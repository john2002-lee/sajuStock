import type { Metadata } from "next";
import { SearchProvider } from "@/features/stock/search";
import { SessionProvider } from "@/shared/auth/SessionProvider";
import { QueryProvider } from "@/shared/query";
import { ThemeProvider } from "@/shared/theme";
import { getServerTheme } from "@/shared/theme/server";
import { fontVars } from "./fonts";
import "./globals.css";

/**
 * 두 서비스의 공통 껍데기다. **서비스 하나를 설명하지 않는다** — 여기 적힌 제목이
 * 서비스 선택 화면(`/`)의 제목이고, 주식·사주 각각의 제목은 서비스 레이아웃이
 * 템플릿으로 덮는다(`app/(stock)/layout.tsx` · `app/(saju)/layout.tsx`).
 */
export const metadata: Metadata = {
  title: {
    default: "종목 원장 · The Stock Ledger",
    // 서비스 레이아웃이 각자 자기 템플릿을 두므로 여기 템플릿은 그룹 밖 화면
    // (서비스 선택 · 404 · 관리자)에만 걸린다.
    template: "%s · 종목 원장",
  },
  description:
    "시장을 읽는 주식 서비스와 당신을 읽는 사주 서비스. 두 축을 따로 놓고 봅니다.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 쿠키에서 테마를 읽어 첫 HTML 에 그대로 담는다. 인라인 스크립트로 하이드레이션
  // 전에 DOM 을 고치던 방식과 달리 서버·클라이언트가 처음부터 같은 값을 본다 —
  // 깜빡임도, 하이드레이션 불일치도 없어 suppressHydrationWarning 이 필요 없다.
  const { preference, theme } = await getServerTheme();

  return (
    <html
      lang="ko"
      className={`${fontVars} h-full`}
      data-theme={theme === "terminal" ? "terminal" : undefined}
    >
      <body className="flex min-h-full flex-col">
        {/* 순서: 세션 → 쿼리 캐시 → 테마 → 전역 검색.
            검색 팔레트가 쿼리 캐시를 쓰므로 QueryProvider 안쪽에 있어야 한다.

            `SearchProvider` 는 주식 서비스 것이지만 여기 남는다. 팔레트는 열렸을
            때만 마운트되므로 닫혀 있는 동안 비용이 없고, `SearchTrigger` 를 쓰는
            화면이 `(stock)` 밖에도 있다 — 404 가 그렇다. 프로바이더를 그룹 안으로
            내리면 그 화면에서 `useSearch()` 가 던진다. */}
        <SessionProvider>
          <QueryProvider>
            <ThemeProvider initialPreference={preference} initialTheme={theme}>
              <SearchProvider>{children}</SearchProvider>
            </ThemeProvider>
          </QueryProvider>
        </SessionProvider>

        {/* 푸터는 여기 없다. 고지 문장이 서비스마다 다르므로 서비스 레이아웃이
            각자 붙인다 (`shared/components/layout/Footer.tsx` 의 `service` 절).
            그룹 밖 화면(서비스 선택·404·오류·관리자)은 직접 든다. */}
      </body>
    </html>
  );
}
