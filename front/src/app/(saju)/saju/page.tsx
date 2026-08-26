import { SajuEntry } from "@/features/saju";
import { getBirthPlaces } from "@/features/saju/server";
import type { Metadata } from "next";

/**
 * 사주 입력 화면 — 사주 서비스의 첫 화면.
 *
 * 페이지는 조립만 한다(CONVENTIONS: app/ 은 라우팅만). 출생지 목록만 서버에서
 * 미리 받아 넘기고, 흐름은 `features/saju` 가 소유한다.
 *
 * 요청 시 렌더한다. 출생지 목록 자체는 캐시되지만(`getBirthPlaces`), 이 라우트를
 * 정적 프리렌더로 두면 `next build` 가 빌드 머신에서 백엔드에 접속해야 한다.
 */

export const metadata: Metadata = {
  title: "사주팔자",
  description: "진태양시 보정을 적용한 사주팔자. 회원가입 없이 여덟 글자를 확인하세요.",
};

export const revalidate = 0;

export default async function SajuPage() {
  const places = await getBirthPlaces();
  return <SajuEntry places={places} />;
}
