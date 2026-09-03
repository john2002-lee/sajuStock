"""pykrx 세션 — KRX 로그인을 흡수하는 한 지점.

KRX 정보데이터시스템이 로그인을 요구하도록 바뀌면서 pykrx 도 자격증명 없이는
빈손으로 돌아온다. 그 처리를 **여기 한 곳에** 두는 이유는 실제 사고 때문이다:
시가총액 수집은 이 처리를 갖고 있었고 상장사 목록 수집은 갖고 있지 않아서,
목록 쪽만 조용히 KIND(상장법인 목록)로 폴백해 **우선주가 통째로 누락**됐다.
삼성전자우(005935)가 검색되지 않은 원인이 그것이다.

두 모듈이 같은 로그인을 각자 처리하면 그 어긋남은 반드시 다시 생긴다.
"""

import contextlib
import io
import logging
import os
from types import ModuleType

from app.core.config import settings

logger = logging.getLogger(__name__)

_pykrx_stock: ModuleType | None = None


def prepare_pykrx() -> ModuleType:
    """pykrx 를 쓸 수 있는 상태로 만들고 `stock` 모듈을 돌려준다.

    ## 자격증명을 `os.environ` 으로 옮기는 것이 이 함수의 핵심이다

    pykrx 는 `os.getenv("KRX_ID")` 를 직접 읽는다. 반면 pydantic-settings 는 `.env`
    를 `Settings` 객체로만 옮기고 `os.environ` 은 건드리지 않는다(`dotenv_values`).
    그래서 `.env` 를 정확히 채워도 pykrx 에는 닿지 않았고, 배치는 자격증명이 있는데도
    매번 yfinance 폴백으로 내려갔다. 경계 밖 라이브러리의 규약이므로 경계에서 흡수한다.

    ## import 보다 **먼저** 넣어야 한다

    pykrx 는 import 시점에 로그인한다 — `website/comm/webio.py` 가 모듈 최상단에서
    `build_krx_session()` 을 부르고, 그 기본 인자가 `os.getenv("KRX_ID")` 다. 둘 다
    import 때 확정되므로 순서가 뒤집히면 첫 로그인이 빈손으로 나간다. 그래서 import
    를 이 함수가 소유한다 — 호출부가 순서를 지켜야 할 필요를 없앤다.

    ## 그 로그인이 **로그인 ID 를 stdout 에 찍는다**

    서버 로그에 계정을 남길 이유가 없어 삼켜서 DEBUG 로만 흘린다. 세션 만료 뒤의
    재로그인은 ID 를 찍지 않으므로(`comm/auth.get_auth_session`) 이 한 번으로 족하다.
    """
    global _pykrx_stock
    if _pykrx_stock is not None:
        return _pykrx_stock

    # 빈 문자열은 넣지 않는다 — pykrx 는 truthy 검사를 하므로 결과는 같지만,
    # 실제 OS 환경변수로 자격증명을 준 경우를 빈 `.env` 값이 덮어써서는 안 된다.
    if settings.krx_id:
        os.environ["KRX_ID"] = settings.krx_id
    if settings.krx_pw:
        os.environ["KRX_PW"] = settings.krx_pw

    chatter = io.StringIO()
    with contextlib.redirect_stdout(chatter):
        from pykrx import stock

    for line in chatter.getvalue().splitlines():
        if line.strip():
            logger.debug("pykrx: %s", line.strip())

    _pykrx_stock = stock
    return stock
