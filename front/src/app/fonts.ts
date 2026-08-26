import { Gothic_A1, IBM_Plex_Mono, IBM_Plex_Sans_KR } from "next/font/google";

/**
 * 서체 셋을 CSS 변수로 주입한다. globals.css 의 @theme 이 이 변수를 받아
 * `font-display` / `font-sans-kr` / `font-mono` 유틸로 노출한다.
 *
 * ## 넷에서 셋으로 — 명조를 걷어냈다
 *
 * 예전에는 헤드라인이 **Noto Serif KR**(명조), 영문 부제가 **Instrument Serif**
 * 였다. 신문 지면 은유의 핵심이었고, 리뉴얼이 폐기하는 것이 정확히 그 은유다
 * (기획 §3.5). 다크 배경 · 라임 액센트 · 14px 라운드 위에 명조가 오면
 * "옛날 것과 요즘 것" 이 섞여 어느 쪽도 아니게 된다.
 *
 * 영문 부제 서체는 **대체하지 않고 없앴다.** 그 자리(에이전트 영문명 ·
 * "Watchlist")는 이 앱이 이미 영문 라벨에 쓰던 mono 로 간다 — `STOCK` ·
 * `final decision` 과 같은 어휘라, 서체를 하나 더 두는 것보다 일관된다.
 *
 * ## Pretendard 가 아닌 이유
 *
 * 한국어 MZ UI 의 사실상 표준이지만 **Google Fonts 에 없다.** self-host 하려면
 * woff2 를 저장소에 넣고 `next/font/local` 로 잡아야 하는데, 그 대가보다
 * `next/font` 규약을 지키는 편을 골랐다.
 *
 * ## subsets 에 "korean" 을 넣을 수 없다
 *
 * next/font 메타데이터상 Gothic A1 과 IBM Plex Sans KR 은 latin / latin-ext 만
 * 선언한다(실측 확인). 한글 글리프는 unicode-range 로 자체 호스팅되어 정상
 * 표시되지만 preload 대상은 아니다. display:swap 으로 덮는다.
 */

/**
 * 헤드라인 · 종목명 · AI 판정. **800 이 기본이고 900 은 판정 한 곳**을 위한 것이다.
 *
 * 이름이 `display` 인 이유: 예전 유틸은 `font-serif-kr` 이었는데 명조를 걷어낸
 * 뒤로는 그 이름이 거짓이 된다. 서체가 또 바뀌어도 "화면에서 가장 큰 글자" 라는
 * 역할은 그대로라, 역할로 이름을 둔다.
 */
export const displayKR = Gothic_A1({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-display-kr",
  display: "swap",
});

export const plexSansKR = IBM_Plex_Sans_KR({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-plex-sans-kr",
  display: "swap",
});

export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const fontVars = [displayKR.variable, plexSansKR.variable, plexMono.variable].join(
  " ",
);
