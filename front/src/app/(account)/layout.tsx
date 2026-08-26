import { Footer } from "@/shared/components/layout/Footer";

/**
 * 계정 셸 — `/login` · `/signup` · `/verify` 가 공유한다.
 *
 * 라우트 그룹 `(account)` 는 URL 에 나타나지 않는다. 주소는 `/login` 그대로다.
 *
 * **어느 서비스에도 속하지 않는 화면들이다.** 로그인은 주식 대시보드로 가는
 * 문이기도 하고 사주 성향을 계정에 묶는 문이기도 하다. 그래서 푸터도 한쪽 면책을
 * 고르지 않고 둘 다 짧게 든다(`service="both"`).
 *
 * 관리자(`/admin`)는 여기 넣지 않았다. 계정 흐름이 아니라 운영 화면이고,
 * `proxy.ts` 와 `requireAdmin()` 이 앞뒤로 막는 별도의 문이다.
 */
export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <Footer service="both" />
    </>
  );
}
