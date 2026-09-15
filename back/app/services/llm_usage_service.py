"""LLM 토큰 사용량 기록 — `integrations/llm.py` 가 꽂아 쓰는 싱크.

## 왜 서비스가 필요한가 (리포지터리를 바로 꽂으면 안 되나)

리포지터리는 **세션을 받아** 만든다. 그런데 이 싱크를 부르는 쪽(`llm.py`)에는 세션이
없다 — 요청 스코프 밖(배치·워밍업)에서도 불리고, 무엇보다 그 파일이 DB 를 알면
계층이 뒤집힌다. 세션을 열고 닫는 일과 "실패해도 조용히 지나간다" 는 정책이 여기
있어야 할 몫이다.

## 요청 세션을 빌려 쓰지 않는 이유

LLM 호출은 요청 처리 **한가운데**에서 일어난다. 그 요청의 세션에 얹으면 사용량
기록의 커밋이 진행 중인 트랜잭션과 엮여, 요청이 나중에 롤백될 때 사용량까지 사라진다.
**이미 태운 토큰은 롤백되지 않는다** — 기록도 그래야 한다. 그래서 자기 세션을 연다.

## 절대 던지지 않는다

`llm.py` 의 `_persist` 도 예외를 삼키지만, 여기서 한 번 더 막는 것이 중복이 아니다 —
이 함수는 싱크로 등록되는 **공개 계약**이고, 다른 호출자가 생겼을 때 그쪽이 같은
방어를 다시 적어야 한다면 계약이 잘못된 것이다.
"""

import logging

from app.core.database import AsyncSessionLocal
from app.domain.llm_usage import LlmTokens
from app.repositories.llm_usage import LlmUsageRepository

logger = logging.getLogger(__name__)


async def record(model: str, tokens: LlmTokens) -> None:
    """호출 한 건의 토큰을 그날·그 모델의 행에 더한다."""
    if tokens.empty:
        return

    try:
        async with AsyncSessionLocal() as db:
            await LlmUsageRepository(db).add(model, tokens)
    except Exception:
        # 사용량을 못 남긴 것과 답을 못 낸 것은 전혀 다른 사건이다. 전자 때문에
        # 후자가 생기면 안 된다.
        logger.warning("토큰 사용량을 남기지 못했습니다 (model=%s)", model, exc_info=True)
