"""배치 실행 기록 리포지토리. SQL 만 담당한다."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.batch_run import BatchRun


class BatchRunRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def record(
        self,
        name: str,
        *,
        ok: bool,
        attempted: int = 0,
        answered: int = 0,
        applied: int = 0,
        detail: str | None = None,
    ) -> None:
        """실행 한 건을 남긴다.

        **커밋한다.** 이 프로젝트의 `get_db` 는 커밋하지 않고 세션을 닫으므로
        (`core/database.py`), 커밋하지 않으면 응답이 나간 뒤 조용히 롤백된다 —
        화면에는 기록된 것처럼 보이고 새로고침하면 사라진다. 다른 리포지토리가
        자기 쓰기마다 커밋하는 것과 같은 규약이다.

        배치의 본 쓰기와 **같은 트랜잭션에 묶지 않는다.** 기록이 본 작업을 되돌리게
        하면 안 된다 — 기록 실패는 관측을 잃는 것이고, 본 쓰기 실패는 데이터를 잃는
        것이다. 둘의 무게가 다르다.
        """
        self._db.add(
            BatchRun(
                name=name,
                ok=ok,
                attempted=attempted,
                answered=answered,
                applied=applied,
                detail=detail,
            )
        )
        await self._db.commit()

    async def last_run(self, name: str) -> BatchRun | None:
        """가장 최근 실행. 성공·실패를 가리지 않는다.

        실패만 보면 "실패가 없다" 와 "배치가 아예 돌지 않았다" 를 구분할 수 없다.
        후자가 더 나쁜 상태라 이 질의가 따로 필요하다.
        """
        return await self._latest(select(BatchRun).where(BatchRun.name == name))

    async def last_failure(self, name: str) -> BatchRun | None:
        """가장 최근 실패. 화면이 "언제, 왜" 를 한 줄로 보여주는 근거다."""
        return await self._latest(
            select(BatchRun).where(BatchRun.name == name, BatchRun.ok.is_(False))
        )

    async def _latest(self, stmt) -> BatchRun | None:
        """두 질의가 공유하는 정렬·타이브레이크.

        `id` 를 함께 내림차순으로 두는 것은 같은 초에 두 행이 들어갈 수 있기 때문이다
        (`server_default=now()` 는 트랜잭션 시작 시각이라 배치 두 개가 같은 값을 받는
        일이 실제로 생긴다). 타이브레이크가 없으면 "마지막" 이 물리적 행 순서가 된다.
        """
        stmt = stmt.order_by(BatchRun.finished_at.desc(), BatchRun.id.desc()).limit(1)
        return (await self._db.execute(stmt)).scalars().first()
