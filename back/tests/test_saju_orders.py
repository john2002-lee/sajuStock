"""유료 리포트 경로 — 승인·전달·조회의 계약 테스트.

## 왜 이 파일이 생겼나

이 경로에는 테스트가 하나도 없었다. 그런데 여기가 **돈이 오가는 유일한 자리**이고,
리포트 생성을 요청 밖으로 내보내면서 승인의 반환 계약과 조회의 실패 코드가 함께
바뀌었다. 그 두 가지가 어긋나면 증상이 조용하다: 화면이 영원히 기다리거나, 다 된
리포트를 포기하거나, 같은 결제를 두 번 긁는다.

DB 를 띄우지 않는다. 저장소를 가짜로 두면 검사하려는 **분기**가 그대로 드러나고,
이 저장소의 `TEST_DATABASE_URL` 은 지금 살아 있지도 않다.
"""

import asyncio
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import pytest

from app.domain.saju.followup import MAX_FOLLOW_UPS
from app.integrations.payment.toss import PaymentResult
from app.schemas.saju import BirthInput
from app.services import saju_job_store, saju_order_service
from app.services.saju_order_service import (
    NoFollowUpSlotsError,
    OrderNotFoundError,
    PaymentNeedsAttentionError,
    ReportGeneratingError,
    ReportNotReadyError,
    confirm_payment,
    read_paid_report,
    read_shared_report,
    share_paid_report,
)

BIRTH = BirthInput(
    year=1990,
    month=5,
    day=15,
    hour=14,
    minute=30,
    gender="M",
    birth_place_code="SEOUL",
)


# ---------------------------------------------------------------------------
# 가짜 저장소 — 실제 저장소의 **호출된 횟수**까지 드러낸다. 두 번 긁지 않는지,
# 리포트를 두 번 만들지 않는지가 이 파일이 확인하려는 것 중 절반이다.
# ---------------------------------------------------------------------------


#: 주문을 만들 때 서버가 계산해 넣어 두는 값(`create_order`). 유료 결과 공유가
#: **재계산 없이** 옮기는 것이 정확히 이것이라, 테스트도 그 자리에서 가져온다.
TEASER = {
    "pillars_hangul": ["경오", "신사", "임진", "정미"],
    "char_count": 8,
    "day_master_hangul": "임",
    "visible_wuxing": {"목": 0, "화": 3, "토": 2, "금": 2, "수": 1},
    "strength_verdict": "신약",
    "summary": "여덟 글자 요약 한 문단.",
}


@dataclass
class FakeOrder:
    id: str = "order-1"
    birth: dict[str, Any] = field(default_factory=lambda: BIRTH.model_dump(mode="json"))
    teaser: dict[str, Any] = field(default_factory=lambda: dict(TEASER))
    amount: int = 9900
    status: str = "pending"
    idempotency_key: str = "idem-1"
    payment_key: str | None = None
    attention_reason: str | None = None
    report_share_id: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass
class FakeFollowUp:
    id: int
    order_id: str
    question: str
    answer: str | None = None
    status: str = "pending"
    source: str = "llm"


@dataclass
class FakeReport:
    markdown: str = "# 총평\n본문"
    chart: dict[str, Any] = field(default_factory=dict)
    source: str = "llm"


