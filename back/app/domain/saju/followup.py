"""추가 질문의 프리셋과 자유 입력 정제. 순수 모듈 — DB 도 LLM 도 모른다.

라우트와 화면이 **같은 규칙**을 공유하면서 각자 테스트될 수 있어야 해서 여기 있다.
프런트가 이 목록을 복사해 두면 갈라진다 — 버튼이 서버가 거절할 요청을 활성화하는
상태가 되고, 그것은 사용자에게 "보내 놓고 실패하는" 경험으로 나타난다.

원본: `SajuService/src/lib/followup/presets.ts`.
"""

import re
from dataclasses import dataclass

#: 리포트 하나에 포함된 추가 질문 수.
MAX_FOLLOW_UPS = 3


@dataclass(frozen=True)
class Preset:
    key: str
    #: 칩에 찍히는 짧은 말.
    label: str
    #: 실제로 모델에 전달되는 완성된 질문.
    question: str


#: 건강·질병 항목을 **일부러 넣지 않았다.** 정책(`report_policy`)이 의료 표현을
#: 금지하므로 그런 질문은 재생성 루프를 태우다 실패로 끝난다 — 우리가 스스로
#: 유도할 이유가 없다.
PRESETS: tuple[Preset, ...] = (
    Preset("startup", "창업 시기", "창업이나 개업을 시작하기에 좋은 시기는 언제인가요?"),
    Preset("career", "이직", "지금 직장을 옮기는 것이 흐름에 맞는 때인가요?"),
    Preset("money", "재물 흐름", "재물의 흐름이 좋아지는 시기는 언제인가요?"),
    Preset("love", "인연", "인연을 만나기 좋은 시기는 언제인가요?"),
    Preset("move", "이사", "이사를 하기에 무난한 해는 언제인가요?"),
    Preset("study", "시험·공부", "시험이나 자격 준비에 힘이 실리는 시기는 언제인가요?"),
    Preset("people", "사람 관계", "주변 사람들과의 관계는 어떤 흐름으로 흘러가나요?"),
    Preset("thisyear", "올해 흐름", "올해 남은 기간은 어떤 흐름으로 보면 좋을까요?"),
)

_BY_KEY = {preset.key: preset for preset in PRESETS}


def find_preset(key: str) -> Preset | None:
    return _BY_KEY.get(key)


#: 자유 질문 최대 길이. 화면의 글자수 카운터가 같은 값을 써야 한다.
MAX_FREE_TEXT = 200
_MIN_FREE_TEXT = 2

#: **정제 전** 원문 길이 상한. 이것은 정당성 판단이 아니라 **자원 보호**다.
#:
#: 아래 정규식은 선형 스캔이고, 이 함수는 제품의 유일한 자유 입력 지점이다.
#: 사전 검사가 없으면 보내는 만큼 스캔하게 된다.
#:
#: 접기(collapse)는 문자열을 임의로 줄일 수 있다 — 공백 100만 개는 한 글자가
#: 되거나 아예 사라진다. 그래서 "스캔 비용을 막으면서 동시에 어차피 거절될 것만
#: 거절한다"를 둘 다 만족하는 원문 길이 상한은 존재하지 않는다. 이 상한은 그
#: 트레이드오프에서 **스캔 비용 쪽을 택한** 것이고, 공백이 잔뜩 붙은 짧은 질문이
#: 여기서 거절되는 것은 의도된 부수 효과다.
MAX_RAW_TEXT = MAX_FREE_TEXT * 20


class QuestionRejectedError(ValueError):
    """자유 입력이 규칙에 맞지 않는다.

    **사용자가 쓴 문장을 메시지에 넣지 않는다** — 이 문자열은 로그로 나간다.
    `PolicyError` 가 걸린 문장을 메시지에서 빼는 것과 같은 계약이다.
    """

    def __init__(self, reason: str) -> None:
        super().__init__(f"추가 질문이 거절되었습니다: {reason}")
        self.reason = reason


#: 제어문자(Cc)·서식문자(Cf)·공백을 한 칸으로 접는다.
#:
#: 파이썬 `re` 는 `\p{Cc}` 를 모르므로 해당 범위를 직접 적는다. `\s` 가 이미
#: 대부분의 공백을 덮고, 나머지는 C0/C1 제어 범위와 zero-width·bidi 계열이다.
_COLLAPSE_RE = re.compile(
    r"[\s\x00-\x1f\x7f-\x9f​-‏  ‪-‮⁠-⁤﻿]+"
)


def normalize_free_text(raw: str) -> str:
    """자유 입력을 한 줄짜리 안전한 문자열로 정제한다.

    개행과 제어문자를 공백으로 접는 것이 핵심이다: 프롬프트에서 질문은 구분 블록
    안에 들어가는데, 개행이 살아 있으면 그 블록을 시각적으로 빠져나와 **새 지시처럼
    보이는 줄**을 만들 수 있다. 한 줄로 만들면 그 수법이 사라진다.

    이것만으로 인젝션이 끝나지는 않는다 — 최종 방어선은 출력단의 `validate_answer` 다.
    """
    if len(raw) > MAX_RAW_TEXT:
        raise QuestionRejectedError("too long")
    collapsed = _COLLAPSE_RE.sub(" ", raw).strip()
    if len(collapsed) < _MIN_FREE_TEXT:
        raise QuestionRejectedError("too short")
    if len(collapsed) > MAX_FREE_TEXT:
        raise QuestionRejectedError("too long")
    return collapsed
