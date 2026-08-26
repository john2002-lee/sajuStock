"""yfinance 지연 로딩과 공용 헬퍼.

yfinance는 동기 블로킹 라이브러리다. 이 패키지의 함수는 모두 동기이며, 서비스 계층이
`asyncio.to_thread`로 감싸 호출한다 — 이벤트 루프를 막지 않는 경계를 한 곳에 모았다.
"""

import logging
import re
from typing import Any

from app.core.exceptions import ProviderUnavailableError
from app.domain.symbols import is_usable_stock_name

logger = logging.getLogger(__name__)

#: 레이트리밋으로 읽을 메시지. yfinance 는 `YFRateLimitError("Too Many Requests.
#: Rate limited. Try after a while.")` 를 던지지만, 그 아래 HTTP 계층이 먼저 새는
#: 경로도 있어 문구로도 본다.
#:
#: `429` 만 단어 경계로 찾는다 — 그냥 부분 문자열로 두면 가격이나 종목 코드에 섞인
#: `1429` 가 레이트리밋으로 읽힌다.
_RATE_LIMIT_PATTERN = re.compile(r"too many requests|rate limit|\b429\b", re.IGNORECASE)


def is_rate_limited(exc: BaseException) -> bool:
    """이 실패가 **상류가 우리를 막은 것**인가.

    구분이 필요한 이유: 후보 루프(`fetch_stock_history`)는 모든 실패를 "다음 후보"로
    흡수한 뒤 404 를 던진다. 그러면 레이트리밋 상황에서 사용자는 삼성전자를 검색해도
    "주가 데이터를 찾을 수 없습니다" 를 보고, 운영자는 상류 차단인지 심볼 오류인지
    구분할 수 없다. 게다가 6자리 코드는 후보가 3개라 **이미 조여진 상류를 요청당 3번
    더 두드려 차단을 스스로 연장한다.**

    클래스를 import 하지 않고 이름으로 본다 — 예외가 다른 모듈로 옮겨가도(yfinance 는
    실제로 그런 이력이 있다) 이 판정이 조용히 거짓이 되지 않게.
    """
    if type(exc).__name__ == "YFRateLimitError":
        return True

    return bool(_RATE_LIMIT_PATTERN.search(str(exc)))


def load_yfinance() -> Any:
    """import 실패를 도메인 예외로 변환한다."""
    try:
        import yfinance as yf
    except ImportError as exc:  # pragma: no cover - 설치 환경에 의존
        raise ProviderUnavailableError("yfinance 패키지가 설치되어 있지 않습니다.") from exc

    return yf


def is_empty_frame(frame: Any) -> bool:
    """pandas DataFrame 가드. `None`과 빈 프레임을 한 번에 걸러낸다.

    yfinance의 표 형태 응답(등급 변경·손익계산서·밸류에이션)은 실패해도 예외가 아니라
    `None`이나 빈 프레임으로 온다 — 두 모듈이 같은 가드를 쓰므로 여기에 둔다.
    """
    return frame is None or getattr(frame, "empty", True)


def get_stock_name(ticker: Any, fallback: str) -> str:
    """`ticker.info`는 느리고 자주 실패한다 — 실패 시 조용히 fallback을 쓴다.

    성공해도 값을 그대로 믿지 않는다. 야후에 없는 심볼이면 `shortName`에
    검색 결과가 섞여 나와("247540.KS,0P0001GZPV,623889") 그게 화면 제목이
    된다 — 이름 검증(`is_usable_stock_name`)을 통과한 값만 내보낸다.
    """
    try:
        info = ticker.info
    except Exception as exc:
        logger.debug("ticker.info 조회 실패 (%s) → fallback=%r", exc, fallback)
        return fallback

    name = info.get("shortName") or info.get("longName")
    if is_usable_stock_name(name, fallback):
        return str(name).strip()

    if name:
        logger.info("%s 의 shortName 이 이름 형태가 아닙니다 (%r) → fallback", fallback, name)
    return fallback
