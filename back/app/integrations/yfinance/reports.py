"""애널리스트 리포트 수집 (명세 6.3).

세 소스를 순서대로 시도하며 `limit`에 도달하면 즉시 반환한다:
등급 변경 → 목표가 컨센서스 → 투자의견 요약.
"""

import logging
from typing import Any

from app.integrations.yfinance.client import is_empty_frame
from app.schemas.stock import AnalystReport
from app.utils.numbers import format_compact_number, int_or_none
from app.utils.text import clean_text, format_date_text

logger = logging.getLogger(__name__)

_PERIOD_LABELS = {
    "0m": "현재",
    "-1m": "1개월 전",
    "-2m": "2개월 전",
    "-3m": "3개월 전",
}


def _recommendation_summary(row: Any) -> str:
    return (
        f"Strong Buy {int_or_none(row.get('strongBuy')) or 0}, "
        f"Buy {int_or_none(row.get('buy')) or 0}, "
        f"Hold {int_or_none(row.get('hold')) or 0}, "
        f"Sell {int_or_none(row.get('sell')) or 0}, "
        f"Strong Sell {int_or_none(row.get('strongSell')) or 0}"
    )


def _upgrade_reports(ticker: Any, analysis_url: str, limit: int) -> list[AnalystReport]:
    try:
        upgrades = ticker.get_upgrades_downgrades()
    except Exception as exc:
        logger.debug("등급 변경 조회 실패: %s", exc)
        return []

    if is_empty_frame(upgrades):
        return []

    reports: list[AnalystReport] = []
    for date_value, row in upgrades.head(limit).iterrows():
        firm = clean_text(row.get("Firm"))
        to_grade = clean_text(row.get("ToGrade"))
        from_grade = clean_text(row.get("FromGrade"))
        target = format_compact_number(row.get("currentPriceTarget"))
        prior_target = format_compact_number(row.get("priorPriceTarget"))

        title = f"{firm} 애널리스트 의견"
        if to_grade:
            title += f": {to_grade}"

        parts: list[str] = []
        if from_grade and to_grade and from_grade != to_grade:
            parts.append(f"투자의견 {from_grade}에서 {to_grade}로 변경")
        elif to_grade:
            parts.append(f"투자의견 {to_grade} 유지")
        if target != "-":
            parts.append(f"목표가 {target}")
        if prior_target != "-" and prior_target != target:
            parts.append(f"이전 목표가 {prior_target}")

        reports.append(
            AnalystReport(
                title=title,
                publisher=firm,
                published_at=format_date_text(date_value),
                summary=" · ".join(parts),
                url=analysis_url,
            )
        )

    return reports


def _price_target_report(ticker: Any, analysis_url: str) -> AnalystReport | None:
    try:
        targets = ticker.get_analyst_price_targets()
    except Exception as exc:
        logger.debug("목표가 컨센서스 조회 실패: %s", exc)
        return None

    if not isinstance(targets, dict) or not targets:
        return None

    return AnalystReport(
        title="애널리스트 목표가 컨센서스",
        publisher="Yahoo Finance",
        summary=(
            f"평균 목표가 {format_compact_number(targets.get('mean'))}, "
            f"최고 {format_compact_number(targets.get('high'))}, "
            f"최저 {format_compact_number(targets.get('low'))}, "
            f"현재가 {format_compact_number(targets.get('current'))}"
        ),
        url=analysis_url,
    )


def _recommendation_reports(ticker: Any, analysis_url: str, limit: int) -> list[AnalystReport]:
    try:
        recommendations = ticker.get_recommendations_summary()
    except Exception as exc:
        logger.debug("투자의견 요약 조회 실패 (%s) → get_recommendations 시도", exc)
        try:
            recommendations = ticker.get_recommendations()
        except Exception as inner:
            logger.debug("투자의견 조회 실패: %s", inner)
            return []

    if is_empty_frame(recommendations):
        return []

    reports: list[AnalystReport] = []
    for _, row in recommendations.iterrows():
        period = clean_text(row.get("period"))
        reports.append(
            AnalystReport(
                title=f"애널리스트 투자의견 요약 ({_PERIOD_LABELS.get(period, period)})",
                publisher="Yahoo Finance",
                summary=_recommendation_summary(row),
                url=analysis_url,
            )
        )
        if len(reports) >= limit:
            break

    return reports


def fetch_analyst_reports(ticker: Any, symbol: str, limit: int = 3) -> list[AnalystReport]:
    analysis_url = f"https://finance.yahoo.com/quote/{symbol}/analysis/"

    reports = _upgrade_reports(ticker, analysis_url, limit)
    if len(reports) >= limit:
        return reports[:limit]

    price_target = _price_target_report(ticker, analysis_url)
    if price_target is not None:
        reports.append(price_target)
    if len(reports) >= limit:
        return reports[:limit]

    reports.extend(_recommendation_reports(ticker, analysis_url, limit - len(reports)))
    return reports[:limit]
