import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getSharedVerdict } from "@/features/stock/advice/server";

/**
 * 공유 링크의 미리보기 카드.
 *
 * ## 왜 필요한가
 *
 * 공유 링크가 카카오톡·슬랙·트위터에 붙으면 **제목 한 줄만** 뜬다. 이 제품이
 * 공유할 값이 있는 것은 판정 그 자체라, 그것이 카드에 보이지 않으면 링크를 받은
 * 사람은 열어 볼 이유를 못 찾는다.
 *
 * ## 폰트를 저장소에 넣었다
 *
 * `ImageResponse`(satori)는 **`ttf`·`otf`·`woff` 만 읽는다 — `woff2` 는 못 읽는다**
 * (`docs/.../image-response.md`). `next/font` 가 빌드 때 내려받는 것은 woff2 라
 * 그 파일을 재사용할 수 없다. 그리고 폰트가 없으면 한글이 **빈 네모로** 렌더된다 —
 * 종목명이 사라진 카드는 없는 것보다 나쁘다.
 *
 * 그래서 Gothic A1 ExtraBold ttf 한 벌(2.2MB)을 `front/assets/` 에 둔다. 런타임에
 * Google Fonts 를 부르는 방법도 있지만, 공유 카드를 그릴 때마다 외부 왕복이 붙고
 * 그쪽이 느리면 미리보기가 통째로 빈다.
 *
 * ## `alt` 를 종목명으로 만들지 않았다
 *
 * 이 파일은 정적 export 라 `alt` 안에서 종목을 알 수 없다(그건 아래 함수가
 * `params` 를 받아야 안다). 카드를 볼 수 없는 사람에게 "AI 판단 카드" 라고만
 * 말하는 편이, 링크마다 틀린 종목명을 말하는 것보다 낫다.
 */

export const alt = "AI 종합 판단 카드";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** 판정 → 색. 화면(`VerdictHistory`)과 같은 규약 — **등락색을 쓰지 않는다.** */
const TONE: Record<string, string> = {
  BUY: "#1ea381",
  WATCH: "#9aa0a6",
  AVOID: "#b58629",
};

export default async function Image({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const [{ shareId }, font] = await Promise.all([
    params,
    // `process.cwd()` 는 Next 프로젝트 디렉터리(= front/)다.
    readFile(join(process.cwd(), "assets/GothicA1-ExtraBold.ttf")),
  ]);

  const verdict = await getSharedVerdict(shareId);

  // 없는 링크에도 카드를 낸다 — 여기서 예외를 던지면 미리보기가 깨진 이미지가
  // 되고, 그건 "링크가 틀렸다" 를 말해 주지 않는다.
  const decision = verdict?.decision ?? "—";
  const name = verdict?.name ?? "AI 종합 판단";
  const confidence = verdict?.confidence ?? 0;
  const tone = TONE[decision] ?? "#f2f3f5";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          // 다크 팔레트의 종이색. 카드가 제품과 같은 바탕이어야 열었을 때
          // 같은 곳으로 왔다는 느낌이 든다.
          background: "#0a0b0e",
          color: "#f2f3f5",
          padding: "72px 80px",
          fontFamily: "GothicA1",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", fontSize: 28, color: "#9aa0a6", letterSpacing: 4 }}>
            3 AGENTS → 1 DECISION
          </div>
          <div style={{ display: "flex", fontSize: 52, color: "#c9ccd2" }}>{name}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 32 }}>
            <div style={{ display: "flex", fontSize: 160, lineHeight: 1, color: tone }}>
              {decision}
            </div>
            <div style={{ display: "flex", fontSize: 40, color: "#9aa0a6" }}>
              신뢰도 {confidence}%
            </div>
          </div>

          {/* 신뢰도 5칸 미터 — 화면의 `Meter` 와 같은 20%p 단위다.
              satori 는 flex 만 지원하므로 칸을 직접 그린다. */}
          <div style={{ display: "flex", gap: 10 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  height: 12,
                  flex: 1,
                  background:
                    i < Math.floor(confidence / 20) ? "#ff5449" : "rgba(242,243,245,0.18)",
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 26, color: "#6b7280", letterSpacing: 3 }}>
          THE STOCK LEDGER · 투자 권유가 아닙니다
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "GothicA1", data: font, style: "normal", weight: 800 }],
    },
  );
}
