"""엔진 응답 → 스키마 변환 (통합 기획 5.3의 `mapper.py`).

**도메인 dataclass 와 Pydantic 스키마가 만나는 유일한 지점이다.** 변환을 한곳에
모으면 `api → services → domain` 방향이 코드로 강제된다 — 도메인이 스키마를
import 하지 않고, 스키마가 도메인 객체를 들고 다니지 않는다.

`profile_service.to_schema` 가 ORM 행에 대해 하는 일과 같은 규약이다.
"""

from app.domain.saju.engine import PillarDetail, SajuChart
from app.domain.saju.luck import LuckResult
from app.domain.saju.profile_mapping import ProfileAxes
from app.domain.saju.strength import StrengthVerdict
from app.domain.saju.teaser import Teaser
from app.domain.saju.types import SajuInput
from app.integrations.saju.client import SajuReading
from app.schemas.profile import InvestorProfile
from app.schemas.saju import (
    BirthInput,
    ChartOut,
    ConventionsOut,
    DaYunOut,
    LuckOut,
    PillarDetailOut,
    PillarOut,
    SajuProfileDraft,
    SajuReadingResponse,
    SeUnOut,
    StrengthBasisOut,
    StrengthOut,
    TeaserOut,
)


def to_saju_input(birth: BirthInput) -> SajuInput:
    """검증된 요청을 도메인 입력으로. 여기가 스키마 → 도메인 방향의 유일한 통로다."""
    return SajuInput(
        year=birth.year,
        month=birth.month,
        day=birth.day,
        hour=birth.hour,
        minute=birth.minute,
        is_lunar=birth.is_lunar,
        is_leap_month=birth.is_leap_month,
        gender=birth.gender,
        birth_place_code=birth.birth_place_code,
    )


def _pillar(detail: PillarDetail) -> PillarDetailOut:
    return PillarDetailOut(
        pillar=PillarOut(gan=detail.pillar.gan, zhi=detail.pillar.zhi),
        hangul=detail.hangul,
        shi_shen_gan=detail.shi_shen_gan,
        shi_shen_zhi=detail.shi_shen_zhi,
        hide_gan=detail.hide_gan,
        na_yin=detail.na_yin,
        di_shi=detail.di_shi,
        xun_kong=detail.xun_kong,
    )


def to_chart_out(chart: SajuChart) -> ChartOut:
    year, month, day = chart.solar_date
    return ChartOut(
        year=_pillar(chart.year),
        month=_pillar(chart.month),
        day=_pillar(chart.day),
        hour=_pillar(chart.hour) if chart.hour is not None else None,
        day_master=chart.day_master,
        day_master_hangul=chart.day_master_hangul,
        visible_wuxing=chart.visible_wuxing,
        solar_date=f"{year:04d}-{month:02d}-{day:02d}",
        conventions=ConventionsOut(
            zi_hour_sect=chart.conventions.zi_hour_sect,
            strength_algorithm_version=chart.conventions.strength_algorithm_version,
            standard_meridian=chart.conventions.standard_meridian,
            dst_applied=chart.conventions.dst_applied,
            longitude_correction_minutes=chart.conventions.longitude_correction_minutes,
            equation_of_time_minutes=chart.conventions.equation_of_time_minutes,
        ),
    )


def to_strength_out(strength: StrengthVerdict) -> StrengthOut:
    return StrengthOut(
        verdict=strength.verdict,
        score=strength.score,
        basis=StrengthBasisOut(
            deuk_ryeong=strength.basis.deuk_ryeong,
            deuk_ji=strength.basis.deuk_ji,
            deuk_se=strength.basis.deuk_se,
            detail=strength.basis.detail,
        ),
        algorithm_version=strength.algorithm_version,
    )


def to_teaser_out(teaser: Teaser) -> TeaserOut:
    return TeaserOut(
        pillars_hangul=teaser.pillars_hangul,
        char_count=teaser.char_count,
        day_master_hangul=teaser.day_master_hangul,
        visible_wuxing=teaser.visible_wuxing,
        strength_verdict=teaser.strength_verdict,
        summary=teaser.summary,
    )


def _da_yun(entry) -> DaYunOut:  # noqa: ANN001 - luck.DaYunEntry, 순환 import 회피
    return DaYunOut(
        start_age=entry.start_age,
        start_year=entry.start_year,
        gan_zhi=entry.gan_zhi,
        hangul=entry.hangul,
        shi_shen=entry.shi_shen,
    )


def to_luck_out(luck: LuckResult) -> LuckOut:
    return LuckOut(
        forward=luck.forward,
        start_age=luck.start_age,
        da_yun=[_da_yun(d) for d in luck.da_yun],
        current_da_yun=_da_yun(luck.current_da_yun) if luck.current_da_yun else None,
        se_un=[SeUnOut(year=s.year, gan_zhi=s.gan_zhi, hangul=s.hangul) for s in luck.se_un],
        now_year=luck.now_year,
    )


def to_profile_draft(axes: ProfileAxes) -> SajuProfileDraft:
    return SajuProfileDraft(
        risk_appetite=axes.risk_appetite,
        patience=axes.patience,
        decisiveness=axes.decisiveness,
        loss_aversion=axes.loss_aversion,
        herd_tendency=axes.herd_tendency,
        saju_summary=axes.saju_summary,
    )


def to_investor_profile(axes: ProfileAxes) -> InvestorProfile:
    """초안을 **저장 가능한** 프로파일로. `source="saju"` 가 여기서 붙는다.

    화면이 "사주 해석 기반 초안입니다"를 띄우는 근거가 그 값이다(기획 5.7:
    "정직함이 방어막이다"). 사용자가 슬라이더를 만지면 프런트가 `user_edited` 로
    바꿔 저장한다 — 그 순간 근거가 사용자 본인에게 넘어간다.
    """
    return InvestorProfile(
        risk_appetite=axes.risk_appetite,
        patience=axes.patience,
        decisiveness=axes.decisiveness,
        loss_aversion=axes.loss_aversion,
        herd_tendency=axes.herd_tendency,
        source="saju",
        saju_summary=axes.saju_summary,
    )


def to_reading_response(reading: SajuReading) -> SajuReadingResponse:
    return SajuReadingResponse(
        chart=to_chart_out(reading.chart),
        strength=to_strength_out(reading.strength),
        teaser=to_teaser_out(reading.teaser),
        luck=to_luck_out(reading.luck),
        profile=to_profile_draft(reading.profile),
    )
