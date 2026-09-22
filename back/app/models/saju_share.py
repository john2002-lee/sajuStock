"""사주 결과 공유 링크 ORM 모델.

## 이 표는 무료 경로의 "아무것도 저장하지 않는다" 를 **의도적으로** 깬다

`endpoints/saju.py` 와 `services/saju_job_store.py` 가 지키는 약속은 "무료로 사주를
보는 사람의 것은 서버에 남지 않는다" 였다. 결과를 친구에게 **링크로** 보내려면 그
약속을 깰 수밖에 없다 — 링크가 가리킬 무언가가 서버에 있어야 하기 때문이다.

깨는 대신 세 가지로 좁힌다.

1. **공유 버튼을 누를 때만** 행이 생긴다. 사주를 보는 것만으로는 아무것도 안 남는다.
   행의 존재가 곧 동의다.
2. **여덟 글자와 무료 요약만** 담는다. 생년월일시 원본도, 양력 환산일도, 시주를
   제외한 보정값도, 리포트 본문도 들어오지 않는다 (아래 "담지 않는 것").
3. **7일이면 사라진다** (`saju_share_retention_days`). 유료 주문의 보관 기간과 값이
   같지만 **묶여 있지 않다** — 그쪽은 돈을 받고 한 약속이고 이쪽은 아니므로, 설정이
   둘로 나뉘어 있어 한쪽이 움직일 때 다른 쪽이 따라가지 않는다.

개인정보처리방침의 무료 경로 문구가 이 표와 **반드시 같은 말을 해야 한다.**

## 담지 않는 것, 그리고 왜

`solar_date` — 양력 환산일이다. 그 한 칸이 곧 생년월일이다.
시주를 뺀 개별 기둥 — `pillars_hangul` 안에 세 글자 또는 네 글자로만 들어간다.
`conventions.longitude_correction_minutes` · `equation_of_time_minutes` — 이 둘은
  출생지를 좁힌다. 보정 분값의 조합이 곧 경도다.
`birth_place_code` · 리포트 마크다운 · 추가 질문 텍스트 — 애초에 받지 않는다.

`char_count` 도 빼 두었다. `len(pillars_hangul)` 로 나오는 값이라 새는 것은 없지만,
**스키마에 없는 칸은 실수로 채울 수도 없다.**

## `share_id` 가 PK 다 — `advice_verdicts` 와 다른 점

주식 쪽은 `share_id` 가 nullable 컬럼이고 `NULL` 이 비공개를 뜻한다. 그 표의 행은
소유자 자신의 목록을 위해 이미 존재하고, 공유는 거기 붙는 선택이기 때문이다.

이 표의 행은 **공유되기 위해서만** 존재한다. 표현할 비공개 상태가 없고, 소유자
컬럼도 없다 — 이 결과를 소유자별로 보여 주는 화면이 없으므로 owner 를 받으면
쓰지도 않을 개인 식별자를 하나 더 저장하는 셈이다.
"""

from sqlalchemy import Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class SajuShareRow(TimestampMixin, Base):
    """공유 링크 하나가 가리키는 티저 수준 투영."""

    __tablename__ = "saju_shares"
    __table_args__ = (
        # 정리는 `created_at` 으로만 훑는다. 소유자별로 좁힐 수 없으므로
        # (owner 컬럼이 없다) 이 색인이 없으면 전체 스캔이 된다.
        Index("ix_saju_shares_created_at", "created_at"),
    )

    #: `secrets.token_urlsafe(16)` = 128비트, 22자. 주소가 곧 열쇠이므로 짧게
    #: 하면 남의 링크를 긁어 볼 수 있다. 길이는 `advice_verdicts.share_id` 와 맞춘다.
    share_id: Mapped[str] = mapped_column(String(32), primary_key=True)

    #: 세 글자(시각 모름) 또는 네 글자. 각 항목이 "경오" 처럼 두 글자다.
    #: 통째로 읽고 한 번 쓰고 안을 조건으로 검색하지 않으므로 JSONB 다
    #: (`advice_verdicts.agent_opinions` 와 같은 판단).
    pillars_hangul: Mapped[list] = mapped_column(JSONB)

    day_master_hangul: Mapped[str] = mapped_column(String(4))

    #: 오행 → 개수. 다섯 칸짜리 작은 맵이다.
    visible_wuxing: Mapped[dict] = mapped_column(JSONB)

    #: 신강 · 중화 · 신약.
    strength_verdict: Mapped[str] = mapped_column(String(8))

    #: 무료 요약 한 문단. 서버가 계산해 만든 문장이고 LLM 출력이 아니다.
    summary: Mapped[str] = mapped_column(Text)
