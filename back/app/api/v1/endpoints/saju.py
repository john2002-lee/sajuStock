"""사주 엔드포인트 (통합 기획 5.1의 온보딩 경로).

라우터는 파라미터 수신과 서비스 호출만 한다 — 비즈니스 로직은 서비스 계층에 있다.

## 이 라우터가 저장하지 않는 이유

`POST /saju/chart` 는 **읽기 전용이다.** 생년월일시를 받아 계산해서 돌려줄 뿐 어디에도
쓰지 않는다. 기획의 데이터 흐름이 `생년월일시 → 사주엔진 → 프로파일 초안 → 사용자
보정 → 저장` 이고, 저장 대상은 **보정이 끝난 6개 숫자**이기 때문이다
(`models/investor_profile.py` 의 "생년월일시를 저장하지 않는다" 절).

원본 사주 서비스는 여기서 주문(Order)을 만들어 생년월일시를 30일간 보관했다.
그쪽은 결제가 붙은 제품이라 주문 기록이 필요했지만, 여기서는 필요 없어졌다 —
**쓸지 안 쓸지 모르는 민감정보를 미리 받아 두는 것은 안 받는 것보다 나쁘다.**

## 소유자 헤더가 없는 이유

관심종목·프로파일과 달리 `X-Owner-Key` 를 요구하지 않는다. 저장하는 것이 없으니
소유자를 물을 이유가 없고, 온보딩은 로그인보다 앞설 수 있어야 한다(기획 3.4).
저장은 사용자가 보정을 끝낸 뒤 `PUT /profile` 이 소유자와 함께 받는다.
"""

import logging
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

from app.api.deps import SajuOrderRepo
from app.core.config import settings
from app.core.exceptions import LLMRefusedError
from app.domain.saju.followup import (
    MAX_FOLLOW_UPS,
    MAX_FREE_TEXT,
    PRESETS,
    QuestionRejectedError,
    find_preset,
    normalize_free_text,
)
from app.domain.saju.report_policy import ContentRefusalError
from app.integrations import amplitude
from app.integrations.llm import ask_text
from app.integrations.saju.mapper import to_reading_response
from app.schemas.saju import (
    BirthInput,
    BirthPlacesResponse,
    FollowUpPresetOut,
    FollowUpPresetsResponse,
    FollowUpRequest,
    FollowUpResponse,
    SajuConfirmRequest,
    SajuFollowUpJob,
    SajuFollowUpState,
    SajuJobCreated,
    SajuOrderCreated,
    SajuOrderRequest,
    SajuPaidReport,
    SajuPaymentConfig,
    SajuPaymentConfirmed,
    SajuReadingResponse,
    SajuReportJob,
    SajuReportRequest,
    SajuReportResponse,
)
from app.services import saju_job_store, saju_order_service, saju_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/saju", tags=["saju"])


@router.get("/places", response_model=BirthPlacesResponse, summary="선택 가능한 출생지 목록")
async def list_birth_places() -> BirthPlacesResponse:
    """출생지 폐쇄 목록. **경도는 내려보내지 않는다.**

    경도는 진태양시 보정에 쓰이는 서버 소유 값이라, 클라이언트가 알면 직접 보내고
    싶어진다 — 그 순간 범위 밖 값으로 보정을 왜곡할 수 있다
    (`domain/saju/places.py` 모듈 주석).
    """
    return BirthPlacesResponse.build()


@router.post("/chart", response_model=SajuReadingResponse, summary="사주 계산 + 투자 성향 초안")
async def compute_chart(birth: BirthInput) -> SajuReadingResponse:
    """생년월일시로 사주 원국·강약·대운을 계산하고 투자 성향 초안을 함께 낸다.

    LLM 을 부르지 않는다 — 전부 결정론적 계산이라 비용이 0이고 즉시 응답한다.
    풀이 문장이 필요하면 `POST /saju/report` 를 따로 부른다.
    """
    return to_reading_response(saju_service.read_chart(birth))


@router.get(
    "/followup/presets",
    response_model=FollowUpPresetsResponse,
    summary="추가 질문 프리셋과 상한",
)
async def list_follow_up_presets() -> FollowUpPresetsResponse:
    """칩에 찍을 프리셋 질문과 제한값.

    프런트가 이 목록을 상수로 복사해 두지 않게 하려고 내려 준다. 복사본이 생기면
    갈라지고, 그러면 **버튼이 서버가 거절할 요청을 활성화한다** — 사용자에게는
    "보내 놓고 실패하는" 경험으로 나타난다.
    """
    return FollowUpPresetsResponse(
        presets=[FollowUpPresetOut(key=p.key, label=p.label) for p in PRESETS],
        max_follow_ups=MAX_FOLLOW_UPS,
        max_free_text=MAX_FREE_TEXT,
    )


