"""뉴스 수집 (명세 6.3)."""

import logging
from typing import Any

from app.schemas.stock import NewsItem
from app.utils.text import clean_text, format_date_text

logger = logging.getLogger(__name__)

_PREFERRED_THUMBNAIL_TAG = "170x128"


def _nested_url(value: Any) -> str:
    if isinstance(value, dict):
        return clean_text(value.get("url"))

    return clean_text(value)


def _thumbnail_url(content: dict) -> str:
    thumbnail = content.get("thumbnail")
    if not isinstance(thumbnail, dict):
        return ""

    resolutions = thumbnail.get("resolutions")
    if isinstance(resolutions, list) and resolutions:
        preferred = next(
            (
                item
                for item in resolutions
                if isinstance(item, dict) and item.get("tag") == _PREFERRED_THUMBNAIL_TAG
            ),
            resolutions[-1],
        )
        return clean_text(preferred.get("url"))

    return clean_text(thumbnail.get("originalUrl"))


def fetch_stock_news(ticker: Any, limit: int = 3) -> list[NewsItem]:
    """yfinance 뉴스. 스키마가 버전마다 달라 두 접근 경로를 모두 시도한다."""
    try:
        raw_news = ticker.get_news(count=limit)
    except Exception as exc:
        logger.debug("get_news 실패 (%s) → .news 속성 시도", exc)
        try:
            raw_news = ticker.news[:limit]
        except Exception as inner:
            logger.info("뉴스 수집 실패: %s", inner)
            return []

    items: list[NewsItem] = []
    for item in raw_news[:limit]:
        content = item.get("content", item) if isinstance(item, dict) else {}
        if not isinstance(content, dict):
            continue

        provider = content.get("provider")
        provider_name = (
            provider.get("displayName") if isinstance(provider, dict) else clean_text(provider)
        )

        title = clean_text(content.get("title"))
        if not title:
            continue

        items.append(
            NewsItem(
                title=title,
                publisher=clean_text(provider_name),
                published_at=format_date_text(content.get("pubDate") or content.get("displayTime")),
                summary=clean_text(content.get("summary") or content.get("description")),
                url=_nested_url(content.get("clickThroughUrl"))
                or _nested_url(content.get("canonicalUrl")),
                thumbnail=_thumbnail_url(content),
            )
        )

    return items
