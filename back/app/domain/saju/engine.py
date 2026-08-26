"""사주 엔진: 출생 정보 → 사주팔자(사주 원국) · 십신 · 지장간 · 납음 · 십이운성 · 공망.

`lunar-python` 위의 순수 계산이다 — I/O 없음, 네트워크 없음.

합성 순서가 중요하다(`true_solar_time` 모듈 주석 참고): 출생일이 **음력이면 먼저
양력으로 변환**하고, **그 다음에** 진태양시 보정을 그 양력 날짜로 적용한다. 원본
음력 숫자에 보정을 걸면 서머타임·자오선·균시차를 엉뚱한 달력 날짜로 조회하게 된다.

원본: `SajuService/src/lib/saju/engine.ts`.
"""

from dataclasses import dataclass
from typing import Any, Literal

from lunar_python import Lunar, Solar

from app.domain.saju.cnko import DISHI_KO, NAYIN_KO, SHISHEN_KO, to_ko, zhi_pair_to_hangul
from app.domain.saju.day_master_attrs import di_shi_for, shi_shen_gan_for, shi_shen_zhi_for
from app.domain.saju.ganzhi import GAN_HANGUL, count_visible_wuxing, ganzhi_to_hangul
from app.domain.saju.strength import ALGORITHM_VERSION as STRENGTH_ALGORITHM_VERSION
from app.domain.saju.true_solar_time import MINUTES_PER_DAY, to_true_solar_time
from app.domain.saju.types import Conventions, Pillar, SajuInput

#: 자시 관례. **정자시설(sect 1): 23시부터 다음 날로 넘어간다.**
#:
#: 스펙 §8.3 은 본래 야자시설(sect 2)을 채택했다. 원본 프로젝트의 T21 조사에서
#: 뒤집었고, 근거는 셋이다.
#:
#: 1. **한국 서비스의 기본값이 아니다.** 포스텔러·사주플러스 두 곳 모두 야자시를
#:    "기본 꺼짐 체크박스"로 두고, 켜면 sect 2 출력과 정확히 일치한다. sect 2 는
#:    실재하는 학파이되 시장 기본값의 반대편이다.
#: 2. **시두법에 맞지 않는 조합을 만든다.** 야자시설은 일주를 당일에 두면서
#:    시간(時干)만 익일 일간에서 뽑으므로 오서둔으로는 나올 수 없는 짝이 된다 —
#:    경(庚) 일간에 무자시(戊子)처럼. 1990년 8,064건 중 336건(4.2%, 24시간 중
#:    1시간)이 그런 짝이었다.
#: 3. **일간은 풀이 전체의 기준이다.** 십신·강약·대운이 모두 여기서 파생되므로,
#:    존재할 수 없는 짝은 한 줄이 아니라 리포트 전체를 이상하게 만든다.
#:
#: sect 1 은 23시부터 일주가 넘어가고 시주도 그 일간에서 나오므로 항상 정합이다.
#: **기본값에 기대지 않고 `setSect` 를 명시 호출한다** — 라이브러리 기본값은 2 라서
#: 안 부르면 방금 뒤집은 쪽으로 돌아간다.
ZI_HOUR_SECT: Literal[1, 2] = 1

#: 시각을 모를 때 쓰는 대체 시각. 시주는 만들지 않지만(`has_time`), 년·월·일주를
#: 뽑으려면 어떤 시각이든 필요하다. 정오는 자정 경계에서 가장 먼 값이라 진태양시
#: 보정이 날짜를 넘길 가능성이 없다.
_UNKNOWN_HOUR = 12
_UNKNOWN_MINUTE = 0


@dataclass(frozen=True)
class PillarDetail:
    """기둥 하나와 거기서 파생된 표시 값 전부."""

    pillar: Pillar
    hangul: str
    shi_shen_gan: str  # 한글
    shi_shen_zhi: list[str]  # 한글
    hide_gan: list[str]  # 한자
    na_yin: str  # 한글
    di_shi: str  # 한글
    xun_kong: str  # 한글


@dataclass(frozen=True)
class SajuChart:
    year: PillarDetail
    month: PillarDetail
    day: PillarDetail
    hour: PillarDetail | None
    day_master: str
    day_master_hangul: str
    visible_wuxing: dict[str, int]
    #: 변환·보정 후 실제로 쓰인 양력 날짜 (년, 월, 일).
    solar_date: tuple[int, int, int]
    conventions: Conventions
    input: SajuInput


@dataclass(frozen=True)
class SolarAndEightChar:
    """`build_solar_and_eight_char` 의 결과 묶음."""

    solar: Any
    #: 진태양시 프레임 EightChar — 일주·시주와 **일간**의 출처.
    ec: Any
    #: 베이징(UTC+8) 프레임 EightChar — 년주·월주와 절기 경계, 대운의 출처.
    ec_term: Any
    has_time: bool
    true_solar_time: Any


