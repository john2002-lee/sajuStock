"""선택 가능한 출생지 폐쇄 목록. 순수 데이터 — I/O 없음.

**임의 좌표를 받지 않는다.** `compute_chart` 는 진태양시 보정에 경도가 필요한데,
클라이언트가 경도를 직접 보내게 하면 범위 밖 값을 실어 보정을 마음대로 왜곡할 수
있다. 대신 서버가 소유한 폐쇄 코드 → 고정 경도 매핑만 쓴다.

좌표는 각 지자체 시청·도청의 WGS84 경도(소수 3자리)다. 원본
`SajuService/src/lib/places.ts` 의 값을 그대로 옮겼다.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class BirthPlace:
    code: str
    label: str
    #: 동경 기준 WGS84 경도(도). 서경이면 음수.
    longitude: float


BIRTH_PLACES: tuple[BirthPlace, ...] = (
    BirthPlace("SEOUL", "서울", 126.978),
    BirthPlace("BUSAN", "부산", 129.075),
    BirthPlace("INCHEON", "인천", 126.705),
    BirthPlace("DAEGU", "대구", 128.601),
    BirthPlace("DAEJEON", "대전", 127.385),
    BirthPlace("GWANGJU", "광주", 126.853),
    BirthPlace("ULSAN", "울산", 129.311),
    BirthPlace("SEJONG", "세종", 127.289),
    BirthPlace("SUWON", "수원", 127.010),
    BirthPlace("CHUNCHEON", "춘천", 127.730),
    BirthPlace("CHEONGJU", "청주", 127.489),
    BirthPlace("JEONJU", "전주", 127.148),
    BirthPlace("MOKPO", "목포", 126.392),
    BirthPlace("POHANG", "포항", 129.365),
    BirthPlace("CHANGWON", "창원", 128.681),
    BirthPlace("JEJU", "제주", 126.531),
)

_BY_CODE = {place.code: place for place in BIRTH_PLACES}


def longitude_of(code: str) -> float | None:
    """폐쇄 목록에 있는 코드의 경도. 없으면 None."""
    place = _BY_CODE.get(code)
    return place.longitude if place is not None else None