class FakeRepo:
    def __init__(self, order: FakeOrder | None, report: FakeReport | None = None):
        self.order = order
        self.report = report
        self.saved: list[dict[str, Any]] = []
        self.marked_paid = 0
        self.attention: list[str] = []
        self.share_ids_written: list[str] = []
        self.follow_ups: list[FakeFollowUp] = []
        self._next_follow_up_id = 1

    async def get(self, order_id: str):
        return self.order if self.order and self.order.id == order_id else None

    async def get_by_token_hash(self, _hash: str):
        return self.order

    async def get_report(self, _order_id: str):
        return self.report

    async def mark_paid(self, order, payment_key):
        self.marked_paid += 1
        order.status = "paid"
        order.payment_key = payment_key
        return order

    async def mark_needs_attention(self, order, reason):
        self.attention.append(reason)
        order.status = "needs_attention"
        return order

    async def set_report_share_id(self, order, share_id: str):
        self.share_ids_written.append(share_id)
        order.report_share_id = share_id
        return order

    async def get_by_report_share_id(self, share_id: str, _cutoffs):
        if self.order is None or self.order.report_share_id != share_id:
            return None
        return self.order

    async def save_report(self, *, order_id, markdown, chart, source):
        self.saved.append({"order_id": order_id, "markdown": markdown, "source": source})
        self.report = FakeReport(markdown=markdown, chart=chart, source=source)

    # --- 추가 질문 슬롯 -------------------------------------------------------

    async def list_follow_ups(self, order_id: str):
        return [
            f
            for f in self.follow_ups
            if f.order_id == order_id and f.status != "failed"
        ]

    async def count_spent_slots(self, order_id: str) -> int:
        return len(await self.list_follow_ups(order_id))

    async def reserve_follow_up(self, order_id: str, question: str, max_slots: int):
        if await self.count_spent_slots(order_id) >= max_slots:
            return None
        row = FakeFollowUp(
            id=self._next_follow_up_id, order_id=order_id, question=question
        )
        self._next_follow_up_id += 1
        self.follow_ups.append(row)
        return row

    def _find(self, follow_up_id: int):
        return next((f for f in self.follow_ups if f.id == follow_up_id), None)

    async def complete_follow_up(self, follow_up_id: int, *, answer: str, source: str):
        row = self._find(follow_up_id)
        if row is None:
            return
        row.answer, row.source, row.status = answer, source, "answered"

    async def refuse_follow_up(self, follow_up_id: int, *, answer: str):
        row = self._find(follow_up_id)
        if row is None:
            return
        row.answer, row.source, row.status = answer, "fallback", "refused"

    async def fail_follow_up(self, follow_up_id: int):
        row = self._find(follow_up_id)
        if row is None:
            return
        row.status = "failed"


class FakeProvider:
    """토스 대역. **불렸는지**가 중요하다 — 금액 검증은 승인 앞에 있어야 한다."""

    def __init__(self, result: PaymentResult):
        self.result = result
        self.calls = 0

    async def confirm(self, **_kwargs):
        self.calls += 1
        return self.result

    async def query(self, **_kwargs):  # pragma: no cover - 이 파일이 쓰지 않는다
        return self.result


def toss_result(**overrides) -> PaymentResult:
    """`PaymentResult` 는 필드가 여덟 개이고 전부 필수다. 테스트가 신경 쓰는 것은
    그중 셋(`paid`·`ambiguous`·`already_processed`)이라 나머지는 여기서 채운다."""
    base = {
        "order_id": "order-1",
        "paid": True,
        "amount": 9900,
        "currency": "KRW",
        "payment_key": "pk-1",
        "status": "DONE",
        "already_processed": False,
        "ambiguous": False,
    }
    return PaymentResult(**{**base, **overrides})


@pytest.fixture(autouse=True)
def clean_jobs():
    saju_job_store.reset_for_tests()
    yield
    saju_job_store.reset_for_tests()


async def ask_llm(_system: str, _user: str) -> str:  # pragma: no cover
    raise AssertionError("LLM 을 부르지 않아야 한다")


# ---------------------------------------------------------------------------