def _build_pillar_detail(
    gan: str,
    zhi: str,
    shi_shen_gan: str,
    shi_shen_zhi: list[str],
    hide_gan: list[str],
    na_yin: str,
    di_shi: str,
    xun_kong: str,
) -> PillarDetail:
    return PillarDetail(
        pillar=Pillar(gan=gan, zhi=zhi),
        hangul=ganzhi_to_hangul(gan, zhi),
        shi_shen_gan=to_ko(SHISHEN_KO, shi_shen_gan),
        shi_shen_zhi=[to_ko(SHISHEN_KO, value) for value in shi_shen_zhi],
        hide_gan=list(hide_gan),
        na_yin=to_ko(NAYIN_KO, na_yin),
        di_shi=to_ko(DISHI_KO, di_shi),
        xun_kong=zhi_pair_to_hangul(xun_kong),
    )


def _shift_solar(solar: Any, day_offset: int, hour: int, minute: int) -> Any:
    """율리우스일로 날짜만 옮기고 시·분은 그대로 다시 세운다."""
    if day_offset == 0:
        return solar
    shifted = Solar.fromJulianDay(solar.getJulianDay() + day_offset)
    return Solar.fromYmdHms(
        shifted.getYear(), shifted.getMonth(), shifted.getDay(), hour, minute, 0
    )


def build_solar_and_eight_char(saju_input: SajuInput, longitude: float) -> SolarAndEightChar:
    """보정된 `Solar` 와 그 `EightChar` 두 벌(자시 관례 적용 완료)을 만든다.

    `luck.py` 의 대운·세운이 `EightChar.getYun()` 을 직접 불러야 해서 따로 노출한다.
    거기서 음력 변환 → 진태양시 → 날짜 이월 파이프라인을 두 번째로 다시 짜면
    두 경로가 조용히 갈라질 수 있다.
    """
    has_time = saju_input.hour is not None and saju_input.minute is not None
    raw_hour = saju_input.hour if has_time else _UNKNOWN_HOUR
    raw_minute = saju_input.minute if has_time else _UNKNOWN_MINUTE

    # 1) 음력이면 먼저 양력으로 변환한다.
    #    (`Lunar.fromYmd` 는 시각을 자정으로 두므로 시각은 아래에서 재구성한다.)
    gy, gm, gd = saju_input.year, saju_input.month, saju_input.day
    if saju_input.is_lunar:
        lunar_month = -saju_input.month if saju_input.is_leap_month else saju_input.month
        solar_of_lunar = Lunar.fromYmd(saju_input.year, lunar_month, saju_input.day).getSolar()
        gy = solar_of_lunar.getYear()
        gm = solar_of_lunar.getMonth()
        gd = solar_of_lunar.getDay()

    # 2) 변환된 **양력** 날짜로 시간 보정을 적용한다.
    #    (`standard_meridian` 이 여기서 1908-04-01 이전 생일을 거부한다.)
    tst = to_true_solar_time(gy, gm, gd, raw_hour, raw_minute, longitude)

    # 3) 보정된 시각으로 Solar 를 재구성한다(날짜 이월 포함).
    solar = Solar.fromYmdHms(gy, gm, gd, tst.hour, tst.minute, 0)
    solar = _shift_solar(solar, tst.day_offset, tst.hour, tst.minute)

    ec = solar.getLunar().getEightChar()
    ec.setSect(ZI_HOUR_SECT)  # 명시 호출 — 라이브러리 기본값은 2 다

    # 4) 절기(절입) 경계 판정용 EightChar 를 따로 만든다.
    #
    #    `lunar-python` 은 모든 절기 순간을 **UTC+8(중국 표준시)** 로 계산한다.
    #    위의 `solar` 는 한국 진태양시 벽시계 숫자라, 그대로 넘기면 라이브러리가
    #    서로 다른 프레임의 두 값을 같은 것처럼 비교해 입춘·절입 경계가 13~74분
    #    일찍 발동한다(127.5E 시대가 가장 심하다).
    #
    #    따라서 경계 판정에는 같은 절대 시각의 **베이징 지방시**, 즉
    #    표준시(서머타임 제거) − 60분 을 넘긴다. 경도·균시차 보정은 붙이지 않는다 —
    #    보정은 출생 시각과 절입 시각 양쪽에 거의 동일하게 적용되어 상쇄되므로,
    #    경계는 KST 절입 시각에서 넘어가야 맞다.
    kst_standard_minutes = raw_hour * 60 + raw_minute - (60 if tst.detail.dst_applied else 0)
    term_minutes = kst_standard_minutes - 60
    term_day_offset, term_minute_of_day = divmod(term_minutes, MINUTES_PER_DAY)
    term_hour = term_minute_of_day // 60
    term_minute = term_minute_of_day % 60

    solar_term = Solar.fromYmdHms(gy, gm, gd, term_hour, term_minute, 0)
    solar_term = _shift_solar(solar_term, term_day_offset, term_hour, term_minute)

    ec_term = solar_term.getLunar().getEightChar()
    ec_term.setSect(ZI_HOUR_SECT)

    return SolarAndEightChar(
        solar=solar, ec=ec, ec_term=ec_term, has_time=has_time, true_solar_time=tst
    )


