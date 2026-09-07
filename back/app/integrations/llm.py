"""LLM 호출 경계 (명세 6.4).

**앱 전체에서 이 파일 하나만 LLM SDK를 import한다.** 에이전트 계층은 `ask_text`와
`ask_structured` 두 함수만 보므로, 프로바이더를 바꾸려면 이 파일만 교체하면 된다
(그래서 파일명이 `gemini_client`가 아니라 `llm`이다).

이 원칙이 실제로 값을 한 것이 세 번이다: Anthropic → OpenAI(2회차) → **Gemini**(10회차).
세 번 모두 바뀐 것은 이 파일과 설정 몇 줄뿐이고, 에이전트·서비스·엔드포인트 코드는
한 줄도 손대지 않았다.

현재 구현은 공식 `google-genai` SDK의 비동기 클라이언트다.

## OpenAI 구현과 대응 관계

| 개념        | OpenAI (Responses)        | Gemini (`generate_content`)             |
|-------------|---------------------------|------------------------------------------|
| 시스템 지시 | `instructions=`           | `config.system_instruction=`             |
| 출력 상한   | `max_output_tokens=`      | `config.max_output_tokens=`              |
| 구조화 출력 | `text_format=Model`       | `response_schema=Model` + JSON mime      |
| 추론 강도   | `reasoning.effort`        | `thinking_config.thinking_budget`(토큰)  |
| 거절        | 출력 블록의 `refusal`     | `finish_reason` / `prompt_feedback`      |

가장 다른 곳은 **추론 강도**다. OpenAI 는 `low~max` 라벨을 받지만 Gemini 는 생각에
쓸 **토큰 예산**을 받는다. 그래서 `LLM_EFFORT` 를 예산으로 옮기는 표가 아래에 있다.
"""

import logging
import time

from google import genai
from google.genai import types
from google.genai.errors import APIError
from pydantic import BaseModel

from app.core.config import settings
from app.core.exceptions import LLMRefusedError
from app.integrations import amplitude

logger = logging.getLogger(__name__)

_client: genai.Client | None = None

#: `LLM_EFFORT` → 생각 토큰 예산.
#:
#: Gemini 는 라벨이 아니라 토큰 수를 받는다. `-1` 은 "모델이 알아서 정한다"(동적)이고
#: `0` 은 생각을 끈다. 값은 `llm_max_tokens` 와 **함께** 소모되므로, 상한을 넉넉히
#: 두지 않으면 생각만 하다 본문이 빈 채로 끝난다(MAX_TOKENS).
_THINKING_BUDGET: dict[str, int] = {
    "low": 0,
    "medium": 4_096,
    "high": 12_288,
    "xhigh": 24_576,
    "max": -1,
}


def get_client() -> genai.Client:
    """프로세스 수명 동안 재사용되는 클라이언트.

    `api_key`를 넘기지 않으면 SDK가 `GOOGLE_API_KEY`/`GEMINI_API_KEY` 환경 변수를 읽는다.
    """
    global _client
    if _client is None:
        http_options = types.HttpOptions(
            # SDK 는 밀리초를 받는다. 설정은 초 단위라 여기서 환산한다.
            timeout=int(settings.llm_timeout_seconds * 1000),
            retry_options=types.HttpRetryOptions(attempts=settings.llm_max_retries + 1),
        )
        _client = genai.Client(
            api_key=settings.gemini_api_key or None, http_options=http_options
        )
    return _client


async def close_client() -> None:
    """SDK 가 명시적 close 를 요구하지 않으므로 참조만 버린다.

    호출부(main.py lifespan)는 프로바이더를 모른 채 이 함수만 부른다 — 시그니처를
    유지하는 것이 경계의 일이다.
    """
    global _client
    _client = None


def _thinking() -> types.ThinkingConfig | None:
    """생각 예산. 모델이 안 받으면 붙이지 않는다.

    `thinkingConfig` 를 지원하지 않는 모델(별칭 계열 등)에 붙이면 **요청 자체가 400**
    이라 응답을 한 줄도 못 받는다. OpenAI 시절 비추론 모델에 `reasoning` 을 보내
    같은 일이 났었고, 그때와 같은 이유로 모델을 보고 붙인다.
    """
    if not supports_thinking(settings.gemini_model):
        return None
    budget = _THINKING_BUDGET.get(settings.llm_effort, 4_096)
    return types.ThinkingConfig(thinking_budget=budget)


def supports_thinking(model: str) -> bool:
    """이 모델이 `thinking_config` 를 받는가. 2.5 이상 정식 모델만 받는다."""
    name = model.strip().lower()
    if name.endswith("-latest"):
        # `gemini-flash-latest` 는 실측에서 thinkingConfig 와 함께 400 이 났다.
        return False
    return name.startswith(("gemini-2.5", "gemini-3"))


def _base_config(system_prompt: str) -> dict:
    config: dict = {
        "system_instruction": system_prompt,
        "max_output_tokens": settings.llm_max_tokens,
    }
    thinking = _thinking()
    if thinking is not None:
        config["thinking_config"] = thinking
    return config


