"""종목 스냅샷 배치 — 일정(실적발표·배당락) + 스크리너 지표를 하루 1회 채운다.

## 왜 미리 적재하나

yfinance 는 종목당 1회 호출(~0.5초)이라 "이번 주에 실적발표가 있는 종목" 이나
"PER 10 이하인 종목" 을 요청 시점에 찾으려면 전 종목(2,700+)을 훑어야 한다. 답이
나올 무렵이면 사용자는 이미 떠났다. 그래서 하루 1회 배치가 `listed_companies` 의
컬럼을 채우고, 조회는 SQL 한 번이 된다.

## 왜 배치가 **하나**인가 — 16회차에 데이터로 배웠다

일정과 지표는 서로 다른 화면이 쓰지만 같은 `get_info()` 응답에서 나온다. 기능별로
배치를 나누면 같은 종목에 같은 호출을 두 번 친다. 실제로 시총 배치가 `get_info()` 를
2,747번 친 직후 일정 배치를 2,703종목으로 돌렸더니 야후가 전부 거부했다 — 2,703종목이
113초 만에 "끝나고" 응답 0건이었다(실제 왕복이면 5분 이상이다).

그때는 "두 배치를 연달아 돌리지 않는다" 고 주석에 적었지만, 지키는 쪽보다 **없애는
쪽**이 낫다. 이제 종목당 호출은 info 1회 + 밸류에이션 1회이고, 그 한 번으로 일정 두
날짜와 지표 넷을 함께 얻는다.

남아 있는 유일한 중복은 시가총액 배치의 yfinance 폴백(`listed_company_service`)이다.
그쪽은 `market_cap IS NULL` 인 종목만 물어보므로, 이 배치가 한 바퀴 돌아 시총을
채우고 나면 물어볼 종목이 없어져 **스스로 조용해진다.**

## 배치가 시총 배치와 다른 점 하나

**일정은 만료된다.** 시총은 며칠 스테일해도 랭킹 순서가 안 바뀌지만, 실적발표일은
지나가면 그 값이 과거를 가리킨다. 그래서 "아직 없는 종목" 이 아니라 **"가장 오래
안 물어본 종목"** 부터 채운다 (`symbols_for_calendar_refresh`).
"""

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from app.core.background import retry_after, schedule_once
from app.core.config import settings
from app.integrations.yfinance.snapshot import fetch_company_snapshots
from app.repositories.batch_run import BatchRunRepository
from app.repositories.listed_company import ListedCompanyRepository

logger = logging.getLogger(__name__)

_SNAPSHOT_TTL = timedelta(days=1)

#: 배치 이름. `core/background` 가 이 문자열로 재시도 시각을 기억한다.
_BATCH = "snapshot"

#: 실패했을 때 다시 시도할 간격.
#:
#: 하루가 아니라 30분인 이유: 이 배치의 실패는 대개 **일시적**이다(야후가 조인 상태).
#: 그런데 시각은 태스크를 띄우기 전에 찍히므로, 되돌리지 않으면 10분 뒤에 풀려도
#: 다음 시도는 24시간 뒤가 된다. 반대로 너무 짧으면 조여진 상류를 계속 두드려
#: 차단을 연장한다 — 야후의 실질 상한을 실측한 17회차 기록이 그 근거다.
_RETRY_AFTER_FAILURE = timedelta(minutes=30)

#: 이 비율보다 적게 응답하면 배치 결과를 통째로 버린다.
#:
#: 절반으로 잡은 근거: 정상 실행은 30종목 중 30종목이 응답했다(그중 28종목이 날짜를
#: 가졌다). 반대로 막힌 실행은 2,703종목 중 **0종목**이었다. 둘 사이가 크게 벌어져
#: 있어 경계가 예민할 이유가 없고, 상장폐지·해외 계열이 섞여 응답률이 조금 떨어지는
#: 정상 배치를 버리지 않는 편이 중요하다.
_MIN_RESPONSE_RATIO = 0.5

_refresh_lock = asyncio.Lock()


