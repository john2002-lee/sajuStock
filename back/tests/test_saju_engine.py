"""사주 엔진 테스트.

**대조 검증이 우선이다.** 이 파일의 값 기반 단언은 원본 TypeScript 엔진과의
전수 대조(`compare_dumps.py`)를 대신하지 않는다 — 그쪽이 포팅의 정확성을 말하고,
여기는 그 정확성이 **깨졌을 때 어디가 깨졌는지**를 말한다.

값은 전부 원본 프로젝트가 문서로 남긴 사실이거나 대조 덤프에서 확인된 것이다.
새 기대값을 여기서 지어내지 않는다.
"""

import pytest

from app.domain.saju.engine import ZI_HOUR_SECT, compute_chart
from app.domain.saju.equation_of_time import day_of_year
from app.domain.saju.ganzhi import count_visible_wuxing, ganzhi_to_hangul
from app.domain.saju.korean_time import is_dst, standard_meridian
from app.domain.saju.places import longitude_of
from app.domain.saju.profile_mapping import to_profile_axes
from app.domain.saju.strength import judge_strength
from app.domain.saju.teaser import build_teaser
from app.domain.saju.true_solar_time import to_true_solar_time
from app.domain.saju.types import Pillar, SajuInput

SEOUL = 126.978


def _seoul(**overrides) -> SajuInput:
    base = {
        "year": 1990,
        "month": 5,
        "day": 15,
        "hour": 23,
        "minute": 40,
        "is_lunar": False,
        "is_leap_month": False,
        "gender": "M",
        "birth_place_code": "SEOUL",
    }
    return SajuInput(**{**base, **overrides})


class TestZiHourSect:
    """자시 관례 — 정자시설(sect 1). `engine.ZI_HOUR_SECT` 주석의 근거를 고정한다."""

    def test_sect_is_one(self):
        assert ZI_HOUR_SECT == 1

    def test_23h_rolls_the_day_pillar_forward(self):
        """1990-05-15 23:40 서울 → 일주 신사, 시주 무자 (원본 README 의 관례 표).

        야자시설(sect 2)이면 일주가 경진으로 나온다. 이 단언이 그 회귀를 막는다.
        """
        chart = compute_chart(_seoul(), SEOUL)
        assert chart.day.hangul == "신사"
        assert chart.hour is not None
        assert chart.hour.hangul == "무자"

    def test_hour_pillar_is_always_consistent_with_sidubeop(self):
        """**시두법 불변식**: 일간이 허용하는 시주만 나와야 한다.

        야자시설은 일주를 당일에 두고 시간만 익일 일간에서 뽑아 오서둔으로는 나올 수
        없는 짝을 만든다(경 일간에 무자시). 정자시설은 구조적으로 그럴 수 없다.
        1990년 표본으로 전 시각을 훑어 그것을 강제한다.
        """
        # 오서둔: 일간 → 자시의 천간. 甲己→甲子, 乙庚→丙子, 丙辛→戊子, 丁壬→庚子, 戊癸→壬子
        zi_stem_for_day_stem = {
            "甲": "甲", "己": "甲",
            "乙": "丙", "庚": "丙",
            "丙": "戊", "辛": "戊",
            "丁": "庚", "壬": "庚",
            "戊": "壬", "癸": "壬",
        }
        gan_cycle = "甲乙丙丁戊己庚辛壬癸"
        zhi_cycle = "子丑寅卯辰巳午未申酉戌亥"

        for day in (14, 15, 16):
            for hour in range(24):
                chart = compute_chart(_seoul(day=day, hour=hour, minute=30), SEOUL)
                assert chart.hour is not None

                day_gan = chart.day.pillar.gan
                zi_stem = zi_stem_for_day_stem[day_gan]
                # 시지에서 몇 번째 시각인지 세고, 자시 천간에서 그만큼 진행시킨다.
                steps = zhi_cycle.index(chart.hour.pillar.zhi)
                expected = gan_cycle[(gan_cycle.index(zi_stem) + steps) % 10]

                assert chart.hour.pillar.gan == expected, (
                    f"시두법 위반: {day}일 {hour}시 → 일간 {day_gan} 인데 "
                    f"시주 {chart.hour.pillar.gan}{chart.hour.pillar.zhi}"
                )


