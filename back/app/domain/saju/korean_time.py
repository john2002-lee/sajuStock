"""한국 표준시 자오선·서머타임 역사표. 순수 조회표 — I/O 없음.

두 표 모두 1차 출처는 IANA tzdata(`asia` 파일, Zone `Asia/Seoul`)이고, tzdata 의
한국 항목 자체는 관보·대통령령과 당대 신문을 근거로 한다(아래 인용).
원본: `SajuService/src/lib/saju/koreanTime.ts` (2026-07-29 기준 fetch).
"""

from dataclasses import dataclass

#: 이 이전(지방평균시 시대)은 제품 범위 밖이다 — 표준자오선이 없어 보정할 기준이 없다.
EARLIEST_SUPPORTED = (1908, 4, 1)

#: 역대 한국 표준자오선. tzdata 의 `Zone Asia/Seoul` 전환점이며 각각 근거가 있다.
#:
#:  - 1908: 대한제국 관보 제3994호(칙령 제5호)  → 127.5E (UTC+8:30)
#:  - 1912: 조선총독부 관보 제367호             → 135E   (UTC+9:00)
#:  - 1954: 대통령령 제876호 (1954-03-17)       → 127.5E (UTC+8:30)
#:  - 1961: 법률 제676호 (1961-08-07)           → 135E   (UTC+9:00)
_MERIDIAN_ERAS: tuple[tuple[int, float], ...] = (
    (19080401, 127.5),
    (19120101, 135.0),
    (19540321, 127.5),
    (19610810, 135.0),
)


def date_key(year: int, month: int, day: int) -> int:
    """y*10000 + m*100 + d — 오름차순 비교가 그대로 날짜 비교가 된다."""
    return year * 10000 + month * 100 + day


_EARLIEST_KEY = date_key(*EARLIEST_SUPPORTED)


def standard_meridian(year: int, month: int, day: int) -> float:
    """그 날짜에 유효했던 표준자오선(127.5E 또는 135E).

    `EARLIEST_SUPPORTED` 이전이면 예외다. 조용히 아무 값이나 돌려주면 지방평균시
    시대의 출생이 **틀린 보정을 받은 채** 그럴듯한 차트가 되어 나온다.
    """
    key = date_key(year, month, day)
    if key < _EARLIEST_KEY:
        y, m, d = EARLIEST_SUPPORTED
        raise ValueError(
            f"standard_meridian: {y}-{m}-{d} 이전(지방평균시 시대)은 지원하지 않습니다"
        )

    meridian = _MERIDIAN_ERAS[0][1]
    for from_key, value in _MERIDIAN_ERAS:
        if key >= from_key:
            meridian = value
    return meridian


@dataclass(frozen=True)
class DstPeriod:
    """한 해의 서머타임 구간. KST 벽시계(naive local) 기준이다.

    `start_hour`/`end_hour` 는 전환이 일어나는 **표준시** 시각이지 서머타임 쪽
    시계 숫자가 아니다.

     - `start_day` 의 `start_hour` 시는 건너뛰는 시간이다. 시계가 그 시각에서
       곧바로 +1시간으로 뛰므로 그 naive 시각은 실제로 존재하지 않는다.
       서머타임은 `start_hour + 1` 시부터 유효하다.
     - `end_day` 의 `end_hour` 시는 되풀이되는 시간이다. 시계가 `end_hour + 1` 시에
       닿았다가 `end_hour` 시로 돌아오므로 그 naive 시각은 두 번 지나간다.
       서머타임은 그 날 `end_hour` 시 **직전까지만** 유효하다.

    스펙 §8.2 에 따라 건너뛴 시각과 되풀이된 시각은 **둘 다 표준시로** 해석한다.
    """

    year: int
    start_month: int
    start_day: int
    start_hour: int
    end_month: int
    end_day: int
    end_hour: int


#: 한국 서머타임 구간(1948-1988). 한국전쟁 전후 1952-1954 와 1988 이후는 없다.
#:
#: 출처는 tzdata `asia` 의 `Rule ROK` 줄이고, 그쪽이 다시 인용하는 근거는
#: 1948-1960 구간에 대한 당대 한국 신문 대조(Sanghyuk Jung, 2014-10-29)와
#: 1955-1960 종료 일시에 대한 국가기록원 관보 스캔(Phake Nick, 2018-10-27)이다.
#: "Sat>=N"/"Sun>=N" 형태의 규칙은 해마다 달력 계산으로 실제 날짜를 풀어 적었다.
#:
#: 통설과의 차이 하나: 2차 자료 다수가 1948년 시작을 5월 31일로 적지만, tzdata 가
#: 인용하는 1차 자료(1948년 한국어 신문 기사)는 6월 1일이다. 여기서는 tzdata 를 따른다.
DST_PERIODS: tuple[DstPeriod, ...] = (
    DstPeriod(1948, 6, 1, 0, 9, 12, 23),
    DstPeriod(1949, 4, 3, 0, 9, 10, 23),
    DstPeriod(1950, 4, 1, 0, 9, 9, 23),
    DstPeriod(1951, 5, 6, 0, 9, 8, 23),
    DstPeriod(1955, 5, 5, 0, 9, 8, 23),
    DstPeriod(1956, 5, 20, 0, 9, 29, 23),
    DstPeriod(1957, 5, 5, 0, 9, 21, 23),
    DstPeriod(1958, 5, 4, 0, 9, 20, 23),
    DstPeriod(1959, 5, 3, 0, 9, 19, 23),
    DstPeriod(1960, 5, 1, 0, 9, 17, 23),
    DstPeriod(1987, 5, 10, 2, 10, 11, 2),
    DstPeriod(1988, 5, 8, 2, 10, 9, 2),
)

_DST_BY_YEAR = {period.year: period for period in DST_PERIODS}


def is_dst(year: int, month: int, day: int, hour: int) -> bool:
    """그 KST 벽시계 시각이 서머타임 구간 안인지.

    시작의 건너뛴 시각과 종료의 되풀이된 시각은 둘 다 표준시(False)로 떨어진다
    (스펙 §8.2, `DstPeriod` 주석).
    """
    period = _DST_BY_YEAR.get(year)
    if period is None:
        return False

    key = month * 100 + day
    start_key = period.start_month * 100 + period.start_day
    end_key = period.end_month * 100 + period.end_day

    if key < start_key or key > end_key:
        return False
    if key == start_key and hour <= period.start_hour:
        return False  # 시작 전이거나, 건너뛴 그 시각
    if key == end_key and hour >= period.end_hour:
        return False  # 되풀이된 그 시각이거나, 종료 후
    return True
