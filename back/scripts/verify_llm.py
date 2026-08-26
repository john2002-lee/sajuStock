"""LLM 경로 라이브 검증.

자격 증명이 생긴 뒤 한 번 돌려서, 테스트로는 덮을 수 없는 "네트워크 왕복"을 확인한다.
앱이 실제로 쓰는 함수(`ask_text` / `ask_structured`)를 그대로 호출하므로, 통과하면
`POST /stocks/advice`의 LLM 경로가 검증된 것과 같다.

    uv run python -m scripts.verify_llm

(`-m`으로 실행해야 프로젝트 루트가 sys.path에 올라 `app` 패키지를 찾는다.)

각 단계는 독립적으로 실패 원인을 좁힌다:
    1. 자격 증명 + 모델 접근  → 키가 유효한지, 모델 ID가 맞는지
    2. ask_text               → 요청 형태(thinking/max_output_tokens)가 맞는지
    3. ask_structured         → InvestmentDecision 스키마가 컴파일되는지
"""

import asyncio
import sys

from app.agents.prompts import DECISION_PROFILE, JOURNALIST
from app.core.config import settings
from app.core.logging import configure_logging
from app.integrations import llm
from app.schemas.advice import InvestmentDecision

_PROBE_CONTEXT = """{
  "stock": {"name": "테스트", "symbol": "TEST"},
  "metrics": {"trend": "상승 우위", "return_20d_pct": 4.0, "recent_cross_signal": "golden"},
  "fundamentals": {"per": 21.06, "pbr": 3.64, "roe_pct": 30.79, "dividend_yield_pct": 0.57},
  "agent_opinions": []
}"""


def _ok(label: str, detail: str = "") -> None:
    print(f"  [PASS] {label}" + (f" - {detail}" if detail else ""))


def _fail(label: str, exc: BaseException, hint: str) -> None:
    print(f"  [FAIL] {label}")
    print(f"         {type(exc).__name__}: {exc}")
    print(f"         → {hint}")


async def check_credentials() -> bool:
    print("1. 자격 증명 + 모델 접근")
    try:
        client = llm.get_client()
        # 모델 이름을 `models/` 접두 없이 넘겨도 SDK 가 붙여 준다.
        model = await client.aio.models.get(model=settings.gemini_model)
    except Exception as exc:
        _fail(
            settings.gemini_model,
            exc,
            "GEMINI_API_KEY를 .env에 넣는다. 401/403 이면 키가 폐기됐거나 이 API 권한이 "
            "없고, 404 면 모델 ID가 틀렸다 — GEMINI_MODEL을 확인한다.",
        )
        return False

    thinking = (
        "thinking 지원" if llm.supports_thinking(settings.gemini_model) else "thinking 미지원"
    )
    _ok(model.name or settings.gemini_model, f"출력상한={model.output_token_limit} · {thinking}")
    return True


async def check_text() -> bool:
    print("2. ask_text (자유 서술)")
    try:
        text = await llm.ask_text(
            JOURNALIST.full_prompt(),
            "다음 컨텍스트를 한 문장으로 요약해라.\n" + _PROBE_CONTEXT,
        )
    except Exception as exc:
        _fail(
            "ask_text",
            exc,
            "thinkingConfig 에서 400이면 GEMINI_MODEL이 그 파라미터를 안 받는 모델이다 "
            "(gemini-2.5/3 정식 모델을 쓴다. -latest 별칭은 400이 날 수 있다). "
            "503 이면 그 모델이 일시적으로 혼잡한 것이라 잠시 뒤 다시 돌린다.",
        )
        return False

    if not text:
        print("  [WARN] ask_text - 빈 응답. 생각 토큰이 LLM_MAX_TOKENS를 다 썼을 수 있다.")
        return False

    _ok("ask_text", f"{len(text)}자 · {text[:60]}...")
    return True


async def check_structured() -> bool:
    print("3. ask_structured (InvestmentDecision 구조화 출력)")
    try:
        decision = await llm.ask_structured(
            DECISION_PROFILE.full_prompt(), _PROBE_CONTEXT, InvestmentDecision
        )
    except Exception as exc:
        _fail(
            "InvestmentDecision",
            exc,
            "스키마 컴파일 실패거나 거절이다. 첫 요청은 스키마 컴파일 비용이 있어 느릴 수 있다.",
        )
        return False

    _ok(
        "InvestmentDecision",
        f"verdict={decision.verdict} confidence={decision.confidence} "
        f"buy_conditions={len(decision.buy_conditions)} risks={len(decision.risk_notes)}",
    )
    return True


async def main() -> int:
    # 윈도우 기본 콘솔(cp949)에서 못 찍는 기호로 죽지 않게 한다.
    sys.stdout.reconfigure(errors="replace")
    configure_logging()
    print(f"모델: {settings.gemini_model} (effort={settings.llm_effort})\n")

    if not await check_credentials():
        await llm.close_client()
        return 1

    text_ok = await check_text()
    structured = await check_structured()

    await llm.close_client()

    print()
    if text_ok and structured:
        print("전부 통과. LLM 경로가 검증됐다.")
        print("마지막으로 실제 엔드포인트를 확인한다:")
        print(
            '  curl -s -X POST -H "content-type: application/json" '
            '-d \'{"symbol":"005930"}\' '
            "http://127.0.0.1:8000/api/v1/stocks/advice"
        )
        print('  → agents[*].status가 모두 "done"이면 (fallback이 아니면) 성공이다.')
        return 0

    print("위 [FAIL] 항목의 조치를 먼저 처리한다.")
    return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
