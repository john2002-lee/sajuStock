"""LLM 사용량의 순수 표현. I/O 없음.

## 왜 dataclass 하나를 위해 파일을 두나

`integrations/llm.py` 가 사용량을 만들고 `services`·`repositories` 가 그것을 저장한다.
그런데 **integrations 는 repositories 를 import 할 수 없다** — 의존이 위로 흐른다
(`back/README.md` 계층 구조). 그래서 둘 다 아래를 보게 하려면 두 계층이 공유할 타입이
가장 아래(`domain`)에 있어야 한다. `schemas` 에 두지 않은 것은 integrations 가 지금껏
`core` 와 `domain` 만 import 해 온 규칙을 깨지 않기 위해서다.

## 사고 토큰은 **출력이다**

Gemini 는 생각(thinking)에 쓴 토큰을 출력으로 과금한다. `saju-llm-cost.xlsx` 의 실측에
따르면 `llm_effort=medium` 에서 사고가 과금 출력의 절반을 넘는다 — 출력과 합쳐 한 칸에
넣으면 비용이 어디서 나는지 안 보인다. 그래서 **따로 든 채로** 저장하고, 합산은 보는
쪽에서 한다.
"""

from dataclasses import dataclass, fields

#: 프로바이더가 주지 않는 값은 0 이다. `None` 을 쓰면 합산하는 쪽마다 분기가 생기고,
#: "안 왔다" 와 "0 이었다" 를 구분해 봐야 할 일이 이 도메인에는 없다.
_MISSING = 0


@dataclass(frozen=True, slots=True)
class LlmTokens:
    """호출 한 건의 토큰 사용량."""

    #: 프롬프트. 이 저장소는 프롬프트가 거의 고정이라 표본마다 값이 비슷하다
    input_tokens: int = _MISSING
    #: 본문 출력. **사고 토큰은 여기 포함되지 않는다** (모듈 주석)
    output_tokens: int = _MISSING
    #: 사고(thinking). 과금은 출력과 같은 단가다
    reasoning_tokens: int = _MISSING
    #: 캐시에서 읽은 입력. 입력 토큰의 부분집합이라 합계에 더하지 않는다
    cache_read_tokens: int = _MISSING
    #: 프로바이더가 셈한 합계. 오지 않으면 입력+출력+사고로 채운다
    total_tokens: int = _MISSING

    @classmethod
    def from_usage(cls, usage: dict[str, int]) -> "LlmTokens":
        """프로바이더 어휘로 옮겨진 dict 에서 만든다. 모르는 키는 버린다.

        버리는 것이 의도다 — SDK 가 필드를 늘렸을 때 `TypeError` 로 **LLM 호출 자체가
        죽는 것**보다, 새 숫자를 한동안 놓치는 편이 낫다. 계측이 판단을 죽이면 안
        된다는 `llm._record` 의 원칙과 같다.
        """
        known = {f.name for f in fields(cls)}
        value = cls(**{k: v for k, v in usage.items() if k in known})

        if value.total_tokens:
            return value
        summed = value.input_tokens + value.output_tokens + value.reasoning_tokens
        return cls(
            input_tokens=value.input_tokens,
            output_tokens=value.output_tokens,
            reasoning_tokens=value.reasoning_tokens,
            cache_read_tokens=value.cache_read_tokens,
            total_tokens=summed,
        )

    @property
    def empty(self) -> bool:
        """셈할 것이 없다. 실패·거절 응답이 여기 해당한다."""
        return self.total_tokens <= 0
