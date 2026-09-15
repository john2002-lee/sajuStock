"""접속 집계의 날짜 계산 — 조용히 하루 밀리는 것을 막는다.

이 파일이 따로 있는 이유는 **DB 없이 돌아야** 하기 때문이다. 접속 통계의 나머지는
전부 upsert·집계 쿼리라 Postgres 가 필요한데, 유일하게 오류 없이 틀릴 수 있는 부분
(KST 환산)은 순수 함수라 여기서 잡을 수 있다.

DB 는 UTC, 화면이 묻는 "오늘" 은 KST 자정 기준이다. 두 프레임이 9시간 어긋나므로
**UTC 15:00 부터는 이미 한국의 다음 날**이고, 이걸 틀리면 일일 접속자수가 하루씩
밀린 채로 아무 에러 없이 동작한다.
"""

from datetime import UTC, date, datetime, timedelta, timezone

from app.domain.visits import KST, korean_date, recent_dates


class TestKoreanDate:
    def test_utc_midnight_is_the_same_korean_day_at_9am(self) -> None:
        """UTC 00:00 = KST 09:00 — 아직 같은 날이다."""
        assert korean_date(datetime(2026, 9, 7, 0, 0, tzinfo=UTC)) == date(2026, 9, 7)

    def test_utc_1459_is_still_the_same_korean_day(self) -> None:
        """UTC 14:59 = KST 23:59 — 경계 **직전**."""
        assert korean_date(datetime(2026, 9, 7, 14, 59, tzinfo=UTC)) == date(2026, 9, 7)

    def test_utc_1500_is_already_the_next_korean_day(self) -> None:
        """UTC 15:00 = KST 다음날 00:00 — **이 테스트가 이 파일의 존재 이유다.**

        저녁에 접속한 한국 사용자가 UTC 날짜로 집계되면 다음 날 몫으로 세어진다.
        오류는 나지 않고 숫자만 틀린다.
        """
        assert korean_date(datetime(2026, 9, 7, 15, 0, tzinfo=UTC)) == date(2026, 9, 8)

    def test_naive_datetime_is_read_as_utc_not_local(self) -> None:
        """tz 없는 값은 **UTC 로 본다** — 개발 기계의 시간대에 따라 달라지면 안 된다.

        드라이버가 `DateTime(timezone=True)` 컬럼을 naive 로 주는 경우가 있고,
        그것을 로컬 시간으로 해석하면 같은 코드가 서울과 런던에서 다른 답을 낸다.
        """
        assert korean_date(datetime(2026, 9, 7, 15, 0)) == date(2026, 9, 8)

    def test_a_kst_aware_value_is_not_shifted_again(self) -> None:
        """이미 KST 인 값에 9시간을 또 더하지 않는다."""
        assert korean_date(datetime(2026, 9, 7, 0, 30, tzinfo=KST)) == date(2026, 9, 7)

    def test_other_zones_convert_correctly(self) -> None:
        """UTC·KST 가 아닌 값도 KST 로 옮겨 읽는다."""
        ny = timezone(timedelta(hours=-4))
        # 뉴욕 2026-09-07 12:00 = UTC 16:00 = KST 2026-09-08 01:00
        assert korean_date(datetime(2026, 9, 7, 12, 0, tzinfo=ny)) == date(2026, 9, 8)

    def test_defaults_to_now_without_raising(self) -> None:
        """인자 없이 부를 수 있다 — 기록 경로가 그렇게 쓴다."""
        assert isinstance(korean_date(), date)


class TestRecentDates:
    def test_newest_first_and_contiguous(self) -> None:
        """최신이 먼저, 하루씩 끊김 없이."""
        got = recent_dates(3, today=date(2026, 9, 7))

        assert got == [date(2026, 9, 7), date(2026, 9, 6), date(2026, 9, 5)]

    def test_spans_a_month_boundary(self) -> None:
        """월이 바뀌는 구간에서도 날짜 산술이 맞는지."""
        got = recent_dates(2, today=date(2026, 9, 1))

        assert got == [date(2026, 9, 1), date(2026, 8, 31)]

    def test_zero_or_negative_gives_nothing(self) -> None:
        """0 일 추이는 빈 목록이다 — 예외가 아니다."""
        assert recent_dates(0, today=date(2026, 9, 7)) == []
        assert recent_dates(-5, today=date(2026, 9, 7)) == []

    def test_axis_exists_so_empty_days_can_be_drawn(self) -> None:
        """**축을 여기서 세우는 것이 목적이다.**

        DB 는 행이 있는 날만 준다. 화면이 빈 날을 스스로 만들지 않으면
        "조회가 안 됐다" 와 "아무도 안 왔다" 가 구분되지 않는다.
        """
        axis = recent_dates(30, today=date(2026, 9, 7))

        assert len(axis) == 30
        assert axis[0] == date(2026, 9, 7)
        assert axis[-1] == date(2026, 8, 9)
