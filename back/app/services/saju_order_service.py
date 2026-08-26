"""사주 유료 리포트의 주문·결제·전달 흐름.

라우터는 파라미터만 받고, 도메인은 순수 계산만 한다. "무엇을 어떤 순서로 부를지" 가
여기다.

## 이 파일이 지키는 것

**돈을 받았으면 반드시 무언가를 준다.** 그 약속이 깨지는 자리가 셋이라 각각 다르게 막는다.

1. **승인 결과가 미상일 때** — 실패로 단정하지 않는다. 주문을 `needs_attention` 으로
   두고 사람이 대조한다(`integrations/payment/toss` 주석).
2. **리포트 생성이 실패할 때** — 결제는 이미 됐다. 에러를 내지 않고 규칙 기반 간이
   리포트라도 저장해 돌려준다. 빈손으로 보내지 않는다.
3. **같은 승인이 두 번 올 때** — 이미 `paid` 면 다시 승인하지 않고 있는 것을 돌려준다.
   토스 재시도·새로고침·뒤로가기가 전부 이 경로로 온다.
"""

import logging

from app.core.config import settings
from app.core.exceptions import AppError
from app.domain.saju.followup import MAX_FOLLOW_UPS
from app.integrations.payment.toss import TossPaymentsProvider
from app.integrations.saju.mapper import to_chart_out, to_luck_out, to_teaser_out
from app.models.saju_order import SajuOrderRow
from app.repositories.saju_order import (
    SajuOrderRepository,
    derive_access_token,
    hash_access_token,
    new_order_id,
)
from app.schemas.saju import (
    BirthInput,
    FollowUpResponse,
    SajuFollowUpState,
    SajuFollowUpTurn,
    SajuOrderCreated,
    SajuPaidReport,
    SajuPaymentConfirmed,
)
from app.services import saju_service

logger = logging.getLogger(__name__)


class PaymentDisabledError(AppError):
    """결제 설정이 없다. 팔 수 없는 상태에서 주문을 만들지 않는다."""

    status_code = 503
    code = "saju_payment_disabled"
    message = "지금은 리포트를 구매할 수 없습니다. 잠시 후 다시 시도해 주세요."


class OrderNotFoundError(AppError):
    status_code = 404
    code = "saju_order_not_found"
    message = "주문을 찾을 수 없습니다."


class ReportNotReadyError(AppError):
    """결제가 아직 확인되지 않았다."""

    status_code = 409
    code = "saju_report_not_ready"
    message = "결제가 확인되지 않았습니다."


class ReportGeneratingError(AppError):
    """결제는 끝났고 리포트를 만드는 중이다. **오류가 아니라 진행 상황이다.**

    `ReportNotReadyError` 와 코드를 나누는 이유: 화면이 폴링을 해야 하는지 판단해야
    한다. 미결제(`saju_report_not_ready`)는 기다려도 바뀌지 않으니 멈춰야 하고,
    생성 중(`saju_report_generating`)은 기다리면 나온다. 같은 코드로 내려가면 화면은
    둘을 구분할 수 없어 **둘 중 하나에서 반드시 틀린 행동**을 한다.

    상태 코드가 202 가 아니라 409 인 것은 이것이 `GET` 의 정상 응답이 아니기
    때문이다 — 본문에 리포트가 없다.
    """

    status_code = 409
    code = "saju_report_generating"
    message = "리포트를 만들고 있습니다. 잠시만 기다려 주세요."


class NoFollowUpSlotsError(AppError):
    """이 주문의 추가 질문을 다 썼다.

    409 인 이유: 요청 자체는 올바르고(422 가 아니다), 권한도 있다(403 이 아니다) —
    **자원의 현재 상태**가 그 요청을 받을 수 없다.
    """

    status_code = 409
    code = "saju_follow_ups_exhausted"
    message = "이번 리포트의 추가 질문을 모두 사용하셨습니다."


