"""FastAPI CLI 엔트리포인트.

`fastapi dev` / `fastapi run`은 인자가 없으면 `main.py` → `app/main.py` → `app.py`
순서로 모듈을 찾고, 그 안에서 `app` 객체를 찾는다. 이 파일이 루트에 있으면 가장
먼저 선택되므로 실제 앱을 여기서 재노출한다.

    uv run fastapi dev          # 개발 (자동 리로드, http://127.0.0.1:8000)
    uv run fastapi run          # 운영

앱 조립은 `app/main.py`의 `create_app()`이 담당한다 — 이 파일에는 로직을 두지 않는다.
"""

from app.main import app

__all__ = ["app"]
