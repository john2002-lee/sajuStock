"""사주 엔진 호출 (통합 기획 5.3의 `client.py`).

엔진은 이 저장소 안의 순수 파이썬 라이브러리(`domain/saju/`)이므로 여기서는 그것을
직접 부른다 — HTTP 도, 네트워크도, 재시도도 없다. 기획이 열어 둔 "라이브러리 import
또는 HTTP" 중 라이브러리 쪽으로 확정된 결과다.

**그런데도 이 파일이 존재하는 이유**는 `__init__.py` 에 적었다: 사주가 앱의 나머지와
만나는 지점을 한 곳으로 못박아 둔다. 나중에 엔진이 별도 서비스로 빠지면 바뀌는 것은
이 파일 하나다.

계산은 결정론적이고 비용이 0이라 캐시가 필요 없다 — 생년월일시가 같으면 언제나 같은
결과이고, 한 번 부르는 데 밀리초가 든다. (기획 5.1 이 "사주 계산은 1회성"이라고 한
것은 **저장** 이야기다: 사용자가 보정한 프로파일이 DB 에 영구 저장되므로 종목 분석
때마다 엔진을 다시 부르지 않는다.)
"""

from dataclasses import dataclass

from app.domain.saju.engine import SajuChart, build_solar_and_eight_char, compute_chart
from app.domain.saju.luck import LuckResult, compute_luck
from app.domain.saju.places import longitude_of
from app.domain.saju.profile_mapping import ProfileAxes, to_profile_axes
from app.domain.saju.strength import StrengthVerdict, judge_strength
from app.domain.saju.teaser import Teaser, build_teaser
from app.domain.saju.types import SajuInput


class UnknownBirthPlaceError(ValueError):
    """폐쇄 목록에 없는 출생지 코드. 스키마가 먼저 걸러 내지만 방어적으로 남긴다."""


@dataclass(frozen=True)
class SajuReading:
    """엔진이 낸 사주 한 벌. 서비스 계층이 스키마로 옮긴다."""

    chart: SajuChart
    strength: StrengthVerdict
    teaser: Teaser
    luck: LuckResult
    profile: ProfileAxes


def compute_reading(saju_input: SajuInput, now_year: int) -> SajuReading:
    """생년월일시 하나를 사주 한 벌 + 투자 성향 초안으로.

    `now_year` 를 **인자로 받는다**. 시계를 여기서 읽으면 `domain/saju/luck.py` 의
    "현재 시각 의존 없음" 보장이 한 층 위에서 새어 나가고, 같은 입력이 실행 시점에
    따라 다른 `current_da_yun` 을 내게 된다 — 테스트가 날짜에 따라 깨진다는 뜻이다.
    """
    longitude = longitude_of(saju_input.birth_place_code)
    if longitude is None:
        raise UnknownBirthPlaceError(f"알 수 없는 출생지 코드입니다: {saju_input.birth_place_code}")

    chart = compute_chart(saju_input, longitude)
    strength = judge_strength(chart)
    teaser = build_teaser(chart, strength)

    # 대운은 **두 EightChar 를 모두** 필요로 한다. 일간은 진태양시 쪽에서, 대운
    # 방향·대운수는 절기 프레임에서 온다 — 자세한 이유는 `luck.compute_luck` 주석.
    built = build_solar_and_eight_char(saju_input, longitude)
    luck = compute_luck(built.ec, built.ec_term, saju_input.gender, now_year)

    return SajuReading(
        chart=chart,
        strength=strength,
        teaser=teaser,
        luck=luck,
        profile=to_profile_axes(chart, strength),
    )