class PaymentNeedsAttentionError(AppError):
    """결제 상태를 확정할 수 없어 사람이 확인 중이다. **자동으로 환불하지 않는다.**

    ## 이 문장은 약관 제6조와 글자까지 같아야 한다

    `TossPaymentsProvider` 에는 취소·환불 메서드가 아예 없다. 그래서 이 상태에서
    실제로 일어나는 일은 **사람이 토스 대시보드에서 처리하는 것**이고, 화면은 그
    사실을 그대로 말해야 한다.

    문구가 약관과 어긋나는 것이 가장 나쁘다 — 약관이 "환불 불가" 라고 적으면서
    화면은 환불을 약속하면 고객은 어느 쪽을 믿어야 하는지 알 수 없고, 분쟁에서는
    화면의 약속이 이긴다. 그래서 여기와
    `front/src/app/(legal)/terms/page.tsx` 제6조가 **같은 문장**을 쓴다.
    한쪽을 고치면 반드시 다른 쪽도 고친다.

    예전 문구는 "영업일 기준 1일 이내에 처리해 드립니다" 였다. **무엇을** 처리하는지
    말하지 않아서, 돈이 나간 사람이 환불을 받는지 리포트를 받는지 알 수 없었다.
    """

    status_code = 409
    code = "saju_payment_needs_attention"
    message = (
        "결제 처리 중 문제가 발생해 담당자가 직접 확인하고 있습니다. "
        "영업일 기준 1일 이내로 결제하신 금액을 전액 환불해 드립니다."
    )


def _provider() -> TossPaymentsProvider:
    if not settings.saju_payment_enabled:
        raise PaymentDisabledError()
    return TossPaymentsProvider(settings.toss_secret_key or "")


def _token_for(order_id: str) -> str:
    return derive_access_token(order_id, settings.saju_access_token_secret or "")


async def create_order(birth: BirthInput, repo: SajuOrderRepository) -> SajuOrderCreated:
    """주문을 만든다. 티저를 함께 저장해 결제 화면이 다시 계산하지 않게 한다.

    **결제 설정이 없으면 여기서 막는다.** 주문만 만들어 두고 승인할 수 없으면,
    고객은 결제창까지 갔다가 실패하고 우리에게는 쓸모없는 행이 쌓인다.
    """
    if not settings.saju_payment_enabled:
        raise PaymentDisabledError()

    reading = saju_service.read_chart(birth)
    order_id = new_order_id()
    token = _token_for(order_id)

    await repo.create(
        order_id=order_id,
        birth=birth.model_dump(mode="json"),
        teaser=to_teaser_out(reading.teaser).model_dump(mode="json"),
        amount=settings.saju_report_price,
        access_token_hash=hash_access_token(token),
    )

    return SajuOrderCreated(
        order_id=order_id,
        amount=settings.saju_report_price,
        teaser=to_teaser_out(reading.teaser),
    )


async def confirm_payment(
    *,
    order_id: str,
    payment_key: str,
    amount: int,
    repo: SajuOrderRepository,
    ask_llm,  # noqa: ANN001 - `(system, user) -> str` 코루틴
) -> SajuPaymentConfirmed:
    """토스 승인 → 접근 토큰 반환. **리포트를 기다리지 않는다.**

    ## 왜 리포트를 이 요청에서 떼어냈나

    승인은 1초 남짓, 리포트 생성은 실측 36초다. 둘을 한 요청에 묶으면 **결제가
    됐는지조차 37초 동안 알 수 없고**, 그 사이 연결이 끊기면 돈은 나갔는데 화면은
    실패를 띄운다. 결제 화면에서 그것은 가장 나쁜 실패 방식이다.

    이제 승인이 확정되는 즉시 토큰이 손에 들어온다. 토큰이 있으면 리포트를 잃는
    경로가 없다 — 생성이 늦어도, 끊겨도, 나중에 다시 와도 같은 주소에서 열린다.
    """
    order = await repo.get(order_id)
    if order is None:
        raise OrderNotFoundError()

    if order.status == "needs_attention":
        raise PaymentNeedsAttentionError()

    # 이미 승인된 주문이면 다시 승인하지 않는다. 새로고침·뒤로가기·토스 재시도가
    # 모두 여기로 온다 — 두 번 긁지 않는 것이 이 분기의 전부다.
    if order.status == "paid":
        return await _start_delivery(order, repo, ask_llm)

    # **금액을 서버가 정한 값과 대조한다.** 클라이언트가 보낸 금액을 그대로 승인하면
    # 100원짜리 요청으로 리포트를 살 수 있다.
    if amount != order.amount:
        logger.warning("사주 결제 금액 불일치 — 주문 %s", order_id)
        raise ReportNotReadyError("결제 금액이 주문과 다릅니다.")

    result = await _provider().confirm(
        payment_key=payment_key,
        order_id=order_id,
        amount=order.amount,
        idempotency_key=order.idempotency_key,
    )

    if result.ambiguous or result.already_processed:
        # 실패가 아니다 — **모르는 것**이다. 사람이 대조한다.
        reason = "승인 응답 미상" if result.ambiguous else "이미 처리된 결제"
        await repo.mark_needs_attention(order, reason)
        logger.warning("사주 결제 상태 미상 — 주문 %s (%s)", order_id, reason)
        raise PaymentNeedsAttentionError()

    if not result.paid:
        logger.info("사주 결제 거절 — 주문 %s (status=%s)", order_id, result.status)
        raise ReportNotReadyError("결제가 완료되지 않았습니다.")

    order = await repo.mark_paid(order, result.payment_key)
    return await _start_delivery(order, repo, ask_llm)


