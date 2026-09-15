"""LLM 토큰 사용량 영속성 — 기록(upsert)과 집계.

## 기록과 조회가 한 파일에 있는 이유

`repositories/visit.py` 와 같다. 둘이 같은 정의를 공유한다 — "하루·모델당 한 행" 을
upsert 가 실현하고 집계가 그것을 전제로 더한다. 한쪽만 고치면 숫자의 뜻이 조용히
바뀐다.

## 왜 **한 문장**으로 전부 더하나

오늘·이번 달·누적·모델별을 따로 조회하면 그 사이에 LLM 호출이 하나 끼어 서로
맞지 않는 화면이 된다 — **오늘 > 이번 달**, 또는 모델별 합이 누적을 넘는 식이다.
한 화면에 함께 보이는 숫자들이라 그 어긋남은 곧바로 눈에 띈다.

그래서 조건부 합계(`case`)로 구간 셋을 만들고, **모델로 묶은 한 문장**에서 전부
얻는다. 합계는 그 결과를 파이썬에서 더한 것이라 정의상 모델별 합과 일치한다
(`visit.totals` 가 익명·회원·전체를 한 번에 세는 것과 같은 이유).
"""

import logging
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import and_, case, func, select, true
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.llm_usage import LlmTokens
from app.domain.visits import korean_date
from app.models.llm_usage_day import LlmUsageDay

logger = logging.getLogger(__name__)

#: 더하는 컬럼. 순서가 `TokenTotals` 의 필드 순서와 **같아야 한다** — 아래
#: `_totals_for` 가 만든 합계식을 그 순서대로 받아 넣는다.
_SUMMED: tuple[str, ...] = (
    "calls",
    "input_tokens",
    "output_tokens",
    "reasoning_tokens",
    "cache_read_tokens",
    "total_tokens",
)


@dataclass(frozen=True)
class TokenTotals:
    """한 구간의 합계."""

    #: **토큰을 태운 호출 수 — 거절도 포함한다.** SAFETY 로 막힌 응답에도 입력
    #: 토큰은 실려 오고(`llm._persist` 가 거절 경로에서도 부른다), 그것을 빼면
    #: "토큰만 쓰고 결과가 없던" 구간이 표에서 사라진다. 네트워크 실패처럼 사용량
    #: 자체가 없는 호출만 빠진다
    calls: int = 0
    input_tokens: int = 0
    #: 본문 출력. 사고 토큰은 아래에 따로 있다
    output_tokens: int = 0
    #: 사고(thinking). **출력과 같은 단가로 과금된다**
    reasoning_tokens: int = 0
    #: 캐시에서 읽은 입력. 입력의 부분집합이라 합계에 더하지 않는다
    cache_read_tokens: int = 0
    total_tokens: int = 0


@dataclass(frozen=True)
class ModelUsage:
    """모델 하나의 누적."""

    model: str
    totals: TokenTotals


@dataclass(frozen=True)
class LlmUsageSummary:
    """관리자 화면 한 벌."""

    today: TokenTotals
    month: TokenTotals
    total: TokenTotals
    #: 누적 합계 내림차순. 모델마다 단가가 달라 합계만으로는 비용을 못 읽는다
    by_model: list[ModelUsage]
    #: **집계를 시작한 날(KST).** 과거는 채우지 않았으므로 화면이 이것을 밝혀야
    #: "누적" 이 언제부터의 누적인지 오해가 없다
    started_on: date | None
    last_used_at: datetime | None

    @classmethod
    def empty(cls) -> "LlmUsageSummary":
        """읽지 못했을 때의 값. **0 은 "아직 없음" 과 같은 모양이다** —
        화면이 이미 그 상태를 그릴 줄 알기 때문에 따로 오류 표시를 만들지 않는다."""
        return cls(
            today=TokenTotals(),
            month=TokenTotals(),
            total=TokenTotals(),
            by_model=[],
            started_on=None,
            last_used_at=None,
        )


def _totals_for(condition) -> list:
    """조건에 맞는 행만 더하는 합계식 여섯 개. 순서는 `_SUMMED` 를 따른다.

    `case` 를 쓰는 것은 한 번의 스캔에서 구간 셋을 함께 얻기 위해서다 — `else_` 가
    0 이라 조건 밖의 행은 더해지지 않는다 (`visit._distinct_with_prefix` 와 같은 수법).
    """
    return [
        func.coalesce(func.sum(case((condition, getattr(LlmUsageDay, name)), else_=0)), 0)
        for name in _SUMMED
    ]


def _sum_totals(items: Iterable[TokenTotals]) -> TokenTotals:
    """모델별 합계를 하나로 접는다.

    화면의 "누적" 이 아래 모델별 목록의 합과 **정의상** 같아지는 자리다. 두 숫자를
    각각 SQL 로 구하면 그 사이에 호출이 끼어 어긋날 수 있다.
    """
    acc = [0] * len(_SUMMED)
    for item in items:
        for index, name in enumerate(_SUMMED):
            acc[index] += getattr(item, name)
    return TokenTotals(*acc)


