"""사주 주문·리포트 리포지토리. SQL 과 토큰 파생만 담당한다."""

import hashlib
import hmac
import secrets
import uuid

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.saju_retention import RetentionCutoffs
from app.models.saju_order import SajuFollowUpRow, SajuOrderRow, SajuReportRow


def new_order_id() -> str:
    """주문 id 를 **애플리케이션이** 만든다.

    DB 기본값에 맡기지 않는 이유: 접근 토큰이 id 에서 파생되고 그 해시를 **같은
    INSERT 에** 넣어야 하므로, 행을 쓰기 전에 id 를 알고 있어야 한다.
    """
    return uuid.uuid4().hex


def derive_access_token(order_id: str, secret: str) -> str:
    """리포트를 여는 토큰. 주문 id 의 HMAC 이라 **언제든 다시 만들 수 있다.**

    난수를 저장하지 않는 이유가 그것이다 — 잃어버릴 것이 없고, DB 에는 해시만 둔다.
    """
    digest = hmac.new(secret.encode(), order_id.encode(), hashlib.sha256).digest()
    # base64url — URL 에 그대로 들어간다.
    import base64

    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def hash_access_token(token: str) -> str:
    """저장되는 것은 이 해시뿐이다. 평문 토큰은 어디에도 남지 않는다."""
    return hashlib.sha256(token.encode()).hexdigest()


def _expired(cutoffs: RetentionCutoffs):
    """보관 기간이 지난 주문을 고르는 술어.

    경계가 둘인 이유는 `domain/saju_retention` 에 있다 — 보관 기간을 줄이기 전에
    팔린 주문에는 그때의 약속(더 긴 기간)이 걸린다.

    **파기와 공유 링크 조회가 이것 하나를 나눠 쓴다.** 두 곳에 따로 적으면 한쪽만
    고쳐지는 날 링크의 수명과 데이터의 수명이 어긋나고, 그 어긋남은 "이미 파기한
    리포트가 아직 링크로 열린다" 쪽으로 틀릴 수 있다.
    """
    return or_(
        and_(
            SajuOrderRow.created_at < cutoffs.changed_at,
            SajuOrderRow.created_at < cutoffs.legacy,
        ),
        and_(
            SajuOrderRow.created_at >= cutoffs.changed_at,
            SajuOrderRow.created_at < cutoffs.current,
        ),
    )


def new_report_share_id() -> str:
    """리포트 공유 주소의 id. `secrets.token_urlsafe(16)` = 128비트, 22자.

    **접근 토큰과 독립이다.** 토큰에서 파생시키면(해시 한 번이라도) 둘의 수명이
    묶이고, 무엇보다 공유를 취소할 방법이 사라진다 — 지금 그 화면은 없지만, 이
    칸을 널로 되돌리는 것만으로 되게 남겨 둔다.

    폭은 `saju_shares.share_id` 와 같다. 주소가 곧 열쇠이므로 짧게 하면 남의
    링크를 긁어 볼 수 있다.
    """
    return secrets.token_urlsafe(16)


class SajuOrderRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def create(
        self,
        *,
        order_id: str,
        birth: dict,
        teaser: dict,
        amount: int,
        access_token_hash: str,
    ) -> SajuOrderRow:
        row = SajuOrderRow(
            id=order_id,
            birth=birth,
            teaser=teaser,
            amount=amount,
            currency="KRW",
            status="pending",
            # 주문마다 한 번 만들어 두고 재시도에 그대로 쓴다 — 같은 승인이 두 번
            # 일어나지 않게 하는 것이 이 값의 전부다.
            idempotency_key=secrets.token_hex(16),
            access_token_hash=access_token_hash,
        )
        self._db.add(row)
        # `get_db` 는 커밋하지 않고 세션을 닫는다 — flush 로 끝내면 응답이 나간 뒤
        # 조용히 롤백된다 (다른 리포지토리와 같은 규약).
        await self._db.commit()
        await self._db.refresh(row)
        return row

    async def get(self, order_id: str) -> SajuOrderRow | None:
        stmt = select(SajuOrderRow).where(SajuOrderRow.id == order_id)
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def get_by_token_hash(self, token_hash: str) -> SajuOrderRow | None:
        stmt = select(SajuOrderRow).where(SajuOrderRow.access_token_hash == token_hash)
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def mark_paid(self, row: SajuOrderRow, payment_key: str) -> SajuOrderRow:
        row.status = "paid"
        row.payment_key = payment_key
        row.attention_reason = None
        await self._db.commit()
        await self._db.refresh(row)
        return row

    async def mark_needs_attention(self, row: SajuOrderRow, reason: str) -> SajuOrderRow:
        """결제의 실제 상태를 알 수 없다. **자동 환불하지 않고 사람에게 넘긴다.**

        `reason` 에 고객 텍스트나 결제 식별자를 넣지 않는다 — 이 값은 운영 화면과
        로그로 나간다.
        """
        row.status = "needs_attention"
        row.attention_reason = reason
        await self._db.commit()
        await self._db.refresh(row)
        return row

    async def set_report_share_id(self, row: SajuOrderRow, share_id: str) -> SajuOrderRow:
        """이 리포트를 읽기 전용으로 여는 공유 id 를 기억한다.

        두 번 눌러도 같은 링크가 나가게 하는 것이 전부다. 덮어쓰지 않는다 —
        부르는 쪽(`share_paid_report`)이 이미 있으면 그것을 돌려주므로 여기까지
        오지 않는다. 덮어쓰면 **먼저 보낸 링크가 말없이 죽는다.**
        """
        row.report_share_id = share_id
        await self._db.commit()
        await self._db.refresh(row)
        return row

    async def get_by_report_share_id(
        self, share_id: str, cutoffs: RetentionCutoffs
    ) -> SajuOrderRow | None:
        """공유 id 로 주문 하나. **만료를 쿼리가 강제한다.**

        삭제를 기다리지 않는 이유: `saju_purge_service` 는 크론이 아니라 요청
        경로에 얹혀 도는 기회주의적 정리다. 트래픽이 없으면 돌지 않고, 그러면
        "지웠다" 고 적어 둔 날짜가 지난 링크가 계속 열린다. 공유 링크에서 그
        차이는 치명적이다 — `SajuShareRepository.get` 이 같은 판단을 했다.

        경계가 여기서 `delete_expired` 와 **같은 술어**인 것이 요점이다. 둘을
        따로 적으면 한쪽만 고쳐지는 날 링크의 수명과 데이터의 수명이 어긋난다.
        """
        stmt = select(SajuOrderRow).where(
            SajuOrderRow.report_share_id == share_id,
            ~_expired(cutoffs),
        )
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def get_report(self, order_id: str) -> SajuReportRow | None:
        stmt = select(SajuReportRow).where(SajuReportRow.order_id == order_id)
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def save_report(
        self, *, order_id: str, markdown: str, chart: dict, source: str
    ) -> SajuReportRow:
        """리포트를 저장한다. 이미 있으면 덮지 않고 그대로 돌려준다.

        덮지 않는 이유: 같은 주문에 두 번째 생성이 일어나는 경우는 재시도뿐이고,
        그때 먼저 만들어진 것이 고객이 이미 본 리포트일 수 있다. 같은 값을 내고
        LLM 호출을 아끼는 편이 낫다.
        """
        existing = await self.get_report(order_id)
        if existing is not None:
            return existing

        row = SajuReportRow(order_id=order_id, markdown=markdown, chart=chart, source=source)
        self._db.add(row)
        await self._db.commit()
        await self._db.refresh(row)
        return row

    # -----------------------------------------------------------------------
    # 추가 질문 — 결제한 주문의 질문 3개를 **서버가** 센다
    # -----------------------------------------------------------------------

    async def list_follow_ups(self, order_id: str) -> list[SajuFollowUpRow]:
        """대화를 순서대로. `failed` 는 뺀다.

        우리 인프라가 실패해서 답을 못 준 시도를 대화에 남기면, 고객은 자기 질문이
        답 없이 놓인 것을 보게 된다 — 슬롯을 돌려줬는데도 잃은 것처럼 보인다.
        `pending` 은 남긴다: 지금 답이 오는 중이므로 화면이 그 질문을 보여 주는 것이
        맞다.
        """
        result = await self._db.execute(
            select(SajuFollowUpRow)
            .where(
                SajuFollowUpRow.order_id == order_id,
                SajuFollowUpRow.status != "failed",
            )
            .order_by(SajuFollowUpRow.id)
        )
        return list(result.scalars().all())

    async def count_spent_slots(self, order_id: str) -> int:
        """소모된 슬롯 수. **화면의 카운터가 아니라 이 값이 진실이다.**

        `failed` 만 빼고 센다 — `pending` 을 세는 것이 중요하다: 답이 오는 동안에도
        그 슬롯은 잡혀 있어야 한다. 그러지 않으면 세 번 연속 눌러 세 개를 동시에
        띄우고 각각이 "아직 0개 썼다" 고 보게 된다.
        """
        result = await self._db.execute(
            select(func.count())
            .select_from(SajuFollowUpRow)
            .where(
                SajuFollowUpRow.order_id == order_id,
                SajuFollowUpRow.status != "failed",
            )
        )
        return int(result.scalar_one())

    async def reserve_follow_up(
        self, order_id: str, question: str, max_slots: int
    ) -> SajuFollowUpRow | None:
        """슬롯을 잡고 `pending` 행을 만든다. 남은 것이 없으면 `None`.

        ## 왜 세기와 만들기가 한 트랜잭션이어야 하는가

        `SELECT count` 다음에 `INSERT` 를 하면, 두 요청이 같은 순간에 세면 둘 다
        "2개 썼으니 하나 남았다" 를 보고 **둘 다** 넣는다. 결제한 3개가 4개가 된다.

        주문 행을 `FOR UPDATE` 로 잠가 그 창을 없앤다. 같은 주문의 예약은 줄을 서고,
        다른 주문끼리는 서로 막지 않는다 — 잠그는 것이 표가 아니라 그 주문의 행이다.
        """
        locked = await self._db.execute(
            select(SajuOrderRow.id).where(SajuOrderRow.id == order_id).with_for_update()
        )
        if locked.scalar_one_or_none() is None:
            return None

        if await self.count_spent_slots(order_id) >= max_slots:
            return None

        row = SajuFollowUpRow(order_id=order_id, question=question, status="pending")
        self._db.add(row)
        await self._db.commit()
        await self._db.refresh(row)
        return row

    async def complete_follow_up(
        self, follow_up_id: int, *, answer: str, source: str
    ) -> None:
        """답이 왔다. 슬롯을 소모한 것으로 확정한다."""
        row = await self._db.get(SajuFollowUpRow, follow_up_id)
        if row is None:
            return
        row.answer = answer
        row.source = source
        row.status = "answered"
        await self._db.commit()

    async def refuse_follow_up(self, follow_up_id: int, *, answer: str) -> None:
        """모델이 이 질문을 거절했다. **슬롯은 소모된다.**

        환불하면 거절되는 질문 하나로 생성을 무한히 돌릴 수 있다. 답변 자리에는
        거절을 사람 말로 옮긴 문장이 들어간다 — 빈칸으로 두면 화면이 무엇을 보여
        줘야 할지 모른다.
        """
        row = await self._db.get(SajuFollowUpRow, follow_up_id)
        if row is None:
            return
        row.answer = answer
        row.source = "fallback"
        row.status = "refused"
        await self._db.commit()

    async def fail_follow_up(self, follow_up_id: int) -> None:
        """**우리 쪽** 실패다. 슬롯을 돌려준다.

        `failed` 는 `count_spent_slots` 에서 빠지므로 이 행은 자리를 놓는다.
        지우지 않고 남기는 이유는 무엇이 얼마나 실패했는지 볼 수 있어야 하기
        때문이고, 보관 기간이 지나면 주문과 함께 사라진다.
        """
        row = await self._db.get(SajuFollowUpRow, follow_up_id)
        if row is None:
            return
        row.status = "failed"
        await self._db.commit()

    async def delete_expired(self, cutoffs: RetentionCutoffs) -> int:
        """이 시각보다 앞서 만들어진 주문을 지우고, 지운 수를 돌려준다.

        **리포트와 추가 질문은 따로 지우지 않는다.** 두 테이블의 `order_id` 가
        DB 레벨 `ON DELETE CASCADE` 라 같은 문장에서 함께 사라진다
        (`a7f3d92c4e18`·`c5e81a37f2b9` 마이그레이션). ORM 캐스케이드에 기대면
        안 된다 — 여기는 행을 메모리로 읽지 않는 일괄 삭제라 그쪽은 돌지 않는다.

        지운 수를 세는 이유는 관리자 화면이 "정말 지워지고 있나" 에 답해야
        하기 때문이다. 파기는 안 돌아도 화면이 멀쩡한 종류라 숫자가 유일한 증거다.
        """
        result = await self._db.execute(delete(SajuOrderRow).where(_expired(cutoffs)))
        await self._db.commit()
        return result.rowcount or 0
