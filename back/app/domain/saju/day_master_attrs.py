"""일간에 의존하는 기둥 속성(십신 · 십이운성)을 **명시한 일간으로** 계산한다.

## 왜 필요한가

엔진은 절기 경계를 일주·시주와 **다른 시간 프레임**에서 판정한다(`engine.py` 의
`build_solar_and_eight_char` 주석). 년주·월주는 베이징 프레임 `EightChar` 에서,
일주·시주는 진태양시 쪽에서 온다. 그런데 십신과 십이운성은 **일간의 함수**라,
년·월 값을 베이징 쪽 객체에서 그냥 읽으면 안 된다 — 그 객체 자신의 일간이 진태양시
일간과 다를 수 있기 때문이다(서울 기준 두 시각이 약 22분 어긋나 자정 근처에서
날이 갈린다). 진태양시 일간으로 다시 계산해야 한다.

## 왜 라이브러리의 표를 쓰는가

`LunarUtil.SHI_SHEN`, `LunarUtil.ZHI_HIDE_GAN`, `EightChar.CHANG_SHENG` 는
`EightChar.getYearShiShenGan()` / `getYearShiShenZhi()` / `getYearDiShi()` 가 실제로
읽는 바로 그 표다. 손으로 두 번째 사본을 적는 대신 재사용하면, `lunar-python`
업그레이드가 재계산된 년·월 속성과 라이브러리에서 그대로 오는 일·시 속성을
**조용히 어긋나게 만들 수 없다**.

`CHANG_SHENG_OFFSET` 만 이름 맹글링된 비공개 속성이라 `getattr` 로 꺼낸다. 원본
TS 에서는 `LunarUtil.CHANG_SHENG_OFFSET` 로 공개돼 있었는데 파이썬 포팅본은
`EightChar` 안으로 옮기며 비공개가 됐다 — 그래도 **직접 적는 것보다 낫다**:
사본을 두면 두 표가 갈라져도 아무도 모르지만, 여기서는 라이브러리가 이름을 바꾸면
즉시 `AttributeError` 로 드러난다(`_resolve_chang_sheng_offset` 이 그 실패를 설명한다).
"""

from lunar_python import EightChar
from lunar_python.util import LunarUtil

GAN = "甲乙丙丁戊己庚辛壬癸"
ZHI = "子丑寅卯辰巳午未申酉戌亥"


def _resolve_chang_sheng_offset() -> dict[str, int]:
    """라이브러리의 장생 기준점 표를 꺼낸다.

    비공개(`__CHANG_SHENG_OFFSET`)라 맹글링된 이름으로 접근한다. 사라지면 조용히
    빈 표로 떨어지는 대신 여기서 즉시, 무엇이 깨졌는지 말하며 실패한다.
    """
    offset = getattr(EightChar, "_EightChar__CHANG_SHENG_OFFSET", None)
    if not isinstance(offset, dict):
        raise RuntimeError(
            "lunar-python 의 EightChar.__CHANG_SHENG_OFFSET 을 찾지 못했습니다 — "
            "라이브러리 구조가 바뀌었습니다. 십이운성 계산이 라이브러리와 어긋나지 "
            "않도록 표를 다시 연결해야 합니다."
        )
    return offset


_CHANG_SHENG_OFFSET = _resolve_chang_sheng_offset()


def shi_shen_gan_for(day_master_gan: str, target_gan: str) -> str:
    """`day_master_gan` 에서 본 `target_gan` 의 십신. 한자 in, 한자 out."""
    return LunarUtil.SHI_SHEN.get(day_master_gan + target_gan)


def hide_gan_for(zhi: str) -> list[str]:
    """지지의 지장간. 일간과 무관하지만 쓰는 쪽이 같아 여기 둔다."""
    return list(LunarUtil.ZHI_HIDE_GAN.get(zhi))


def shi_shen_zhi_for(day_master_gan: str, zhi: str) -> list[str]:
    """`day_master_gan` 에서 본, `zhi` 의 지장간 각각의 십신."""
    return [LunarUtil.SHI_SHEN.get(day_master_gan + stem) for stem in hide_gan_for(zhi)]


def di_shi_for(day_master_gan: str, zhi: str) -> str:
    """`day_master_gan` 에서 본 `zhi` 의 십이운성.

    라이브러리의 `EightChar.__getDiShi` 를 그대로 옮기되, 일간 인덱스를 그 객체
    자신의 것이 아니라 `day_master_gan` 에서 가져온다. 음간(홀수 인덱스)은 장생
    순환을 역방향으로 돈다.
    """
    offset = _CHANG_SHENG_OFFSET[day_master_gan]
    gan_index = GAN.index(day_master_gan)
    zhi_index = ZHI.index(zhi)
    index = offset + (zhi_index if gan_index % 2 == 0 else -zhi_index)
    if index >= 12:
        index -= 12
    if index < 0:
        index += 12
    return EightChar.CHANG_SHENG[index]
