"""배치 실행 기록 ORM 모델.

## 왜 필요한가 — 조기 경보의 **도착지**가 없었다

이 프로젝트는 조용히 틀리는 경로마다 로그를 심어 왔다: 0건 경보(14회차), 응답률이
무너진 배치를 버리는 가드(16회차), 레이트리밋 분류(P0-4), 실패 뒤 30분 백오프(P1-4).
그런데 **그 신호가 도착하는 곳이 `logger.error` 하나뿐이었다.** 수집기도 알림도
없고 `/health` 는 DB 를 보지 않는다. 즉 백오프와 상한을 조정해도 효과를 확인할
방법이 없었다 — 조정한 값이 맞는지 아는 유일한 방법이 서버 콘솔을 사람이 보는
것이었고, 그건 운영이 아니다.

이 테이블은 그 신호를 **읽을 수 있는 곳**에 남긴다. 관리자 화면이 "마지막 실패가
언제, 왜였는지" 를 한 줄로 보여주면, 배치가 도는지 여부가 처음으로 관측 가능해진다.

## 로그와 무엇이 다른가

로그는 프로세스와 함께 사라지고 워커마다 흩어진다. 배치 결과는 **하루 몇 건**이라
저장 비용이 사실상 없고, 대신 재시작을 넘어 살아남는다. `advice_cache` 의 통계를
DB 로 내리지 않은 것과 반대 판단인데 근거가 다르다 — 그쪽은 초당 수십 번 바뀌는
현재 상태고, 이쪽은 하루 몇 번의 사건이다.

## 성공도 남긴다

실패만 남기면 "실패가 없다" 와 "배치가 아예 돌지 않았다" 를 구분할 수 없다.
후자가 더 나쁜 상태인데 로그에는 똑같이 아무것도 없다. 그래서 성공 행이 있어야
`/admin/ops` 가 "마지막으로 돈 것이 8일 전" 을 말할 수 있다.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class BatchRun(Base):
    """배치 실행 한 건."""

    __tablename__ = "batch_runs"

    id: Mapped[int] = mapped_column(primary_key=True)

    #: 배치 이름. `core/background` 의 스케줄러 이름과 같은 문자열을 쓴다
    #: (`snapshot` · `market_cap` · `movers`) — 두 곳이 같은 것을 다른 이름으로
    #: 부르면 로그와 이 표를 맞춰 볼 수 없다.
    name: Mapped[str] = mapped_column(String(40))

    finished_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    #: 배치가 의도한 일을 했는가. **응답률 가드로 버려진 실행은 False 다** —
    #: 예외가 없었어도 아무것도 쓰지 못했으면 성공이 아니다.
    ok: Mapped[bool] = mapped_column(Boolean)

    #: 물어본 종목 수 · 응답한 종목 수 · 실제로 반영한 종목 수.
    #: 셋을 함께 남기는 이유: 응답률이 무너진 실행과 "응답은 멀쩡한데 값이 안 온"
    #: 실행이 다른 사건이고, 대응도 다르다(전자는 기다리기, 후자는 필드 확인).
    attempted: Mapped[int] = mapped_column(Integer, default=0)
    answered: Mapped[int] = mapped_column(Integer, default=0)
    applied: Mapped[int] = mapped_column(Integer, default=0)

    #: 사람이 읽을 한 줄. 실패 이유가 여기 온다 — 화면이 그대로 보여준다.
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        # 조회는 언제나 "이 배치의 최근 것" 과 "이 배치의 최근 실패" 두 가지다.
        # 단일 컬럼 인덱스 두 개가 아니라 복합 하나로 두 질의를 함께 덮는다.
        Index("ix_batch_runs_name_finished_at", "name", "finished_at"),
    )

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<BatchRun {self.name} ok={self.ok} at={self.finished_at}>"
