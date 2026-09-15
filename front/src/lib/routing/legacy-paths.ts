/**
 * 옮겨 간 주소를 새 자리로 보낸다.
 *
 * ## 왜 이 파일이 따로 있나 — `proxy.ts` 안에 적으면 테스트할 수 없다
 *
 * 프런트의 테스트 러너는 `node --test` 에 `src/**​/*.test.ts` 글롭 하나다
 * (`package.json`). `proxy.ts` 를 직접 부르려면 `NextRequest` 를 만들어야 하고
 * 그것은 Next 런타임을 끌고 온다. **판정만** 순수 함수로 떼어 두면 경계 조건을
 * 값으로 확인할 수 있고, `proxy.ts` 는 이 함수를 부르기만 한다.
 *
 * ## 접두 일치로 적지 않는 이유 — 결제한 사람이 산 것을 잃는다
 *
 * `/saju` 는 루트로 옮겨 갔지만 그 **아래**는 그대로다. 특히
 * `/saju/reports/{token}` 은 **주소 자체가 자격 증명**이라 그것을 루트로 튕기면
 * 구매자가 리포트에 닿을 길이 사라진다. 오류도 뜨지 않는다 — 입력 화면이 뜰
 * 뿐이라 사용자는 무슨 일이 일어났는지 알 수 없다.
 *
 * 그래서 **정확히 일치**만 본다. 끝의 슬래시 하나는 같은 주소로 취급한다.
 */

/** 옮겨 간 주소 → 새 주소. 늘어나면 여기 한 줄씩 는다. */
const MOVED: Readonly<Record<string, string>> = {
  // 사주가 제품의 메인이 되면서 입력 화면이 루트로 올라왔다
  // (`app/(saju)/page.tsx`). 예전 주소로 들어오는 링크·북마크·검색 결과를 받는다.
  "/saju": "/",
};

/**
 * 이 경로가 옮겨 갔으면 새 주소를, 아니면 `null` 을 준다.
 *
 * 받는 값은 `request.nextUrl.pathname` — 쿼리·프래그먼트가 없는 경로뿐이다.
 */
export function legacyRedirect(pathname: string): string | null {
  // 끝의 슬래시만 접는다. `/saju//` 처럼 여러 개인 것은 같은 주소로 보지 않는다 —
  // 정상 링크에서 나올 수 없는 모양이고, 관대할수록 판정이 넓어진다.
  const normalized =
    pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;

  return MOVED[normalized] ?? null;
}