async def _start_delivery(
    order: SajuOrderRow,
    repo: SajuOrderRepository,
    ask_llm,  # noqa: ANN001
) -> SajuPaymentConfirmed:
    """리포트가 이미 있으면 그렇다고 답하고, 없으면 **뒤에서 만들기 시작한다.**

    어느 쪽이든 토큰은 지금 내려간다. 화면은 `ready` 가 거짓일 때만
    `GET /saju/reports/{token}` 을 폴링한다.
    """
    if await repo.get_report(order.id) is not None:
        return SajuPaymentConfirmed(access_token=_token_for(order.id), ready=True)

    _spawn_report_generation(order.id, ask_llm)
    return SajuPaymentConfirmed(access_token=_token_for(order.id), ready=False)


def _spawn_report_generation(order_id: str, ask_llm) -> None:  # noqa: ANN001
    """유료 리포트 생성을 요청 밖으로 내보낸다.

    ## 세션을 새로 연다 — 이것이 이 함수가 존재하는 이유다

    요청의 DB 세션은 **응답이 나가는 순간 닫힌다**(`get_db` 의 `async with`). 그
    세션을 들고 백그라운드로 넘어가면 저장하려는 시점에 이미 닫혀 있다. 그래서 여기서
    `AsyncSessionLocal` 로 자기 세션을 연다 — 배치 작업들(`market_service`,
    `snapshot_service`)이 쓰는 것과 같은 규약이다.

    ## 결과를 작업 저장소에 넣지 않는다

    유료 경로는 리포트를 `saju_reports` 에 저장하므로 조회할 곳이 이미 있다. 메모리
    작업 저장소에 또 넣으면 진실이 두 곳에 있게 되고, 재시작하면 그 둘이 어긋난다.
    화면은 DB 를 본다.
    """
    from app.services.saju_job_store import start

    async def run() -> None:
        from app.core.database import AsyncSessionLocal

        async with AsyncSessionLocal() as session:
            await _generate_and_store(order_id, SajuOrderRepository(session), ask_llm)

    # 실패 문장이 화면에 닿지 않는다 — 유료 경로는 DB 를 보고, 저장이 안 됐으면
    # `read_paid_report` 가 "만들고 있습니다" 로 답한다. 여기 문장은 로그용이다.
    start(run, failure_message="리포트 생성에 실패했습니다.")


