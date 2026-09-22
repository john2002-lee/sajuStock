"""보관 기간의 경계. I/O 없음.

## 왜 한 줄 계산을 꺼내 두나

개인정보처리방침이 "주문 생성일로부터 N일 후 파기합니다" 라고 **약속**한다. 그 문장을
지키는 코드가 이 경계 하나이고, 여기가 하루 어긋나면 약속을 어기거나(늦게 지움) 산
데이터를 지운다(일찍 지움). 둘 다 화면에는 아무 흔적이 없다.

경계는 **경과 시간**으로 본다 — `created_at + N일` 이 지났는가. 달력 날짜로 세지
않는 이유는 시간대다: 서버는 UTC 로 돌고 화면의 "N일" 은 한국 사람이 읽는 말이라,
달력으로 세면 자정을 낀 주문이 하루 일찍 지워질 수 있다. 경과 시간으로 재면 어느
시간대에서 보든 최소 N일은 보장된다 — 약속을 어기지 않는 쪽으로 기운다.

`domain/visits.korean_date` 가 KST 달력 날짜를 쓰는 것과 반대 선택인데 목적이 다르다.
그쪽은 "오늘 몇 명" 을 세는 집계라 사람의 하루에 맞춰야 하고, 이쪽은 파기 약속이라
**덜 지우는 쪽이 안전하다.**

## 기간을 줄였을 때 — 이미 산 사람의 약속은 그대로다

2026-09-21 에 보관 기간을 30일에서 7일로 줄였다. 그때 운영 DB 에는 결제 완료 주문이
50건 있었고 **38건이 이미 7일을 넘긴 상태**였다. 새 기간을 그대로 적용하면 배포하는
순간 그 38명의 리포트가 사라진다 — 그분들이 돈을 낼 때 화면과 방침이 약속한 것은
30일이었다.

약속은 **구매 시점에 걸린다.** 그래서 경계가 둘이다: 변경일 이전 주문은 옛 기간,
이후 주문은 새 기간. 시간이 지나 옛 주문이 모두 만료되면 이 분기는 저절로 죽는다
(설정에서 지우면 된다).
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

#: 한국 표준시. 정책 변경일은 사람이 읽는 날짜라 KST 자정을 경계로 삼는다.
_KST = timezone(timedelta(hours=9), "KST")


@dataclass(frozen=True)
class RetentionCutoffs:
    """파기 대상을 가르는 두 경계.

    지우는 쪽은 이렇게 읽는다 — 주문이 `changed_at` **이전**에 생겼으면
    `legacy` 보다 오래됐을 때, 이후에 생겼으면 `current` 보다 오래됐을 때.
    """

    #: 정책이 바뀐 시각. 이 앞뒤로 적용할 약속이 갈린다
    changed_at: datetime
    #: 변경 **이전** 주문에 적용할 경계 (옛 약속)
    legacy: datetime
    #: 변경 **이후** 주문에 적용할 경계 (지금 약속)
    current: datetime


def _cutoff(now: datetime, days: int) -> datetime:
    if days < 1:
        raise ValueError(f"보관 기간은 1일 이상이어야 합니다: {days}")
    return now - timedelta(days=days)


def expiry_cutoff(now: datetime, retention_days: int) -> datetime:
    """이 시각보다 **앞서** 만들어진 주문이 파기 대상이다.

    경계값(정확히 N일 된 주문)은 포함하지 않는다. 지우는 쪽이 `created_at < cutoff`
    로 비교하므로 딱 N일이 된 주문은 한 틱 더 산다 — 약속이 "N일 후 파기" 이므로
    N일째에 아직 살아 있는 편이 맞다.
    """
    return _cutoff(now, retention_days)


def retention_cutoffs(
    now: datetime,
    *,
    retention_days: int,
    legacy_retention_days: int,
    changed_on: date,
) -> RetentionCutoffs:
    """두 약속을 함께 계산한다.

    `legacy_retention_days` 가 `retention_days` 보다 짧으면 의미가 없다 — 기간을
    **늘렸을** 때는 옛 주문도 새 기간의 혜택을 받으면 되므로, 그 경우 둘을 같게
    맞춰 분기를 없앤다. 분기는 지켜야 할 옛 약속이 더 길 때만 존재할 이유가 있다.
    """
    effective_legacy = max(legacy_retention_days, retention_days)
    return RetentionCutoffs(
        changed_at=datetime.combine(changed_on, time.min, tzinfo=_KST),
        legacy=_cutoff(now, effective_legacy),
        current=_cutoff(now, retention_days),
    )
