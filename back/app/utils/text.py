"""텍스트 정규화 · 한글 초성 추출 순수 함수."""

import re
from datetime import datetime
from typing import Any

ZERO_WIDTH_PATTERN = re.compile(r"[​-‏⁠﻿]")
NON_SEARCH_TEXT_PATTERN = re.compile(r"[^0-9A-Za-z가-힣]")
HANGUL_INITIALS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"

_HANGUL_START = 0xAC00
_HANGUL_END = 0xD7A3
_JONGSUNG_JUNGSUNG_COUNT = 588  # 중성 21 × 종성 28


def clean_text(value: Any) -> str:
    if value is None:
        return ""

    return ZERO_WIDTH_PATTERN.sub("", str(value)).strip()


def format_date_text(value: Any) -> str:
    if value is None:
        return ""

    if isinstance(value, datetime):
        return value.date().isoformat()

    text = clean_text(value)
    if "T" in text:
        return text.split("T", 1)[0]

    return text[:10]


def normalize_search_text(value: str) -> str:
    """검색 비교용 정규화: 공백·기호 제거 후 소문자."""
    return NON_SEARCH_TEXT_PATTERN.sub("", clean_text(value)).lower()


def escape_like(value: str) -> str:
    r"""LIKE/ILIKE 패턴 안에서 와일드카드로 읽힐 문자를 막는다.

    `%`(임의 길이)·`_`(임의 한 글자)를 글자 그대로 찾게 만든다. 쓰는 쪽은 SQL 에
    `escape '\'` 를 함께 적어야 한다 — 이스케이프 문자는 표준에 기본값이 없다.

    역슬래시를 **먼저** 치환한다. 나중에 하면 방금 우리가 넣은 이스케이프까지 다시
    이스케이프해 `\%` 가 `\\%` 가 되고, 그러면 "역슬래시 뒤에 아무 문자열" 을 찾는
    패턴이 된다.

    ORM 쪽에는 이 함수를 쓰지 않는다 — SQLAlchemy 의 `contains(..., autoescape=True)`
    가 같은 일을 하면서 `escape` 절까지 렌더한다. 이 함수가 필요한 것은 NextAuth
    테이블처럼 **모델이 없어 raw SQL 로 읽는 자리**뿐이다 (`repositories/admin`).
    """
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def get_initial_consonants(value: str) -> str:
    """한글 초성 문자열. 한글이 아닌 문자는 소문자로 그대로 통과시킨다."""
    result: list[str] = []
    for char in clean_text(value):
        code = ord(char)
        if _HANGUL_START <= code <= _HANGUL_END:
            result.append(HANGUL_INITIALS[(code - _HANGUL_START) // _JONGSUNG_JUNGSUNG_COUNT])
        elif char.strip():
            result.append(char.lower())
    return "".join(result)