class TestConfirmPayment:
    @pytest.mark.asyncio
    async def test_amount_mismatch_is_rejected_before_touching_toss(self, monkeypatch):
        """금액이 다르면 **승인을 시도하지도 않는다.**

        순서가 뒤집히면 100원짜리 요청으로 결제가 먼저 승인되고, 그다음에 거절된다 —
        돈은 이미 움직인 뒤다.
        """
        repo = FakeRepo(FakeOrder())
        provider = FakeProvider(toss_result())
        monkeypatch.setattr(saju_order_service, "_provider", lambda: provider)

        with pytest.raises(ReportNotReadyError):
            await confirm_payment(
                order_id="order-1",
                payment_key="pk",
                amount=100,
                repo=repo,
                ask_llm=ask_llm,
            )

        assert provider.calls == 0
        assert repo.marked_paid == 0

    @pytest.mark.asyncio
    async def test_already_paid_order_is_not_charged_again(self, monkeypatch):
        """이미 결제된 주문은 승인을 건너뛴다.

        새로고침·뒤로가기·토스 재시도가 전부 이 경로로 온다.
        """
        repo = FakeRepo(FakeOrder(status="paid"), report=FakeReport())
        provider = FakeProvider(toss_result())
        monkeypatch.setattr(saju_order_service, "_provider", lambda: provider)

        result = await confirm_payment(
            order_id="order-1",
            payment_key="pk",
            amount=9900,
            repo=repo,
            ask_llm=ask_llm,
        )

        assert provider.calls == 0
        assert result.ready is True
        assert result.access_token

    @pytest.mark.asyncio
    async def test_confirmed_payment_returns_token_without_waiting_for_report(
        self, monkeypatch
    ):
        """**승인이 리포트를 기다리지 않는다.**

        이 테스트가 지키는 것: 승인 응답에 리포트가 없어도 토큰은 있다. 예전에는 둘이
        한 요청이라 리포트 생성(36초)이 끝나야 결제 성공을 알 수 있었고, 그 사이
        연결이 끊기면 돈은 나갔는데 화면은 실패였다.

        `ask_llm` 은 불리면 실패하는 대역이다 — 그런데도 통과한다는 것이 곧 이
        요청이 생성을 기다리지 않았다는 증거다.
        """
        repo = FakeRepo(FakeOrder())
        provider = FakeProvider(toss_result())
        monkeypatch.setattr(saju_order_service, "_provider", lambda: provider)
        # 백그라운드 생성이 실제로 돌지 않게 한다 — 여기서 보려는 것은 반환 계약이다.
        monkeypatch.setattr(saju_order_service, "_spawn_report_generation", lambda *_: None)

        result = await confirm_payment(
            order_id="order-1",
            payment_key="pk-1",
            amount=9900,
            repo=repo,
            ask_llm=ask_llm,
        )

        assert provider.calls == 1
        assert repo.marked_paid == 1
        assert result.ready is False
        assert result.access_token

    @pytest.mark.asyncio
    async def test_ambiguous_result_needs_attention_and_is_not_a_failure(
        self, monkeypatch
    ):
        """승인 결과가 미상이면 **모른다**고 기록한다. 자동 환불하지 않는다."""
        repo = FakeRepo(FakeOrder())
        provider = FakeProvider(toss_result(paid=False, status="UNKNOWN", ambiguous=True))
        monkeypatch.setattr(saju_order_service, "_provider", lambda: provider)

        with pytest.raises(PaymentNeedsAttentionError):
            await confirm_payment(
                order_id="order-1",
                payment_key="pk",
                amount=9900,
                repo=repo,
                ask_llm=ask_llm,
            )

        assert repo.attention == ["승인 응답 미상"]
        assert repo.marked_paid == 0

    @pytest.mark.asyncio
    async def test_rejected_payment_leaves_the_order_pending(self, monkeypatch):
        """거절은 **확정된 실패**다 — `needs_attention` 이 아니다.

        둘을 섞으면 사람이 대조할 목록에 단순 카드 거절이 쌓인다.
        """
        repo = FakeRepo(FakeOrder())
        provider = FakeProvider(toss_result(paid=False, status="ABORTED"))
        monkeypatch.setattr(saju_order_service, "_provider", lambda: provider)

        with pytest.raises(ReportNotReadyError):
            await confirm_payment(
                order_id="order-1",
                payment_key="pk",
                amount=9900,
                repo=repo,
                ask_llm=ask_llm,
            )

        assert repo.attention == []
        assert repo.order is not None
        assert repo.order.status == "pending"