def _guard(response: types.GenerateContentResponse) -> None:
    """거절·중단을 예외나 로그로 바꾼다.

    Gemini 는 거절을 예외로 던지지 않는다. 두 자리에 나뉘어 실린다.

    * `prompt_feedback.block_reason` — **입력**이 막힌 경우. 후보 자체가 없다
    * `candidate.finish_reason` — 출력이 도중에 끊긴 경우(SAFETY·RECITATION 등)

    둘 다 검사하지 않으면 상위 계층에 "빈 응답"으로만 보여 원인을 못 찾는다.
    """
    feedback = getattr(response, "prompt_feedback", None)
    block_reason = getattr(feedback, "block_reason", None)
    if block_reason:
        raise LLMRefusedError(detail=f"프롬프트가 차단되었습니다 ({block_reason})")

    candidates = response.candidates or []
    if not candidates:
        raise LLMRefusedError("모델이 후보를 하나도 내지 않았습니다.")

    finish = getattr(candidates[0], "finish_reason", None)
    name = getattr(finish, "name", str(finish or ""))
    if name in {"SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"}:
        raise LLMRefusedError(detail=f"응답이 차단되었습니다 ({name})")

    # 생각 토큰이 상한을 다 먹으면 본문이 빈 채로 MAX_TOKENS 로 끝난다.
    # OpenAI 의 status=incomplete 와 같은 상황이라 같은 자세로 경고만 남긴다.
    if name == "MAX_TOKENS":
        logger.warning(
            "응답이 상한에서 끊겼습니다 (max_output_tokens=%d, effort=%s)",
            settings.llm_max_tokens,
            settings.llm_effort,
        )


def _usage(response: types.GenerateContentResponse | None) -> dict:
    """Gemini 의 사용량을 `track_ai_message` 의 인자 이름으로 옮긴다.

    이름이 다 다르다 (`prompt_token_count` ↔ `input_tokens`). 그 변환을 여기 한 번만
    두는 것이 이 파일의 원칙과 같다 — 프로바이더 어휘가 밖으로 새지 않는다.

    사용량이 없으면 빈 dict 다. 그러면 SDK 가 비용을 계산하지 않을 뿐, 이벤트 자체는
    나간다 — 지연과 모델만 있어도 없는 것보다 낫다.
    """
    meta = getattr(response, "usage_metadata", None)
    if meta is None:
        return {}
    fields = {
        "input_tokens": "prompt_token_count",
        "output_tokens": "candidates_token_count",
        "total_tokens": "total_token_count",
        "reasoning_tokens": "thoughts_token_count",
        "cache_read_tokens": "cached_content_token_count",
    }
    return {
        key: value
        for key, attr in fields.items()
        if (value := getattr(meta, attr, None)) is not None
    }


def _record(
    *,
    content: str,
    latency_ms: float,
    system_prompt: str | None = None,
    response: types.GenerateContentResponse | None = None,
    error: BaseException | None = None,
) -> None:
    """LLM 호출 한 건을 Agent Analytics 에 남긴다.

    **세션이 없으면 아무것도 하지 않는다.** 워밍업·배치·테스트가 이 파일을 부르는
    경로가 있고, 그때 계측을 강요할 이유가 없다 (`integrations/amplitude` 주석).

    실패 경로에서도 부른다. 성공만 기록하면 지연·오류율 차트가 **실패를 통째로
    못 보고**, 타임아웃난 호출은 대시보드에서 존재하지 않은 일이 된다.

    이 함수는 절대 던지지 않는다 — 계측 때문에 판단이 죽으면 안 된다.
    """
    session = amplitude.active_session()
    if session is None:
        return

    try:
        finish = None
        if response is not None and (candidates := response.candidates or []):
            raw = getattr(candidates[0], "finish_reason", None)
            finish = getattr(raw, "name", None) or (str(raw) if raw else None)

        session.track_ai_message(
            content,
            settings.gemini_model,
            "gemini",
            latency_ms,
            system_prompt=system_prompt,
            max_output_tokens=settings.llm_max_tokens,
            finish_reason=finish,
            is_error=error is not None,
            error_message=str(error) if error is not None else None,
            error_type=type(error).__name__ if error is not None else None,
            **_usage(response),
        )
    except Exception:
        logger.warning("Amplitude 기록에 실패했습니다", exc_info=True)


def _record_embedding(
    *, latency_ms: float, count: int, error: BaseException | None = None
) -> None:
    """임베딩 호출 한 건. 본문(색인 대상 텍스트)은 남기지 않는다.

    RAG 색인은 한 번에 수십 개 청크를 보낸다 — 그 원문을 전부 실어 보내면 이벤트가
    본문으로 뒤덮이고, 얻는 것은 이미 우리 DB 에 있는 텍스트의 사본뿐이다.
    비용·지연을 보는 것이 목적이므로 개수만 남긴다.
    """
    session = amplitude.active_session()
    if session is None:
        return

    try:
        # `track_embedding` 은 `is_error` 를 받지 않는다 (`track_ai_message` 와
        # 다르다) — 실패 사실은 `context` 로 남긴다.
        session.track_embedding(
            settings.embedding_model,
            "gemini",
            latency_ms,
            dimensions=settings.embedding_dimensions,
            context={
                "input_count": count,
                **({"error": str(error)} if error is not None else {}),
            },
        )
    except Exception:
        logger.warning("Amplitude 임베딩 기록에 실패했습니다", exc_info=True)


