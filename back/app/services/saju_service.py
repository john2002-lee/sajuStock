"""사주 서비스 — 엔진 호출과 리포트 생성을 조율한다.

라우터는 파라미터 수신만, 도메인은 순수 계산만 한다. 그 사이의 "무엇을 어떤 순서로
부를지"가 여기다. 기존 `services/*` 와 같은 규약이다.

**이 서비스는 `HTTPException` 을 던지지 않는다** (`core/exceptions.py` 의 계층 규칙).
도메인 예외를 던지고, HTTP 상태 코드로의 변환은 등록된 핸들러가 한다.
"""

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from app.core.exceptions import AppError
from app.domain.saju.report_policy import (
    ContentRefusalError,
    PolicyError,
    parse_markdown_sections,
    validate_answer,
    validate_markdown,
)
from app.domain.saju.report_prompt import build_follow_up_prompt, build_prompt
from app.integrations.saju.client import SajuReading, compute_reading
from app.integrations.saju.mapper import to_saju_input
from app.schemas.saju import (
    BirthInput,
    FollowUpResponse,
    ReportSectionOut,
    SajuReportResponse,
)

logger = logging.getLogger(__name__)

#: 정책 위반으로 리포트를 다시 만들어 보는 횟수. 1 인 이유: 재생성은 LLM 호출을 한 번
#: 더 태우고, 검증기가 **일부러 넓게** 잡도록 설계돼 있어(운명론 검사에 예외 없음 —
#: `report_policy` 주석) 두 번째도 같은 부류에 걸릴 확률이 낮지 않다. 두 번 실패하면
#: 지어내는 대신 규칙 기반 요약으로 내려간다.
_MAX_REGENERATIONS = 1


class SajuComputationError(AppError):
    """검증을 통과한 입력인데도 엔진이 실패했다.

    400 이다 — 여전히 입력에서 비롯된 문제이므로. 다만 검증에 구멍이 있다는 뜻이라
    서버 로그에 남긴다. 원본 `/api/calc` 라우트의 판단을 그대로 옮겼다.
    """

    status_code = 400
    code = "saju_computation_failed"
    message = "입력한 출생 정보로는 사주를 계산할 수 없습니다."


class SajuReportUnavailableError(AppError):
    """리포트를 만들지 못했고 규칙 기반 대체도 불가능한 경우."""

    status_code = 502
    code = "saju_report_unavailable"
    message = "사주 리포트를 완성하지 못했습니다."


def current_year() -> int:
    """"올해"의 단일 출처.

    `domain/saju/luck.py` 는 시계를 읽지 않기로 되어 있고, 그 보장이 새지 않으려면
    시계를 읽는 곳이 **정확히 한 군데**여야 한다. 여기다.

    KST 기준이다. UTC 로 읽으면 한국의 1월 1일 오전 8시 이전에 작년이 나온다 —
    "올해의 운" 섹션이 매년 하루씩 틀리게 된다.
    """
    return datetime.now(UTC).astimezone().year


def read_chart(birth: BirthInput, now_year: int | None = None) -> SajuReading:
    """사주 한 벌을 계산한다. **아무것도 저장하지 않는다.**

    온보딩 화면이 초안을 보여 주기 위해 부르는 경로이고, 사용자가 보정을 끝낸 뒤에야
    `PUT /profile` 로 저장한다(기획 5.1 의 데이터 흐름).
    """
    saju_input = to_saju_input(birth)
    try:
        return compute_reading(saju_input, now_year if now_year is not None else current_year())
    except Exception as exc:  # noqa: BLE001 - 어떤 실패든 400 으로 바꾸되 원인은 남긴다
        # 생년월일시는 민감정보다. 예외 메시지에는 엔진이 거부한 값이 그대로 인용돼
        # 있을 수 있으므로(예: 범위 오류) **메시지를 로그에 싣지 않는다**. 유형만 남긴다.
        logger.error(
            "검증을 통과한 입력인데 사주 계산이 실패했습니다 — 검증에 구멍이 있습니다 (type=%s)",
            type(exc).__name__,
        )
        raise SajuComputationError() from exc