class TestKoreanTime:
    """표준자오선·서머타임 표. tzdata 를 출처로 하는 사실들이다."""

    @pytest.mark.parametrize(
        ("date", "expected"),
        [
            ((1908, 4, 1), 127.5),
            ((1911, 12, 31), 127.5),
            ((1912, 1, 1), 135.0),
            ((1954, 3, 20), 135.0),
            ((1954, 3, 21), 127.5),
            ((1961, 8, 9), 127.5),
            ((1961, 8, 10), 135.0),
            ((2026, 1, 1), 135.0),
        ],
    )
    def test_meridian_eras(self, date, expected):
        assert standard_meridian(*date) == expected

    def test_before_1908_raises(self):
        """지방평균시 시대는 조용히 아무 값이나 주지 않고 거부한다."""
        with pytest.raises(ValueError, match="지원하지 않습니다"):
            standard_meridian(1908, 3, 31)

    def test_dst_skipped_hour_resolves_to_standard(self):
        """1988-05-08 02시는 **건너뛴 시각**이라 존재하지 않는다 → 표준시(False)."""
        assert is_dst(1988, 5, 8, 2) is False
        assert is_dst(1988, 5, 8, 3) is True

    def test_dst_repeated_hour_resolves_to_standard(self):
        """1988-10-09 02시는 **되풀이된 시각** → 표준시(False)."""
        assert is_dst(1988, 10, 9, 2) is False
        assert is_dst(1988, 10, 9, 1) is True

    def test_no_dst_outside_listed_years(self):
        assert is_dst(1990, 7, 1, 12) is False
        assert is_dst(1953, 7, 1, 12) is False  # 한국전쟁 전후 중단기


class TestTrueSolarTime:
    def test_rounds_once_at_the_end(self):
        """경도 보정과 균시차를 각각 반올림해 더하지 않는다(이중 반올림 금지).

        서울 1990-05-15 23:40 → 진태양시 **23:12**. 손계산과도 맞는다:
        1420분 + 경도 보정 (126.978−135)×4 = −32.088 + 균시차 3.747 = 1391.659 →
        한 번 반올림해 1392 → 23:12. 성분을 미리 반올림하면 −32 + 4 = 1392 로 우연히
        같지만, 다른 날짜에서는 갈린다.

        **기대값의 출처는 원본 TS 엔진의 실제 출력이다** (`toTrueSolarTime` 직접 호출로
        확인). 원본 README 의 자시 관례 설명에 적힌 "23:08" 은 그 문단의 논지(어느
        쪽이든 자시 안이다)에 영향이 없는 어림값이라 기대값으로 쓰지 않는다.
        """
        result = to_true_solar_time(1990, 5, 15, 23, 40, SEOUL)
        assert (result.hour, result.minute) == (23, 12)
        assert result.day_offset == 0
        assert result.detail.longitude_minutes == -32
        assert result.detail.equation_minutes == 4

    def test_negative_rollover(self):
        """보정이 자정을 거꾸로 넘으면 day_offset 이 -1 이다."""
        result = to_true_solar_time(1990, 5, 16, 0, 10, SEOUL)
        assert result.day_offset == -1
        assert result.hour == 23

    def test_dst_subtracts_an_hour(self):
        with_dst = to_true_solar_time(1987, 7, 15, 14, 30, SEOUL)
        without_dst = to_true_solar_time(1990, 7, 15, 14, 30, SEOUL)
        assert with_dst.detail.dst_applied is True
        assert without_dst.detail.dst_applied is False
        # 같은 벽시계 시각인데 서머타임 쪽이 60분 이르다 (균시차는 날짜가 같아 상쇄).
        assert without_dst.hour - with_dst.hour == 1

    def test_leap_year_day_of_year(self):
        assert day_of_year(2000, 3, 1) == 61  # 윤년
        assert day_of_year(1999, 3, 1) == 60  # 평년


class TestGanzhi:
    def test_hangul_reading(self):
        assert ganzhi_to_hangul("甲", "子") == "갑자"

    def test_unmapped_raises_instead_of_returning_none(self):
        """조용한 None 은 이후 비교를 전부 틀린 거짓으로 만든다."""
        with pytest.raises(ValueError, match="매핑되지 않은 값"):
            ganzhi_to_hangul("X", "子")

    def test_visible_tally_counts_stem_and_branch_once_each(self):
        # 甲(목) 子(수) · 丙(화) 午(화) → 목1 화2 수1. 기둥당 정확히 2개씩,
        # 지장간은 세지 않는다.
        tally = count_visible_wuxing([Pillar("甲", "子"), Pillar("丙", "午")])
        assert tally == {"목": 1, "화": 2, "토": 0, "금": 0, "수": 1}
        assert sum(tally.values()) == 4