@router.post("/followup", response_model=FollowUpResponse, summary="사주 추가 질문")
async def ask_follow_up(payload: FollowUpRequest, repo: SajuOrderRepo) -> FollowUpResponse:
    """리포트를 읽은 뒤의 추가 질문 하나에 답한다.

    입력 검증은 `_resolve_question`·`_resolve_birth` 에 있다(프리셋 위조와 개행 주입을
    막는 자리다). 출력은 `validate_answer` 를 반드시 통과한다 — 리포트와 **같은**
    금지 표현 검사이며(의료·법률·투자·운명론·의식 권유), 거기에 더해 마크다운 헤딩과
    길이를 본다.

    브라우저는 이 경로를 쓰지 않는다 — LLM 한 번이 브라우저 타임아웃을 넘겨
    `POST /saju/followup/jobs` 로 간다. 여기를 남기는 이유는 리포트 쪽과 같다.
    """
    question = _resolve_question(payload)
    birth = await _resolve_birth(payload, repo)
    return await saju_service.answer_follow_up(birth, question, _ask_report_llm)


def _resolve_question(payload: FollowUpRequest) -> str:
    """무엇을 물은 것인지 확정한다.

    **프리셋 문장은 서버가 갖고 있다.** 클라이언트가 보낸 문장을 믿지 않는 이유는,
    칩을 눌렀다고 주장하면서 임의의 텍스트를 실어 보내는 경로를 막기 위해서다.
    자유 입력은 `normalize_free_text` 가 한 줄로 접는다 — 개행이 살아 있으면
    프롬프트의 질문 블록을 빠져나와 새 지시처럼 보이는 줄을 만들 수 있다.

    동기 경로와 작업 경로가 **같은** 함수를 쓴다. 둘로 갈라 두면 한쪽만 고쳐질 때
    검증이 새는 경로가 생긴다.
    """
    if payload.preset_key is not None:
        preset = find_preset(payload.preset_key)
        if preset is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"알 수 없는 질문입니다: {payload.preset_key}",
            )
        return preset.question

    try:
        return normalize_free_text(payload.text or "")
    except QuestionRejectedError as exc:
        # `exc` 의 메시지에는 사용자 문장이 들어 있지 않다(그쪽 주석). 그래도
        # 화면에는 사유를 사람 말로 바꿔서 준다.
        detail = (
            f"질문은 {MAX_FREE_TEXT}자 이내로 적어 주세요."
            if exc.reason == "too long"
            else "질문을 조금 더 자세히 적어 주세요."
        )
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail) from exc


async def _resolve_birth(payload: FollowUpRequest, repo: SajuOrderRepo) -> BirthInput:
    """누구의 사주인지 확정한다.

    유료 경로는 토큰으로 온다 — 생년월일시는 주문에 있으므로 브라우저가 다시 보내지
    않는다(`schemas/saju.FollowUpRequest` 주석).
    """
    if payload.birth is not None:
        return payload.birth
    return await saju_order_service.birth_for_token(payload.access_token or "", repo)


