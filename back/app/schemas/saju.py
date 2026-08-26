"""사주 요청·응답 스키마.

HTTP 경계의 검증이 여기 있다. `domain/saju/` 는 이 모듈을 모른다 — 계층 방향이
`api → services → domain` 이므로 도메인은 dataclass 로만 말하고, 변환은
`integrations/saju/mapper.py` 한 지점에서 한다.

**검증이 여기 있는 이유.** `compute_chart` 는 순수 함수라 입력을 믿는다. 양력
`2022-02-30` 같은 존재하지 않는 날짜를 주면 `lunar-python` 은 1..31 범위만 보고
통과시켜 **엉뚱한 날짜의 차트를 조용히** 계산한다. 아래 규칙은 전부 엔진이 잡아
주지 않기 때문에 존재한다.
"""

from datetime import date
from typing import Literal, Self

from lunar_python import Lunar, LunarYear
from pydantic import BaseModel, Field, model_validator

from app.domain.saju.korean_time import EARLIEST_SUPPORTED, date_key
from app.domain.saju.places import BIRTH_PLACES, longitude_of

Gender = Literal["M", "F"]

#: 이 제품이 풀이를 내주는 가장 이른 출생. `EARLIEST_SUPPORTED`(1908-04-01)보다
#: **일부러 늦다**, 그리고 성격이 다르다.
#:
#: 그쪽은 한국 표준시에 대한 사실이다 — 그 전에는 표준자오선이 없어 보정할 기준이
#: 없고 `standard_meridian` 이 예외를 던진다. 이쪽은 **제품 결정**이다: 원본
#: 프로젝트의 T21 검증이 독립 만세력과 대조했는데 그 만세력이 1920년 이전을 거부했고
#: (1919 거부, 1920 승인 — 실측), 1908-1919 를 덮는 다른 출처를 찾지 못했다.
#: 그 12년은 127.5E 첫 시대 전체이고 검증되지 않은 채로 나갈 뻔했다.
#:
#: 1919년생은 107세다. 검증 안 된 차트를 내주면서까지 닿을 손님이 아니다.
#: 엔진 자체는 1908년부터 계산하며 그쪽 가드는 그대로다 — 여기서 좁히는 것은
#: 공개 엔드포인트가 받는 범위뿐이라, 넓히려면 엔진이 아니라 이 상수 하나만 만진다.
EARLIEST_ACCEPTED = (1920, 1, 1)

_EARLIEST_ACCEPTED_KEY = date_key(*EARLIEST_ACCEPTED)

# 제품 하한이 엔진 하한 아래로 내려가면 `standard_meridian` 이 예외를 던지고,
# 400 이어야 할 것이 500 이 된다. **기동 시점에** 막는다 — 상수를 잘못 낮춘 배포가
# 런타임까지 살아 있으면 안 된다.
if _EARLIEST_ACCEPTED_KEY < date_key(*EARLIEST_SUPPORTED):
    raise RuntimeError("EARLIEST_ACCEPTED 는 EARLIEST_SUPPORTED 보다 이를 수 없습니다")


