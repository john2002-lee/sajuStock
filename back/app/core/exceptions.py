"""도메인 예외와 FastAPI 예외 핸들러.

계층 규칙: 서비스·통합 계층은 `HTTPException`을 절대 던지지 않는다. 도메인 예외를
던지고, HTTP 상태 코드로의 변환은 여기 등록된 핸들러가 담당한다. 덕분에 서비스
계층을 FastAPI 없이도 테스트할 수 있다.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class AppError(Exception):
    """모든 도메인 예외의 베이스."""

    status_code: int = 500
    code: str = "internal_error"
    message: str = "요청을 처리하지 못했습니다."

    def __init__(self, message: str | None = None, *, detail: str | None = None) -> None:
        self.message = message or self.message
        self.detail = detail
        super().__init__(self.message)


class StockNotFoundError(AppError):
    status_code = 404
    code = "stock_not_found"
    message = "주가 데이터를 찾을 수 없습니다. 예: AAPL, MSFT, 005930.KS"


class UnsupportedTimeframeError(AppError):
    status_code = 400
    code = "unsupported_timeframe"
    message = "지원하지 않는 조회 단위입니다."


class UnsupportedPeriodError(AppError):
    status_code = 400
    code = "unsupported_period"
    message = "지원하지 않는 조회 기간입니다."


class InvalidDateRangeError(AppError):
    status_code = 400
    code = "invalid_date_range"
    message = "시작일은 종료일보다 늦을 수 없습니다."


class UnsupportedMarketCategoryError(AppError):
    status_code = 400
    code = "unsupported_market_category"
    message = "지원하지 않는 시장 구분입니다."


class MarketDataUnavailableError(AppError):
    status_code = 503
    code = "market_data_unavailable"
    message = "시장 데이터를 불러오지 못했습니다."


class ProviderUnavailableError(AppError):
    status_code = 503
    code = "provider_unavailable"
    message = "시세 공급자를 사용할 수 없습니다."


class LLMUnavailableError(AppError):
    """LLM 호출이 실패했고 규칙 기반 대체도 불가능한 경우."""

    status_code = 502
    code = "llm_unavailable"
    message = "AI 분석을 완료하지 못했습니다."


class LLMRefusedError(LLMUnavailableError):
    """안전 분류기가 요청을 거절한 경우 (`stop_reason == "refusal"`).

    HTTP 200으로 돌아오므로 SDK 예외가 아니다 — 응답을 읽기 전에 직접 검사해야 한다.
    """

    code = "llm_refused"
    message = "AI가 이 요청에 답변하지 않았습니다."


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        if exc.status_code >= 500:
            logger.error("%s: %s (detail=%s)", exc.code, exc.message, exc.detail)
        else:
            logger.info("%s: %s", exc.code, exc.message)
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(
        _: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        """`HTTPException` 도 같은 봉투로 내보낸다.

        ## 왜 필요했나 — 서버가 쓴 문장이 화면에 닿지 않고 있었다

        FastAPI 의 기본 처리기는 `{"detail": "..."}` 를 낸다. 그런데 이 제품의 클라이언트
        (`lib/api/errors.toApiError`)는 `{"error": {"code", "message"}}` 를 읽으므로,
        `detail` 에 담긴 문장은 **통째로 버려지고** "요청이 실패했습니다 (422)" 라는
        일반 문구로 대체됐다.

        실제로 사라지던 문장들: "질문은 200자 이내로 적어 주세요.", "알 수 없는
        질문입니다", "풀이 작업을 찾을 수 없습니다". 전부 사용자가 무엇을 해야 하는지
        알려 주려고 쓴 것이고, 코드에는 "서버 문장을 그대로 쓴다" 는 주석까지 달려
        있었는데 그렇게 되지 않았다.

        코드는 `http_{상태}` 로 맞춘다 — 클라이언트가 봉투가 없을 때 만들어 쓰던 값과
        같으므로, 이 처리기가 붙어도 코드로 분기하던 곳의 동작이 바뀌지 않는다.
        문장만 살아난다.
        """
        detail = exc.detail
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": f"http_{exc.status_code}",
                    "message": detail if isinstance(detail, str) else "요청이 실패했습니다.",
                }
            },
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # `exc.errors()` 를 그대로 내보내지 않는다 — Pydantic 이 채우는 `input` 에는
        # 사용자가 보낸 원본 값(예: 헤더로 시도한 소유자 키)이 그대로 들어 있다.
        # 어느 필드가 왜 틀렸는지만 남기고 값 자체는 뺀다.
        fields = [
            {"loc": error.get("loc"), "msg": error.get("msg"), "type": error.get("type")}
            for error in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "validation_error",
                    "message": "요청 값을 확인해주세요.",
                    "fields": fields,
                }
            },
        )