class TestTeaser:
    def test_six_characters_when_time_unknown(self):
        """시각 미상이면 여섯 글자이고, 시주가 빠졌다고 말해야 한다."""
        chart = compute_chart(_seoul(hour=None, minute=None), SEOUL)
        teaser = build_teaser(chart, judge_strength(chart))

        assert teaser.char_count == 6
        assert len(teaser.pillars_hangul) == 3
        assert "여섯 글자" in teaser.summary
        assert "여덟 글자" not in teaser.summary
        assert "시주를 제외한" in teaser.summary

    def test_eight_characters_when_time_known(self):
        chart = compute_chart(_seoul(), SEOUL)
        teaser = build_teaser(chart, judge_strength(chart))
        assert teaser.char_count == 8
        assert "여덟 글자" in teaser.summary

    def test_frequency_sentence_never_carries_strength_vocabulary(self):
        """빈도는 가중치 없는 집계이지 강약이 아니다 — 두 문장이 분리돼 있어야 한다."""
        chart = compute_chart(_seoul(), SEOUL)
        teaser = build_teaser(chart, judge_strength(chart))

        frequency = next(s for s in teaser.summary.split(".") if "빈도는" in s)
        for word in ("신강", "신약", "중화"):
            assert word not in frequency

    def test_never_mentions_yongsin(self):
        """용신은 계산하지 않으므로 어디에도 나오면 안 된다."""
        chart = compute_chart(_seoul(), SEOUL)
        teaser = build_teaser(chart, judge_strength(chart))
        assert "용신" not in teaser.summary


class TestStrengthBasisWording:
    def test_supporting_element_is_not_called_a_root(self):
        """통근(같은 오행)과 생조(인성)를 같은 말로 설명하지 않는다.

        이 문장은 리포트 프롬프트에 그대로 주입되므로, 틀린 용어가 손님이 받는
        리포트에 재생산된다 (`strength._judge_deuk_ji` 주석).
        """
        # 여러 케이스를 훑어 '생조함' 문장에 '통근'이 섞이지 않는 것을 확인한다.
        for day in range(1, 29):
            chart = compute_chart(_seoul(month=3, day=day, hour=10, minute=0), SEOUL)
            detail = judge_strength(chart).basis.detail[1]
            if "생조함 (일간과 같은 오행은 아니므로" in detail:
                assert "통근" not in detail


class TestProfileMapping:
    """사주 → 투자 성향 6축. 통합의 심장부라 성질(property)로 지킨다."""

    def test_axes_are_always_in_range(self):
        """어떤 사주가 들어와도 0~100 을 벗어나지 않는다.

        벗어나면 `InvestorProfile` 의 Pydantic 검증이 500 으로 터진다 —
        사용자 입력이 서버 오류가 되는 경로다.
        """
        for month in range(1, 13):
            for hour in (2, 9, 15, 23):
                chart = compute_chart(_seoul(month=month, day=10, hour=hour, minute=0), SEOUL)
                axes = to_profile_axes(chart, judge_strength(chart))
                for name in (
                    "risk_appetite",
                    "patience",
                    "decisiveness",
                    "loss_aversion",
                    "herd_tendency",
                ):
                    value = getattr(axes, name)
                    assert 0 <= value <= 100, f"{name}={value} (month={month}, hour={hour})"

    def test_deterministic(self):
        """같은 생년월일시면 언제나 같은 프로파일 — 재현·감사의 전제다."""
        chart = compute_chart(_seoul(), SEOUL)
        strength = judge_strength(chart)
        assert to_profile_axes(chart, strength) == to_profile_axes(chart, strength)

    def test_strength_moves_risk_and_loss_aversion_oppositely(self):
        """신강은 위험 감수를 올리고 손실 회피를 내린다 (매핑표의 의도).

        두 축이 독립이 아니라는 것이 설계다 — 명리에서 일간의 강약이 실제로 그 둘을
        같은 방향으로 설명한다 (`profile_mapping` 모듈 주석).
        """
        strong = None
        weak = None
        for month in range(1, 13):
            for day in (5, 15, 25):
                chart = compute_chart(_seoul(month=month, day=day, hour=12, minute=0), SEOUL)
                verdict = judge_strength(chart)
                axes = to_profile_axes(chart, verdict)
                if verdict.verdict == "신강" and strong is None:
                    strong = axes
                if verdict.verdict == "신약" and weak is None:
                    weak = axes

        assert strong is not None and weak is not None, "표본에 신강·신약이 모두 있어야 한다"
        assert strong.risk_appetite > weak.risk_appetite
        assert strong.loss_aversion < weak.loss_aversion

    def test_summary_is_display_only_and_names_the_day_master(self):
        chart = compute_chart(_seoul(), SEOUL)
        axes = to_profile_axes(chart, judge_strength(chart))
        assert chart.day_master_hangul in axes.saju_summary
        # 판단 계산에 쓰이지 않는 필드이므로 숫자 축과 섞이지 않는다.
        assert isinstance(axes.saju_summary, str)


class TestPlaces:
    def test_closed_list(self):
        assert longitude_of("SEOUL") == SEOUL
        assert longitude_of("NOWHERE") is None