async def refresh_snapshots(
    repo: ListedCompanyRepository,
    *,
    force: bool = False,
    runs: BatchRunRepository | None = None,
) -> int:
    """일정·지표를 하루 1회 갱신한다. 날짜를 얻은 종목 수를 돌려준다.

    실패해도 예외를 올리지 않는다 — 얹는 기능이고, 이것 때문에 홈이 죽으면 안 된다.
    값이 없으면 화면에서 섹션이 비어 보일 뿐이다.

    `runs` 를 주면 실행 결과를 남긴다. **예약된 경로는 항상 준다**
    (`_refresh_in_new_session`) — 없으면 관리자 화면이 "배치가 도는가" 에 답할 수
    없다. 직접 부르는 경로(스크립트·테스트)에서는 생략할 수 있고, 그때는 기록만
    빠진다. 기록 실패가 배치를 실패시키지 않는 것과 같은 이유다: 관측을 잃는 것과
    데이터를 잃는 것의 무게가 다르다.
    """
    async with _refresh_lock:
        try:
            if not force:
                latest = await repo.latest_calendar_update()
                if latest and datetime.now(UTC) - latest < _SNAPSHOT_TTL:
                    # 실행하지 않았으므로 기록하지 않는다 — 이것을 남기면 표가
                    # "안 돌아도 되는 날" 로 가득 차서 진짜 사건이 묻힌다.
                    return 0

            symbols = await repo.symbols_for_calendar_refresh(settings.snapshot_batch_limit)
            if not symbols:
                logger.info("스냅샷 배치: 물어볼 종목이 없습니다 (상장사 목록이 비었는가)")
                await _record(
                    runs, ok=False, detail="물어볼 종목이 없습니다 (상장사 목록이 비었는가)"
                )
                return 0

            record = await asyncio.to_thread(fetch_company_snapshots, symbols)

            # **응답률이 무너지면 아무것도 쓰지 않는다.**
            #
            # 이 가드가 없어서 실제로 데이터를 지웠다. 시총 배치가 직전에 get_info() 를
            # 2,747번 친 뒤 이 배치가 2,703종목을 돌았는데, 야후가 전부 거부해 113초 만에
            # 0건으로 "끝났다". 저장 계층은 그 0건을 곧이곧대로 반영해 이미 수집돼 있던
            # 29종목의 날짜를 NULL 로 덮었다.
            #
            # 종목별 구분(`_fetch_one` 이 실패를 None 으로 표시)만으로도 그 사고는 막힌다.
            # 그래도 이 층을 하나 더 두는 이유: 공급자가 **에러 대신 빈 응답**을 주기
            # 시작하면 종목별로는 "정상 응답, 일정 없음" 과 구별되지 않는다. 그때
            # 마지막으로 이상을 알아챌 수 있는 신호가 "전 종목이 동시에 비었다" 이다.
            answered = len(record.answered)
            if answered < record.attempted * _MIN_RESPONSE_RATIO:
                logger.error(
                    "스냅샷 배치를 버립니다 — %d종목 중 %d종목만 응답했습니다(%.0f%%). "
                    "공급자가 요청을 막고 있을 가능성이 큽니다. 기존 값은 그대로 둡니다.",
                    record.attempted,
                    answered,
                    100 * answered / record.attempted if record.attempted else 0,
                )
                # 아무것도 쓰지 않았으므로 하루를 기다릴 이유가 없다. 되돌리지 않으면
                # 이 실행이 다음 24시간의 몫을 써 버린 셈이 된다.
                retry_after(_BATCH, _RETRY_AFTER_FAILURE)
                await _record(
                    runs,
                    ok=False,
                    attempted=record.attempted,
                    answered=answered,
                    detail=(
                        f"응답률 {100 * answered / record.attempted:.0f}% — 배치를 버렸습니다. "
                        "공급자가 요청을 막고 있을 가능성이 큽니다."
                        if record.attempted
                        else "물어본 종목이 없습니다"
                    ),
                )
                return 0

            filled_dates, filled_metrics = await repo.update_snapshots(
                record.dates, record.metrics, record.answered
            )

            # 수확 0건은 **버릴 근거가 아니라 볼 근거**다. 소형주만 걸린 배치는 일정이
            # 잡힌 종목이 원래 드물어 0건이 정상일 수 있으므로 여기서 쓰기를 막지
            # 않는다(막으면 그 종목들이 타임스탬프를 못 받아 큐 앞에 영영 남는다).
            # 다만 응답은 멀쩡한데 날짜만 전부 비는 것은 공급자 필드가 바뀌었을 때의
            # 모습이기도 해서, 로그로는 남긴다 (14회차의 0건 경보와 같은 결).
            if answered and not filled_dates:
                logger.warning(
                    "스냅샷 배치: %d종목이 응답했지만 날짜는 0건입니다 — 소형주만 걸린 "
                    "정상일 수 있으나, yfinance 필드가 바뀌었는지 확인하세요 (예: %s)",
                    answered,
                    record.answered[0],
                )

            # 지표 쪽 0건은 날짜와 달리 **정상일 여지가 거의 없다.** PER/PBR 은 상장
            # 종목 대부분이 가진 값이라, 응답이 멀쩡한데 한 종목도 못 얻었다면
            # `get_valuation_measures` 가 통째로 막혔거나 표의 라벨이 바뀐 것이다.
            if answered and not filled_metrics:
                logger.error(
                    "스냅샷 배치: %d종목이 응답했지만 PER/PBR 은 0건입니다 — "
                    "get_valuation_measures 가 막혔거나 표 라벨이 바뀌었을 수 있습니다 "
                    "(`yfinance/fundamentals._PE_LABEL` 확인)",
                    answered,
                )

            logger.info(
                "스냅샷 배치: %d종목 응답 중 일정 %d종목 · 지표 %d종목 반영 (기준일 %s)",
                answered,
                filled_dates,
                filled_metrics,
                record.as_of,
            )
            # **지표 0건은 성공으로 기록하지 않는다.** 위 로그가 이미 error 인 사건인데
            # 표에 ok 로 남으면 관리자 화면이 "마지막 실행 정상" 이라고 말한다 —
            # 경보를 만들어 두고 그것을 가리는 셈이다.
            await _record(
                runs,
                ok=bool(filled_metrics) or not answered,
                attempted=record.attempted,
                answered=answered,
                applied=filled_dates,
                detail=(
                    f"일정 {filled_dates}종목 · 지표 {filled_metrics}종목 반영"
                    if filled_metrics or not answered
                    else (
                        f"{answered}종목이 응답했지만 PER/PBR 은 0건입니다 — "
                        "get_valuation_measures 가 막혔거나 표 라벨이 바뀌었을 수 있습니다"
                    )
                ),
            )
            return filled_dates
        except Exception as exc:  # noqa: BLE001 - 배치 실패가 홈을 죽이면 안 된다
            logger.exception("스냅샷 배치 실패 — 기존 값으로 계속합니다")
            retry_after(_BATCH, _RETRY_AFTER_FAILURE)
            await _record(runs, ok=False, detail=f"{type(exc).__name__}: {exc}"[:500])
            return 0


