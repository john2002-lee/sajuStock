"""투자 성향 프로파일과 적합도 스키마 (사주 통합 계획 5.2 / 5.4).

여기에 있는 것은 **숫자뿐**이다. 사주 원문·오행·십성은 이 계층에 들어오지 않는다
(계획 5.7). 판단 경로가 보는 것은 `InvestorProfile` 의 6개 값이 전부이며,
`saju_summary` 는 프로파일 화면에 문장으로 띄우기 위한 표시 전용 필드다.

이 모듈은 `advice.py` 를 import 하지 않는다 — 반대 방향이다. 결합 결과인
`PersonalVerdict` 는 `Verdict` 를 쓰므로 다른 판단 스키마와 함께 `advice.py` 에 둔다.
"""

from typing import Literal

from pydantic import BaseModel, Field

Severity = Literal["low", "medium", "high"]
FitLevel = Literal["high", "medium", "low"]
ProfileSource = Literal["saju", "survey", "user_edited"]


class InvestorProfile(BaseModel):
    """사주 해석 또는 설문에서 도출한 투자 성향. 0~100 정규화.

    동료의 사주 엔진에 요구하는 계약은 이 6개 필드뿐이다 — 사주 → 숫자 매핑은
    그쪽 도메인이고 이 앱은 결과 숫자만 본다. 생년월일시는 바뀌지 않으므로
    이 값은 1회 산출 후 영구 저장이 가능하고, 종목 분석마다 재계산하지 않는다.
    """

    risk_appetite: int = Field(ge=0, le=100, description="위험 감수도")
    patience: int = Field(ge=0, le=100, description="보유기간 선호. 낮을수록 단타")
    decisiveness: int = Field(ge=0, le=100, description="결정 속도. 높을수록 충동적")
    loss_aversion: int = Field(ge=0, le=100, description="손실 회피 강도")
    herd_tendency: int = Field(ge=0, le=100, description="군중 추종 성향")

    source: ProfileSource = "survey"
    # 화면 표시 전용. 판단 계산에 절대 넣지 않는다 (계획 5.7).
    saju_summary: str | None = None


class InvestorProfileResponse(BaseModel):
    """`GET`·`PUT /profile` 응답.

    프로파일이 없을 때 404 가 아니라 `profile: null` 로 200 을 주는 이유: "아직 안
    만들었다"는 오류가 아니라 **온보딩 전이라는 정상 상태**다. 404 로 주면 화면이
    처음 방문한 사용자마다 에러 경로를 타고, 진짜 장애와 구분되지 않는다.
    """

    profile: InvestorProfile | None = None
    updated_at: str | None = None


class FitConcern(BaseModel):
    """적합도가 깎인 이유 한 건.

    점수만 내려보내면 화면이 "38점"밖에 못 쓴다. 왜 갈렸는지를 문장으로 설명하는
    재료(계획 5.6)가 필요해서 축·심각도·문장을 함께 싣는다.
    """

    axis: str = Field(description="적합도 축 이름. 예: 변동성 부담")
    severity: Severity
    message: str = Field(description="사용자에게 그대로 보여줄 문장")


class FitScore(BaseModel):
    """프로파일 × 종목 지표의 적합도. LLM·네트워크 없이 산출된다."""

    score: int = Field(ge=0, le=100)
    level: FitLevel
    concerns: list[FitConcern] = Field(default_factory=list)
    # 계산에 쓸 지표가 하나도 없었으면 True. 이때 점수 100 은 "잘 맞는다"가 아니라
    # "판단 근거가 없었다"는 뜻이고, 결합 단계는 이 경우 보정을 걸지 않는다.
    insufficient_data: bool = False
