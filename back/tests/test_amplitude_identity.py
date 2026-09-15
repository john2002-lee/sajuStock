"""Amplitude 이벤트가 **버려지지 않는다**는 불변식.

## 왜 이 파일이 있나

Amplitude Python SDK 는 `user_id` 와 `device_id` 가 **둘 다 비면 이벤트를 버린다**
(`amplitude/plugin.verify_event`). 버릴 때 예외도 재시도도 없고 로그에
`Invalid event` 한 줄이 남을 뿐이라, 계측이 전량 실패해도 화면·API·테스트 어디에도
흔적이 없다. 실제로 사주 LLM 계측이 그 상태였다 — 토큰·지연·오류가 **한 건도**
Amplitude 에 도착하지 않는데 아무도 몰랐다.

그래서 여기서 지키는 것은 숫자가 아니라 **"신원이 비어 있지 않다"** 한 줄이다.
"""

from app.integrations import amplitude


class TestIdentity:
    def test_anonymous_gets_a_device_id(self) -> None:
        """**이 테스트가 이 파일의 존재 이유다.** 사주는 로그인이 없다."""
        identity = amplitude._identity(None)

        assert identity["user_id"] is None
        assert identity["device_id"]

    def test_known_user_keeps_its_id_and_needs_no_device(self) -> None:
        """주식 경로는 소유자 키를 들고 온다 — 거기에 가짜를 덧붙이지 않는다."""
        identity = amplitude._identity("user:abc")

        assert identity["user_id"] == "user:abc"
        assert identity["device_id"] is None

    def test_one_of_the_two_is_always_filled(self) -> None:
        """SDK 가 요구하는 유일한 조건. 빈 문자열도 신원이 아니다."""
        for user_id in (None, "", "user:abc", "anon:xyz"):
            identity = amplitude._identity(user_id)
            assert identity["user_id"] or identity["device_id"], user_id

    def test_throwaway_ids_are_not_reused(self) -> None:
        """신원이 아니라는 뜻이다 — 두 호출을 같은 사람으로 이을 수 없다."""
        seen = {amplitude._identity(None)["device_id"] for _ in range(20)}

        assert len(seen) == 20

    def test_throwaway_ids_are_marked_as_such(self) -> None:
        """대시보드에서 이 접두를 보면 '사람이 아니라 호출 한 건' 이다."""
        assert str(amplitude._identity(None)["device_id"]).startswith("throwaway:")
