"""보관 기간이 지난 사주 주문을 파기한다.

## 왜 이 파일이 생겼나

`saju_order_retention_days` 는 오랫동안 **화면에 숫자를 내려보내는 데만** 쓰였다
(`GET /saju/payment/config`). 개인정보처리방침과 결제 화면은 "주문 생성일로부터
N일 후 파기합니다" 라고 적고 있었는데 **지우는 코드가 저장소 어디에도 없었다.**
지켜지지 않는 약속이었고, 그 약속은 법적 구속력이 있다.

## 무엇이 함께 지워지는가

`saju_orders` 한 줄만 지우면 된다. `saju_reports.order_id` 와
`saju_follow_ups.order_id` 가 DB 레벨 `ON DELETE CASCADE` 라(두 마이그레이션 모두)
리포트 본문과 추가 질문이 같은 문장에서 함께 사라진다. ORM 캐스케이드에 기대지
않는 것이 중요하다 — 여기는 행을 메모리로 읽지 않는 일괄 삭제라 ORM 캐스케이드가
돌지 않는다. **DB 제약이 실제로 지우는 주체다.**

## 언제 도는가

크론이 없다. 이 저장소의 배치는 전부 요청에 얹혀 도는 방식이고
(`core/background.schedule_once` + `min_interval`), 그 규약을 그대로 따른다.

방아쇠는 `GET /saju/payment/config` 다 — **보관 기간을 광고하는 바로 그 엔드포인트**가
그 약속을 지키게 한다. 티저 화면마다 불리므로 트래픽이 있는 한 하루 한 번은 돈다.
트래픽이 아주 없으면 늦어지는데, 그때는 지울 것도 늘지 않으므로 위험이 같이 줄어든다.

## 기록을 남긴다

`batch_runs` 에 남겨 관리자 화면이 "정말 돌고 있나" 에 답할 수 있게 한다. 파기는
**조용히 안 도는 것이 가장 위험한** 종류다 — 안 돌아도 화면은 멀쩡하고, 방침만
거짓이 된다. 그 상태를 관측할 수 있는 자리가 이 기록이다.
"""

import logging
from datetime import UTC, datetime, timedelta

from app.core.background import schedule_once
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.domain.saju_retention import retention_cutoffs
from app.repositories.batch_run import BatchRunRepository
from app.repositories.saju_order import SajuOrderRepository

logger = logging.getLogger(__name__)

#: 배치 이름. `services/admin_service._RECORDED_BATCHES` 와 프런트의 `BATCH_LABELS`
#: 가 같은 문자열을 든다 — 세 곳이 어긋나면 화면에서 이 배치가 사라진다.
BATCH = "saju_purge"

#: 하루 한 번이면 충분하다. 약속이 "N일 후" 라 시간 단위 정밀도가 필요 없고,
#: 자주 돌수록 트래픽이 적은 서비스에서 의미 없는 질의만 늘어난다.
_MIN_INTERVAL = timedelta(days=1)


async def purge_expired(repo: SajuOrderRepository, *, now: datetime | None = None) -> int:
    """만료된 주문을 지우고 지운 수를 돌려준다.

    `now` 를 받는 것은 시험을 위해서다 — 시계를 인자로 받지 않으면 경계 동작을
    확인하려고 며칠을 기다려야 한다.
    """
    cutoffs = retention_cutoffs(
        now or datetime.now(UTC),
        retention_days=settings.saju_order_retention_days,
        legacy_retention_days=settings.saju_order_retention_days_legacy,
        changed_on=settings.saju_retention_changed_on,
    )
    deleted = await repo.delete_expired(cutoffs)
    if deleted:
        logger.info(
            "사주 주문 %d건을 파기했습니다 (신규 %d일 · %s 이전 주문은 %d일)",
            deleted,
            settings.saju_order_retention_days,
            settings.saju_retention_changed_on,
            settings.saju_order_retention_days_legacy,
        )
    return deleted


async def _purge_in_new_session() -> int:
    """요청 세션은 응답과 함께 닫히므로 배경 작업은 자기 세션을 연다.

    **예약된 경로는 항상 기록한다.** 지운 것이 0건이어도 남긴다 — 여기서는 0 이
    "할 일이 없었다" 는 정상이고, 그 정상이 보여야 "아예 안 돌았다" 와 구분된다.
    """
    async with AsyncSessionLocal() as session:
        runs = BatchRunRepository(session)
        try:
            deleted = await purge_expired(SajuOrderRepository(session))
        except Exception as exc:
            logger.exception("사주 주문 파기에 실패했습니다")
            await _record(runs, ok=False, applied=0, detail=str(exc)[:200])
            raise
        await _record(
            runs,
            ok=True,
            applied=deleted,
            detail=f"보관 {settings.saju_order_retention_days}일",
        )
        return deleted


async def _record(runs: BatchRunRepository, *, ok: bool, applied: int, detail: str) -> None:
    """기록 실패가 파기를 되돌리지 않는다 — 관측을 잃는 것과 데이터를 잃는 것은 다르다."""
    try:
        await runs.record(BATCH, ok=ok, applied=applied, detail=detail)
    except Exception:
        logger.warning("파기 실행 기록에 실패했습니다", exc_info=True)


def schedule_purge() -> bool:
    """하루 한 번 파기를 예약한다. 실제로 띄웠으면 True.

    호출부는 결과를 기다리지 않는다. 파기는 사용자의 요청과 아무 관계가 없으므로
    응답을 늦추면 안 된다.
    """
    return schedule_once(BATCH, _purge_in_new_session, min_interval=_MIN_INTERVAL)
