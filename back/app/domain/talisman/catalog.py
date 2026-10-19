"""파는 부적의 목록. 순서가 곧 화면의 진열 순서다.

`id` 는 URL·DB·원본 파일 이름에 그대로 쓰이므로 소문자 영문만 쓴다. 화면의 이름과
설명은 프런트(`features/talisman/model/catalog.ts`)가 들고, 여기에는 **결제에
필요한 것만** 있다 — 무엇을 팔 수 있는지와, 토스에 보낼 주문명.

주문명이 화면의 상품명과 **글자까지 같아야** 한다. 카드 명세서에 찍히는 이름이
사이트에 없으면 "모르는 결제" 민원에 소명할 수 없다(`shared/legal/product.ts` 주석).
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Talisman:
    id: str
    #: 화면의 상품명이자 토스 `orderName`.
    name: str


TALISMANS: tuple[Talisman, ...] = (
    Talisman(id="jinheung", name="진흥부적"),
    Talisman(id="heukgeum", name="흑금수호인장"),
    Talisman(id="silver", name="실버수호창"),
)

_BY_ID = {t.id: t for t in TALISMANS}


def find_talisman(talisman_id: str) -> Talisman | None:
    return _BY_ID.get(talisman_id)