class TestReadPaidReport:
    @pytest.mark.asyncio
    async def test_paid_but_missing_report_says_generating(self):
        """결제됐고 리포트가 없으면 **`saju_report_generating`** 이다.

        화면이 폴링을 계속할지 여기서 갈린다. 미결제와 같은 코드로 내려가면 화면은
        둘을 구분할 수 없어 다 된 리포트를 포기하거나 영원히 기다린다.
        """
        repo = FakeRepo(FakeOrder(status="paid"), report=None)

        with pytest.raises(ReportGeneratingError) as exc:
            await read_paid_report("token", repo)

        assert exc.value.code == "saju_report_generating"

    @pytest.mark.asyncio
    async def test_unpaid_order_is_a_different_code(self):
        """미결제는 기다려도 바뀌지 않는다 — 코드가 달라야 한다."""
        repo = FakeRepo(FakeOrder(status="pending"))

        with pytest.raises(ReportNotReadyError) as exc:
            await read_paid_report("token", repo)

        assert exc.value.code == "saju_report_not_ready"

    @pytest.mark.asyncio
    async def test_ready_report_comes_back_with_the_token(self):
        repo = FakeRepo(FakeOrder(status="paid"), report=FakeReport(markdown="# 총평\n됐네"))

        result = await read_paid_report("token", repo)

        assert result.markdown == "# 총평\n됐네"
        assert result.access_token == "token"


class TestGenerateAndStore:
    @pytest.mark.asyncio
    async def test_does_not_regenerate_when_a_report_already_exists(self, monkeypatch):
        """이미 있으면 만들지 않는다.

        승인 요청이 두 번 오면(토스 재시도·새로고침) 작업도 두 개 뜬다. 이 확인이
        없으면 한 주문에 리포트가 둘 저장되고 LLM 도 두 번 태운다.
        """
        repo = FakeRepo(FakeOrder(status="paid"), report=FakeReport())

        async def boom(_birth, _ask):  # pragma: no cover
            raise AssertionError("생성을 시도해서는 안 된다")

        monkeypatch.setattr(saju_order_service.saju_service, "generate_report", boom)

        await saju_order_service._generate_and_store("order-1", repo, ask_llm)

        assert repo.saved == []

    @pytest.mark.asyncio
    async def test_missing_order_is_survivable(self):
        """주문이 사라졌으면 조용히 끝난다 — 백그라운드에서 예외를 올릴 이유가 없다."""
        repo = FakeRepo(None)
        await saju_order_service._generate_and_store("gone", repo, ask_llm)
        assert repo.saved == []


class TestJobStore:
    @pytest.mark.asyncio
    async def test_result_is_retrievable_after_completion(self):
        async def work():
            return {"value": 42}

        job = saju_job_store.start(work, failure_message="실패")
        assert job.status == "running"

        # 작업에 실행 기회를 준다. `start` 는 기다리지 않으므로 여기서 한 박자 넘긴다.
        for _ in range(50):
            if job.status != "running":
                break
            await asyncio.sleep(0.01)

        assert job.status == "done"
        assert job.result == {"value": 42}
        assert saju_job_store.get(job.id) is job

    @pytest.mark.asyncio
    async def test_failure_hides_the_exception_text(self):
        """예외 메시지가 화면으로 새지 않는다.

        예외에는 생년월일시가 인용돼 있을 수 있다. 그래서 실패 문장은 **미리 준비된
        것**만 쓴다.
        """

        async def work():
            raise ValueError("1990-05-15 14:30 처리 중 실패")

        job = saju_job_store.start(work, failure_message="풀이를 만들지 못했습니다.")

        for _ in range(50):
            if job.status != "running":
                break
            await asyncio.sleep(0.01)

        assert job.status == "failed"
        assert job.error == "풀이를 만들지 못했습니다."
        assert "1990" not in (job.error or "")

    def test_unknown_job_is_none(self):
        assert saju_job_store.get("does-not-exist") is None


