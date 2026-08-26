"""종목 매핑 상수와 조회 파라미터 화이트리스트."""

from typing import Final

# 사용자가 흔히 입력하는 별칭 → yfinance 심볼
COMMON_STOCK_SYMBOLS: Final[dict[str, str]] = {
    "삼성": "005930.KS",
    "삼성전자": "005930.KS",
    "sk하이닉스": "000660.KS",
    "에스케이하이닉스": "000660.KS",
    "현대차": "005380.KS",
    "현대자동차": "005380.KS",
    "기아": "000270.KS",
    "네이버": "035420.KS",
    "naver": "035420.KS",
    "카카오": "035720.KS",
    "lg에너지솔루션": "373220.KS",
    "셀트리온": "068270.KS",
}

# 같은 별칭 → 화면에 보여줄 표시명
COMMON_STOCK_NAMES: Final[dict[str, str]] = {
    "삼성": "삼성전자",
    "삼성전자": "삼성전자",
    "sk하이닉스": "SK하이닉스",
    "에스케이하이닉스": "SK하이닉스",
    "현대차": "현대차",
    "현대자동차": "현대차",
    "기아": "기아",
    "네이버": "NAVER",
    "naver": "NAVER",
    "카카오": "카카오",
    "lg에너지솔루션": "LG에너지솔루션",
    "셀트리온": "셀트리온",
}

# 6자리 코드 → 한글 종목명. 상장사 목록 수집이 모두 실패했을 때의 최종 폴백 소스.
KOREAN_STOCK_NAMES_BY_SYMBOL: Final[dict[str, str]] = {
    "000270": "기아",
    "000660": "SK하이닉스",
    "003490": "대한항공",
    "005380": "현대차",
    "005930": "삼성전자",
    "035420": "NAVER",
    "035720": "카카오",
    "068270": "셀트리온",
    "322310": "오로스테크놀로지",
    "373220": "LG에너지솔루션",
}

# 위 폴백 종목 중 코스닥인 것만 명시. 나머지는 KOSPI로 간주한다.
KOREAN_STOCK_MARKETS_BY_SYMBOL: Final[dict[str, str]] = {
    "035720": "KOSDAQ",
    "068270": "KOSDAQ",
    "322310": "KOSDAQ",
}

STOCK_PERIODS: Final[frozenset[str]] = frozenset(
    {"5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "ytd", "max"}
)

STOCK_TIMEFRAMES: Final[dict[str, dict[str, str]]] = {
    "day": {"interval": "1d", "period": "2y"},
    "week": {"interval": "1wk", "period": "5y"},
    "month": {"interval": "1mo", "period": "max"},
}
