"""사주 리포트 출력 정책 — **코드로 강제되는 안전 장치**. 순수 함수 — I/O 없음.

장식이 아니다. 생성된 마크다운은 곧바로 사용자에게 간다. 프롬프트 문구는 통제가
아니며(원본 프로젝트의 리뷰가 프롬프트 전용 정책을 명시적으로 기각했다),
`validate_report` 는 프롬프트가 무엇을 부탁했든 상관없이 **모델의 실제 출력에**
매번 돌아가는 평범한 코드다.

`REQUIRED_SECTIONS` 에 용신이 없는 것은 의도다: 이 제품은 용신을 계산하지 않으므로
(`strength.py` 주석) 리포트가 용신을 논해서는 안 된다. 여기에 용신 섹션을 요구하면
매 리포트마다 모델이 근거 없는 사실을 지어내야 한다.

원본: `SajuService/src/lib/llm/policy.ts`. 정규식은 그쪽에서 네 라운드의 리뷰를
거치며 굳은 것이라 **모양을 그대로 옮겼다** — 특히 아래 `_any_batchim` 과
운명론 검사의 "예외 없음" 결정은 각각 실패에서 배운 것이라 재해석하지 않는다.
"""

import re

REQUIRED_SECTIONS: tuple[str, ...] = (
    "총평",
    "성격과 기질",
    "강약과 균형",
    "대운의 흐름",
    "올해의 운",
    "연애·관계",
    "재물·직업",
    "조언",
)