def _month_start(day: date) -> date:
    """그 날이 속한 달의 1일. **KST 날짜를 받아 KST 날짜를 낸다.**"""
    return day.replace(day=1)


class LlmUsageRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ------------------------------------------------------------------ 기록

    async def add(
        self, model: str, tokens: LlmTokens, *, moment: datetime | None = None
    ) -> None:
        """이 모델의 오늘 행에 사용량을 더한다. **누적이다.**

        `ON CONFLICT` 대상은 `uq_llm_usage_date_model` 이다. select 후 update 로 하면
        동시에 끝난 호출 둘이 경쟁해 유니크 위반이나 갱신 유실이 난다 — 특히 AI 판단은
        분석가 3인을 `asyncio.gather` 로 **동시에** 부르므로 그 경쟁이 기본값이다.
        DB 한 문장으로 끝내면 경쟁이 없다.

        `first_seen_at` 은 갱신하지 않는다 — 그날 그 모델을 처음 부른 시각이라
        덮으면 뜻이 사라진다. (화면의 "집계 시작일" 은 `min(usage_date)` 에서 온다.
        날짜 하나면 충분하고, 그쪽이 인덱스를 탄다.)

        `last_seen_at` 은 `greatest` 로 민다. 동시에 끝난 호출 둘의 커밋 순서가
        시작 순서와 다를 수 있어, 그냥 덮으면 "마지막 사용" 이 **뒤로 갈 수 있다**.
        """
        day = korean_date(moment)
        now = moment or func.now()

        stmt = insert(LlmUsageDay).values(
            usage_date=day,
            model=model,
            calls=1,
            input_tokens=tokens.input_tokens,
            output_tokens=tokens.output_tokens,
            reasoning_tokens=tokens.reasoning_tokens,
            cache_read_tokens=tokens.cache_read_tokens,
            total_tokens=tokens.total_tokens,
            first_seen_at=now,
            last_seen_at=now,
        )
        stmt = stmt.on_conflict_do_update(
            constraint="uq_llm_usage_date_model",
            set_={
                "calls": LlmUsageDay.calls + 1,
                **{
                    name: getattr(LlmUsageDay, name) + getattr(stmt.excluded, name)
                    for name in _SUMMED
                    if name != "calls"
                },
                "last_seen_at": func.greatest(
                    LlmUsageDay.last_seen_at, stmt.excluded.last_seen_at
                ),
            },
        )

        await self._db.execute(stmt)
        await self._db.commit()

    # ------------------------------------------------------------------ 집계

    async def summary(self, *, moment: datetime | None = None) -> LlmUsageSummary:
        """오늘 · 이번 달 · 누적, 그리고 모델별 누적. **한 번의 왕복이다.**"""
        today = korean_date(moment)

        stmt = select(
            LlmUsageDay.model,
            *_totals_for(LlmUsageDay.usage_date == today),
            # 위쪽 경계를 함께 건다. 없으면 서버 시계가 앞서 있거나 과거 시점으로
            # 물었을 때(`moment`) 미래 날짜 행이 "이번 달" 에 섞인다.
            *_totals_for(
                and_(
                    LlmUsageDay.usage_date >= _month_start(today),
                    LlmUsageDay.usage_date <= today,
                )
            ),
            *_totals_for(true()),
            func.min(LlmUsageDay.usage_date),
            func.max(LlmUsageDay.last_seen_at),
        ).group_by(LlmUsageDay.model)

        rows = (await self._db.execute(stmt)).all()

        width = len(_SUMMED)
        today_by_model = [TokenTotals(*row[1 : 1 + width]) for row in rows]
        month_by_model = [TokenTotals(*row[1 + width : 1 + width * 2]) for row in rows]
        total_by_model = [TokenTotals(*row[1 + width * 2 : 1 + width * 3]) for row in rows]

        # 많이 쓴 모델이 위. 정렬을 SQL 에 맡기지 않는 것은 같은 문장에서 구간 셋을
        # 함께 받기 때문이다 — 행 수가 모델 수라 파이썬에서 정렬해도 비용이 없다.
        by_model = sorted(
            (
                ModelUsage(model=row[0], totals=totals)
                for row, totals in zip(rows, total_by_model, strict=True)
            ),
            key=lambda item: item.totals.total_tokens,
            reverse=True,
        )

        started = [row[1 + width * 3] for row in rows if row[1 + width * 3] is not None]
        last_used = [row[2 + width * 3] for row in rows if row[2 + width * 3] is not None]

        return LlmUsageSummary(
            today=_sum_totals(today_by_model),
            month=_sum_totals(month_by_model),
            total=_sum_totals(total_by_model),
            by_model=by_model,
            started_on=min(started) if started else None,
            last_used_at=max(last_used) if last_used else None,
        )
