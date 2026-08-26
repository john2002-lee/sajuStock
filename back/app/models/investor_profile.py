"""투자 성향 프로파일 ORM 모델 (사주 통합 계획 5.2).

## 소유자를 다시 `owner_key` 로 둔다

`watchlist_items` 와 같은 규약이다 — 외래키가 아니라 불투명한 문자열이고, 값은
`anon:<uuid>` 또는 `user:<uuid>` 다. 로그인이 이미 붙었는데도 외래키를 걸지 않는
이유는 **온보딩이 로그인보다 앞설 수 있어야** 하기 때문이다. 생년월일시를 넣어
프로파일 카드를 본 다음에 가입하는 흐름이 자연스럽고, 그때 익명으로 만든 프로파일은
`transfer_owner` 한 번으로 계정에 승계된다.

## 소유자당 한 행

`owner_key` 에 유니크를 건다. 한 사람의 투자 성향은 하나다 — 여러 행을 허용하면
"어느 것이 지금 성향인가"를 매번 정해야 하고, 그 규칙(최신? 마지막 수정?)이 조회하는
곳마다 어긋난다.

## 생년월일시를 저장하지 않는다

계획의 데이터 흐름은 `생년월일시 → 사주엔진 → 프로파일 초안 → 사용자 보정 → 저장`
이고, 저장 대상은 **보정이 끝난 6개 숫자**다. 원본 생년월일시는 재산정에만 쓰이는데
재산정 허용 여부가 아직 미결이다(계획 11절). 쓸지 안 쓸지 모르는 민감정보를 미리
받아 두는 것은, 안 받는 것보다 나쁘다. 필요해지는 날 컬럼을 추가한다.
"""

from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class InvestorProfileRow(TimestampMixin, Base):
    """한 소유자의 투자 성향 한 건.

    이름 끝에 `Row` 를 붙인 이유: 같은 개념의 Pydantic 스키마가 이미
    `schemas/profile.InvestorProfile` 이고, 그쪽이 도메인 계층(`domain/fit.py`)까지
    흘러 다닌다. 두 이름이 같으면 import 한 줄만 어긋나도 ORM 객체가 순수 함수에
    들어가고, 그 오류는 런타임에야 드러난다.
    """

    __tablename__ = "investor_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)

    # 소유자당 하나. 조회는 전부 이 컬럼으로 시작한다.
    owner_key: Mapped[str] = mapped_column(String(80), unique=True, index=True)

    # 6개 축은 전부 0~100 정규화 값이다. 범위 검증은 Pydantic 계층이 하고
    # (`InvestorProfile` 의 ge/le), 여기서는 저장만 한다.
    risk_appetite: Mapped[int] = mapped_column(Integer)
    patience: Mapped[int] = mapped_column(Integer)
    decisiveness: Mapped[int] = mapped_column(Integer)
    loss_aversion: Mapped[int] = mapped_column(Integer)
    herd_tendency: Mapped[int] = mapped_column(Integer)

    # saju · survey · user_edited. 화면이 "사주 해석 기반 초안입니다"를 띄울지
    # 정하는 값이라 표시에 쓰이고, 판단 계산에는 들어가지 않는다.
    source: Mapped[str] = mapped_column(String(20), default="survey")

    # "화(火) 기운이 강해 결단이 빠른 편" — 프로파일 화면 전용 문장이다.
    # **판단 컨텍스트에 절대 넣지 않는다** (계획 5.7).
    saju_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<InvestorProfileRow {self.owner_key} {self.source}>"