def _fallback_markdown(reading: SajuReading) -> str:
    """LLM 없이 만드는 간이 리포트.

    필수 섹션을 **채워 넣지 않는다** — 없는 풀이를 지어내는 대신, 이미 계산된 사실만
    적고 그것이 간이본임을 밝힌다. `source="fallback"` 이 화면의 배지를 켠다.
    주식 쪽 `fallback_decision` 과 같은 태도다: 폴백은 조용하지 않다.
    """
    chart = reading.chart
    strength = reading.strength
    lines = [
        "## 총평",
        reading.teaser.summary,
        "",
        "## 강약과 균형",
        f"강약 판정은 {strength.verdict}(점수 {strength.score})입니다.",
        *strength.basis.detail,
        "",
        "## 대운의 흐름",
    ]
    if reading.luck.current_da_yun is not None:
        current = reading.luck.current_da_yun
        lines.append(
            f"{reading.luck.now_year}년 현재 대운은 {current.hangul}"
            f"({current.gan_zhi}) 구간이며, {current.start_age}세에 시작했습니다."
        )
    else:
        lines.append(
            f"{reading.luck.now_year}년 현재는 아직 첫 대운"
            f"({reading.luck.start_age}세) 전 구간입니다."
        )
    lines += [
        "",
        "## 안내",
        "AI 풀이를 완성하지 못해 계산 결과만 정리한 간이 리포트입니다. "
        f"일간은 {chart.day_master_hangul}({chart.day_master})입니다.",
    ]
    return "\n".join(lines)


async def generate_report(
    birth: BirthInput,
    ask_llm,  # noqa: ANN001 - `(system, user) -> str` 코루틴. 통합 계층이 주입한다
    now_year: int | None = None,
) -> SajuReportResponse:
    """사주 리포트를 만든다. 정책 위반이면 한 번 다시 시켜 보고, 그래도 안 되면 폴백한다.

    `ask_llm` 을 **인자로 받는다**. 서비스가 `integrations/llm` 을 직접 잡으면 이
    함수를 네트워크 없이 테스트할 수 없고, 실제로 검증하고 싶은 것(정책 → 재생성 →
    폴백의 분기)은 LLM 이 아니라 이 흐름이다.
    """
    reading = read_chart(birth, now_year)
    prior_violation: str | None = None

    for attempt in range(_MAX_REGENERATIONS + 1):
        system, user = build_prompt(
            reading.chart, reading.strength, reading.luck, prior_violation=prior_violation
        )
        try:
            markdown = await ask_llm(system, user)
        except ContentRefusalError:
            # 모델이 이 입력에 대해 거절했거나 자리가 모자랐다. 재시도해도 같은
            # 이유로 같은 결과가 나오므로 곧바로 폴백한다.
            logger.warning("사주 리포트: 모델이 응답을 거절했습니다 — 간이 리포트로 대체합니다")
            break
        except Exception:  # noqa: BLE001 - 프로바이더 장애. 폴백이 있으므로 실패시키지 않는다
            logger.exception("사주 리포트: LLM 호출 실패 — 간이 리포트로 대체합니다")
            break

        try:
            sections = validate_markdown(markdown)
        except PolicyError as exc:
            # **걸린 문장은 로그에 남기지 않는다** — 유형과 섹션만 남긴다
            # (`PolicyError.offending_sentence` 주석). 그 문장은 재생성 프롬프트로만 간다.
            logger.warning(
                "사주 리포트 정책 위반 (시도 %d/%d): %s",
                attempt + 1,
                _MAX_REGENERATIONS + 1,
                exc.message,
            )
            prior_violation = exc.message
            continue

        return SajuReportResponse(
            markdown=markdown,
            sections=[ReportSectionOut(heading=s.heading, body=s.body) for s in sections],
            source="llm",
        )

    markdown = _fallback_markdown(reading)
    return _fallback_report(markdown)


def _fallback_report(markdown: str) -> SajuReportResponse:
    return SajuReportResponse(
        markdown=markdown,
        # 폴백 본문은 필수 섹션을 다 갖추지 않으므로 `validate_markdown` 을 통과하지
        # 못한다. 검사를 건너뛰어도 되는 이유는 따로 있다: 이 텍스트는 모델이 아니라
        # **우리가** 만들었고 이미 계산된 사실만 담으므로, 금지 표현이 들어갈 경로가
        # 구조적으로 없다. 섹션은 파싱만 해서 화면에 넘긴다.
        sections=[
            ReportSectionOut(heading=s.heading, body=s.body)
            for s in parse_markdown_sections(markdown)
        ],
        source="fallback",
    )


#: 정책 위반으로 답을 다시 만들어 보는 횟수. 리포트와 같은 이유로 1 이다
#: (`_MAX_REGENERATIONS` 주석).
_MAX_ANSWER_REGENERATIONS = 1

#: 답을 만들지 못했을 때 내보내는 문장.
#:
#: **사주 이야기를 지어내지 않는다.** 여기서 그럴듯한 한 문단을 만들어 주면 그것은
#: 계산된 사실에 근거하지 않은 유일한 텍스트가 된다 — 리포트 폴백이 이미 계산된
#: 값만 정리해 내보내는 것과 정반대다. 못 했다고 말하는 편이 정직하다.
_ANSWER_FALLBACK = (
    "미안하네만 지금은 그 질문에 답을 드리기 어렵네. "
    "잠시 뒤에 다시 물어봐 주시겠는가."
)