class BirthInput(BaseModel):
    """사주 계산의 입력. 완전히 신뢰할 수 없는 사용자 입력이 처음 들어오는 지점이다."""

    year: int
    month: int = Field(ge=1, le=12)
    day: int = Field(ge=1, le=31)
    #: 시와 분은 **둘 다 있거나 둘 다 없어야** 한다. 한쪽만 주면 엔진이 나머지를
    #: 임의 기본값으로 채워 그럴듯하지만 틀린 시주를 만든다.
    hour: int | None = Field(default=None, ge=0, le=23)
    minute: int | None = Field(default=None, ge=0, le=59)
    is_lunar: bool = False
    is_leap_month: bool = False
    gender: Gender
    birth_place_code: str = Field(min_length=1)

    @model_validator(mode="after")
    def _check(self) -> Self:
        if (self.hour is None) != (self.minute is None):
            raise ValueError("시와 분은 둘 다 입력하거나 둘 다 비워야 합니다")

        if longitude_of(self.birth_place_code) is None:
            raise ValueError(f"알 수 없는 출생지 코드입니다: {self.birth_place_code}")

        if self.is_leap_month and not self.is_lunar:
            raise ValueError("윤달은 음력일 때만 의미가 있습니다")

        if self.is_lunar and self.is_leap_month:
            actual = LunarYear.fromYear(self.year).getLeapMonth()
            if actual != self.month:
                raise ValueError(
                    f"{self.year}년에는 윤달이 없습니다"
                    if actual == 0
                    else f"{self.year}년의 윤달은 {actual}월입니다"
                )

        resolved = self._resolve_gregorian()
        if resolved is None:
            raise ValueError(f"{self.year}-{self.month}-{self.day}는 존재하지 않는 날짜입니다")

        key = date_key(*resolved)
        if key < _EARLIEST_ACCEPTED_KEY:
            raise ValueError(f"{EARLIEST_ACCEPTED[0]}년 이전 출생은 지원하지 않습니다")

        today = date.today()
        if key > date_key(today.year, today.month, today.day):
            raise ValueError("출생일이 미래일 수 없습니다")

        return self

    def _resolve_gregorian(self) -> tuple[int, int, int] | None:
        """비교 가능한 양력 날짜로 풀되, **그 날짜가 실재하는지** 함께 확인한다.

        양력은 `datetime.date` 가 존재하지 않는 날짜에 예외를 던지는 것으로 판정한다.
        음력은 `lunar-python` 의 `Lunar.fromYmd` 에 맡긴다 — 그쪽이 이미 그 음력 달의
        일수를 검사한다. 음력 달 길이를 손으로 다시 유도하지 않는다.
        """
        if not self.is_lunar:
            try:
                date(self.year, self.month, self.day)
            except ValueError:
                return None
            return (self.year, self.month, self.day)

        try:
            lunar_month = -self.month if self.is_leap_month else self.month
            solar = Lunar.fromYmd(self.year, lunar_month, self.day).getSolar()
        except Exception:  # noqa: BLE001 - 라이브러리가 던지는 예외 종류가 문서화돼 있지 않다
            return None
        return (solar.getYear(), solar.getMonth(), solar.getDay())


class BirthPlaceOut(BaseModel):
    """출생지 선택지. 경도는 **내보내지 않는다** — 서버가 소유하는 값이다."""

    code: str
    label: str


class PillarOut(BaseModel):
    gan: str
    zhi: str


class PillarDetailOut(BaseModel):
    pillar: PillarOut
    hangul: str
    shi_shen_gan: str
    shi_shen_zhi: list[str]
    hide_gan: list[str]
    na_yin: str
    di_shi: str
    xun_kong: str


class ConventionsOut(BaseModel):
    """이 차트에 적용된 계산 관례. 화면의 '어떻게 계산했나' 안내가 읽는다."""

    zi_hour_sect: int
    strength_algorithm_version: str
    standard_meridian: float
    dst_applied: bool
    longitude_correction_minutes: int
    equation_of_time_minutes: int


class ChartOut(BaseModel):
    year: PillarDetailOut
    month: PillarDetailOut
    day: PillarDetailOut
    hour: PillarDetailOut | None = None
    day_master: str
    day_master_hangul: str
    visible_wuxing: dict[str, int]
    solar_date: str = Field(description="변환·보정 후 실제로 쓰인 양력 날짜 (YYYY-MM-DD)")
    conventions: ConventionsOut


class StrengthBasisOut(BaseModel):
    deuk_ryeong: bool
    deuk_ji: bool
    deuk_se: int
    detail: list[str]


class StrengthOut(BaseModel):
    verdict: str
    score: int
    basis: StrengthBasisOut
    algorithm_version: str


class TeaserOut(BaseModel):
    pillars_hangul: list[str]
    char_count: int
    day_master_hangul: str
    visible_wuxing: dict[str, int]
    strength_verdict: str
    summary: str


class DaYunOut(BaseModel):
    start_age: int = Field(description="세는나이 — 만 나이가 아니다 (domain/saju/luck.py 주석)")
    start_year: int
    gan_zhi: str
    hangul: str
    shi_shen: str


class SeUnOut(BaseModel):
    year: int
    gan_zhi: str
    hangul: str


