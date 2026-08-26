"""상장사 리포지토리 — 시총 배치가 채우는 순서.

이 파일이 생긴 이유는 하나다. `symbols_without_market_cap` 이 `market == "KOSPI"` 로
정렬하고 있었는데 그 컬럼의 실제 값은 한글이라(실측: 코스닥 1806 · 유가 833 ·
코넥스 109) **매칭이 0건**이었다. 정렬 항이 통째로 죽어도 배치는 정상 동작하고
채우는 순서만 뒤섞이므로 아무도 눈치채지 못한 채 오래 살아남았다.

조용히 틀리는 종류의 버그는 결과가 아니라 **순서를 직접 확인해야** 잡힌다.
"""

from app.repositories.listed_company import ListedCompanyRepository
from app.schemas.stock import ListedCompanyRecord

# (심볼, 이름, 라벨) — 라벨은 실측 DB 표기 그대로다. `KOSPI` 라고 쓰면 이 테스트가
# 고치려는 버그를 그대로 재현하게 된다.
#
# **코드를 일부러 거꾸로 골랐다.** 정렬은 (시장, 심볼) 2단인데 실제 데이터처럼
# 코스피 코드가 코스닥보다 작으면(005930 < 900100) 시장 항이 죽어도 심볼 오름차순만으로
# 정답이 나온다 — 버그를 넣어도 초록인 테스트가 된다. 여기서는 `.KS` 를 알파벳상
# 뒤에 두어 **시장 항이 살아 있을 때만** 앞으로 올 수 있게 한다.
_SEED = [
    ("000100.KQ", "코스닥종목A", "코스닥"),
    ("950000.KS", "유가종목A", "유가"),
    ("000200.KQ", "코스닥종목B", "코스닥"),
    ("960000.KS", "유가종목B", "유가"),
    ("000300.KQ", "코넥스종목", "코넥스"),
]


async def _seed(repo: ListedCompanyRepository) -> None:
    await repo.upsert_many(
        [
            ListedCompanyRecord(symbol=symbol, name=name, market=market)
            for symbol, name, market in _SEED
        ]
    )


async def test_market_cap_batch_takes_kospi_first(
    repo: ListedCompanyRepository,
) -> None:
    """시총이 빈 종목 중 유가증권(.KS)을 먼저 준다.

    대형주가 거기 몰려 있어 랭킹 개선 효과가 가장 크다는 것이 이 정렬의 목적이다.
    상한(limit)이 모집단보다 작을 때 그 목적이 실제로 달성되는지가 핵심이라,
    전체가 아니라 앞의 2건만 가져와 확인한다.
    """
    await _seed(repo)

    symbols = await repo.symbols_without_market_cap(limit=2)

    assert symbols == ["950000.KS", "960000.KS"]


async def test_batch_still_returns_kosdaq_after_kospi(
    repo: ListedCompanyRepository,
) -> None:
    """코스피를 다 채우면 나머지도 순서대로 나온다 — 굶는 종목은 없다."""
    await _seed(repo)

    symbols = await repo.symbols_without_market_cap(limit=10)

    assert symbols[:2] == ["950000.KS", "960000.KS"]
    assert sorted(symbols[2:]) == ["000100.KQ", "000200.KQ", "000300.KQ"]


async def test_batch_skips_symbols_that_already_have_a_cap(
    repo: ListedCompanyRepository,
) -> None:
    """이미 채워진 종목은 다시 주지 않는다 — 배치가 같은 종목을 맴돌면 안 된다."""
    await _seed(repo)
    await repo.update_market_caps({"950000": 450_000_000_000_000})

    symbols = await repo.symbols_without_market_cap(limit=10)

    assert "950000.KS" not in symbols
    assert symbols[0] == "960000.KS"  # 남은 .KS 가 여전히 먼저다
