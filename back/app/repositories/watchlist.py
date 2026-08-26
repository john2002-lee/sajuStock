"""관심종목 리포지토리. SQL 만 담당하고 시세는 모른다."""

from collections.abc import Sequence

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.watchlist import WatchlistItem

#: 순서 값을 이 간격으로 띄워 발급한다.
#:
#: 1,2,3 으로 촘촘히 매기면 중간에 하나 끼워 넣을 때 뒤쪽 전부를 UPDATE 해야 한다.
#: 간격을 두면 대개 그 사이 값 하나만 쓰면 된다. 드래그 정렬은 전체 순서를 다시
#: 보내오므로(WatchlistOrderRequest) 지금은 재발급이 흔하지만, 간격은 공짜다.
_POSITION_STEP = 100

#: 한 소유자가 담을 수 있는 종목 수 상한.
#:
#: 없으면 스크립트 하나로 수천 행을 밀어 넣을 수 있고, 그 목록은 조회할 때마다
#: 그만큼의 시세를 끌어온다 — 저장소가 아니라 **상류 API 가 먼저 죽는다.**
MAX_ITEMS_PER_OWNER = 200


class WatchlistRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_for_owner(self, owner_key: str) -> Sequence[WatchlistItem]:
        """순서대로. 같은 position 이면 담은 순서(id)로 안정화한다."""
        stmt = (
            select(WatchlistItem)
            .where(WatchlistItem.owner_key == owner_key)
            .order_by(WatchlistItem.position, WatchlistItem.id)
        )
        result = await self._db.execute(stmt)
        return result.scalars().all()

    async def count_for_owner(self, owner_key: str) -> int:
        stmt = (
            select(func.count())
            .select_from(WatchlistItem)
            .where(WatchlistItem.owner_key == owner_key)
        )
        return int((await self._db.execute(stmt)).scalar_one())

    async def find(self, owner_key: str, symbol: str) -> WatchlistItem | None:
        stmt = select(WatchlistItem).where(
            WatchlistItem.owner_key == owner_key, WatchlistItem.symbol == symbol
        )
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def find_by_code(self, owner_key: str, code: str) -> WatchlistItem | None:
        """6자리 코드로 찾는다 — 화면은 코드로 행을 식별한다.

        저장은 심볼(`005930.KS`)이므로 코드에 접미사를 붙여 **정확히 일치**하는 것을
        찾는다. 후보는 `normalize_stock_candidates` 와 같은 셋이다(`.KS`·`.KQ`·접미사
        없는 원본) — 코넥스도 `.KQ` 로 저장되므로 그 밖은 없다.

        **예전에는 `symbol LIKE '{code}%'` 였고, 그것이 실제 결함이었다.** 라우터가
        `code` 를 검증하지 않아 `%`·`_` 가 그대로 패턴에 실렸고, `DELETE /watchlist/%`
        는 그 소유자의 **전 행에 매치**되어(정렬도 없는 `first()`) 임의의 한 종목을
        지우고 200 을 돌려줬다. "6자리라 겹칠 수 없다" 는 그때 주석의 전제가 숫자
        검증 없이는 성립하지 않았다.

        라우터에 `^\\d{6}$` 를 걸었으므로 지금은 여기 도달하는 값이 이미 안전하다.
        그래도 LIKE 를 남기지 않는다 — 검증은 호출부의 성질이고, 이 함수가 그것에
        기대면 새 호출부 하나가 같은 사고를 되살린다.
        """
        stmt = select(WatchlistItem).where(
            WatchlistItem.owner_key == owner_key,
            WatchlistItem.symbol.in_([f"{code}.KS", f"{code}.KQ", code]),
        )
        return (await self._db.execute(stmt)).scalars().first()

    async def add(
        self, owner_key: str, symbol: str, *, group: str
    ) -> tuple[WatchlistItem, bool]:
        """담는다. 이미 있으면 그 행을 그대로 돌려준다 (created=False).

        중복을 오류로 만들지 않는 이유: 검색 팔레트의 ⇥ 는 연타되기 쉽고, "이미
        담겨 있다"는 사용자에게 실패가 아니라 **원하는 상태**다.
        """
        existing = await self.find(owner_key, symbol)
        if existing is not None:
            return existing, False

        item = WatchlistItem(
            owner_key=owner_key,
            symbol=symbol,
            group_name=group,
            position=await self._next_position(owner_key),
        )
        self._db.add(item)
        try:
            await self._db.commit()
        except IntegrityError:
            # 검색 팔레트 연타나 두 탭에서 같은 종목을 거의 동시에 담으면 둘 다
            # `find()` 를 통과한 뒤 하나가 유니크 제약에 걸린다. 그걸 500 으로
            # 올리면 "이미 담겨 있다" 는 성공 취급 원칙이 타이밍에 따라 깨진다.
            await self._db.rollback()
            existing = await self.find(owner_key, symbol)
            if existing is not None:
                return existing, False
            raise
        return item, True

    async def remove_by_code(self, owner_key: str, code: str) -> bool:
        item = await self.find_by_code(owner_key, code)
        if item is None:
            return False

        await self._db.delete(item)
        await self._db.commit()
        return True

    async def reorder(self, owner_key: str, codes: Sequence[str]) -> int:
        """받은 코드 순서대로 position 을 다시 매긴다.

        목록에 없는 코드는 무시하고, **요청에 빠진 종목은 뒤로 밀어 둔다.** 화면이
        그룹 탭으로 일부만 보고 있을 때 그 일부만 보내와도 나머지가 사라지지 않아야
        한다 — 순서 변경이 조용한 삭제가 되면 안 된다.
        """
        items = list(await self.list_for_owner(owner_key))
        by_code = {item.symbol.split(".", 1)[0]: item for item in items}

        ordered = [by_code[code] for code in codes if code in by_code]
        seen = {id(item) for item in ordered}
        ordered += [item for item in items if id(item) not in seen]

        for index, item in enumerate(ordered):
            item.position = index * _POSITION_STEP

        await self._db.commit()
        return len(ordered)

    async def delete_all_for_owner(self, owner_key: str) -> int:
        """소유자 초기화. 테스트와 '전부 비우기' 가 쓴다."""
        result = await self._db.execute(
            delete(WatchlistItem).where(WatchlistItem.owner_key == owner_key)
        )
        await self._db.commit()
        return int(result.rowcount or 0)

    async def transfer_owner(self, from_key: str, to_key: str) -> int:
        """익명으로 모은 목록을 로그인 계정으로 승계한다.

        로그인이 붙는 날 호출할 자리를 지금 만들어 둔다 — 이 한 줄이 있어야
        `owner_key` 를 외래키가 아닌 문자열로 둔 선택이 값을 한다. 이미 계정 쪽에
        같은 종목이 있으면 유니크 제약에 걸리므로 **겹치지 않는 것만** 옮긴다.
        """
        existing = {item.symbol for item in await self.list_for_owner(to_key)}
        moved = 0
        for item in await self.list_for_owner(from_key):
            if item.symbol in existing:
                continue
            item.owner_key = to_key
            moved += 1

        await self._db.commit()
        return moved

    async def save(self) -> None:
        """서비스가 ORM 객체를 직접 고친 뒤 확정한다.

        **`flush()` 가 아니라 `commit()` 이어야 한다.** 이 프로젝트의 `get_db` 는
        커밋하지 않고 세션을 닫으므로(`core/database.py`), flush 로 끝내면 변경이
        그 요청 안에서만 보이고 응답이 나간 뒤 조용히 롤백된다 — 화면에는 저장된
        것처럼 보이고 새로고침하면 사라진다. `listed_company` 리포지토리가 자기
        쓰기마다 커밋하는 것과 같은 규약이다.
        """
        await self._db.commit()

    async def _next_position(self, owner_key: str) -> int:
        stmt = select(func.max(WatchlistItem.position)).where(
            WatchlistItem.owner_key == owner_key
        )
        current = (await self._db.execute(stmt)).scalar()
        return _POSITION_STEP if current is None else int(current) + _POSITION_STEP
