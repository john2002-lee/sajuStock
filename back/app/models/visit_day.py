"""접속 이력 ORM 모델 — 하루·방문자당 한 행.

## 왜 방문 한 건이 아니라 "방문한 날" 인가

승인된 정의가 **하루 1회**다. 같은 사람이 하루에 열 번 와도 접속 1회로 센다.

그 정의를 스키마가 그대로 담으면(하루당 한 행) 얻는 것이 셋이다.

1. **용량이 예측된다.** 행 수는 `방문자 × 방문일` 이라 하루 2,000명이면 연 73만 행
   수준이다. 페이지뷰마다 한 행이면 같은 트래픽에서 수천만 행이 되고, 그때부터는
   집계에 별도 롤업 테이블이 필요해진다.
2. **집계가 세지 않고 센다.** 일일 접속자수가 `where visit_date = ?` 의 행 수이고,
   총 접속자수가 `count(distinct owner_key)` 다 — 중복 제거를 조회 시점에 하지 않는다.
3. **기록이 멱등이다.** upsert 라 비콘이 몇 번 불려도 결과가 같다. 그래서 클라이언트
   쪽 중복 방지를 느슨하게 둘 수 있다(`VisitBeacon` 은 탭당 1회만 시도하지만,
   그 보장이 깨져도 숫자가 틀어지지 않는다).

`hits` 를 함께 세는 것은 정의를 바꾸지 않고 **밀도**를 보기 위해서다. "어제 500명이
왔다" 와 "그 500명이 평균 3번씩 열어 봤다" 는 다른 질문이고, 후자를 나중에 물어볼 때
스키마를 고치지 않아도 된다.

## `users` 에 외래키를 걸지 않는다

`admin_audit_log` 와 같은 판단이고 이유는 둘이다.

* **행의 절반 이상이 익명이다.** 사주 서비스는 회원가입을 받지 않으므로 `anon:` 키가
  다수이고, 그 키에 대응하는 `users` 행은 존재하지 않는다.
* **계정을 지워도 집계는 남아야 한다.** 외래키가 있으면 그 사람의 방문 기록이 함께
  사라지거나(CASCADE) 삭제가 막힌다(RESTRICT). 어제까지의 총접속자수가 오늘 계정
  하나를 지웠다고 줄어들면 그 숫자는 더 이상 집계가 아니다.

대가는 `watchlist_items.owner_key` 와 같다 — 정합성을 DB 가 아니라 우리가 진다.

## `visit_date` 는 **KST 날짜**다

DB 는 UTC 로 돌지만 "오늘 몇 명" 은 한국 자정 기준이어야 한다. 환산은 쓰는 시점에
한 번만 한다 (`domain/visits.korean_date`). 조회할 때마다 `at time zone` 을 붙이면
표현식이 이 컬럼의 인덱스를 못 타고, 그 표현식을 쓰는 자리가 늘어날수록 한 곳을
빠뜨려 하루 밀린 숫자를 내놓을 확률이 올라간다.
"""

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class VisitDay(Base):
    """한 방문자가 하루에 접속한 기록."""

    __tablename__ = "visit_days"
    __table_args__ = (
        # upsert 의 근거다. 이 제약이 없으면 `ON CONFLICT` 를 걸 대상이 없어
        # 비콘 중복이 그대로 중복 행이 되고, 그 순간 "하루 1회" 정의가 깨진다.
        UniqueConstraint("owner_key", "visit_date", name="uq_visit_owner_date"),
        # 일일 접속자수와 30일 추이가 전부 이 컬럼으로 시작한다.
        Index("ix_visit_days_visit_date", "visit_date"),
        # 회원별 집계는 소유자로 모은다. 위 유니크 제약의 선행 컬럼이 `owner_key`
        # 라 그 인덱스로도 되지만, 제약의 컬럼 순서는 언제든 바뀔 수 있는 것이라
        # 조회가 의존하는 인덱스는 따로 명시한다.
        Index("ix_visit_days_owner_key", "owner_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    #: 익명 브라우저 ID(`anon:`) 또는 로그인 사용자(`user:`).
    #: `watchlist_items.owner_key` 와 **같은 타입·같은 규약**이다 — 회원별 집계가
    #: 그쪽과 같은 방식으로 `users` 에 조인한다.
    owner_key: Mapped[str] = mapped_column(String(80), nullable=False)

    #: **KST 기준 날짜.** UTC 가 아니다 (모듈 주석).
    visit_date: Mapped[date] = mapped_column(Date, nullable=False)

    #: 그날 처음 온 시각. upsert 에서 갱신하지 않는다.
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    #: 그날 마지막으로 온 시각. **"최근 접속일시" 의 원본이다** — 회원별 화면이
    #: 이 값의 최댓값을 보여준다.
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    #: 그날 비콘이 몇 번 닿았는지. 접속 정의(하루 1회)를 바꾸지 않고 밀도를 본다.
    #: 서버 기본값을 함께 두는 이유는 `admin_audit_log.ok` 와 같다 — 모델과
    #: 마이그레이션이 어긋나면 `alembic check` 가 drift 로 잡고, 그 소음이 진짜
    #: drift 를 가린다.
    hits: Mapped[int] = mapped_column(
        Integer, default=1, server_default="1", nullable=False
    )

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<VisitDay {self.owner_key} {self.visit_date} hits={self.hits}>"
