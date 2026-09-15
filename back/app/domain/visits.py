"""접속 집계의 순수 함수. I/O 없음.

## 왜 이 파일이 따로 있나

여기 있는 것은 사실상 하나 — **"이 순간은 한국 날짜로 며칠인가"** 다. 한 줄짜리
계산이지만 이 작업에서 유일하게 조용히 틀릴 수 있는 자리라 밖으로 꺼냈다.

DB 는 UTC 로 돌고 화면이 묻는 것은 "오늘 몇 명 왔나" 다. 그 "오늘" 이 KST 자정
기준이어야 하는데, 두 프레임이 9시간 어긋나므로 **UTC 15:00 부터는 이미 한국의
다음 날**이다. 이것을 틀리면 오류는 없고 숫자만 하루 밀린다 — 아무도 눈치채지
못하는 종류다.

## 저장 시점에 환산한다

`visit_days.visit_date` 에 **KST 날짜를 넣는다.** 조회할 때마다
`(created_at at time zone 'Asia/Seoul')::date` 로 바꾸는 방법도 있지만 그러면
표현식이 컬럼 인덱스를 타지 못하고, 무엇보다 그 표현식을 쓰는 자리가 늘어날수록
한 곳을 빠뜨릴 확률이 올라간다. 환산은 쓰는 곳 한 군데에서 끝낸다.

## `domain/saju/korean_time.py` 와의 관계

그쪽도 한국 시간을 다루지만 목적이 다르다 — 사주는 **진태양시**(경도·균시차 보정)를
계산하고 표준자오선이 역사적으로 바뀐 것까지 따라간다. 여기서 필요한 것은 현재
시행 중인 시계 시각(UTC+9)뿐이라 그 무거운 계산을 끌어오지 않는다. 두 모듈이
같은 상수를 쓰지 않는 것은 의도적이다.
"""

from datetime import UTC, date, datetime, timedelta, timezone

#: 현재 시행 중인 한국 표준시. 사주 엔진이 다루는 역사적 자오선 변경과 무관하다 —
#: 접속 통계는 오늘·어제를 셀 뿐이고 과거를 소급 계산하지 않는다.
KST = timezone(timedelta(hours=9), "KST")


def korean_date(moment: datetime | None = None) -> date:
    """그 순간의 한국 날짜. `moment` 가 없으면 지금.

    tz 정보가 없는 `datetime` 은 **UTC 로 간주한다.** 이 앱의 naive datetime 은
    전부 DB 에서 온 UTC 값이고(`DateTime(timezone=True)` 컬럼을 드라이버가 naive
    로 주는 경우), 로컬 시간으로 해석하면 개발 기계의 시간대에 따라 결과가 달라진다.
    """
    if moment is None:
        moment = datetime.now(UTC)
    elif moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)

    return moment.astimezone(KST).date()


def recent_dates(days: int, *, today: date | None = None) -> list[date]:
    """오늘부터 거꾸로 `days` 일. 최신이 먼저.

    추이 그래프가 **방문이 0건인 날도 그려야** 하기 때문에 있다. DB 는 행이 있는
    날만 돌려주므로, 빈 날을 화면에서 만들어 내면 "그날은 조회가 안 된 것" 과
    "그날은 아무도 안 왔다" 가 구분되지 않는다. 축을 여기서 먼저 세우고 DB 값을
    얹는다.
    """
    if days < 1:
        return []

    base = today if today is not None else korean_date()
    return [base - timedelta(days=offset) for offset in range(days)]