class LuckOut(BaseModel):
    forward: bool
    start_age: int
    da_yun: list[DaYunOut]
    current_da_yun: DaYunOut | None = None
    se_un: list[SeUnOut]
    now_year: int


class SajuReadingResponse(BaseModel):
    """`POST /saju/chart` 응답 — 사주 한 벌 전체.

    투자 성향 초안(`profile`)을 **함께** 싣는다. 온보딩 화면이 사주와 프로파일을 한
    화면에서 보여 주기 때문이고(기획 3.4: 입력 4개 → 초안 → 3번 탭해 보정),
    나눠서 두 번 왕복하면 같은 계산을 두 번 하거나 서버가 상태를 들고 있어야 한다.
    """

    chart: ChartOut
    strength: StrengthOut
    teaser: TeaserOut
    luck: LuckOut
    #: 사주에서 도출한 투자 성향 **초안**. 저장되지 않은 값이며, 사용자가 보정한 뒤
    #: `PUT /profile` 로 따로 저장한다 — 이 엔드포인트는 아무것도 쓰지 않는다.
    profile: "SajuProfileDraft"


class SajuProfileDraft(BaseModel):
    """사주 → 투자 성향 6축 초안 (통합 기획 5.2).

    `schemas/profile.InvestorProfile` 과 같은 축을 갖되 **별도 타입**이다. 그쪽은
    저장되는 확정 프로파일이고 이쪽은 아직 사용자가 보지도 않은 초안이라, 같은 타입을
    쓰면 초안을 실수로 저장 경로에 흘려보내도 타입이 막아 주지 못한다.
    """

    risk_appetite: int = Field(ge=0, le=100)
    patience: int = Field(ge=0, le=100)
    decisiveness: int = Field(ge=0, le=100)
    loss_aversion: int = Field(ge=0, le=100)
    herd_tendency: int = Field(ge=0, le=100)
    #: 프로파일 화면 표시 전용. **판단 계산에 절대 넣지 않는다** (기획 5.7).
    saju_summary: str


class BirthPlacesResponse(BaseModel):
    places: list[BirthPlaceOut]

    @classmethod
    def build(cls) -> "BirthPlacesResponse":
        return cls(places=[BirthPlaceOut(code=p.code, label=p.label) for p in BIRTH_PLACES])


class SajuReportRequest(BaseModel):
    """`POST /saju/report` 요청. 리포트는 LLM 을 쓰므로 차트 계산과 분리돼 있다."""

    birth: BirthInput


class SajuReportResponse(BaseModel):
    markdown: str
    sections: list["ReportSectionOut"]
    #: LLM 이 썼는지, 규칙 기반 요약으로 떨어졌는지. 화면이 '간이 리포트' 배지를
    #: 켜는 유일한 근거다 — 주식 쪽 `decision_source` 와 같은 규약이다.
    source: Literal["llm", "fallback"] = "llm"


class ReportSectionOut(BaseModel):
    heading: str
    body: str


class FollowUpPresetOut(BaseModel):
    key: str
    label: str


class FollowUpRequest(BaseModel):
    """`POST /saju/followup` 요청.

    **생년월일시를 매번 다시 받는다.** 원본 서비스는 주문 id 로 서버에 저장된 차트를
    찾았지만 이 제품은 아무것도 저장하지 않으므로(`endpoints/saju.py` 모듈 주석),
    질문에 답하려면 사주를 그 자리에서 다시 계산해야 한다. 계산은 순수 함수이고
    밀리초 단위라 비용이 문제되지 않는다.

    `preset_key` 와 `text` 는 **둘 중 하나만** 온다. 프리셋은 서버가 문장을 갖고
    있으므로 클라이언트가 보낸 문장을 믿지 않는다 — 칩을 눌렀다고 주장하면서 임의의
    텍스트를 실어 보내는 경로를 막는다.
    """

    #: 무료 경로. 서버가 사주를 저장하지 않으므로 매번 다시 받는다.
    birth: BirthInput | None = None
    #: 유료 경로. 주문에 생년월일시가 저장돼 있으므로 **토큰만** 있으면 된다.
    #: 서버에 있는 것을 굳이 브라우저로 꺼내 오지 않는다.
    access_token: str | None = None

    preset_key: str | None = None
    text: str | None = None

    @model_validator(mode="after")
    def _exactly_one(self) -> Self:
        if (self.birth is None) == (self.access_token is None):
            raise ValueError("birth 와 access_token 중 정확히 하나만 보내야 합니다")
        if (self.preset_key is None) == (self.text is None):
            raise ValueError("preset_key 와 text 중 정확히 하나만 보내야 합니다")
        return self


