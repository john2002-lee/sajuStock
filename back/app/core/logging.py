"""로깅 설정.

원본 코드는 `except Exception: pass`로 실패를 조용히 삼켰다. 폴백 경로는 정상
동작이지만 어떤 소스가 실패했는지는 관측 가능해야 하므로, 각 모듈이 이 로거로
경고를 남긴다.
"""

import logging

from app.core.config import settings

_CONFIGURED = False


def configure_logging() -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return

    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(asctime)s %(levelname)-8s %(name)s | %(message)s",
    )
    # yfinance/urllib이 매 호출마다 남기는 잡음 제거
    logging.getLogger("yfinance").setLevel(logging.ERROR)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    _CONFIGURED = True