class TestFollowUpSlots:
    """추가 질문 3개는 **결제한 사람의 권리**다. 서버가 지키는지 본다."""

    @pytest.mark.asyncio
    async def test_reservation_is_refused_once_slots_run_out(self):
        """네 번째 질문은 거절된다. 새로고침으로 슬롯이 되살아나지 않는다."""
        repo = FakeRepo(FakeOrder(status="paid"), report=FakeReport())
        for i in range(MAX_FOLLOW_UPS):
            await saju_order_service.reserve_follow_up(
                token="tok", question=f"질문{i}", repo=repo
            )

        with pytest.raises(NoFollowUpSlotsError):
            await saju_order_service.reserve_follow_up(
                token="tok", question="하나 더", repo=repo
            )

    @pytest.mark.asyncio
    async def test_unpaid_order_cannot_reserve(self):
        repo = FakeRepo(FakeOrder(status="pending"))
        with pytest.raises(ReportNotReadyError):
            await saju_order_service.reserve_follow_up(
                token="tok", question="질문", repo=repo
            )
        assert repo.follow_ups == []

    @pytest.mark.asyncio
    async def test_pending_reservation_already_holds_its_slot(self):
        """답이 오는 **동안에도** 자리는 잡혀 있다.

        세 번 연속 누르면 세 작업이 동시에 도는데, `pending` 을 세지 않으면 각자
        "아직 0개 썼다" 를 보고 네 번째·다섯 번째까지 통과한다.
        """
        repo = FakeRepo(FakeOrder(status="paid"))
        await saju_order_service.reserve_follow_up(
            token="tok", question="첫 질문", repo=repo
        )
        assert await repo.count_spent_slots("order-1") == 1

    @pytest.mark.asyncio
    async def test_answer_spends_the_slot(self, monkeypatch):
        repo = FakeRepo(FakeOrder(status="paid"))
        _, follow_up_id = await saju_order_service.reserve_follow_up(
            token="tok", question="질문", repo=repo
        )
        _patch_outcome(monkeypatch, repo, kind="answered", answer="그렇다네")

        await saju_order_service.answer_reserved_follow_up(
            follow_up_id=follow_up_id, birth=BIRTH, question="질문", ask_llm=ask_llm
        )

        assert repo.follow_ups[0].status == "answered"
        assert await repo.count_spent_slots("order-1") == 1

    @pytest.mark.asyncio
    async def test_model_refusal_also_spends_the_slot(self, monkeypatch):
        """**거절도 소모한다.** 환불하면 거절되는 질문 하나로 생성을 무한히 돌릴 수 있다."""
        repo = FakeRepo(FakeOrder(status="paid"))
        _, follow_up_id = await saju_order_service.reserve_follow_up(
            token="tok", question="질문", repo=repo
        )
        _patch_outcome(monkeypatch, repo, kind="refused", answer="답하기 어렵네")

        await saju_order_service.answer_reserved_follow_up(
            follow_up_id=follow_up_id, birth=BIRTH, question="질문", ask_llm=ask_llm
        )

        assert repo.follow_ups[0].status == "refused"
        assert await repo.count_spent_slots("order-1") == 1

    @pytest.mark.asyncio
    async def test_our_own_failure_gives_the_slot_back(self, monkeypatch):
        """**우리 장애는 소모하지 않는다.** 고객 잘못이 아니다."""
        repo = FakeRepo(FakeOrder(status="paid"))
        _, follow_up_id = await saju_order_service.reserve_follow_up(
            token="tok", question="질문", repo=repo
        )
        _patch_outcome(monkeypatch, repo, kind="failed", answer="지금은 어렵네")

        await saju_order_service.answer_reserved_follow_up(
            follow_up_id=follow_up_id, birth=BIRTH, question="질문", ask_llm=ask_llm
        )

        assert repo.follow_ups[0].status == "failed"
        assert await repo.count_spent_slots("order-1") == 0
        # 대화에도 남지 않는다 — 답 없는 자기 질문을 보게 되면 잃은 것처럼 보인다.
        assert await repo.list_follow_ups("order-1") == []

    @pytest.mark.asyncio
    async def test_paid_report_carries_the_conversation(self, monkeypatch):
        """새로고침해도 대화가 남는다 — 이 기능의 존재 이유다."""
        repo = FakeRepo(FakeOrder(status="paid"), report=FakeReport())
        _, follow_up_id = await saju_order_service.reserve_follow_up(
            token="tok", question="올해 재물운은?", repo=repo
        )
        _patch_outcome(monkeypatch, repo, kind="answered", answer="나쁘지 않네")
        await saju_order_service.answer_reserved_follow_up(
            follow_up_id=follow_up_id, birth=BIRTH, question="올해 재물운은?", ask_llm=ask_llm
        )

        result = await read_paid_report("tok", repo)

        assert [t.question for t in result.follow_ups] == ["올해 재물운은?"]
        assert result.follow_ups[0].answer == "나쁘지 않네"
        assert result.follow_ups_spent == 1
        assert result.max_follow_ups == MAX_FOLLOW_UPS