class FollowUpResponse(BaseModel):
    #: 실제로 모델에 전달된 질문. 프리셋이면 서버가 가진 문장이다.
    question: str
    answer: str
    #: LLM 이 답했는지, 규칙 기반 안내로 떨어졌는지.
    source: Literal["llm", "fallback"] = "llm"


class FollowUpPresetsResponse(BaseModel):
    presets: list[FollowUpPresetOut]
    max_follow_ups: int
    max_free_text: int


SajuReadingResponse.model_rebuild()
SajuReportResponse.model_rebuild()


# ---------------------------------------------------------------------------
# 유료 리포트 — 주문·결제·전달
#
# 무료 경로(`/saju/chart`)와 달리 이쪽은 **저장한다**. 돈을 받았으면 나중에 다시
# 볼 수 있어야 하기 때문이고, 그 판단의 근거는 `models/saju_order.py` 에 있다.
# ---------------------------------------------------------------------------


class SajuOrderRequest(BaseModel):
    birth: BirthInput


class SajuOrderCreated(BaseModel):
    """`POST /saju/orders` 응답 — 결제창을 열기 위한 최소한."""

    order_id: str
    #: 서버가 정한 금액. 화면은 이 값을 그대로 결제 요청에 싣고, 승인 때 서버가
    #: 다시 대조한다 — 클라이언트가 보낸 금액을 믿지 않는다.
    amount: int
    #: 결제 화면이 다시 계산하지 않도록 함께 준다.
    teaser: TeaserOut


class SajuConfirmRequest(BaseModel):
    """`POST /saju/payments/confirm` 요청. 토스가 리다이렉트로 돌려준 값 그대로다."""

    payment_key: str = Field(min_length=1, max_length=200)
    order_id: str = Field(min_length=1, max_length=40)
    amount: int = Field(ge=0)


class SajuFollowUpTurn(BaseModel):
    """저장된 추가 질문 한 턴.

    `answer` 가 비어 있을 수 있다 — `pending`(답이 오는 중)인 경우다. 화면은 그 턴을
    질문만 그리고 답 자리에 대기 표시를 둔다.

    `status` 를 내려보내는 이유: 화면이 `refused`(모델이 답하지 않았고 슬롯은
    소모됐다)를 정상 답변과 다르게 표시해야 한다. 그러지 않으면 안내문이 답처럼
    읽힌다.
    """

    question: str
    answer: str | None = None
    status: Literal["pending", "answered", "refused"]
    source: Literal["llm", "fallback"] = "llm"


class SajuFollowUpState(BaseModel):
    """추가 질문의 현재 상태만. **리포트 본문 없이.**

    답 하나가 끝난 뒤 화면이 서버와 다시 맞추는 데 쓴다. `SajuPaidReport` 를 다시
    받아도 되지만 그쪽은 리포트 마크다운(수 KB)을 함께 들고 오고, 여기서 필요한 것은
    숫자 둘과 짧은 목록이다.

    ## 왜 다시 맞춰야 하는가

    답이 실패로 끝나면 서버가 슬롯을 **돌려준다**(`fail_follow_up`). 화면이 낙관적으로
    하나 올려 두었다면 그 순간 남은 개수가 서버와 어긋나고, 고객은 자기가 산 질문 하나를
    잃은 것으로 본다. 끝난 뒤 서버에 물어보는 것이 그 어긋남을 없애는 가장 짧은 길이다.
    """

    follow_ups: list["SajuFollowUpTurn"] = Field(default_factory=list)
    follow_ups_spent: int = 0
    max_follow_ups: int = 0


