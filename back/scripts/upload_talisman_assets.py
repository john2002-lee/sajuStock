"""부적 원본을 DB(`talisman_assets`)에 올린다.

    uv run python -m scripts.upload_talisman_assets <원본_폴더>            # 모의 실행
    uv run python -m scripts.upload_talisman_assets <원본_폴더> --apply    # 실제로 올린다

`<원본_폴더>` 에 `{id}.png` (또는 .webp/.jpg) 가 부적마다 하나씩 있어야 한다 —
`scripts.make_talisman_images` 가 만드는 모양이다. **저장소 밖 폴더여야 한다.**
이 저장소는 공개라 원본이 커밋되면 결제 없이 받을 수 있게 된다.

**어느 DB 에 올리는지 `DATABASE_URL` 이 정한다.** `back/.env` 의 값은 운영 DB 다.
로컬 확인용이면 `DATABASE_URL` 을 덮어 다른 DB 를 가리키게 한 뒤 돌린다. 기본이
모의 실행인 이유가 그것이다 — 어느 호스트에 무엇을 올릴지 먼저 본다.

이미 있으면 덮어쓴다. 고해상도 원본으로 바꿀 때도 같은 명령이다.
"""

import asyncio
import hashlib
import sys
from pathlib import Path
from urllib.parse import urlsplit

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.domain.talisman.catalog import TALISMANS
from app.repositories.talisman import TalismanRepository

_MEDIA_TYPES = {".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg"}


def _find(folder: Path, talisman_id: str) -> Path | None:
    for suffix in _MEDIA_TYPES:
        path = folder / f"{talisman_id}{suffix}"
        if path.is_file():
            return path
    return None


def _prepare(argv: list[str]) -> tuple[dict[str, tuple[str, bytes]], bool] | int:
    """파일을 읽고 무엇을 올릴지 출력한다. 실패하면 종료 코드를 돌려준다.

    파일 입출력을 여기 모아 두는 이유: `async` 함수 안의 동기 파일 읽기는 이벤트
    루프를 막는다(ruff ASYNC240). DB 에 쓰는 것만 비동기다.
    """
    args = [a for a in argv if not a.startswith("--")]
    apply = "--apply" in argv
    if len(args) != 1:
        print(__doc__)
        return 2

    folder = Path(args[0]).resolve()
    if folder.is_relative_to(Path(__file__).resolve().parents[2]):
        print("원본 폴더가 저장소 안입니다. 공개 저장소이므로 저장소 밖에 두세요.")
        return 1

    paths = {t.id: _find(folder, t.id) for t in TALISMANS}
    missing = [tid for tid, path in paths.items() if path is None]
    if missing:
        print(f"원본이 없습니다: {', '.join(missing)}")
        return 1

    print(f"대상 DB 호스트: {urlsplit(settings.database_url).hostname}")
    files: dict[str, tuple[str, bytes]] = {}
    for tid, path in paths.items():
        assert path is not None
        content = path.read_bytes()
        digest = hashlib.sha256(content).hexdigest()
        print(f"  {tid}: {path.name} ({len(content):,} bytes) sha256={digest}")
        files[tid] = (path.suffix, content)
    return files, apply


async def _upload(files: dict[str, tuple[str, bytes]]) -> None:
    async with AsyncSessionLocal() as session:
        repo = TalismanRepository(session)
        for tid, (suffix, content) in files.items():
            await repo.upsert_asset(
                talisman_id=tid,
                content=content,
                media_type=_MEDIA_TYPES[suffix],
                filename=f"talisman-{tid}{suffix}",
                sha256=hashlib.sha256(content).hexdigest(),
            )


def main() -> int:
    sys.stdout.reconfigure(errors="replace")
    prepared = _prepare(sys.argv[1:])
    if isinstance(prepared, int):
        return prepared
    files, apply = prepared
    if not apply:
        print("모의 실행입니다. 올리려면 --apply 를 붙이세요.")
        return 0
    asyncio.run(_upload(files))
    print("올렸습니다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
