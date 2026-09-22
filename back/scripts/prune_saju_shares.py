"""만료된 사주 공유 링크 정리.

    uv run python -m scripts.prune_saju_shares            # 모의 실행 — 숫자만 본다
    uv run python -m scripts.prune_saju_shares --apply    # 실제로 지운다

(`-m` 으로 실행해야 프로젝트 루트가 sys.path 에 올라 `app` 패키지를 찾는다.)

## 이 스크립트가 없어도 링크는 만료된다

보관 기간을 **조회 쿼리가 강제한다**(`SajuShareRepository.get` — `created_at` 이
기준 시각보다 오래되면 404). 그래서 이것은 보안 장치가 아니라 **청소**다. 돌리지
않으면 표가 커지고, 링크가 새지는 않는다.

그 순서가 중요한 이유: 이 저장소에는 크론이 없다. 유료 주문을 지우는
`saju_purge_service` 도 스케줄러가 아니라 요청 경로에 얹혀 돈다 — 트래픽이 없으면
돌지 않는다. 삭제에 의존하는 보관 기간은 보관 기간이 아니다.

쓰기 경로에도 상한 붙은 정리가 하나 달려 있다(`SajuShareRepository.create` →
`prune_expired(limit=PRUNE_LIMIT)`). 평상시에는 그것으로 충분하고, 이 스크립트는
한동안 공유가 없어 쓰기 기회조차 없었을 때를 위한 것이다.

**기본이 모의 실행이다.** 되돌릴 수 없는 일이라 숫자를 먼저 보고 납득한 다음 지운다.
"""

import asyncio
import sys

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.logging import configure_logging
from app.repositories.saju_share import SajuShareRepository


async def main() -> int:
    # 윈도우 기본 콘솔(cp949)에서 못 찍는 기호로 죽지 않게 한다.
    sys.stdout.reconfigure(errors="replace")
    configure_logging()

    apply = "--apply" in sys.argv[1:]
    days = settings.saju_share_retention_days
    print(
        f"만료된 사주 공유 링크 정리 (보관 {days}일) —",
        "실제 삭제" if apply else "모의 실행 (--apply 로 실제 삭제)",
    )
    print()

    async with AsyncSessionLocal() as session:
        repo = SajuShareRepository(session)
        pending = await repo.count_expired()

        if not pending:
            print(f"  만료된 링크가 없습니다. (보관 {days}일)")
            return 0

        if not apply:
            print(f"  {pending:,}건이 대상입니다. 실제로 지우려면 --apply 를 붙입니다.")
            return 0

        # 상한 없이 한 번에 지운다 — 사람이 직접 돌리는 자리이므로 요청 지연을
        # 걱정할 대상이 없다. 쓰기 경로의 정리만 상한이 필요하다.
        removed = await repo.prune_expired()
        await session.commit()

    print(f"  {removed:,}건을 삭제했습니다.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