@router.post(
    "/followup/jobs",
    response_model=SajuJobCreated,
    status_code=status.HTTP_202_ACCEPTED,
    summary="사주 추가 질문 시작",
)
async def start_follow_up_job(
    payload: FollowUpRequest, repo: SajuOrderRepo
) -> SajuJobCreated:
    """추가 질문을 접수하고 **즉시** 작업 번호를 돌려준다.

    리포트와 같은 이유다 — 답 하나에 LLM 한 번이라 브라우저 쪽 타임아웃(20초)을
    넘긴다.

    **검증과 슬롯 예약은 여기서, 지금 한다.** 작업 안으로 밀지 않는다: 그렇게 하면
    잘못된 질문이나 슬롯이 없는 요청에도 작업 번호가 나가고, 화면은 한 번 폴링한
    뒤에야 거절을 알게 된다. 게다가 DB 를 보는 일을 요청의 세션으로 하는데, 그 세션은
    **응답이 나가면 닫힌다** — 작업 안에서 부르면 닫힌 세션을 만진다.

    유료 경로는 슬롯을 **예약한 뒤** 생성에 들어간다(`reserve_follow_up` 주석).
    """
    question = _resolve_question(payload)

    # 유료 경로: **슬롯을 먼저 잡는다.** 답을 만든 뒤에 잡으면 동시에 여덟 번 누른
    # 요청이 여덟 개 다 LLM 을 태우고 나서 셋만 살아남는다 — 다섯 번의 비용은 이미
    # 나간 뒤다. 자리가 없으면 여기서 409 로 끝나고 작업 번호가 나가지 않는다.
    if payload.birth is None:
        birth, follow_up_id = await saju_order_service.reserve_follow_up(
            token=payload.access_token or "",
            question=question,
            repo=repo,
        )
        job = saju_job_store.start(
            lambda: saju_order_service.answer_reserved_follow_up(
                follow_up_id=follow_up_id,
                birth=birth,
                question=question,
                ask_llm=_ask_report_llm,
            ),
            failure_message="답을 만들지 못했습니다. 잠시 후 다시 물어봐 주세요.",
        )
        return SajuJobCreated(job_id=job.id)

    # 무료 경로: 저장할 주문이 없으므로 슬롯 회계도 없다. 화면이 세는 개수는 비용
    # 안내이지 권리가 아니다(`FollowUpChat` 주석).
    birth = payload.birth
    job = saju_job_store.start(
        lambda: saju_service.answer_follow_up(birth, question, _ask_report_llm),
        failure_message="답을 만들지 못했습니다. 잠시 후 다시 물어봐 주세요.",
    )
    return SajuJobCreated(job_id=job.id)


@router.get(
    "/followup/jobs/{job_id}",
    response_model=SajuFollowUpJob,
    summary="사주 추가 질문 진행 상황",
)
async def read_follow_up_job(job_id: str) -> SajuFollowUpJob:
    """작업 상태를 본다. 리포트 작업과 같은 규약이다."""
    job = saju_job_store.get(job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="질문 작업을 찾을 수 없습니다. 다시 물어봐 주세요.",
        )
    return SajuFollowUpJob(
        status=job.status,
        answer=job.result if job.status == "done" else None,
        error=job.error,
    )


@router.post("/report", response_model=SajuReportResponse, summary="AI 사주 리포트")
async def generate_report(payload: SajuReportRequest) -> SajuReportResponse:
    """사주 풀이 리포트를 생성한다. LLM 1회(정책 위반 시 최대 2회)를 쓴다.

    출력은 `domain/saju/report_policy.validate_markdown` 을 반드시 통과한다 —
    의료·법률·투자·운명론·의식 권유 표현이 사용자에게 나가지 않게 하는 **코드로
    강제되는** 검사이고, 프롬프트 문구가 아니라 이것이 실제 경계다.

    실패하면 에러가 아니라 규칙 기반 간이 리포트로 내려간다(`source="fallback"`).
    주식 판단이 `LLM → 지표 규칙 기반` 으로 내려가는 것과 같은 규약이다.

    ## 브라우저는 이 경로를 쓰지 않는다

    이 호출은 실측 **36초**다. 브라우저에서 그만큼 기다리는 요청은 성립하지 않으므로
    (BFF 구간 기본 타임아웃 20초에 끊겼다) 화면은 아래 `POST /saju/report/jobs` 를
    쓴다. 여기를 남겨 둔 것은 생성 로직을 한 자리에서만 잡기 위해서고, 긴 요청을
    감당할 수 있는 호출자(테스트·서버 간)를 위해서다.
    """
    return await saju_service.generate_report(payload.birth, _ask_report_llm)


@router.post(
    "/report/jobs",
    response_model=SajuJobCreated,
    status_code=status.HTTP_202_ACCEPTED,
    summary="AI 사주 리포트 생성 시작",
)
async def start_report_job(payload: SajuReportRequest) -> SajuJobCreated:
    """리포트 생성을 시작하고 **즉시** 작업 번호를 돌려준다.

    ## 왜 이 경로가 생겼나

    리포트 생성은 LLM 1~2회라 실측 36초다. 그것을 요청 하나로 처리하니 브라우저 →
    BFF 구간의 기본 타임아웃(20초)에 매번 끊겼고, 화면에는 "풀이를 들려드리기
    어렵네" 가 떴다 — **백엔드는 성공하고 있는데 사용자는 실패를 보고 있었다.**

    타임아웃 숫자를 올리는 것으로는 부족하다. 그러면 모바일 네트워크, 중간 프록시,
    화면을 끄는 것까지 전부 그 하나의 연결에 매달린다. 작업으로 바꾸면 **긴 요청
    자체가 없어진다.**

    202 를 쓰는 것은 이 응답이 결과가 아니라 접수 확인이기 때문이다.
    """
    job = saju_job_store.start(
        lambda: saju_service.generate_report(payload.birth, _ask_report_llm),
        failure_message="풀이를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.",
    )
    return SajuJobCreated(job_id=job.id)