async def _generate_and_store(
    order_id: str,
    repo: SajuOrderRepository,
    ask_llm,  # noqa: ANN001
) -> None:
    """리포트를 만들어 저장한다. 이미 있으면 아무것도 하지 않는다.

    **결제는 이미 끝났다.** 그래서 생성이 실패해도 고객을 빈손으로 두지 않는다 —
    `generate_report` 가 규칙 기반 간이 리포트로 내려가고, 그것이라도 저장한다.

    맨 앞의 존재 확인은 **경합 방어**다. 승인 요청이 두 번 들어오면(토스 재시도,
    사용자 새로고침) 작업도 두 개 뜬다. 둘 다 저장하면 한 주문에 리포트가 둘이 되고
    LLM 도 두 번 태운다.
    """
    order = await repo.get(order_id)
    if order is None:
        logger.warning("사주 리포트 생성 대상 주문이 없습니다 — %s", order_id)
        return
    if await repo.get_report(order_id) is not None:
        return

    birth = BirthInput.model_validate(order.birth)
    report = await saju_service.generate_report(birth, ask_llm)

    # 화면의 계산 패널이 쓸 값. 리포트를 열 때마다 엔진을 다시 돌리지 않으려고
    # 함께 저장한다.
    reading = saju_service.read_chart(birth)
    chart_payload = {
        "chart": to_chart_out(reading.chart).model_dump(mode="json"),
        "luck": to_luck_out(reading.luck).model_dump(mode="json"),
        "strength_verdict": reading.strength.verdict,
    }

    await repo.save_report(
        order_id=order_id,
        markdown=report.markdown,
        chart=chart_payload,
        source=report.source,
    )
    logger.info("사주 유료 리포트 저장 — 주문 %s (source=%s)", order_id, report.source)


async def read_paid_report(token: str, repo: SajuOrderRepository) -> SajuPaidReport:
    """토큰으로 리포트를 연다.

    토큰은 **자격 증명 그 자체**다. 주소를 아는 사람이 곧 산 사람이므로 별도 로그인이
    없고, 그래서 이 화면은 색인되지 않아야 한다(프런트 metadata 의 `noindex`).
    """
    order = await repo.get_by_token_hash(hash_access_token(token))
    if order is None:
        raise OrderNotFoundError()

    if order.status == "needs_attention":
        raise PaymentNeedsAttentionError()
    if order.status != "paid":
        raise ReportNotReadyError()

    report = await repo.get_report(order.id)
    if report is None:
        # 결제는 됐는데 리포트가 아직 없다 — **정상적인 중간 상태다.** 승인이
        # 리포트를 기다리지 않고 내려가므로, 승인 직후 몇십 초는 반드시 여기를 지난다.
        #
        # 여기서 만들지 않는 이유: 이 경로는 `GET` 이고, 폴링이 들어오는 경로다.
        # 여기서 LLM 을 태우면 폴링 한 번마다 생성이 하나씩 뜬다.
        raise ReportGeneratingError()

    # 대화와 소모 개수를 함께 준다. **두 값이 따로인 이유**: 대화 길이는 화면에
    # 보이는 것이고, 소모 개수는 실패로 돌려준 슬롯을 뺀 회계 값이다. 우리 장애로
    # 슬롯을 돌려준 뒤에는 둘이 어긋나며, 그때 남은 개수의 근거는 **뒤쪽**이다.
    turns = await repo.list_follow_ups(order.id)
    spent = await repo.count_spent_slots(order.id)

    return SajuPaidReport(
        access_token=token,
        markdown=report.markdown,
        chart=report.chart,
        source=report.source,
        follow_ups=[
            SajuFollowUpTurn(
                question=turn.question,
                answer=turn.answer,
                status=turn.status,
                source=turn.source,
            )
            for turn in turns
        ],
        follow_ups_spent=spent,
        max_follow_ups=MAX_FOLLOW_UPS,
    )


async def read_follow_up_state(
    token: str, repo: SajuOrderRepository
) -> SajuFollowUpState:
    """대화와 소모 개수만 읽는다. 리포트 본문은 건드리지 않는다.

    리포트가 아직 없어도 답한다 — 결제만 확인되면 질문은 할 수 있고, 이 조회가
    리포트 생성을 기다릴 이유가 없다.
    """
    order = await repo.get_by_token_hash(hash_access_token(token))
    if order is None:
        raise OrderNotFoundError()
    if order.status == "needs_attention":
        raise PaymentNeedsAttentionError()
    if order.status != "paid":
        raise ReportNotReadyError()

    turns = await repo.list_follow_ups(order.id)
    return SajuFollowUpState(
        follow_ups=[
            SajuFollowUpTurn(
                question=turn.question,
                answer=turn.answer,
                status=turn.status,
                source=turn.source,
            )
            for turn in turns
        ],
        follow_ups_spent=await repo.count_spent_slots(order.id),
        max_follow_ups=MAX_FOLLOW_UPS,
    )