def compute_chart(saju_input: SajuInput, longitude: float) -> SajuChart:
    """출생 정보 하나를 완성된 사주 원국으로 바꾼다."""
    built = build_solar_and_eight_char(saju_input, longitude)
    ec, ec_term, tst = built.ec, built.ec_term, built.true_solar_time

    # 일간은 언제나 **진태양시** 기준 일주에서 온다. 년·월주는 절기 프레임(`ec_term`)
    # 에서 오지만, 십신·십이운성은 일간 의존이라 `ec_term` 의 자체 일간(두 시각이
    # 약 22분 어긋나 자정 근처에서 날이 갈릴 수 있다)으로 읽으면 안 되고, 아래처럼
    # 진태양시 일간으로 다시 계산해야 한다. 지장간·납음·공망은 일간과 무관하므로
    # `ec_term` 에서 그대로 가져온다.
    true_solar_day_gan: str = ec.getDayGan()

    year = _build_pillar_detail(
        gan=ec_term.getYearGan(),
        zhi=ec_term.getYearZhi(),
        shi_shen_gan=shi_shen_gan_for(true_solar_day_gan, ec_term.getYearGan()),
        shi_shen_zhi=shi_shen_zhi_for(true_solar_day_gan, ec_term.getYearZhi()),
        hide_gan=ec_term.getYearHideGan(),
        na_yin=ec_term.getYearNaYin(),
        di_shi=di_shi_for(true_solar_day_gan, ec_term.getYearZhi()),
        xun_kong=ec_term.getYearXunKong(),
    )
    month = _build_pillar_detail(
        gan=ec_term.getMonthGan(),
        zhi=ec_term.getMonthZhi(),
        shi_shen_gan=shi_shen_gan_for(true_solar_day_gan, ec_term.getMonthGan()),
        shi_shen_zhi=shi_shen_zhi_for(true_solar_day_gan, ec_term.getMonthZhi()),
        hide_gan=ec_term.getMonthHideGan(),
        na_yin=ec_term.getMonthNaYin(),
        di_shi=di_shi_for(true_solar_day_gan, ec_term.getMonthZhi()),
        xun_kong=ec_term.getMonthXunKong(),
    )
    day = _build_pillar_detail(
        gan=ec.getDayGan(),
        zhi=ec.getDayZhi(),
        shi_shen_gan=ec.getDayShiShenGan(),
        shi_shen_zhi=ec.getDayShiShenZhi(),
        hide_gan=ec.getDayHideGan(),
        na_yin=ec.getDayNaYin(),
        di_shi=ec.getDayDiShi(),
        xun_kong=ec.getDayXunKong(),
    )
    hour = (
        _build_pillar_detail(
            gan=ec.getTimeGan(),
            zhi=ec.getTimeZhi(),
            shi_shen_gan=ec.getTimeShiShenGan(),
            shi_shen_zhi=ec.getTimeShiShenZhi(),
            hide_gan=ec.getTimeHideGan(),
            na_yin=ec.getTimeNaYin(),
            di_shi=ec.getTimeDiShi(),
            xun_kong=ec.getTimeXunKong(),
        )
        if built.has_time
        else None
    )

    visible_pillars = [year.pillar, month.pillar, day.pillar]
    if hour is not None:
        visible_pillars.append(hour.pillar)

    conventions = Conventions(
        zi_hour_sect=ZI_HOUR_SECT,
        strength_algorithm_version=STRENGTH_ALGORITHM_VERSION,
        standard_meridian=tst.detail.meridian,
        dst_applied=tst.detail.dst_applied,
        longitude_correction_minutes=tst.detail.longitude_minutes,
        equation_of_time_minutes=tst.detail.equation_minutes,
    )

    return SajuChart(
        year=year,
        month=month,
        day=day,
        hour=hour,
        day_master=day.pillar.gan,
        day_master_hangul=to_ko(GAN_HANGUL, day.pillar.gan),
        visible_wuxing=count_visible_wuxing(visible_pillars),
        solar_date=(built.solar.getYear(), built.solar.getMonth(), built.solar.getDay()),
        conventions=conventions,
        input=saju_input,
    )