async def _record(
    runs: BatchRunRepository | None,
    *,
    ok: bool,
    attempted: int = 0,
    answered: int = 0,
    applied: int = 0,
    detail: str | None = None,
) -> None:
    """실행 결과를 남긴다. 저장소가 없으면(직접 호출 경로) 아무것도 하지 않는다.

    **기록 실패가 배치를 실패시키지 않는다.** 이 함수가 예외를 올리면 성공한 배치가
    바깥 `except` 로 잡혀 "실패" 로 기록되려 하고, 그 기록도 같은 이유로 실패한다.
    관측을 잃는 것과 데이터를 잃는 것은 무게가 다르다.
    """
    if runs is None:
        return

    try:
        await runs.record(
            _BATCH,
            ok=ok,
            attempted=attempted,
            answered=answered,
            applied=applied,
            detail=detail,
        )
    except Exception:  # noqa: BLE001 - 관측 실패가 배치를 되돌리면 안 된다
        logger.exception("배치 실행 기록에 실패했습니다 — 배치 결과는 그대로 둡니다")


async def _refresh_in_new_session() -> int:
    """요청 세션은 응답과 함께 닫히므로 백그라운드 작업은 자기 세션을 연다.

    **예약된 경로는 항상 기록한다.** 여기가 실제로 도는 유일한 자리이므로, 여기서
    `runs` 를 빠뜨리면 관리자 화면의 배치 현황이 영원히 비어 있게 된다.
    """
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        return await refresh_snapshots(
            ListedCompanyRepository(session), runs=BatchRunRepository(session)
        )


def schedule_snapshot_refresh() -> None:
    """갱신을 백그라운드로 띄운다. 요청이 수집(수십 초)을 기다리지 않는다.

    홈('오늘의 일정')과 조건 검색이 **같은 스케줄러를 부른다.** 배치가 하나이므로
    두 화면 중 어느 쪽이 먼저 열리든 같은 한 번이 돌고, 메모리 가드가 나머지를
    막는다 — 그 가드가 `min_interval` 이다 (`core/background` 주석).

    테스트가 이 이름을 대역으로 세운다(`test_calendar.py` · `test_screener.py` ·
    `test_admin.py`). 공용 스케줄러를 부르더라도 이 함수 자체는 남는다.

    실패했을 때는 `refresh_snapshots` 가 `retry_after` 로 그 간격을 30분으로 당긴다 —
    아무것도 쓰지 못한 실행이 다음 하루를 잡아먹지 않게.
    """
    schedule_once(_BATCH, _refresh_in_new_session, min_interval=_SNAPSHOT_TTL)