def _patch_outcome(monkeypatch, repo: FakeRepo, *, kind: str, answer: str) -> None:
    """`answer_follow_up_detailed` 와 백그라운드 세션을 대역으로 바꾼다.

    세션까지 바꾸는 이유: `answer_reserved_follow_up` 은 자기 DB 세션을 여는데
    (요청 세션이 닫히므로 옳다), 테스트에는 DB 가 없다. 가짜 저장소를 그대로 쓰도록
    돌려준다.
    """
    from app.schemas.saju import FollowUpResponse
    from app.services.saju_service import FollowUpOutcome

    async def fake_detailed(_birth, question, _ask, _now=None):
        return FollowUpOutcome(
            response=FollowUpResponse(
                question=question,
                answer=answer,
                source="llm" if kind == "answered" else "fallback",
            ),
            kind=kind,
        )

    monkeypatch.setattr(
        saju_order_service.saju_service, "answer_follow_up_detailed", fake_detailed
    )
    monkeypatch.setattr(
        saju_order_service, "SajuOrderRepository", lambda _session: repo
    )

    class _NullSession:
        async def __aenter__(self):
            return None

        async def __aexit__(self, *_):
            return False

    import app.core.database as database

    monkeypatch.setattr(database, "AsyncSessionLocal", lambda: _NullSession())


# ---------------------------------------------------------------------------
# 유료 리포트 공유 — `POST /saju/shares/from-report` · `GET /saju/shares/report/{id}`
#
# 이 절이 지키는 것은 셋이다.
#
#   ① **접근 토큰이 링크가 되지 않는다.** 그 토큰은 로그인을 대신하는 자격
#      증명이라, 받은 사람이 양력 생년월일을 보고 구매자의 남은 추가 질문까지
#      쓴다. 공유 id 는 토큰과 무관한 두 번째 난수여야 한다.
#   ② **응답이 좁혀져 있는가.** 화면에서 감추는 것은 UI 일 뿐이다 — 새는지
#      아닌지는 응답이 정한다.
#   ③ **결제된, 리포트가 있는 주문만.** 링크를 먼저 쥐여 주면 받는 쪽에만 404 인
#      주소가 나가고 보낸 쪽은 그것을 알 수 없다.
# ---------------------------------------------------------------------------

#: 저장된 리포트의 `chart` 칸을 **실제 매퍼로** 짓는다. 손으로 적으면 매퍼에
#: 필드가 하나 느는 날 이 테스트만 옛 모양을 검사하며 통과한다 — 새는지 보는
#: 테스트가 그러면 아무것도 안 지킨다.
def _stored_chart() -> dict[str, Any]:
    from app.integrations.saju.mapper import to_chart_out, to_luck_out
    from app.services import saju_service

    reading = saju_service.read_chart(BIRTH)
    return {
        "chart": to_chart_out(reading.chart).model_dump(mode="json"),
        "luck": to_luck_out(reading.luck).model_dump(mode="json"),
        "strength_verdict": reading.strength.verdict,
    }