@dataclass(frozen=True)
class FollowUpOutcome:
    """답 한 벌 + **그 답이 어떻게 나왔는지**.

    ## 왜 이유가 필요한가 — 슬롯 소모가 여기서 갈린다

    유료 경로는 질문 3개가 고객의 권리다. 그것을 지키려면 폴백이 왜 폴백인지 알아야
    한다:

      · `refused` — 모델이 **이 질문에** 답하기를 거절했거나, 재생성을 다 써도 금지
        표현을 계속 냈다. 내용의 문제이므로 **슬롯을 소모한다.** 환불하면 거절되는
        질문 하나로 생성을 무한히 돌릴 수 있다.
      · `failed` — 타임아웃·5xx·연결 실패. **우리 쪽** 문제이므로 소모하지 않는다.

    `FollowUpResponse`(와이어 스키마)에 넣지 않는 이유: 이것은 과금 회계용 내부
    사실이고, 화면이 알아야 하는 것은 "답인가 폴백인가"(`source`)까지다.
    """

    response: FollowUpResponse
    kind: Literal["answered", "refused", "failed"]


async def answer_follow_up(
    birth: BirthInput,
    question: str,
    ask_llm,  # noqa: ANN001 - `(system, user) -> str` 코루틴. 통합 계층이 주입한다
    now_year: int | None = None,
) -> FollowUpResponse:
    """추가 질문 하나에 답한다. **무료 경로용** — 슬롯 회계가 없다."""
    return (await answer_follow_up_detailed(birth, question, ask_llm, now_year)).response


async def answer_follow_up_detailed(
    birth: BirthInput,
    question: str,
    ask_llm,  # noqa: ANN001
    now_year: int | None = None,
) -> FollowUpOutcome:
    """추가 질문 하나에 답하고, **왜 그렇게 됐는지까지** 돌려준다.

    사주를 **그 자리에서 다시 계산한다.** 저장된 것이 없기 때문이고
    (`schemas/saju.FollowUpRequest` 주석), 순수 계산이라 비용이 없다.

    `generate_report` 와 같은 분기다 — 정책 위반이면 한 번 다시 시켜 보고, 그래도
    안 되면 폴백한다. 다른 점은 폴백이 **내용을 만들지 않는다**는 것이다.
    """
    reading = read_chart(birth, now_year)
    prior_violation: str | None = None
    # 폴백으로 끝났을 때의 이유. 기본을 `refused` 로 두지 않는다 — 모르는 것을
    # 소모로 단정하면 우리 장애로 고객이 산 것을 잃는다.
    kind: Literal["answered", "refused", "failed"] = "failed"

    for attempt in range(_MAX_ANSWER_REGENERATIONS + 1):
        system, user = build_follow_up_prompt(
            reading.chart, reading.strength, reading.luck, question, prior_violation
        )
        try:
            answer = await ask_llm(system, user)
        except ContentRefusalError:
            logger.warning("추가 질문: 모델이 응답을 거절했습니다")
            kind = "refused"
            break
        except Exception:  # noqa: BLE001 - 프로바이더 장애. 폴백이 있으므로 실패시키지 않는다
            logger.exception("추가 질문: LLM 호출 실패")
            kind = "failed"
            break

        try:
            validate_answer(answer)
        except PolicyError as exc:
            # 걸린 문장은 로그에 남기지 않는다 — 재생성 프롬프트로만 간다.
            logger.warning(
                "추가 질문 정책 위반 (시도 %d/%d): %s",
                attempt + 1,
                _MAX_ANSWER_REGENERATIONS + 1,
                exc.message,
            )
            # 재생성에는 걸린 문장까지 넘긴다 — 구체적인 문장이 있어야 고칠 수 있다.
            prior_violation = (
                f"{exc.message} — {exc.offending_sentence}"
                if exc.offending_sentence
                else exc.message
            )
            # 재생성을 다 써도 금지 표현이 계속 나오면 **내용의 문제**다.
            # 다시 시켜도 같은 결과라 소모로 본다.
            kind = "refused"
            continue

        return FollowUpOutcome(
            response=FollowUpResponse(
                question=question, answer=answer.strip(), source="llm"
            ),
            kind="answered",
        )

    return FollowUpOutcome(
        response=FollowUpResponse(
            question=question, answer=_ANSWER_FALLBACK, source="fallback"
        ),
        kind=kind,
    )