async def reserve_follow_up(
    *,
    token: str,
    question: str,
    repo: SajuOrderRepository,
) -> tuple[BirthInput, int]:
    """유료 경로의 추가 질문 슬롯을 **지금** 잡는다.

    돌려주는 것은 `(생년월일시, 예약된 행 id)` 다. 답을 만드는 일은 부르는 쪽이
    백그라운드로 돌린다 — LLM 한 번이 브라우저 타임아웃을 넘기기 때문이다.

    ## 예약이 답보다 먼저다

    답을 만든 뒤에 자리를 잡으면, 동시에 여덟 번 누른 사람의 요청이 여덟 개 다
    LLM 을 태우고 나서 셋만 살아남는다. 다섯 번의 비용은 이미 나갔다. 그래서
    **먼저 자리를 잡고** 그 자리를 들고 생성에 들어간다.
    """
    order = await repo.get_by_token_hash(hash_access_token(token))
    if order is None:
        raise OrderNotFoundError()
    if order.status == "needs_attention":
        raise PaymentNeedsAttentionError()
    if order.status != "paid":
        raise ReportNotReadyError()

    reserved = await repo.reserve_follow_up(order.id, question, MAX_FOLLOW_UPS)
    if reserved is None:
        raise NoFollowUpSlotsError()

    return BirthInput.model_validate(order.birth), reserved.id


async def answer_reserved_follow_up(
    *,
    follow_up_id: int,
    birth: BirthInput,
    question: str,
    ask_llm,  # noqa: ANN001
) -> FollowUpResponse:
    """예약된 슬롯의 답을 만들고 **결과에 따라 슬롯을 확정하거나 돌려준다.**

    자기 DB 세션을 연다 — 백그라운드에서 도는 함수이고, 요청의 세션은 응답이 나가는
    순간 닫힌다(`_spawn_report_generation` 과 같은 이유).

    소모 규칙은 `models/saju_order.SajuFollowUpRow` 의 "무엇이 슬롯을 소모하는가"
    절에 있다. 여기서 하는 일은 그 규칙을 그대로 적용하는 것뿐이다.
    """
    from app.core.database import AsyncSessionLocal

    outcome = await saju_service.answer_follow_up_detailed(birth, question, ask_llm)

    async with AsyncSessionLocal() as session:
        repo = SajuOrderRepository(session)
        if outcome.kind == "answered":
            await repo.complete_follow_up(
                follow_up_id,
                answer=outcome.response.answer,
                source=outcome.response.source,
            )
        elif outcome.kind == "refused":
            await repo.refuse_follow_up(follow_up_id, answer=outcome.response.answer)
        else:
            # 우리 쪽 실패다. 슬롯을 돌려준다 — 고객은 다시 물을 수 있다.
            await repo.fail_follow_up(follow_up_id)
            logger.warning("추가 질문 실패로 슬롯을 반환했습니다 — 행 %s", follow_up_id)

    return outcome.response


async def birth_for_token(token: str, repo: SajuOrderRepository) -> BirthInput:
    """토큰이 가리키는 주문의 생년월일시.

    추가 질문이 쓴다 — 유료 리포트에서는 사주를 서버가 갖고 있으므로 브라우저가
    생년월일시를 다시 보낼 이유가 없다. **결제된 주문에만** 답한다: 결제 전 주문의
    토큰으로 LLM 을 태울 수 있으면 결제를 건너뛰고 질문만 무한히 쓸 수 있다.
    """
    order = await repo.get_by_token_hash(hash_access_token(token))
    if order is None:
        raise OrderNotFoundError()
    if order.status != "paid":
        raise ReportNotReadyError()
    return BirthInput.model_validate(order.birth)
