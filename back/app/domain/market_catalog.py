"""시장 개요 카테고리 카탈로그."""

from typing import Final, TypedDict


class MarketSymbol(TypedDict):
    name: str
    symbol: str


class MarketCategory(TypedDict):
    label: str
    symbols: list[MarketSymbol]


MARKET_OVERVIEW_CATEGORIES: Final[dict[str, MarketCategory]] = {
    # 홈 화면 지수 카드 전용. index 카테고리는 KOSDAQ이 없고 환율은 forex에,
    # 유가·금은 commodity에 있어, 화면 하나를 그리려면 네 번 호출해야 했다.
    #
    # 8종목이다. 앞 넷은 "지금 시장이 어디에 있나", 뒤 넷은 **왜 그렇게 움직였나** 를
    # 설명하는 축이다. 뒤 넷을 고른 기준은 국내 증시와의 연결이 설명 가능한가였다:
    #   ^SOX  국내 시총 상위가 반도체에 몰려 있어 같이 보는 지표
    #   ^NDX  S&P 500 이 미국 전체라면 이쪽은 기술주. 둘이 갈릴 때가 정보다
    #   CL=F  정유·화학·항공처럼 기름값이 원가·매출에 바로 닿는 업종
    #   GC=F  위험 회피 분위기를 읽는 축
    #
    # 종목 상세(2a)의 우측 레일도 이 카테고리를 쓰는데 292px 에 8행은 많다 —
    # 그쪽은 호출부가 앞 넷만 잘라 쓴다(`app/stocks/[symbol]/page.tsx`).
    "home": {
        "label": "홈 지수",
        "symbols": [
            {"name": "KOSPI", "symbol": "^KS11"},
            {"name": "KOSDAQ", "symbol": "^KQ11"},
            {"name": "S&P 500", "symbol": "^GSPC"},
            {"name": "USD/KRW", "symbol": "KRW=X"},
            {"name": "반도체", "symbol": "^SOX"},
            {"name": "나스닥 100", "symbol": "^NDX"},
            {"name": "WTI유", "symbol": "CL=F"},
            {"name": "금", "symbol": "GC=F"},
        ],
    },
    "forex": {
        "label": "외환",
        "symbols": [
            {"name": "달러/원", "symbol": "KRW=X"},
            {"name": "유로/달러", "symbol": "EURUSD=X"},
            {"name": "브라질 헤알/원", "symbol": "BRLKRW=X"},
            {"name": "엔/원", "symbol": "JPYKRW=X"},
            {"name": "파운드/달러", "symbol": "GBPUSD=X"},
            {"name": "태국 바트/원", "symbol": "THBKRW=X"},
            {"name": "달러/엔", "symbol": "JPY=X"},
        ],
    },
    "index": {
        "label": "지수",
        "symbols": [
            {"name": "코스피지수", "symbol": "^KS11"},
            {"name": "코스닥지수", "symbol": "^KQ11"},
            {"name": "코스피200", "symbol": "^KS200"},
            {"name": "US 500", "symbol": "^GSPC"},
            {"name": "US Tech 100", "symbol": "^NDX"},
            {"name": "DAX", "symbol": "^GDAXI"},
            {"name": "닛케이", "symbol": "^N225"},
            {"name": "미국 달러 지수", "symbol": "DX-Y.NYB"},
            {"name": "필라델피아 반도체 지수", "symbol": "^SOX"},
        ],
    },
    "commodity": {
        "label": "원자재",
        "symbols": [
            {"name": "금", "symbol": "GC=F"},
            {"name": "은", "symbol": "SI=F"},
            {"name": "브렌트유", "symbol": "BZ=F"},
            {"name": "WTI유", "symbol": "CL=F"},
            {"name": "천연가스", "symbol": "NG=F"},
            {"name": "구리", "symbol": "HG=F"},
            {"name": "미국 옥수수", "symbol": "ZC=F"},
        ],
    },
    "stock": {
        "label": "주식",
        "symbols": [
            {"name": "AAPL", "symbol": "AAPL"},
            {"name": "BABA", "symbol": "BABA"},
            {"name": "TSLA", "symbol": "TSLA"},
            {"name": "AA", "symbol": "AA"},
            {"name": "BAC", "symbol": "BAC"},
            {"name": "KO", "symbol": "KO"},
            {"name": "XOM", "symbol": "XOM"},
        ],
    },
}