class TestSharePaidReport:
    @pytest.mark.asyncio
    async def test_mints_an_id_that_is_not_the_access_token(self):
        """**이 테스트가 이 기능의 존재 이유다.**

        토큰을 그대로 쓰거나 그것에서 파생시키면, 받은 사람이 되돌려 원래 화면으로
        갈 수 있다. 공유 id 는 토큰과 아무 관계가 없어야 한다.
        """
        orders = FakeRepo(FakeOrder(status="paid"), report=FakeReport())

        result = await share_paid_report("token", orders)

        assert result.share_id
        assert result.share_id != "token"
        assert "token" not in result.share_id
        assert orders.order.report_share_id == result.share_id

    @pytest.mark.asyncio
    async def test_second_click_returns_the_same_link(self):
        """누를 때마다 새로 내면 먼저 보낸 링크가 말없이 죽는다."""
        orders = FakeRepo(FakeOrder(status="paid"), report=FakeReport())

        first = await share_paid_report("token", orders)
        second = await share_paid_report("token", orders)

        assert first.share_id == second.share_id
        assert len(orders.share_ids_written) == 1

    @pytest.mark.asyncio
    async def test_report_still_generating_cannot_be_shared(self):
        """링크를 먼저 쥐여 주면 **받는 사람에게만 404 인** 주소가 나간다."""
        orders = FakeRepo(FakeOrder(status="paid"), report=None)

        with pytest.raises(ReportGeneratingError):
            await share_paid_report("token", orders)

        assert orders.order.report_share_id is None

    @pytest.mark.asyncio
    async def test_unpaid_order_cannot_mint(self):
        orders = FakeRepo(FakeOrder(status="pending"), report=FakeReport())

        with pytest.raises(ReportNotReadyError):
            await share_paid_report("token", orders)

    @pytest.mark.asyncio
    async def test_needs_attention_order_cannot_mint(self):
        orders = FakeRepo(FakeOrder(status="needs_attention"), report=FakeReport())

        with pytest.raises(PaymentNeedsAttentionError) as exc:
            await share_paid_report("token", orders)

        assert exc.value.code == "saju_payment_needs_attention"

    @pytest.mark.asyncio
    async def test_unknown_token_is_not_found(self):
        with pytest.raises(OrderNotFoundError):
            await share_paid_report("token", FakeRepo(None))


#: 줄바꿈이 든 본문. 마크다운이 저장된 그대로 건너가는지 보는 것이 요점이다.
MARKDOWN = "# 총평" + chr(10) + "됐네"


class TestReadSharedReport:
    @pytest.mark.asyncio
    async def test_body_and_panels_come_through(self):
        """공유의 값어치는 리포트 본문과 계산 패널이다. 그것이 나가야 한다."""
        stored = _stored_chart()
        orders = FakeRepo(
            FakeOrder(status="paid", report_share_id="shr"),
            report=FakeReport(markdown=MARKDOWN, chart=stored),
        )

        shared = await read_shared_report("shr", orders)

        assert shared.markdown == MARKDOWN
        assert shared.chart.day_master_hangul
        assert shared.luck.da_yun
        assert shared.strength_verdict == stored["strength_verdict"]

    @pytest.mark.asyncio
    async def test_birth_identifying_fields_are_structurally_dropped(self):
        """**응답에 생년월일로 이어지는 칸이 하나도 없어야 한다.**

        `solar_date` 한 칸이 곧 생년월일이고, 진태양시 보정 분값 둘의 조합은
        출생지 경도를 좁힌다. 저장된 리포트에는 그 셋이 **다 들어 있다** — 아래
        `assert` 들이 그것을 먼저 확인한다. 응답에서 사라지는 것은 지우는 코드가
        아니라 `SharedChartOut` 이라는 타입 때문이다.
        """
        stored = _stored_chart()
        assert stored["chart"]["solar_date"]
        assert "longitude_correction_minutes" in stored["chart"]["conventions"]

        orders = FakeRepo(
            FakeOrder(status="paid", report_share_id="shr"),
            report=FakeReport(chart=stored),
        )

        shared = await read_shared_report("shr", orders)
        raw = shared.model_dump_json()

        assert "solar_date" not in raw
        assert "longitude_correction_minutes" not in raw
        assert "equation_of_time_minutes" not in raw
        assert "access_token" not in raw
        # 값으로도 새지 않는지 — 키 검사만으로는 중첩된 것을 못 잡는다.
        assert "1990-05-15" not in raw

    @pytest.mark.asyncio
    async def test_unknown_id_is_not_found(self):
        orders = FakeRepo(
            FakeOrder(status="paid", report_share_id="shr"), report=FakeReport()
        )

        with pytest.raises(OrderNotFoundError):
            await read_shared_report("someone-elses-id", orders)

    @pytest.mark.asyncio
    async def test_expired_or_missing_report_is_the_same_404(self):
        """만료와 없음을 구분하지 않는다 — 구분은 곧 "이 사람이 샀다" 의 확인이다."""
        orders = FakeRepo(FakeOrder(status="paid", report_share_id="shr"), report=None)

        with pytest.raises(OrderNotFoundError):
            await read_shared_report("shr", orders)