@router.get(
    "/report/jobs/{job_id}",
    response_model=SajuReportJob,
    summary="AI 사주 리포트 진행 상황",
)
async def read_report_job(job_id: str) -> SajuReportJob:
    """작업 상태를 본다. 화면이 이 경로를 폴링한다.

    없는 작업은 404 다 — 서버가 재시작했거나 TTL 이 지난 경우이고, 둘 다 화면이
    처음부터 다시 해야 한다. `running` 으로 답하면 화면이 오지 않을 결과를 영원히
    기다린다.
    """
    job = saju_job_store.get(job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="풀이 작업을 찾을 수 없습니다. 다시 시도해 주세요.",
        )
    return SajuReportJob(
        status=job.status,
        report=job.result if job.status == "done" else None,
        error=job.error,
    )


async def _ask_report_llm(system: str, user: str) -> str:
    """리포트 생성용 LLM 호출.

    서비스가 통합 계층을 직접 잡지 않도록 여기서 주입한다 — 그래야 서비스의 분기
    (정책 위반 → 재생성 → 폴백)를 네트워크 없이 테스트할 수 있다.

    `LLMRefusedError` 를 `ContentRefusalError` 로 바꿔 준다. 서비스는 "모델이 내용
    때문에 거절했다"와 "인프라가 실패했다"를 구분해야 하는데(전자는 재시도해도 같은
    결과라 곧바로 폴백한다), 그 구분은 프로바이더의 어휘가 아니라 **도메인의**
    어휘여야 한다 — 서비스가 `LLMRefusedError` 를 알면 Gemini 를 아는 것이 된다.
    """
    # 계측 세션을 **여기서** 연다. 위 호출부 대부분은 `saju_job_store.start` 로
    # 나중에 실행되는 작업이라, 엔드포인트 함수에서 열면 작업이 도는 시점에는 이미
    # 닫혀 있다. 이 함수가 사주의 유일한 LLM 깔때기이므로 여기 두면 한 건도 새지
    # 않는다.
    #
    # **본문은 나가지 않는다.** `SAJU_REPORT` 는 metadata_only 인스턴스에서 났다
    # (`integrations/amplitude` 의 "두 도메인" 절) — 생년월일시가 프롬프트에 실려
    # 있고 그것은 민감정보다.
    #
    # 열려 있는 세션을 재사용하지 **않는다.** 한때 그렇게 두었는데, 이 앱에서
    # 사주 세션을 바깥에서 여는 경로가 없어 죽은 분기였고, 더 나쁘게는 언젠가
    # 주식 세션(content_mode="full") 안에서 이 함수가 불리면 생년월일시가 본문째
    # 나가는 구멍이었다. 호출 하나에 세션 하나가 안전하다 — 대신 리포트가 정책
    # 위반으로 재생성되면 두 개의 대화로 보인다.
    async with amplitude.session(
        amplitude.SAJU_REPORT,
        # 무료 경로는 신원을 만들지 않는다 — 이 서비스가 아무것도 저장하지 않는
        # 이유와 같다(`models/saju_order.py`). 없는 신원을 지어내지 않는다.
        user_id=None,
        session_id=f"saju:{uuid4()}",
    ):
        return await _ask_report_llm_inner(system, user)


async def _ask_report_llm_inner(system: str, user: str) -> str:
    try:
        return await ask_text(system_prompt=system, user_content=user)
    except LLMRefusedError as exc:
        raise ContentRefusalError(str(exc)) from exc


# ---------------------------------------------------------------------------
# 유료 리포트 — 주문 · 결제 승인 · 전달
#
# **이 세 경로만 저장한다.** 위의 무료 경로들은 여전히 아무것도 남기지 않는다
# (`models/saju_order.py` 의 "왜 저장하는가" 절).
# ---------------------------------------------------------------------------


