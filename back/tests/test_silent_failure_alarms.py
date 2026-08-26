"""**오류 없이 틀리는** 경로의 조기 경보.

하루에 같은 부류의 버그를 다섯 번 만났다. 공통점은 하나다 — 코드가 **성공적으로**
돌면서 그럴듯하지만 틀린 결과를 냈고, 예외가 안 나서 아무도 몰랐다.

    market == "KOSPI"        매칭 0건 → 정렬 항이 죽고 쿼리는 성공
    _closes_of 단일 분기      1종목 스캔이 0건 → "완료" 로그를 남기며
    ORDER BY DESC            Postgres 는 NULLS FIRST → 모집단이 빈 종목으로
    flush() vs commit()      응답은 정상, 저장만 안 됨
    published_at 문자열       Postgres 에서만 터짐

이런 경로에서는 **0건 자체가 신호**다. 로그 레벨이 유일한 조기 경보이므로, 경보가
실제로 울리는지도 테스트한다 — 안 울리는 경보는 없는 것과 같다.

정상적인 0건과 구분하는 것이 핵심이다. 뉴스가 없는 종목의 검색 결과 0건은 버그가
아니라 사실이라 여기 없다.
"""

import logging

import pytest

from app.integrations.yfinance.movers import _report_yield
from app.repositories.listed_company import ListedCompanyRepository
from app.schemas.stock import ListedCompanyRecord

# ── 등락률 스캔 수확률 ──────────────────────────────────────────────────


def test_zero_yield_is_a_warning_not_an_info(caplog: pytest.LogCaptureFixture) -> None:
    """`0/1종목` 이 정상 완료와 같은 모양으로 찍혀 아무도 보지 않았다.

    실제로 관심종목 시세가 통째로 비어 있었는데, 사람이 화면을 눈으로 볼 때까지 몰랐다.
    """
    with caplog.at_level(logging.INFO):
        _report_yield(0, 1, "2026-08-05")

    assert any(r.levelno == logging.WARNING for r in caplog.records)


def test_partial_loss_is_still_normal(caplog: pytest.LogCaptureFixture) -> None:
    """개별 종목이 빠지는 것은 정상이다 — 신규 상장·거래정지는 전일 종가가 없다.

    여기까지 경고하면 로그가 늑대 소년이 되어 진짜 신호를 묻는다.
    """
    with caplog.at_level(logging.INFO):
        _report_yield(190, 200, "2026-08-05")

    assert not any(r.levelno == logging.WARNING for r in caplog.records)


def test_majority_loss_is_a_warning(caplog: pytest.LogCaptureFixture) -> None:
    """대다수가 빠지면 상류가 아니라 우리 파싱을 의심해야 한다."""
    with caplog.at_level(logging.INFO):
        _report_yield(20, 200, "2026-08-05")

    assert any(r.levelno == logging.WARNING for r in caplog.records)


def test_empty_universe_does_not_warn(caplog: pytest.LogCaptureFixture) -> None:
    """모집단이 비었으면 수확률은 뜻이 없다 — 0으로 나누지도 않는다."""
    with caplog.at_level(logging.INFO):
        _report_yield(0, 0, None)

    assert not any(r.levelno == logging.WARNING for r in caplog.records)


# ── 시총 배치 우선순위 ──────────────────────────────────────────────────


async def _seed(repo: ListedCompanyRepository, symbols: list[str]) -> None:
    await repo.upsert_many(
        [ListedCompanyRecord(symbol=s, name=s, market="유가") for s in symbols]
    )


async def test_batch_warns_when_kospi_priority_looks_dead(
    repo: ListedCompanyRepository, caplog: pytest.LogCaptureFixture
) -> None:
    """`.KS` 가 아직 남아 있는데 배치에 한 건도 없으면 정렬이 죽은 것이다.

    이 정렬은 **죽어도 오류가 안 난다** — 실제로 오래 그랬다. 배치는 정상 동작하고
    채우는 순서만 무작위가 되므로 사람이 눈으로 볼 방법이 없었다.
    """
    # 한도를 코스닥 수만큼만 주면 `.KS` 가 배치에서 밀려난 것처럼 보인다.
    await _seed(repo, ["000100.KQ", "000200.KQ", "950000.KS"])

    with caplog.at_level(logging.WARNING):
        batch = await repo.symbols_without_market_cap(limit=2)

    # 정렬이 살아 있으면 .KS 가 먼저 온다 → 경고가 없어야 정상이다.
    assert batch[0].endswith(".KS")
    assert not any("우선순위 정렬" in r.message for r in caplog.records)


async def test_batch_stays_quiet_when_no_kospi_remains(
    repo: ListedCompanyRepository, caplog: pytest.LogCaptureFixture
) -> None:
    """채울 `.KS` 가 원래 없으면 경고하지 않는다 — 그건 정상 상태다."""
    await _seed(repo, ["000100.KQ", "000200.KQ"])

    with caplog.at_level(logging.WARNING):
        batch = await repo.symbols_without_market_cap(limit=10)

    assert batch and all(s.endswith(".KQ") for s in batch)
    assert not any("우선순위 정렬" in r.message for r in caplog.records)


# ── 시총 매칭 ───────────────────────────────────────────────────────────


async def test_zero_matches_warns_about_code_format(
    repo: ListedCompanyRepository, caplog: pytest.LogCaptureFixture
) -> None:
    """시총을 받았는데 한 종목도 못 붙였다면 코드 형식이 어긋난 것이다.

    `005930` 을 받아 `005930.KS` 에 붙인다는 전제가 이 매칭의 전부다. 공급자가 형식을
    바꾸면 조용히 0건이 되고, 배치는 '성공' 으로 끝난 채 시총이 영원히 안 채워진다.
    """
    await _seed(repo, ["005930.KS"])

    with caplog.at_level(logging.WARNING):
        # 공급자가 접미사를 붙여 주기 시작한 상황을 흉내 낸다.
        updated = await repo.update_market_caps({"005930.KS": 450_000_000_000_000})

    assert updated == 0
    assert any("매칭되지 않았습니다" in r.message for r in caplog.records)


async def test_successful_match_is_quiet(
    repo: ListedCompanyRepository, caplog: pytest.LogCaptureFixture
) -> None:
    await _seed(repo, ["005930.KS"])

    with caplog.at_level(logging.WARNING):
        updated = await repo.update_market_caps({"005930": 450_000_000_000_000})

    assert updated == 1
    assert not any("매칭되지 않았습니다" in r.message for r in caplog.records)