class TestSharedFollowUps:
    """공유되는 대화. **끝난 턴만, 그리고 새 질문을 할 길은 없이.**

    추가 질문은 구매자가 자기 사정을 적은 자유 텍스트라 리포트 본문과 성질이 다르다.
    그것을 싣기로 한 것은 이 기능을 쓰는 사람이 보내려는 것이 "무당과 주고받은
    이야기" 이기 때문이고, 그래서 **무엇이 실리고 무엇이 안 실리는지**를 여기서
    못박는다.
    """

    def _orders(self, *turns: FakeFollowUp) -> FakeRepo:
        # 차트는 **실제 매퍼로** 짓는다 (`_stored_chart` 주석) — 손으로 적으면
        # 매퍼에 필드가 느는 날 이 테스트만 옛 모양을 검사하며 통과한다.
        repo = FakeRepo(
            FakeOrder(status="paid", report_share_id="shr"),
            report=FakeReport(chart=_stored_chart()),
        )
        repo.follow_ups.extend(turns)
        return repo

    @pytest.mark.asyncio
    async def test_answered_turns_come_through_in_order(self):
        orders = self._orders(
            FakeFollowUp(1, "order-1", "올해 재물운은?", "나쁘지 않네", "answered"),
            FakeFollowUp(2, "order-1", "이직은 어떤가?", "기다리게", "answered"),
        )

        shared = await read_shared_report("shr", orders)

        assert [t.question for t in shared.follow_ups] == ["올해 재물운은?", "이직은 어떤가?"]
        assert [t.answer for t in shared.follow_ups] == ["나쁘지 않네", "기다리게"]

    @pytest.mark.asyncio
    async def test_pending_turn_is_not_shared(self):
        """**답이 오는 중인 턴은 나가지 않는다.**

        받은 사람은 기다릴 수 있는 쪽이 아니라 영원히 "대기" 를 보게 되고, 구매자가
        방금 무언가를 물었다는 사실만 새어 나간다.
        """
        orders = self._orders(
            FakeFollowUp(1, "order-1", "끝난 질문", "답", "answered"),
            FakeFollowUp(2, "order-1", "방금 물어본 것", None, "pending"),
        )

        shared = await read_shared_report("shr", orders)

        assert [t.question for t in shared.follow_ups] == ["끝난 질문"]
        assert "방금 물어본 것" not in shared.model_dump_json()

    @pytest.mark.asyncio
    async def test_refused_turn_is_shared_with_its_status(self):
        """거절된 턴의 안내문을 정상 답변처럼 그리면 화면이 거짓을 말한다."""
        orders = self._orders(
            FakeFollowUp(1, "order-1", "로또 번호", "그건 답할 수 없네", "refused"),
        )

        shared = await read_shared_report("shr", orders)

        assert shared.follow_ups[0].status == "refused"

    @pytest.mark.asyncio
    async def test_answered_but_empty_answer_is_not_shared(self):
        """답이 없으면 **질문만** 나간다 — 값어치는 없고 노출은 그대로다."""
        orders = self._orders(
            FakeFollowUp(1, "order-1", "빈 답이 달린 질문", "   ", "answered"),
        )

        shared = await read_shared_report("shr", orders)

        assert shared.follow_ups == []

    @pytest.mark.asyncio
    async def test_no_follow_ups_is_an_empty_list_not_an_error(self):
        """대화 없이 리포트만 산 사람이 대다수다. 그 경우가 정상 경로다."""
        shared = await read_shared_report("shr", self._orders())

        assert shared.follow_ups == []

    @pytest.mark.asyncio
    async def test_token_still_never_travels_with_the_conversation(self):
        """**대화를 실어도 토큰은 안 실린다.**

        받은 사람이 새 질문을 못 하는 근거가 화면이 아니라 이것이다 — 질문을 받는
        경로는 토큰을 요구하고, 이 응답에는 토큰이 담길 칸이 없다.
        """
        orders = self._orders(
            FakeFollowUp(1, "order-1", "질문", "답", "answered"),
        )

        raw = (await read_shared_report("shr", orders)).model_dump_json()

        assert "access_token" not in raw
        assert "token" not in raw
        assert "solar_date" not in raw
