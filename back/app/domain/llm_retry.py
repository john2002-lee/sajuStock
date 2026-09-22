"""LLM 재시도 판정. I/O 없음.

## 왜 "재시도 횟수" 한 값으로 끝나지 않나

이 앱에는 이미 재시도 손잡이가 있다 — `llm_max_retries` 다. 그런데 그것을 0 에서
1 로 올리면 설정이 **기동을 거부한다**. `config._llm_must_fit_the_advice_budget` 이
최악 소요를 `llm_timeout_seconds × 시도횟수` 로 보기 때문이다: 45초 × 2 = 90초 는
AI 판단 예산의 소프트 지점(90 × 0.6 = 54초)을 넘는다.

그 계산은 틀리지 않았다. **타임아웃을 재시도하면** 정말로 45초를 두 번 쓴다.

하지만 운영에서 실제로 본 실패는 두 종류였고 성질이 달랐다(2026-09-21 실측):

    504 DEADLINE_EXCEEDED   44초 걸려 실패 — 예산을 이미 다 썼다
    503 UNAVAILABLE          1.7초 만에 실패 — 아무것도 쓰지 않았다

앞을 다시 부르면 예산이 무너지고, 뒤를 다시 부르지 않는 것은 그냥 손해다. 한 번만
더 물었으면 답을 받았을 호출이 간이 리포트로 떨어졌다.

그래서 재시도를 **빨리 실패한 것에만** 건다. 이 모듈은 그 경계를 정하는 순수 함수
하나이고, 그래서 네트워크 없이 시험할 수 있다.

## 무엇을 일시적으로 보는가

    429  RESOURCE_EXHAUSTED  레이트 리밋 — 잠깐 기다리면 풀린다
    500  INTERNAL            프로바이더 내부 오류
    502  BAD_GATEWAY         게이트웨이
    503  UNAVAILABLE         과부하. 운영에서 실제로 본 것

**504 는 넣지 않는다.** 그것은 우리 상한에 걸렸다는 뜻이고, 다시 부르면 같은 시간을
한 번 더 쓴다. 느린 모델은 재시도가 아니라 모델이나 상한을 바꿔야 할 문제다.

4xx 도 넣지 않는다(429 제외). 요청이 잘못된 것을 다시 보내도 같은 답이 온다.
"""

#: 다시 물어볼 가치가 있는 상태 코드. 근거는 모듈 주석에 있다.
TRANSIENT_STATUS: frozenset[int] = frozenset({429, 500, 502, 503})

#: 빨리 실패한 호출 하나가 예산에서 가져갈 수 있다고 보는 시간(초).
#:
#: 실측 1.7~1.9초였다. 넉넉하게 잡아 두는 이유는 이 값이 `config` 의 불변식에
#: 들어가기 때문이다 — 작게 잡으면 불변식이 통과시킨 설정이 실제로는 예산을 넘는다.
FAST_FAILURE_ALLOWANCE_SECONDS: float = 3.0


def is_transient(status_code: object) -> bool:
    """이 상태 코드를 다시 시도할 것인가.

    코드를 못 읽는 오류(`None`·문자열 등)는 **재시도하지 않는다.** 무엇이 잘못됐는지
    모르는 채로 다시 부르면, 되풀이되는 실패를 두 배로 만들 뿐이다.
    """
    return isinstance(status_code, int) and status_code in TRANSIENT_STATUS


def worst_case_seconds(
    *,
    timeout_seconds: float,
    max_retries: int,
    transient_retries: int,
    backoff_seconds: float,
) -> float:
    """호출 하나가 최악의 경우 쓰는 시간.

    최악은 "빨리 실패한 뒤 마지막 시도가 상한까지 가는" 모양이다 — 일시 실패는
    `FAST_FAILURE_ALLOWANCE_SECONDS` 씩, 마지막 한 번은 타임아웃 전부를 쓴다.

    `config` 의 불변식이 이 값을 AI 판단 예산과 비교한다. 계산을 그쪽에 인라인으로
    두지 않는 이유는 여기서 시험할 수 있게 하기 위해서다.
    """
    sdk_attempts = timeout_seconds * (max_retries + 1)
    transient = transient_retries * (FAST_FAILURE_ALLOWANCE_SECONDS + backoff_seconds)
    return sdk_attempts + transient
