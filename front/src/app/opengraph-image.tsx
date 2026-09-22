import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * 링크 미리보기 카드 — **친구 공유 기능의 실제 결과물.**
 *
 * ## 왜 필요한가
 *
 * 공유 버튼(`features/saju/components/ShareButton.tsx`)이 보내는 것은 주소 하나다.
 * 그 주소가 카톡·문자·슬랙에 붙었을 때 뜨는 것이 이 카드이고, 이것이 없으면 회색
 * 상자에 제목 한 줄만 뜬다 — 링크를 받은 사람이 **열어 볼 이유를 못 찾는다.**
 * 버튼만 만들고 이것을 두지 않으면 기능이 절반만 완성된다.
 *
 * ## 루트 세그먼트에 둔다
 *
 * `app/` 에 두면 `/` 와 그 아래 전부가 이것을 물려받는다(Next 16
 * `opengraph-image.md`). 사주 화면이 루트로 올라왔으므로 이 자리가 곧 공유되는
 * 주소의 자리다. 라우트 그룹 폴더(`app/(saju)/`)가 아니라 여기인 것은, 그룹은
 * 세그먼트가 아니어서 규약이 `/` 에 확실히 걸린다고 보장되지 않기 때문이다.
 *
 * ## 폰트를 저장소에 넣어 둔 것을 쓴다
 *
 * `ImageResponse`(satori)는 **`ttf`·`otf`·`woff` 만 읽는다 — `woff2` 는 못 읽는다.**
 * `next/font` 가 받아 두는 것은 woff2 라 재사용할 수 없고, 폰트가 없으면 한글이
 * **빈 네모로** 렌더된다. 제목이 사라진 카드는 없는 것보다 나쁘다.
 * `/verdict/[shareId]` 의 카드가 이미 같은 파일을 쓴다.
 *
 * ## 정적이다
 *
 * 개인화할 것이 없다 — 공유되는 것은 누구의 결과도 아닌 **사이트 주소**이기
 * 때문이다(`features/saju/model/share.ts`). 그래서 `params` 도, 조회도 없다.
 */

export const alt = "AI Of Tellers · 진태양시 보정을 적용한 사주팔자";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** 사주 팔레트(FEEL Bright)의 값 그대로 — `globals.css` 의 `--saju-*`. */
const PAPER = "#fbf7ef";
const WARM = "#f4ebda";
const GOLD = "#7a5310";
const GOLD_SOFT = "#96691c";
const BODY = "#433d35";
const MUTED = "#6b6357";
const HAIRLINE = "rgba(176, 132, 50, 0.28)";

/** 오행 다섯 색. 카드 아래 띠 하나로 "무엇에 대한 사이트인지" 를 말한다. */
const WUXING = ["#3f7a52", "#b4452f", "#9a7b33", "#8a8f96", "#35597f"];

/** 제호의 AIOT 강조색 = 오행의 수(水). 화면 쪽 `BrandName` 과 같은 값이다. */
const WATER = WUXING[4];

export default async function Image() {
  // `process.cwd()` 는 Next 프로젝트 디렉터리(= front/)다.
  const font = await readFile(join(process.cwd(), "assets/GothicA1-ExtraBold.ttf"));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          // 제품과 같은 바탕이어야 카드를 누르고 들어왔을 때 같은 곳으로 왔다는
          // 느낌이 든다.
          background: PAPER,
          color: BODY,
          padding: "76px 84px",
          fontFamily: "GothicA1",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* 제호. 화면의 `BrandName` 과 같은 규칙으로 AIOT 네 글자만 수(水) 색이다.
              여기서는 컴포넌트를 쓸 수 없어(satori 는 인라인 스타일만 읽는다) 같은
              조판을 손으로 짠다 — 낱말 사이는 `gap` 이 띄운다. */}
          <div style={{ display: "flex", fontSize: 46, gap: 13, color: MUTED }}>
            <div style={{ display: "flex", color: WATER }}>AI</div>
            <div style={{ display: "flex" }}>
              <div style={{ display: "flex", color: WATER }}>O</div>
              <div style={{ display: "flex" }}>f</div>
            </div>
            <div style={{ display: "flex" }}>
              <div style={{ display: "flex", color: WATER }}>T</div>
              <div style={{ display: "flex" }}>ellers</div>
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 24, color: MUTED, letterSpacing: 8 }}>
            SAJU
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", fontSize: 92, lineHeight: 1.18, color: BODY }}>
              당신의 사주팔자,
            </div>
            {/* 첫 화면 h1 과 **같은 문장이어야 한다**(`SajuEntry`). 공유 카드가
                사이트와 다른 말을 하면, 링크를 눌러 들어온 사람이 다른 곳에
                도착했다고 느낀다. */}
            <div style={{ display: "flex", fontSize: 92, lineHeight: 1.18, color: GOLD }}>
              시간부터 바로잡습니다
            </div>
          </div>

          <div style={{ display: "flex", fontSize: 32, color: MUTED }}>
            태어난 시각을 진태양시로 바로잡아 계산합니다
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `2px solid ${HAIRLINE}`,
            paddingTop: 28,
          }}
        >
          <div style={{ display: "flex", fontSize: 28, color: GOLD_SOFT }}>
            회원가입 없이 · 여덟 글자까지 무료
          </div>

          {/* 오행 다섯 칸. satori 는 flex 만 지원하므로 칸을 직접 그린다 —
              `/verdict` 카드의 미터와 같은 수법이다. */}
          <div style={{ display: "flex", gap: 10 }}>
            {WUXING.map((color) => (
              <div
                key={color}
                style={{
                  display: "flex",
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  background: color,
                  border: `3px solid ${WARM}`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "GothicA1", data: font, style: "normal", weight: 800 }],
    },
  );
}