async def ask_text(system_prompt: str, user_content: str) -> str:
    """자유 서술 응답 한 건. 거절되면 `LLMRefusedError`."""
    client = get_client()
    started = time.monotonic()
    try:
        response = await client.aio.models.generate_content(
            model=settings.gemini_model,
            contents=user_content,
            config=types.GenerateContentConfig(**_base_config(system_prompt)),
        )
    except BaseException as exc:
        _record(
            content="",
            latency_ms=(time.monotonic() - started) * 1000,
            system_prompt=system_prompt,
            error=exc,
        )
        raise

    latency_ms = (time.monotonic() - started) * 1000
    try:
        _guard(response)
    except BaseException as exc:
        # 거절도 호출이다. 여기서 기록하지 않으면 SAFETY 로 막힌 호출이 차트에서
        # 사라져, 토큰만 태우고 결과가 없는 구간이 보이지 않게 된다.
        _record(
            content="",
            latency_ms=latency_ms,
            system_prompt=system_prompt,
            response=response,
            error=exc,
        )
        raise

    text = (response.text or "").strip()
    _record(
        content=text,
        latency_ms=latency_ms,
        system_prompt=system_prompt,
        response=response,
    )
    return text


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """임베딩 벡터. 입력 순서 그대로 돌려준다.

    RAG 색인·검색이 쓰는 유일한 임베딩 경로다. 이 함수도 여기 있어야 하는 이유는
    파일 상단의 원칙과 같다 — SDK를 import하는 파일을 하나로 유지한다.

    차원을 명시하는 것은 의도적이다. `gemini-embedding-001` 은 출력 차원을 지정할 수
    있어(MRL) 기존 `vector(1536)` 테이블을 그대로 쓴다 — 프로바이더를 바꾸면서 색인을
    통째로 다시 만들지 않아도 됐던 유일한 이유다. 차원을 안 주면 3072 가 와서
    테이블과 어긋난다.
    """
    if not texts:
        return []

    client = get_client()
    started = time.monotonic()
    try:
        response = await client.aio.models.embed_content(
            model=settings.embedding_model,
            contents=texts,  # type: ignore[arg-type]
            config=types.EmbedContentConfig(
                output_dimensionality=settings.embedding_dimensions
            ),
        )
    except BaseException as exc:
        _record_embedding(
            latency_ms=(time.monotonic() - started) * 1000,
            count=len(texts),
            error=exc,
        )
        raise

    _record_embedding(
        latency_ms=(time.monotonic() - started) * 1000,
        count=len(texts),
    )

    embeddings = response.embeddings or []
    if len(embeddings) != len(texts):
        raise LLMRefusedError(
            f"임베딩 개수가 입력과 다릅니다 ({len(embeddings)} != {len(texts)})"
        )
    return [list(item.values or []) for item in embeddings]


async def ask_structured[ModelT: BaseModel](
    system_prompt: str,
    user_content: str,
    output_model: type[ModelT],
) -> ModelT:
    """스키마가 검증된 구조화 응답.

    `response_schema`에 Pydantic 모델을 그대로 넘기면 SDK가 스키마로 변환해 보내고,
    응답을 다시 그 모델로 파싱해 `parsed`에 담는다 — OpenAI 의 `text_format` 과 같은
    자리다. 최종 판단이 `InvestmentDecision` 스키마를 반드시 만족해야 하는 이 앱의
    요구가 프로바이더를 바꿔도 같은 방식으로 지켜진다.
    """
    client = get_client()
    started = time.monotonic()
    try:
        response = await client.aio.models.generate_content(
            model=settings.gemini_model,
            contents=user_content,
            config=types.GenerateContentConfig(
                **_base_config(system_prompt),
                response_mime_type="application/json",
                response_schema=output_model,
            ),
        )
    except BaseException as exc:
        _record(
            content="",
            latency_ms=(time.monotonic() - started) * 1000,
            system_prompt=system_prompt,
            error=exc,
        )
        raise

    latency_ms = (time.monotonic() - started) * 1000
    try:
        _guard(response)

        parsed = response.parsed
        if not isinstance(parsed, output_model):
            raise LLMRefusedError("구조화 응답을 파싱하지 못했습니다.")
    except BaseException as exc:
        _record(
            content="",
            latency_ms=latency_ms,
            system_prompt=system_prompt,
            response=response,
            error=exc,
        )
        raise

    # 본문은 모델이 실제로 낸 JSON 문자열이다. `parsed` 를 다시 직렬화하면 스키마
    # 기본값이 섞여 모델이 말하지 않은 필드가 들어간다.
    _record(
        content=(response.text or "").strip(),
        latency_ms=latency_ms,
        system_prompt=system_prompt,
        response=response,
    )
    return parsed


__all__ = [
    "APIError",
    "ask_structured",
    "ask_text",
    "close_client",
    "embed_texts",
    "get_client",
    "supports_thinking",
]
