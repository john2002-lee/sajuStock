"""부적 주문·원본 리포지토리. SQL 만 담당한다.

토큰 파생(`derive_access_token`·`hash_access_token`)과 주문 id 는 사주 주문의 것을
그대로 쓴다 — 결제 자격 증명을 만드는 방법이 두 벌이면 한쪽만 고쳐지는 날이 온다.
"""

import secrets
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.talisman import TalismanAssetRow, TalismanOrderRow


class TalismanRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def create(
        self, *, order_id: str, talisman_id: str, amount: int, access_token_hash: str
    ) -> TalismanOrderRow:
        row = TalismanOrderRow(
            id=order_id,
            talisman_id=talisman_id,
            amount=amount,
            currency="KRW",
            status="pending",
            # 주문마다 한 번 만들어 재시도에 그대로 쓴다 — 같은 승인이 두 번 일어나지 않게.
            idempotency_key=secrets.token_hex(16),
            access_token_hash=access_token_hash,
        )
        self._db.add(row)
        # `get_db` 는 커밋하지 않고 세션을 닫는다 — flush 로 끝내면 조용히 롤백된다.
        await self._db.commit()
        await self._db.refresh(row)
        return row

    async def get(self, order_id: str) -> TalismanOrderRow | None:
        stmt = select(TalismanOrderRow).where(TalismanOrderRow.id == order_id)
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def get_by_token_hash(self, token_hash: str) -> TalismanOrderRow | None:
        stmt = select(TalismanOrderRow).where(TalismanOrderRow.access_token_hash == token_hash)
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def mark_paid(
        self, row: TalismanOrderRow, payment_key: str, paid_at: datetime
    ) -> TalismanOrderRow:
        row.status = "paid"
        row.payment_key = payment_key
        row.paid_at = paid_at
        row.attention_reason = None
        await self._db.commit()
        await self._db.refresh(row)
        return row

    async def mark_needs_attention(self, row: TalismanOrderRow, reason: str) -> bool:
        """결제의 실제 상태를 모른다. 자동 환불하지 않고 사람에게 넘긴다.

        **`pending` 인 행만** 바꾼다(조건부 UPDATE). 같은 주문의 승인 두 개가 겹쳐
        다른 쪽이 먼저 `paid` 로 만들었다면 그 결과를 덮지 않는다. 바꿨는지를 돌려준다.
        """
        stmt = (
            update(TalismanOrderRow)
            .where(TalismanOrderRow.id == row.id, TalismanOrderRow.status == "pending")
            .values(status="needs_attention", attention_reason=reason)
        )
        changed = (await self._db.execute(stmt)).rowcount == 1
        await self._db.commit()
        await self._db.refresh(row)
        return changed

    async def claim_download(self, row: TalismanOrderRow, now: datetime) -> bool:
        """일회 다운로드의 1회분을 **지금** 쓴다. 이미 썼으면 `False`.

        조건부 UPDATE 하나라 동시에 두 요청이 와도 하나만 이긴다 — 읽고 나서 쓰면
        두 요청이 둘 다 "아직 안 받음" 을 보고 둘 다 원본을 가져간다.
        """
        stmt = (
            update(TalismanOrderRow)
            .where(
                TalismanOrderRow.id == row.id,
                TalismanOrderRow.status == "paid",
                TalismanOrderRow.downloaded_at.is_(None),
            )
            .values(downloaded_at=now)
        )
        claimed = (await self._db.execute(stmt)).rowcount == 1
        await self._db.commit()
        return claimed

    async def has_asset(self, talisman_id: str) -> bool:
        """원본이 올라와 있는가. 바이트를 읽지 않는다 — 주문 생성마다 불린다."""
        stmt = select(TalismanAssetRow.talisman_id).where(
            TalismanAssetRow.talisman_id == talisman_id
        )
        return (await self._db.execute(stmt)).scalar_one_or_none() is not None

    async def get_asset(self, talisman_id: str) -> TalismanAssetRow | None:
        stmt = select(TalismanAssetRow).where(TalismanAssetRow.talisman_id == talisman_id)
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def upsert_asset(
        self, *, talisman_id: str, content: bytes, media_type: str, filename: str, sha256: str
    ) -> None:
        """원본을 올린다. 이미 있으면 덮어쓴다 — 고해상도로 바꿀 때 같은 명령을 쓴다."""
        values = {
            "talisman_id": talisman_id,
            "content": content,
            "media_type": media_type,
            "filename": filename,
            "sha256": sha256,
        }
        stmt = insert(TalismanAssetRow).values(**values)
        stmt = stmt.on_conflict_do_update(
            index_elements=[TalismanAssetRow.talisman_id],
            # ORM 의 `onupdate` 는 이 경로에서 돌지 않는다 — 갱신 시각을 직접 넣는다.
            set_={
                **{k: stmt.excluded[k] for k in values if k != "talisman_id"},
                "updated_at": func.now(),
            },
        )
        await self._db.execute(stmt)
        await self._db.commit()
