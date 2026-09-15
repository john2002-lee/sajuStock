import { SajuEntry } from "@/features/saju";
import { getBirthPlaces } from "@/features/saju/server";
import type { Metadata } from "next";

/**
 * `/` — **제품의 첫 화면이자 사주 입력 화면.**
 *
 * ## 왜 루트가 사주인가
 *
 * 여기에는 서비스 선택 화면이 있었다(주식이냐 사주냐를 묻는 카드 둘). 주식 서비스가
 * 개발 전용으로 내려가면서 그 갈림길은 **한쪽에 문이 없는 갈림길**이 됐다 — 고를 것이
 * 하나뿐인 화면은 한 번 더 누르게 만들 뿐이다.
 *
 * ## 왜 `/saju` 에서 리다이렉트하지 않고 화면을 옮겼나
 *
 * 리다이렉트로 두면 `aiot21.com` 을 연 사람이 매번 왕복을 한 번 더 하고, 친구에게
 * 보낸 주소와 실제로 열리는 주소가 달라진다. **라우트 그룹 `(saju)` 는 URL 에
 * 나타나지 않으므로** 이 파일이 곧 `/` 이고, 동시에 사주 셸(헤더·금빛 팔레트·푸터)을
 * 그대로 입는다 — 옮기는 데 드는 비용이 사실상 없다.
 *
 * 옛 주소 `/saju` 는 `proxy.ts` 가 307 로 여기 데려다준다. **그 아래**(`/saju/teaser` ·
 * `/saju/report` · `/saju/reports/{token}`)는 그대로다.
 *
 * ## 조립만 한다
 *
 * 페이지는 라우팅만 맡는다(CONVENTIONS). 출생지 목록만 서버에서 미리 받아 넘기고,
 * 흐름은 `features/saju` 가 소유한다.
 *
 * 요청 시 렌더한다. 출생지 목록 자체는 캐시되지만(`getBirthPlaces`), 이 라우트를
 * 정적 프리렌더로 두면 `next build` 가 빌드 머신에서 백엔드에 접속해야 한다.
 */

export const metadata: Metadata = {
  title: "사주팔자",
  description: "진태양시 보정을 적용한 사주팔자. 회원가입 없이 여덟 글자를 확인하세요.",
};

export const revalidate = 0;

export default async function HomePage() {
  const places = await getBirthPlaces();
  return <SajuEntry places={places} />;
}
