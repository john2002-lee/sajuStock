"""접속 기록 엔드포인트.

## 관리자 라우터가 아니라 여기 있는 이유

**기록은 일반 사용자 경로다.** 모든 방문자가 부르고, 관리자 키는 없다. 조회
(`GET /admin/visits`)만 관리자 라우터에 있고 `X-Admin-Key` 로 잠긴다 — 쓰는 쪽과
읽는 쪽의 권한이 정반대이므로 파일을 나눈다.

관심종목과 같은 층이고 같은 신원 규약을 쓴다: `X-Owner-Key` 하나가 방문자를 정하고,
그 값은 프런트 BFF 가 **httpOnly 쿠키에서 옮겨 붙인다**. 브라우저 JS 는 그 쿠키를
읽을 수 없으므로 남의 키로 숫자를 부풀릴 수 없다.

## 응답에 아무것도 담지 않는다

비콘이 부르는 자리다. 화면이 이 응답으로 무엇을 그리지 않으므로 본문을 만들 이유가
없고, 204 면 프런트가 파싱을 시도하지도 않는다. 실패해도 화면은 아무 일 없이
돌아가야 한다 — 통계가 서비스를 죽이면 안 된다.
"""

from fastapi import APIRouter, status

from app.api.deps import OwnerKey, VisitRepo

router = APIRouter(prefix="/visits", tags=["visits"])


@router.post(
    "/touch",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="접속 기록 (하루 1회 · 멱등)",
)
async def touch_visit(repo: VisitRepo, owner: OwnerKey) -> None:
    """이 방문자의 오늘 접속을 기록한다.

    **몇 번 불려도 결과가 같다.** 같은 날 두 번째부터는 행을 늘리지 않고
    `last_seen_at` 을 밀고 `hits` 를 올린다. 그래서 프런트의 중복 방지
    (`VisitBeacon` 의 탭당 1회)는 요청을 아끼기 위한 것이고 정확성의 근거가 아니다 —
    그 보장이 깨져도 숫자가 틀어지지 않는다.

    날짜는 **KST 기준**으로 저장한다 (`domain/visits.korean_date`). UTC 로 두면
    한국 저녁 접속이 다음 날 몫으로 세어지고, 오류는 나지 않는다.
    """
    await repo.touch(owner)
