"""파기 경계 — 약속을 어기지도, 산 데이터를 지우지도 않는다.

이 파일이 지키는 것은 **돈 낸 사람의 리포트**다. 경계가 하루 어긋나면 약속보다
일찍 지우고, 분기를 잘못 두면 기간을 줄이는 배포 한 번이 이미 팔린 주문을 쓸어
간다. 실제로 2026-09-21 에 30일 → 7일로 줄일 때 운영 DB 의 결제 완료 주문 50건 중
**38건이 이미 7일을 넘긴 상태**였다 — 그대로 배포했다면 그 자리에서 사라졌다.

DB 없이 돌아야 하므로 순수 함수만 다룬다. 실제 삭제 질의는
`repositories/saju_order.delete_expired` 가 이 값들을 그대로 쓴다.
"""

from datetime import UTC, date, datetime, timedelta

import pytest

from app.domain.saju_retention import expiry_cutoff, retention_cutoffs

NOW = datetime(2026, 9, 21, 12, 0, tzinfo=UTC)


class TestExpiryCutoff:
    def test_cutoff_is_now_minus_the_period(self) -> None:
        assert expiry_cutoff(NOW, 7) == NOW - timedelta(days=7)

    def test_an_order_exactly_n_days_old_is_not_yet_expired(self) -> None:
        """**약속은 'N일 후 파기' 다.** N일째에는 아직 살아 있어야 한다.

        삭제 질의가 `created_at < cutoff` 로 비교하므로, 정확히 경계에 있는 주문은
        포함되지 않는다. 이 한 틱이 '7일 보관' 과 '6일 보관' 을 가른다.
        """
        cutoff = expiry_cutoff(NOW, 7)
        exactly_seven_days_old = NOW - timedelta(days=7)

        assert not (exactly_seven_days_old < cutoff)

    def test_zero_or_negative_is_rejected(self) -> None:
        """0일 보관은 '즉시 파기' 가 아니라 설정 실수다. 조용히 다 지우면 안 된다."""
        with pytest.raises(ValueError):
            expiry_cutoff(NOW, 0)


class TestGrandfathering:
    def _cutoffs(self, **kw):
        return retention_cutoffs(
            NOW,
            retention_days=kw.get("current", 7),
            legacy_retention_days=kw.get("legacy", 30),
            changed_on=kw.get("changed_on", date(2026, 9, 21)),
        )

    def test_orders_sold_under_the_old_promise_keep_it(self) -> None:
        """**이 테스트가 이 파일의 존재 이유다.**

        변경 전에 팔린 10일 된 주문은 새 기간(7일)을 넘겼지만 옛 약속(30일) 안이다.
        지워지면 안 된다.
        """
        c = self._cutoffs()
        sold_before = NOW - timedelta(days=10)

        assert sold_before < c.changed_at, "변경 전에 팔린 주문이어야 한다"
        assert not (sold_before < c.legacy), "옛 약속 안이므로 살아 있어야 한다"

    def test_orders_sold_under_the_old_promise_still_expire_eventually(self) -> None:
        """영원히 보관하지는 않는다 — 옛 약속의 기간이 지나면 지운다."""
        c = self._cutoffs()
        sold_long_ago = NOW - timedelta(days=31)

        assert sold_long_ago < c.changed_at
        assert sold_long_ago < c.legacy

    def test_new_orders_get_the_new_promise(self) -> None:
        c = self._cutoffs(changed_on=date(2026, 9, 1))
        sold_after = NOW - timedelta(days=8)

        assert sold_after >= c.changed_at
        assert sold_after < c.current, "새 약속(7일)을 넘겼으므로 파기 대상"

    def test_lengthening_the_period_needs_no_branch(self) -> None:
        """기간을 **늘렸을** 때는 옛 주문도 새 기간의 혜택을 받으면 된다.

        분기는 지켜야 할 옛 약속이 더 길 때만 뜻이 있다. 그러지 않으면 옛 주문만
        더 일찍 지워지는, 아무도 원하지 않는 동작이 된다.
        """
        c = self._cutoffs(current=30, legacy=7)

        assert c.legacy == c.current

    def test_the_change_boundary_is_korean_midnight(self) -> None:
        """변경일은 사람이 읽는 날짜다. UTC 자정으로 잡으면 9시간이 어긋난다."""
        c = self._cutoffs(changed_on=date(2026, 9, 21))

        assert c.changed_at == datetime(2026, 9, 20, 15, 0, tzinfo=UTC)
