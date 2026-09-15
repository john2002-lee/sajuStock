import type { Metadata } from "next";
import { SearchProvider } from "@/features/stock/search";
import { AmplitudeProvider, VisitBeacon } from "@/shared/analytics";
import { SessionProvider } from "@/shared/auth/SessionProvider";
import { QueryProvider } from "@/shared/query";
import { ThemeProvider } from "@/shared/theme";
import { getServerTheme } from "@/shared/theme/server";
import { fontVars } from "./fonts";
import "./globals.css";

/**
 * 두 서비스의 공통 껍데기다.
 *
 * 여기 적힌 제목은 **서비스 그룹 밖 화면에만** 걸린다 — 404 · 루트 오류 · 관리자 ·
 * 계정 · 법적 문서. 사주(`(saju)`)와 주식(`(stock)`)은 각자 자기 레이아웃에서
 * `absolute` 로 덮는다.
 *
 * 제품 이름은 **FEEL** 이다. 예전에는 여기 기본값이 "종목 원장 · The Stock Ledger"
 * 였는데, 주식이 개발 전용으로 내려가고 사주가 메인이 되면서 그 이름이 제품 전체를
 * 대표하지 않게 됐다 — 404 를 만난 사주 사용자가 주식 서비스 이름을 탭 제목으로
 * 보는 상태였다.
 */
export const metadata: Metadata = {
  /**
   * OG 이미지·canonical 처럼 **절대 URL 이 필요한 필드**가 상대 경로를 쓸 수 있게
   * 하는 기준점이다. 이것이 없으면 상대 경로는 빌드 에러이고, `opengraph-image`
   * 파일 규약이 만드는 주소도 기준을 잃는다(Next 16 `generate-metadata.md`).
   *
   * `new URL()` 은 잘못된 값에 던진다. 빌드가 그 자리에서 죽는 것이 낫다고 볼 수도
   * 있지만, 여기서 죽으면 **환경 변수 오타 하나로 배포 전체가 멈춘다** — 그리고 이
   * 값이 틀렸을 때 실제로 나빠지는 것은 미리보기 카드 하나뿐이다. 그래서 못 읽으면
   * 로컬 주소로 내려간다.
   */
  metadataBase: resolveMetadataBase(),
  title: {
    default: "FEEL · 사주팔자",
    // 서비스 레이아웃이 각자 자기 템플릿을 두므로 여기 템플릿은 그룹 밖 화면
    // (404 · 관리자 · 계정 · 법적 문서)에만 걸린다.
    template: "%s · FEEL",
  },
  description:
    "진태양시 보정을 적용한 사주팔자. 회원가입 없이 여덟 글자를 확인하세요.",

  /**
   * 카톡·슬랙·문자에 링크가 붙었을 때 뜨는 카드.
   *
   * ## 왜 생겼나 — 공유 기능의 **결과물은 친구의 채팅창**이다
   *
   * 여기에는 `openGraph` 가 한 줄도 없었다. 그 상태로 주소를 카톡에 붙이면 제목
   * 한 줄에 이미지 없는 회색 상자가 뜬다. 링크를 받은 사람이 열어 볼 이유를 못
   * 찾으므로, 공유 버튼(`features/saju/components/ShareButton.tsx`)만 만들고 이것을
   * 두지 않으면 기능이 절반만 완성된다.
   *
   * 이미지는 적지 않는다 — `app/opengraph-image.tsx` 파일 규약이 자동으로 잇는다.
   */
  openGraph: {
    type: "website",
    siteName: "FEEL",
    locale: "ko_KR",
    url: "/",
    title: "FEEL · 사주팔자",
    description: "진태양시 보정을 적용한 사주팔자. 회원가입 없이 여덟 글자를 확인하세요.",
  },
};

/**
 * `NEXT_PUBLIC_APP_ORIGIN` 을 `URL` 로. 못 읽으면 로컬 주소다 (위 주석).
 *
 * `lib/config/public` 의 `APP_ORIGIN` 을 쓰지 않고 직접 읽는다 — 그쪽은 클라이언트
 * 번들용 경계이고 여기는 서버에서 한 번 도는 설정이라, 굳이 그 모듈을 루트
 * 레이아웃의 의존성으로 만들 이유가 없다.
 */
function resolveMetadataBase(): URL {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
}

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

        {/* 분석 초기화. 아무것도 그리지 않으므로 프로바이더 중첩 밖에 둔다 —
            위 트리의 어느 컴포넌트도 이것을 구독하지 않는다. */}
        <AmplitudeProvider />

        {/* 접속 1회를 **우리 DB** 에 남긴다. 위 Amplitude 와 겹치지 않는다 —
            그쪽 값은 우리 DB 에 없어서 관리자 화면이 조회할 수도, `users` 와
            조인해 "이 회원이 마지막으로 언제 왔나" 를 말할 수도 없다.
            같은 이유로 프로바이더 밖이다 (`VisitBeacon` 주석). */}
        <VisitBeacon />

        {/* 푸터는 여기 없다. 고지 문장이 서비스마다 다르므로 서비스 레이아웃이
            각자 붙인다 (`shared/components/layout/Footer.tsx` 의 `service` 절).
            그룹 밖 화면(서비스 선택·404·오류·관리자)은 직접 든다. */}
      </body>
    </html>
  );
}