class PolicyError(Exception):
    """검증기가 모델이 만든 텍스트를 거부했다.

    `offending_sentence` 를 `message` 에서 **일부러 뺀다.** `message` 는 밖으로
    나간다 — 작업 실패 사유로 저장되고 운영 알림으로 전송된다. 걸린 문장은 정의상
    민감하다(건강·죽음·돈에 인접한, 특정인의 리포트 텍스트다). 그래서 사유의 유형과
    섹션 이름만 내보내고 문장 자체는 남기지 않는다.

    문장이 필요한 곳은 **재생성 프롬프트 하나**다. 거기서는 구체적인 문장이 있어야
    재시도가 성공할 확률이 훨씬 높고, 새로 노출되는 것도 없다 — 모델이 쓴 것이다.
    """

    def __init__(self, message: str, offending_sentence: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.offending_sentence = offending_sentence


class ContentRefusalError(Exception):
    """모델이 **이 질문에 대해** 쓸 만한 것을 내놓지 못했고, 이유가 내용에 있다.

    안전 필터에 걸렸거나, 토큰이 모자라 잘렸거나, 아예 후보가 없는 경우다.
    우리 인프라가 실패한 것이 아니라 모델이 이 입력에 대해 거절했거나 자리가 모자랐다.

    `PolicyError` 와 일부러 합치지 않는다. 그쪽은 모델이 **만든** 텍스트를 우리
    검증기가 거부한 것이고 재생성을 이끌 문장을 들고 있다. 여기는 인용할 텍스트도,
    이끌 방향도 없다.
    """


def _split_sentences(body: str) -> list[str]:
    """금지 표현을 **한 문장 안에서** 찾도록 본문을 문장으로 쪼갠다.

    이게 없으면 '반드시'가 든 정상 문장과 뒤의 무관한 문장이 합쳐져 거짓 양성을 만든다.
    """
    return [s.strip() for s in re.split(r"(?<=[.!?])\s*", body) if s.strip()]


def _any_batchim(syllable: str) -> str:
    """받침이 **무엇이든** 붙은 같은 초성·중성 음절 전부를 덮는 문자 클래스.

    완성형 한글은 `0xAC00 + (초성*21 + 중성)*28 + 종성` 이라, 초성·중성이 같은 28개
    음절이 연속한다. 리(U+B9AC)부터 U+B9C7 까지가 리·린·릴·림·립 …을 덮는다.

    **이 함수는 손으로 활용형을 나열하다 조용히 실패한 자리에서 나왔다.** 의료 검사가
    `걸(리|림|려)` 였는데, 이것은 "걸리·걸림·걸려"로 읽히지만 걸릴·걸립·걸린·걸렸 중
    어느 것도 잡지 못한다 — 그것들은 걸 + **다른 완성형 음절**이지 걸 + 리 + 받침이
    아니기 때문이다. 자연스러운 표현 14가지 중 10가지가 샜고 "암에 걸릴 수 있습니다"
    가 거기 있었다.

    받침이 **없는** 음절에만 쓸 것. 이미 받침이 있는 음절을 넓히면 무관한 음절로
    걸어 들어간다 — 받 은 바 블록 안이라 같은 수를 쓰면 박·반·발·밥·방까지 잡는다.
    """
    code = ord(syllable)
    offset = code - 0xAC00
    if offset < 0 or offset >= 11172:
        raise ValueError(f"완성형 한글 음절이 아닙니다: {syllable}")
    if offset % 28 != 0:
        raise ValueError(f"{syllable} 에는 이미 받침이 있습니다 — 넓히면 무관한 음절까지 잡습니다")
    return f"[{chr(code)}-{chr(code + 27)}]"


# ---------------------------------------------------------------------------
# 의료
# ---------------------------------------------------------------------------
_ILLNESS = "(암|당뇨|고혈압|뇌졸중|심장병|우울증|중병|불치병)"
#: 걸리다/걸려…를 활용형 무관하게. 걸리니·걸릴·걸립니다·걸린·걸렸.
_CONTRACTS = f"걸({_any_batchim('리')}|{_any_batchim('려')})"

_MEDICAL_ILLNESS_RE = re.compile(rf"{_ILLNESS}\s*(에)?\s*{_CONTRACTS}")

#: 치료를 받으라는 지시.
#:
#: 치료는 명령형 요구를 유지한다 — "정기적으로 치료를 받아야 건강을 유지할 수
#: 있습니다"는 평범한 건강 조언이고, 맨 '받아야'를 통과시킨 원래 판단을 뒤집지 않는다.
#: 수술·입원은 그런 선의의 독법이 없어(수술을 받아야 한다고 말하는 문장은 활용형과
#: 무관하게 의료 지시다) 필요 형태까지 함께 잡는다.
_MEDICAL_DIRECTIVE_RE = re.compile(
    r"(치료\s*(을|를)?\s*받(으세요|으십시오|아라)|(수술|입원)\s*(을|를)?\s*받(으세요|으십시오|아라|아야))"
)

#: 걸리다를 건너뛰고 진단을 예언하는 형태. 어미를 나열하지 않는다 — 받 은
#: 받게 될·받게 됩니다·받으실·받았 에서 불변이고, 예전의 목록은 그중 넷만 덮었다.
_MEDICAL_DIAGNOSIS_PREDICTION_RE = re.compile(rf"{_ILLNESS}\s*진단\s*(을|를)?\s*받")


def _is_medical_violation(sentence: str) -> bool:
    return bool(
        _MEDICAL_ILLNESS_RE.search(sentence)
        or _MEDICAL_DIRECTIVE_RE.search(sentence)
        or _MEDICAL_DIAGNOSIS_PREDICTION_RE.search(sentence)
    )


# ---------------------------------------------------------------------------
# 의식 권유 (굿·부적)
# ---------------------------------------------------------------------------
#: 프롬프트는 이미 금지하지만 출력을 검사하는 것이 없었다. 무당 페르소나가 유료 굿을
#: 권하는 것은 이 제품이 되어서는 안 되는 것으로 변하는 가장 예측 가능한 경로이고,
#: 프롬프트만의 금지는 우리가 가진 가장 약한 통제다.
#:
#: 다른 범주와 같은 모양의 AND 다 — 신살을 설명하며 부적을 언급하는 것은 파는 것이
#: 아니다. 부적 뒤의 부정 전방탐색은 '부적절'이 페르소나가 쓰는 평범한 낱말이라
#: ("부적절한 관계는 피하시게") 없으면 매번 걸리기 때문이다.
_RITUAL_ITEM_RE = re.compile(r"(굿|부적(?!절)|천도재|살풀이|기도비|복채|신장대)")
_RITUAL_RECOMMENDATION_RE = re.compile(
    r"(하시|하면|해야|하는\s*것이\s*좋|지니시|지니면|올리|받으시|쓰시|사시|구입|장만|준비하)"
)


def _is_ritual_selling_violation(sentence: str) -> bool:
    return bool(_RITUAL_ITEM_RE.search(sentence) and _RITUAL_RECOMMENDATION_RE.search(sentence))


# ---------------------------------------------------------------------------
# 법률
# ---------------------------------------------------------------------------
_LEGAL_DIRECTIVE_RE = re.compile(r"(고소|소송)\s*(을|를)?\s*(하세요|거세요|제기하세요|하십시오)")
#: 나머지 셋은 AND 로 묶는다 — 소송을 그저 조심할 위험으로 언급하는 문장이
#: 단정이나 결과 주장 없이 걸리지 않게 한다.
_LEGAL_CONTEXT_RE = re.compile(r"(소송|재판|고소)")
_LEGAL_DETERMINISM_RE = re.compile(r"(반드시|무조건|틀림없이|수밖에\s*없|피할\s*수\s*없)")
_LEGAL_OUTCOME_RE = re.compile(r"(승소|패소|이깁니다|이길|집니다|진다)")


def _is_legal_violation(sentence: str) -> bool:
    if _LEGAL_DIRECTIVE_RE.search(sentence):
        return True
    return bool(
        _LEGAL_CONTEXT_RE.search(sentence)
        and _LEGAL_DETERMINISM_RE.search(sentence)
        and _LEGAL_OUTCOME_RE.search(sentence)
    )


# ---------------------------------------------------------------------------
# 투자 손익 단정
# ---------------------------------------------------------------------------
#: "다 넣으라"는 표현 — 전 재산/모든 돈/가진 돈/돈 전부·몽땅.
_INVESTMENT_ALLIN_RE = re.compile(r"(전\s*재산|모든\s*돈|가진\s*돈|돈\s*(을|를)?\s*(전부|몽땅))")
#: 투자 언급 자체. 단독으로는 넓지만 위아래와 AND 로 묶여 있어, 단정도 전액도 없는
#: "재물운이 좋아 투자에 성공할 수 있습니다"는 걸리지 않는다.
_INVESTMENT_CONTEXT_RE = re.compile(r"투자")
#: 수익 주장 — 명시적 단정 부사이거나, 맨 "번다/법니다" 계열 동사. 전액 표현 자체가
#: 이미 "다 건다"는 틀을 지고 있어 이 갈래에는 단정 부사를 요구하지 않는다.
_INVESTMENT_PROFIT_RE = re.compile(
    r"(법니다|벌립니다|번답니다|수익\s*(을)?\s*(냅니다|얻습니다)|큰돈을?\s*법니다|확실히|무조건|틀림없이)"
)


def _is_investment_violation(sentence: str) -> bool:
    return bool(
        _INVESTMENT_ALLIN_RE.search(sentence)
        and _INVESTMENT_CONTEXT_RE.search(sentence)
        and _INVESTMENT_PROFIT_RE.search(sentence)
    )


# ---------------------------------------------------------------------------
# 운명론적 단정
# ---------------------------------------------------------------------------
#: 단정 부사 + 부정적 사건 명사 → 거부. **예외 없음.**
#:
#: 원본 프로젝트에서 라운드 2·3 이 회피/부정 예외를 넣어 "사고를 조심하면 반드시
#: 무탈하게 지나갑니다" 같은 위로 표현을 통과시키려 했고, 라운드 3 은 절 단위로
#: 좁혔으며, **라운드 4 에서 그것마저 평범한 `-면`/`-어서`/`-는데`/`-라도` 조건
#: 계열로 우회된다**는 것이 드러났다 ("조심하면 당신은 반드시 이혼하게 됩니다."가
#: 잘못 승인됐다). 매 수정이 지목된 사례를 닫고 새로운 우회 부류를 열었다.
#:
#: 명시적 결론: **예외를 더 넣지 않는다.** 예외 목록은 구조상 우회 표면이고,
#: 여기는 이미 결제한 사용자에게 리포트가 가기 전 마지막 방어선이다.
#: 이 규칙은 일부러 가장 넓고 단순한 라운드 1 의 모양으로 돌아왔다. 위로 문장 몇
#: 개를 거짓 양성으로 거부**할 것이고 그것은 회귀가 아니라 받아들인 대가**다 —
#: 과차단은 재생성 한 번이고, 미차단은 죽음·이혼·파산의 단정 예언이 나가는 것이다.
#: 두 결과는 대칭이 아니다. 거짓 양성의 해결책은 프롬프트에 있다(`report_prompt.py`
#: 의 규칙 6). 프롬프트는 실패해도 재생성 한 번이지만, 이 검증기는 무엇도 새어
#: 나가지 않는다는 보장 그 자체라 우회 표면을 가져서는 안 된다.
#:
#: 이 주석과 위 이력을 다시 읽지 않고 회피/부정 예외를 되살리지 말 것.
_FATALISTIC_CERTAINTY_RE = re.compile(
    r"(반드시|틀림없이|무조건|피할\s*수\s*없|수밖에\s*없|정해진\s*운명|운명입니다)"
)
#: **부정적** 인생 사건 명사. 운명론적 단정과 평범한 격려를 가르는 것이 이것이다 —
#: "반드시 성장하게 됩니다"는 평범한 열의이고 "반드시 이혼하게 됩니다"는 피할 수 없는
#: 나쁜 결과의 단언이다. 긍정 낱말(안정·결실·회복·성장…)은 일부러 넣지 않는다.
_FATALISTIC_NEGATIVE_EVENT_RE = re.compile(
    r"(이혼|사망|죽음|파산|이별|사고|실패|질병에?\s*걸|중병|불치병)"
)


def _is_fatalistic_violation(sentence: str) -> bool:
    return bool(
        _FATALISTIC_CERTAINTY_RE.search(sentence)
        and _FATALISTIC_NEGATIVE_EVENT_RE.search(sentence)
    )


def _violation_message(heading: str, category: str) -> str:
    """리포트를 **인용하지 않으면서** 진단이 되는 메시지.

    이 문자열은 밖으로 나간다 — 실패 사유로 저장되고 운영 알림으로 전송된다.
    걸린 문장을 넣으면 특정인의 건강·관계 인접 텍스트가 로그와 알림 채널로 간다.
    유형과 섹션이면 대응하기에 충분하고, 전문은 정상적인(접근 통제된) 경로로 볼 수 있다.
    """
    return f'섹션 "{heading}"에 금지된 표현이 있습니다 (유형: {category})'


def check_prohibited_content(heading: str, body: str) -> None:
    """한 섹션 본문을 문장 단위로 훑어 금지 표현을 찾는다."""
    for sentence in _split_sentences(body):
        if _is_medical_violation(sentence):
            raise PolicyError(_violation_message(heading, "의료 행위·진단 관련 표현"), sentence)
        if _is_ritual_selling_violation(sentence):
            raise PolicyError(_violation_message(heading, "굿·부적 등 의식 권유"), sentence)
        if _is_legal_violation(sentence):
            raise PolicyError(_violation_message(heading, "법적 판단·소송 결과 단정"), sentence)
        if _is_investment_violation(sentence):
            raise PolicyError(_violation_message(heading, "투자 손익 단정"), sentence)
        if _is_fatalistic_violation(sentence):
            raise PolicyError(_violation_message(heading, "운명론적·단정적 표현"), sentence)


class ReportSection:
    """`## 제목` 하나와 그 본문."""

    __slots__ = ("heading", "body")

    def __init__(self, heading: str, body: str) -> None:
        self.heading = heading
        self.body = body

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<ReportSection {self.heading!r}>"


_HEADING_RE = re.compile(r"^##\s+(.+)$", re.MULTILINE)


def parse_markdown_sections(markdown: str) -> list[ReportSection]:
    """모델 응답을 `## 제목` 기준으로 섹션으로 나눈다.

    첫 제목 **앞의** 텍스트는 결과에 담기지 않는다. 검증에는
    `validate_markdown` 을 쓸 것 — 그쪽이 그 앞부분까지 검사한다.
    """
    matches = list(_HEADING_RE.finditer(markdown))
    sections: list[ReportSection] = []
    for index, match in enumerate(matches):
        body_start = match.end()
        body_end = matches[index + 1].start() if index + 1 < len(matches) else len(markdown)
        sections.append(ReportSection(match.group(1).strip(), markdown[body_start:body_end].strip()))
    return sections


def validate_report(sections: list[ReportSection]) -> None:
    """파싱된 리포트를 정책에 대고 검증한다. 조용히 버리거나 자르지 않고 예외를 던진다.

    - 필수 섹션 누락
    - 제목 중복(필수든 아니든)
    - 빈 본문
    - 금지 표현(의료·법률·투자·운명론·의식 권유)
    """
    seen: set[str] = set()
    for section in sections:
        if section.heading in seen:
            raise PolicyError(f'중복된 섹션 제목입니다: "{section.heading}"')
        seen.add(section.heading)

    for required in REQUIRED_SECTIONS:
        if required not in seen:
            raise PolicyError(f'필수 섹션이 없습니다: "{required}"')

    for section in sections:
        if not section.body.strip():
            raise PolicyError(f'본문이 비어 있는 섹션입니다: "{section.heading}"')
        check_prohibited_content(section.heading, section.body)


#: 첫 `##` **위쪽**에서 위반이 나왔을 때 쓰는 이름. 실제 섹션이 아니라 오류 표시용이다.
_PREAMBLE_LABEL = "(제목/머리말)"


def validate_markdown(markdown: str) -> list[ReportSection]:
    """마크다운 전문을 검증하고 섹션을 돌려준다.

    `parse_markdown_sections` + `validate_report` 조합보다 이쪽을 쓸 것. 그 둘은
    첫 `## 제목` 위의 모든 것을 놓치는데, **저장되고 사용자에게 렌더되는 것은 원본
    마크다운 전체**다. 제목 줄이나 도입 문단으로 시작하는 모델은 자연스럽고
    프롬프트가 금지하지도 않으므로, 그대로 두면 검사되지 않은 산문이 나갈 수 있다 —
    모든 금지 범주가 한꺼번에, 다른 표현을 찾을 필요도 없이 통과했다.

    머리말은 통째로 거부하지 않고 내용만 검사한다 — 평범한 `# 리포트` 제목은
    합법으로 남는다.
    """
    first_heading = _HEADING_RE.search(markdown)
    preamble = (markdown[: first_heading.start()] if first_heading else markdown).strip()
    if preamble:
        check_prohibited_content(_PREAMBLE_LABEL, preamble)

    sections = parse_markdown_sections(markdown)
    validate_report(sections)
    return sections


#: 답변 하나의 최대 길이. 말풍선 몇 개 분량이며, 이보다 길면 모델이 질문에 답하는
#: 대신 리포트를 다시 쓰고 있다는 신호다.
MAX_ANSWER_CHARS = 1800

#: `validate_answer` 가 위반을 보고할 때 쓰는 이름. 실제 섹션이 아니다.
_ANSWER_LABEL = "(추가 질문 답변)"

#: 어떤 형태든 마크다운 헤딩. 리포트용 `## ` 만이 아니라 `#`·`###`·들여쓴 것까지 잡는다.
#: 답변은 산문이라 헤딩이 하나라도 있으면 모델이 리포트 형식으로 흘러간 것이고,
#: 말풍선 안에서 렌더되지 않은 채 문자 그대로 찍힌다.
_ANY_HEADING_RE = re.compile(r"^\s*#{1,6}\s", re.MULTILINE)


def validate_answer(text: str) -> None:
    """추가 질문의 답변을 검증한다.

    `validate_report` 를 쓰지 않는 이유: 그쪽은 필수 섹션 8개가 다 있는지 본다.
    답변은 산문 몇 문단이라 그 검사를 통과할 수 없고, 통과하게 만들려면 답변을
    리포트 모양으로 부풀려야 하는데 그것이 바로 하면 안 되는 일이다.

    금지 표현 검사(`check_prohibited_content`)는 **그대로 재사용한다.** 의료·법률·
    투자·운명론 규칙은 텍스트가 어디에 실리든 같아야 하고, 답변 전용 사본을 두면
    시간이 지나며 리포트 쪽 규칙과 갈라진다.
    """
    stripped = text.strip()
    if not stripped:
        raise PolicyError("답변이 비어 있습니다")
    if len(stripped) > MAX_ANSWER_CHARS:
        raise PolicyError(f"답변이 너무 깁니다 ({len(stripped)}자 / 최대 {MAX_ANSWER_CHARS}자)")
    if _ANY_HEADING_RE.search(stripped):
        raise PolicyError("답변에 마크다운 헤딩이 있습니다 — 답변은 평문 산문이어야 합니다")
    check_prohibited_content(_ANSWER_LABEL, stripped)