@router.get("/payment/config", response_model=SajuPaymentConfig, summary="결제 설정")
async def get_payment_config() -> SajuPaymentConfig:
    """화면이 결제 UI 를 켤지 정하는 값.

    가격을 프런트 상수로 두지 않는 이유는 스키마 주석에 있다 — 화면·결제 요청·승인
    검증 세 곳이 같은 값을 봐야 한다.

    키가 없으면 `enabled: false` 로 내려가고 화면은 결제 카드를 그리지 않는다.
    **팔 수 없는 상태에서 결제 버튼을 보여 주지 않는 것**이 이 값의 목적이다.
    """
    return SajuPaymentConfig(
        enabled=settings.saju_payment_enabled,
        price=settings.saju_report_price,
        retention_days=settings.saju_order_retention_days,
    )


@router.post("/orders", response_model=SajuOrderCreated, summary="유료 리포트 주문 생성")
async def create_saju_order(
    payload: SajuOrderRequest, repo: SajuOrderRepo
) -> SajuOrderCreated:
    """결제창을 열기 전에 주문을 만든다.

    금액을 여기서 **서버가 정해** 돌려준다. 화면이 그 값을 결제 요청에 싣고, 승인
    때 서버가 다시 대조한다 — 클라이언트가 보낸 금액을 믿으면 100원으로 리포트를
    살 수 있다.
    """
    return await saju_order_service.create_order(payload.birth, repo)


@router.post(
    "/payments/confirm",
    response_model=SajuPaymentConfirmed,
    summary="결제 승인",
)
async def confirm_saju_payment(
    payload: SajuConfirmRequest, repo: SajuOrderRepo
) -> SajuPaymentConfirmed:
    """토스 승인 → 접근 토큰 반환. **리포트를 기다리지 않는다.**

    승인은 1초 남짓이고 리포트 생성은 36초다. 예전에는 둘이 한 요청이라 **결제가
    됐는지조차 37초 동안 알 수 없었고**, 그 사이 연결이 끊기면 돈은 나갔는데 화면은
    실패를 띄웠다. 결제 화면에서 그것은 가장 나쁜 실패 방식이다.

    이제 승인이 확정되는 즉시 토큰이 내려가고, 리포트는 뒤에서 만들어 저장된다.
    `ready` 가 거짓이면 화면이 `GET /saju/reports/{token}` 을 폴링한다.

    **같은 요청이 두 번 와도 두 번 긁지 않는다.** 이미 `paid` 인 주문이면 승인을
    건너뛴다 — 새로고침·뒤로가기·토스 재시도가 전부 이 경로로 온다.

    승인 결과가 미상이면(네트워크·타임아웃·5xx·이미 처리됨) 409 `needs_attention`
    이다. **실패가 아니라 모른다는 뜻**이고, 자동 환불하지 않고 사람이 대조한다.
    """
    return await saju_order_service.confirm_payment(
        order_id=payload.order_id,
        payment_key=payload.payment_key,
        amount=payload.amount,
        repo=repo,
        ask_llm=_ask_report_llm,
    )


@router.get(
    "/reports/{token}/follow-ups",
    response_model=SajuFollowUpState,
    summary="구매한 리포트의 추가 질문 상태",
)
async def read_saju_follow_ups(token: str, repo: SajuOrderRepo) -> SajuFollowUpState:
    """대화와 남은 질문 수를 다시 맞춘다.

    답 하나가 끝난 뒤 화면이 부른다. **서버가 슬롯을 돌려주는 경우가 있으므로**
    (우리 쪽 실패) 화면이 스스로 센 값을 믿으면 안 된다 — 그 이유는
    `schemas/saju.SajuFollowUpState` 에 적어 두었다.
    """
    return await saju_order_service.read_follow_up_state(token, repo)


@router.get("/reports/{token}", response_model=SajuPaidReport, summary="구매한 리포트 열기")
async def read_saju_report(token: str, repo: SajuOrderRepo) -> SajuPaidReport:
    """토큰으로 리포트를 연다. **화면이 이 경로를 폴링한다.**

    **토큰이 곧 자격 증명이다.** 주소를 아는 사람이 산 사람이므로 로그인이 없고,
    그래서 이 화면은 색인되지 않아야 한다(프런트 metadata 의 `noindex`).

    아직 만들고 있으면 409 `saju_report_generating` 이다 — 미결제를 뜻하는
    `saju_report_not_ready` 와 코드가 다르다. 화면은 앞의 것만 계속 기다린다.
    """
    return await saju_order_service.read_paid_report(token, repo)
