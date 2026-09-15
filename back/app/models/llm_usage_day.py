"""LLM 토큰 사용량 ORM 모델 — **일별 롤업**.

## 왜 호출 한 건당 한 행이 아닌가

관리자 화면이 묻는 것은 "오늘·이번 달·누적 얼마나 썼나" 셋뿐이다. 호출 단위 상세
(프롬프트·지연·finish_reason)는 이미 Amplitude 가 갖고 있고, 그쪽이 그 일에 더
알맞다. 여기에 호출별 행까지 쌓으면 같은 사실이 두 곳에 살면서, AI 판단 한 건이
LLM 4회(분석가 3 + 결정 1)라 행만 빠르게 불어난다.

(모델, KST 날짜)로 upsert 하면 이 표는 하루 몇 행에서 멈춘다. `visit_days` 가 방문을
"하루 1회"로 접는 것과 같은 판단이고, 근거도 같다 — **저장할 것은 물어볼 것뿐이다.**

## 왜 로그나 메모리가 아닌가

`advice_cache` 의 통계는 DB 로 내리지 않았다. 그쪽은 초당 바뀌는 현재 상태고
재시작하면 0 이어도 맞는 값이기 때문이다. 사용량은 반대다 — **누적이 뜻이라서**
재시작을 넘어 살아남아야 하고, 그러지 못하면 화면의 숫자가 "서버가 마지막으로
켜진 뒤 쓴 양"이 되어 아무도 그것을 예산과 비교할 수 없다.

## `usage_date` 는 **KST 날짜**다

`visit_days.visit_date` 와 같은 규약이다. DB 는 UTC 로 돌지만 "오늘 얼마나 썼나"는
한국 자정 기준이어야 하고, 환산은 쓰는 시점에 한 번만 한다
(`domain/visits.korean_date`). 조회마다 `at time zone` 을 붙이면 인덱스를 못 타고,
그 표현식을 쓰는 자리가 늘수록 한 곳을 빠뜨려 하루 밀린 숫자를 내놓게 된다.

## 모델을 키에 넣는 이유

이 저장소는 모델을 바꿔 가며 쓴다(Anthropic → OpenAI → Gemini, 그 안에서도
flash ↔ pro). 단가가 10배 넘게 차이 나므로 **합계만으로는 비용을 읽을 수 없다.**
모델별로 쪼개 두면 나중에 단가표를 곱하는 것만으로 비용이 나온다.
"""

from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LlmUsageDay(Base):
    """한 모델이 하루에 쓴 토큰."""

    __tablename__ = "llm_usage_days"
    __table_args__ = (
        # upsert 의 근거다. 이 제약이 없으면 `ON CONFLICT` 를 걸 대상이 없어
        # 호출마다 행이 쌓이고, 그 순간 "일별 롤업" 이라는 정의가 깨진다.
        UniqueConstraint("usage_date", "model", name="uq_llm_usage_date_model"),
        # 오늘·이번 달 집계가 전부 이 컬럼으로 시작한다.
        Index("ix_llm_usage_days_usage_date", "usage_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    #: **KST 기준 날짜.** UTC 가 아니다 (모듈 주석).
    usage_date: Mapped[date] = mapped_column(Date, nullable=False)

    #: `settings.gemini_model` 의 값을 그대로 쓴다. 별칭(`-latest`)도 적힌 대로 남긴다 —
    #: 정규화하면 "그날 실제로 무엇을 불렀나" 를 잃는다.
    model: Mapped[str] = mapped_column(String(80), nullable=False)

    #: **토큰을 태운 호출 수 — 거절도 포함한다.** SAFETY 로 막힌 응답에도 입력 토큰은
    #: 실려 오고, 그것을 빼면 "토큰만 쓰고 결과가 없던" 구간이 표에서 사라진다.
    #: 네트워크 실패처럼 사용량 자체가 없는 호출만 빠진다.
    #: 서버 기본값을 모델과 마이그레이션 양쪽에 둔다 — 어긋나면 `alembic check` 가
    #: drift 로 잡고 그 소음이 진짜 drift 를 가린다 (`visit_days.hits` 와 같은 이유).
    calls: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0", nullable=False
    )

    #: `BigInteger` 인 것은 여유다. 하루 한 모델이 int32(21억)를 넘길 일은 없지만,
    #: 넘겼을 때 나는 오류가 조용한 오버플로라 값을 되돌릴 수 없다.
    input_tokens: Mapped[int] = mapped_column(
        BigInteger, default=0, server_default="0", nullable=False
    )
    #: 본문 출력. 사고 토큰은 아래에 따로 있다
    output_tokens: Mapped[int] = mapped_column(
        BigInteger, default=0, server_default="0", nullable=False
    )
    #: 사고(thinking). **출력과 같은 단가로 과금된다** (`domain/llm_usage` 주석)
    reasoning_tokens: Mapped[int] = mapped_column(
        BigInteger, default=0, server_default="0", nullable=False
    )
    #: 캐시에서 읽은 입력. 입력의 부분집합이라 합계에 더하지 않는다
    cache_read_tokens: Mapped[int] = mapped_column(
        BigInteger, default=0, server_default="0", nullable=False
    )
    #: 프로바이더가 셈한 합계. 화면이 "합계" 로 쓰는 값이다
    total_tokens: Mapped[int] = mapped_column(
        BigInteger, default=0, server_default="0", nullable=False
    )

    #: 그 모델을 그날 처음 부른 시각. upsert 에서 갱신하지 않는다 — 덮으면 뜻이 사라진다.
    #: (화면의 "집계 시작일" 은 `min(usage_date)` 에서 온다. 날짜 하나면 충분하고
    #: 그쪽이 인덱스를 탄다. 이 컬럼은 하루 안에서 언제 시작됐는지를 남긴다.)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    #: 마지막으로 부른 시각. 사용량이 멈췄는지 보는 값이다. upsert 는 `greatest` 로
    #: 민다 — 동시에 끝난 호출의 커밋 순서가 시작 순서와 달라 뒤로 갈 수 있다
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return (
            f"<LlmUsageDay {self.usage_date} {self.model} "
            f"calls={self.calls} total={self.total_tokens}>"
        )
