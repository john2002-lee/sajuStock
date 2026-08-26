"""문서 분할 순수 함수.

임베딩 단위를 정하는 곳이다. 문서 하나를 통째로 임베딩하면 벡터가 평균값이 되어
"이 문단이 무슨 얘기인지"가 흐려지고, 반대로 너무 잘게 쪼개면 문장이 맥락을 잃는다.

경계를 문단 → 문장 순으로 찾는 이유: 뉴스·리포트는 문단이 곧 논지 단위라
문단 중간에서 자르면 주어와 서술어가 다른 청크로 갈라진다.
"""

import re

_PARAGRAPH_SPLIT = re.compile(r"\n\s*\n")
# 종결 부호 **뒤의 공백**만 경계로 삼는다. 부호 자체는 lookbehind 라 소비되지 않는다 —
# `\.\s+` 처럼 부호를 패턴에 넣으면 re.split 이 마침표를 먹어 문장이 잘려 나간다.
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?。])\s+")
_WHITESPACE = re.compile(r"[ \t]+")


def _tidy(text: str) -> str:
    return _WHITESPACE.sub(" ", text).strip()


def _units(text: str) -> list[str]:
    """문단으로 나누고, 여전히 긴 문단은 문장으로 한 번 더 나눈다."""
    units: list[str] = []
    for paragraph in _PARAGRAPH_SPLIT.split(text):
        cleaned = _tidy(paragraph)
        if not cleaned:
            continue
        units.extend(part for part in (_tidy(s) for s in _SENTENCE_SPLIT.split(cleaned)) if part)
    return units


def split_text(text: str, *, size: int, overlap: int = 0) -> list[str]:
    """`size`자를 넘지 않는 청크 목록. 경계는 문단·문장에서만 끊는다.

    한 문장이 `size`보다 길면 그 문장은 쪼개지 않고 그대로 둔다 — 문장 중간에서
    자른 조각은 임베딩해 봐야 검색에 걸리지 않는다.

    `overlap`은 앞 청크의 꼬리를 다음 청크 앞에 겹쳐 넣는 길이다. 경계에 걸친
    내용이 어느 쪽에서도 검색되지 않는 것을 막는다.
    """
    if size <= 0:
        raise ValueError("size는 1 이상이어야 한다")
    overlap = max(0, min(overlap, size // 2))

    chunks: list[str] = []
    current = ""

    for unit in _units(text):
        if not current:
            current = unit
            continue
        if len(current) + 1 + len(unit) <= size:
            current = f"{current} {unit}"
            continue

        chunks.append(current)
        tail = current[-overlap:] if overlap else ""
        current = f"{tail} {unit}".strip() if tail else unit

    if current:
        chunks.append(current)
    return chunks