class SajuPaidReport(BaseModel):
    """결제한 리포트 한 벌.

    `access_token` 은 **자격 증명**이다. 이 값이 있는 주소를 아는 사람이 곧 구매자라,
    화면은 이 주소를 색인하지 않는다.
    """

    access_token: str
    markdown: str
    #: 계산 패널(4기둥·오행·대운)이 쓰는 값. 저장된 그대로 내려간다.
    chart: dict
    source: Literal["llm", "fallback"] = "llm"

    #: 지금까지의 추가 질문 대화. **새로고침해도 남는다** — 돈을 낸 사람이 받은 답을
    #: 잃지 않게 하는 것이 이 필드의 목적이다.
    follow_ups: list[SajuFollowUpTurn] = Field(default_factory=list)
    #: 소모된 슬롯 수. **화면의 카운터가 아니라 이 값이 진실이다** — 새로고침으로
    #: 질문 3개가 다시 생기지 않게 하는 근거다.
    follow_ups_spent: int = 0
    #: 이 주문이 쓸 수 있는 전체 슬롯 수. 화면이 숫자를 자기 상수로 들고 있으면
    #: 서버가 거절할 요청을 활성화한다.
    max_follow_ups: int = 0


class SajuJobCreated(BaseModel):
    """작업을 띄웠다는 응답. **즉시** 내려간다.

    리포트 생성은 실측 36초라 요청 하나로는 성립하지 않았다 — 브라우저 쪽 타임아웃이
    20초라 매번 20초에 끊기고 실패 화면이 떴다. 이 응답은 "받았고 돌고 있다" 만
    말하고, 결과는 화면이 아래 조회 경로로 가져간다. 숫자를 올려 미루는 대신 **긴
    요청 자체를 없애는** 것이 목적이다.
    """

    job_id: str


class SajuReportJob(BaseModel):
    """리포트 작업의 현재 상태.

    `running` 이면 화면은 계속 기다린다. `failed` 는 **생성이 터진 경우**이며, 정책
    위반으로 규칙 기반 리포트로 내려간 것은 여기 오지 않는다 — 그것은 실패가 아니라
    `done` + `report.source == "fallback"` 이다.
    """

    status: Literal["running", "done", "failed"]
    report: SajuReportResponse | None = None
    #: 실패 사유. 화면에 그대로 보여도 되는 문장만 담는다 — 내부 예외 메시지에는
    #: 생년월일시가 인용돼 있을 수 있다.
    error: str | None = None


class SajuFollowUpJob(BaseModel):
    """추가 질문 작업의 현재 상태. 리포트 작업과 같은 규약이다."""

    status: Literal["running", "done", "failed"]
    answer: FollowUpResponse | None = None
    error: str | None = None


class SajuPaymentConfirmed(BaseModel):
    """결제 승인 결과. **리포트를 기다리지 않고 내려간다.**

    승인은 1초 남짓이고 리포트 생성은 36초다. 둘을 한 요청에 묶으면 결제가 됐는지조차
    37초 동안 알 수 없고, 그 사이 연결이 끊기면 **돈은 나갔는데 화면은 실패**가 된다.
    그래서 승인이 끝나는 즉시 토큰을 주고, 리포트는 뒤에서 만들어 `saju_reports` 에
    저장한다.

    `ready` 가 거짓이면 화면은 `GET /saju/reports/{token}` 을 폴링한다. 토큰이 이미
    손에 있으므로 **이 시점부터 리포트를 잃는 경로는 없다** — 새로고침해도, 나중에
    다시 와도 같은 주소에서 열린다.
    """

    access_token: str
    #: 저장된 리포트가 이미 있는지(재승인·새로고침). 참이면 폴링 없이 바로 연다.
    ready: bool


class SajuPaymentConfig(BaseModel):
    """화면이 결제 UI 를 켤지 정하는 값.

    가격을 프런트에 상수로 두지 않는 이유: 화면·결제 요청·승인 검증 세 곳이 반드시
    같은 값을 봐야 하고, 복사본이 생기면 그 셋이 어긋나는 순간이 온다.
    """

    enabled: bool
    price: int
    retention_days: int
