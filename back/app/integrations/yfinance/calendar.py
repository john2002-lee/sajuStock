"""실적발표·배당락 **날짜를 읽는 규칙** ('오늘의 일정').

## 이 파일이 소유하는 것 — 규칙 하나뿐이다

날짜 두 개(`exDividendDate` · `earningsTimestampStart`)를 읽는 규칙은 원래
`fundamentals.py` 안에만 있었다. 그 규칙에는 **실측으로만 알 수 있는 함정 셋**이 있어
(아래 `extract_calendar_dates` 주석) 두 벌로 두면 한쪽만 고쳐 조용히 어긋난다.
그래서 규칙은 여기가 단일 출처이고, 상세 화면(`fundamentals.py`)과 배치
(`snapshot.py`)가 둘 다 이것을 부른다.

## 수집(배치)은 여기 없다 — `snapshot.py` 로 갔다

한때 이 파일에 일정 전용 배치가 있었다. 그러나 일정과 스크리너 지표는 종목당
`get_info()` **같은 응답**에서 나오므로, 배치를 기능별로 나누면 같은 종목에 같은
호출을 두 번 치게 된다. 16회차에 야후가 정확히 그것 때문에 전 종목 요청을 거부했다.
그래서 수집은 하나로 합쳤고 이 파일에는 해석 규칙만 남겼다.
"""

import logging
from datetime import UTC, datetime, timedelta, timezone
from typing import Any

logger = logging.getLogger(__name__)

# ZoneInfo 는 Windows 에서 tzdata 패키지를 따로 요구한다. KST 는 서머타임이 없어
# 고정 오프셋이 정확하며 의존성도 늘지 않는다.
KST = timezone(timedelta(hours=9))


def _date_from_epoch(value: Any, tz: Any) -> str | None:
    """unix 초 → `YYYY-MM-DD`."""
    from app.utils.numbers import int_or_none

    seconds = int_or_none(value)
    if seconds is None:
        return None

    try:
        return datetime.fromtimestamp(seconds, tz=tz).strftime("%Y-%m-%d")
    except (OverflowError, OSError, ValueError) as exc:
        logger.debug("epoch 변환 실패 (%r): %s", value, exc)
        return None


def _from_calendar(ticker: Any) -> tuple[str | None, str | None]:
    """`(배당락일, 다음 실적발표일)` 폴백. info 에 값이 없을 때만 부른다.

    yfinance 의 `_fetch_calendar` 는 naive `datetime.fromtimestamp()` 를 쓰므로 서버
    로컬 시간대에 따라 하루가 밀린다. 그래서 1차 경로는 원본 epoch 를 직접 변환하고,
    여기는 진짜 마지막 수단이다.
    """
    try:
        calendar = ticker.calendar
    except Exception as exc:  # noqa: BLE001 - 폴백이 예외를 올리면 1차 값까지 잃는다
        logger.debug("calendar 조회 실패: %s", exc)
        return None, None

    if not isinstance(calendar, dict):
        return None, None

    def _as_text(value: Any) -> str | None:
        if isinstance(value, list | tuple):
            value = value[0] if value else None
        return value.strftime("%Y-%m-%d") if hasattr(value, "strftime") else None

    return _as_text(calendar.get("Ex-Dividend Date")), _as_text(calendar.get("Earnings Date"))


def extract_calendar_dates(ticker: Any, info: dict) -> tuple[str | None, str | None]:
    """`(배당락일, 다음 실적발표일)`. 둘 다 `YYYY-MM-DD` 또는 None.

    **실측으로만 알 수 있는 함정 셋이 여기 모여 있다.**

    1. `earningsTimestamp` 는 **직전** 발표일이다. 다음 발표일은
       `earningsTimestampStart` 다 (실측: 005930.KS 가 2026-08-04 시점에 각각
       2026-07-29 / 2026-10-28). 이걸 헷갈리면 '오늘의 일정' 이 과거를 가리킨다.
    2. `exDividendDate` 의 원본 epoch 는 **UTC 자정 정각**이다
       (1782691200 / 86400 = 20633.0). KST 로 읽으면 09:00 이 되어 날짜는 같지만,
       의미상 UTC 로 읽는 것이 맞다. 실적 쪽은 반대로 KST 로 읽는다.
    3. `ticker.calendar` 폴백은 하루가 밀릴 수 있다 (위 `_from_calendar`).
       그래서 1차는 항상 원본 epoch 다.

    호출자가 `info` 를 넘기는 이유: `ticker.info` 는 0.5~1.5초짜리라 이 함수가 다시
    부르면 안 된다. 이미 가진 것을 재사용한다.
    """
    ex_dividend = _date_from_epoch(info.get("exDividendDate"), UTC)
    next_earnings = _date_from_epoch(info.get("earningsTimestampStart"), KST)

    if ex_dividend is None or next_earnings is None:
        calendar_ex, calendar_earnings = _from_calendar(ticker)
        ex_dividend = ex_dividend or calendar_ex
        next_earnings = next_earnings or calendar_earnings

    return ex_dividend, next_earnings
