"""간지 조회표: 한글 독음 · 오행 · 음양. 순수 조회표 — I/O 없음.

`count_visible_wuxing` 은 지지의 **대표 오행만**(`ZHI_WUXING`) 센다. 지장간은
별개의 관심사이며 `strength.py` 의 득지 판정이 다룬다. 이것은 가중치 없는 단순
빈도이지 강약 판정이 아니다 — 이름이 "visible"("드러난")인 이유가 그것이고,
`teaser.py` 가 이 둘을 절대 같은 문장에 담지 않는 이유이기도 하다.
"""

from collections.abc import Mapping, Sequence

from app.domain.saju.types import Pillar

#: 십천간 → 한글 독음.
GAN_HANGUL: Mapping[str, str] = {
    "甲": "갑", "乙": "을", "丙": "병", "丁": "정", "戊": "무",
    "己": "기", "庚": "경", "辛": "신", "壬": "임", "癸": "계",
}

#: 십이지지 → 한글 독음.
ZHI_HANGUL: Mapping[str, str] = {
    "子": "자", "丑": "축", "寅": "인", "卯": "묘", "辰": "진", "巳": "사",
    "午": "오", "未": "미", "申": "신", "酉": "유", "戌": "술", "亥": "해",
}

#: 십천간 → 오행.
GAN_WUXING: Mapping[str, str] = {
    "甲": "목", "乙": "목", "丙": "화", "丁": "화", "戊": "토",
    "己": "토", "庚": "금", "辛": "금", "壬": "수", "癸": "수",
}

#: 십이지지 → 대표 오행.
ZHI_WUXING: Mapping[str, str] = {
    "子": "수", "丑": "토", "寅": "목", "卯": "목", "辰": "토", "巳": "화",
    "午": "화", "未": "토", "申": "금", "酉": "금", "戌": "토", "亥": "수",
}

#: 십천간 → 음양.
GAN_YINYANG: Mapping[str, str] = {
    "甲": "양", "乙": "음", "丙": "양", "丁": "음", "戊": "양",
    "己": "음", "庚": "양", "辛": "음", "壬": "양", "癸": "음",
}

#: 상생. key 가 value 를 생한다.
#:
#: `strength.py`(강약)와 `luck.py`(대운 십신)가 함께 쓴다 — 두 곳이 각자 표를
#: 들고 있으면 한쪽만 고치는 실수가 조용히 서로 다른 오행 관계를 만든다.
WUXING_GENERATES: Mapping[str, str] = {"목": "화", "화": "토", "토": "금", "금": "수", "수": "목"}

#: 상극. key 가 value 를 극한다. 위와 같은 이유로 한곳에 둔다.
WUXING_OVERCOMES: Mapping[str, str] = {"목": "토", "토": "수", "수": "화", "화": "금", "금": "목"}

#: 오행 고정 표시 순서. 빈도 집계·화면·프롬프트가 모두 이 순서를 따른다.
WUXING_ORDER: tuple[str, ...] = ("목", "화", "토", "금", "수")


def _lookup_or_raise(table: Mapping[str, str], value: str, label: str) -> str:
    """조회 실패를 조용한 `None` 이 아니라 예외로 만든다.

    빠뜨린 글자가 `None` 으로 흘러가면 이후 비교가 전부 (틀린) 거짓이 되어,
    잘못된 값이 아니라 **그럴듯한 값**이 나온다. 원본 `ganzhi.ts` 의
    `lookupOrThrow` 와 같은 규약이다.
    """
    hit = table.get(value)
    if hit is None:
        raise ValueError(f'{label}: 매핑되지 않은 값 "{value}"')
    return hit


def ganzhi_to_hangul(gan: str, zhi: str) -> str:
    """("甲","子") → "갑자"."""
    return _lookup_or_raise(GAN_HANGUL, gan, "ganzhi_to_hangul(gan)") + _lookup_or_raise(
        ZHI_HANGUL, zhi, "ganzhi_to_hangul(zhi)"
    )


def count_visible_wuxing(pillars: Sequence[Pillar]) -> dict[str, int]:
    """드러난 글자의 오행 빈도. 천간 1개 + 지지 대표오행 1개씩만 센다.

    지장간은 일부러 뺀다(모듈 주석). 가중치가 없으므로 이것은 강약이 아니다.
    """
    tally = dict.fromkeys(WUXING_ORDER, 0)
    for pillar in pillars:
        tally[_lookup_or_raise(GAN_WUXING, pillar.gan, "count_visible_wuxing(gan)")] += 1
        tally[_lookup_or_raise(ZHI_WUXING, pillar.zhi, "count_visible_wuxing(zhi)")] += 1
    return tally
