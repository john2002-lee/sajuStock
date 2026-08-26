"""소유자가 사라진 행 정리.

    uv run python -m scripts.cleanup_orphans            # 모의 실행 — 숫자만 본다
    uv run python -m scripts.cleanup_orphans --apply    # 실제로 지운다

(`-m` 으로 실행해야 프로젝트 루트가 sys.path 에 올라 `app` 패키지를 찾는다.)

관심종목·투자 성향은 소유자를 외래키가 아니라 문자열로 들고 있다. 익명이 로그인보다
먼저 존재할 수 있어야 해서 내린 선택이고(모델 주석), 그 대가로 **사용자를 지워도 그
사람의 행이 남는다.** 이 스크립트가 그것을 치운다.

계정 삭제 화면이 생기면 그 경로에서 `orphan_service.sweep_orphans` 를 바로 부르면
된다 — 그때까지는 사람이 가끔 돌린다.

**기본이 모의 실행이다.** 되돌릴 수 없는 일이라 숫자를 먼저 보고 납득한 다음 지운다.
"""

import asyncio
import sys

from app.core.database import AsyncSessionLocal
from app.core.logging import configure_logging
from app.services.orphan_service import UsersTableUnavailable, sweep_orphans


async def main() -> int:
    # 윈도우 기본 콘솔(cp949)에서 못 찍는 기호로 죽지 않게 한다.
    sys.stdout.reconfigure(errors="replace")
    configure_logging()

    apply = "--apply" in sys.argv[1:]
    print("고아 행 정리 —", "실제 삭제" if apply else "모의 실행 (--apply 로 실제 삭제)")
    print()

    async with AsyncSessionLocal() as session:
        try:
            report = await sweep_orphans(session, apply=apply)
        except UsersTableUnavailable as exc:
            print(f"  [중단] {exc}")
            return 1

    for table, count in report.counts.items():
        mark = "삭제" if apply and count else "발견"
        print(f"  {table:20s} {count:>6,}건 {mark if count else ''}")

    print()
    if not report.total:
        print("고아 행이 없습니다.")
        return 0

    if apply:
        print(f"{report.total:,}건을 삭제했습니다.")
        return 0

    print(f"{report.total:,}건이 대상입니다. 실제로 지우려면 --apply 를 붙입니다.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
