import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getSharedReading } from "@/features/saju/server";

/**
 * 공유된 사주의 링크 미리보기 카드 — **이 기능의 실제 결과물.**
 *
 * ## 이것이 없으면 링크 공유는 절반만 완성된다
 *
 * 주소를 카톡에 붙였을 때 뜨는 것이 이 카드다. 없으면 루트의 정적 카드(사이트
 * 소개)가 뜨는데, 그러면 **누구의 사주를 보냈든 같은 그림**이 뜬다 — 받는 사람이
 * 열어 볼 이유가 링크 주인과 아무 상관이 없어진다. 여덟 글자가 미리보기에 보이는
 * 것이 이 기능의 전부다.
 *
 * `/verdict/[shareId]/opengraph-image.tsx` 가 이 저장소의 유일한 동적 카드였고,
 * 이것이 둘째다. 같은 규칙을 따른다.
 *
 * ## 폰트를 저장소에 넣어 둔 것을 쓴다
 *
 * `ImageResponse`(satori)는 **`ttf`·`otf`·`woff` 만 읽는다 — `woff2` 는 못 읽는다.**
 * `next/font` 가 받아 두는 것은 woff2 라 재사용할 수 없고, 폰트가 없으면 한글이
 * **빈 네모로** 렌더된다. 여덟 글자가 네모로 나온 카드는 없는 것보다 나쁘다.
 *
 * ## 못 찾아도 그린다
 *
 * 만료·오타로 `null` 이 와도 던지지 않고 자리값으로 그린다. 미리보기 요청이
 * 500 이면 카톡은 **카드를 통째로 빼고** 제목 한 줄만 띄운다 — 링크가 깨진 것처럼
 * 보인다. `/verdict` 카드가 같은 판단을 했다.
 *
 * ## `revalidate = 0`
 *
 * `opengraph-image` 는 Route Handler 이고 **기본이 캐시**다(Next 16
 * `opengraph-image.md`: "is cached by default"). 캐시되면 7일이 지나 사라진 사주의
 * 카드가 계속 살아서, 링크는 404 인데 미리보기에는 남의 여덟 글자가 뜨는 상태가
 * 된다. `dynamic = "force-dynamic"` 은 쓰지 않는다 — CONVENTIONS 가 금지한다.
 */

export const revalidate = 0;

export const alt = "공유된 사주 여덟 글자";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** 사주 팔레트(FEEL Bright) — `globals.css` 의 `--saju-*`, 루트 카드와 같은 리터럴. */
const PAPER = "#fbf7ef";
const SURFACE = "#ffffff";
const WARM = "#f4ebda";
const GOLD = "#7a5310";
const GOLD_SOFT = "#96691c";
const BODY = "#433d35";
const MUTED = "#6b6357";
const HAIRLINE = "rgba(176, 132, 50, 0.28)";
const ON_GOLD = "#fbf7ef";

/** 오행 다섯 색. `--wuxing-*` 과 같은 값이다. */
const WUXING_COLOR: Record<string, string> = {
  목: "#3f7a52",
  화: "#b4452f",
  토: "#9a7b33",
  금: "#8a8f96",
  수: "#35597f",
};

const WUXING_ORDER = ["목", "화", "토", "금", "수"] as const;

/**
 * 천간·지지 한 글자의 오행.
 *
 * `model/wuxing.ts` 의 `ganWuxingOf`/`zhiWuxingOf` 를 쓰지 않는다 — 그쪽은 Tailwind
 * **클래스 이름**을 내는 표이고 여기서는 색 리터럴이 필요하다. 한글 독음에서
 * 오행으로 가는 표를 여기 다시 두는 대신, 간지 한 글자에 대해 두 표를 모두
 * 물어보는 작은 함수로 좁혔다.
 */
const GAN_WUXING: Record<string, string> = {
  갑: "목", 을: "목", 병: "화", 정: "화", 무: "토",
  기: "토", 경: "금", 신: "금", 임: "수", 계: "수",
};
const ZHI_WUXING: Record<string, string> = {
  자: "수", 축: "토", 인: "목", 묘: "목", 진: "토", 사: "화",
  오: "화", 미: "토", 신: "금", 유: "금", 술: "토", 해: "수",
};

/** 못 알아본 글자는 본문색으로 떨어뜨린다 — `wuxingClass` 와 같은 규칙이다. */
function colorOf(table: Record<string, string>, char: string): string {
  return WUXING_COLOR[table[char] ?? ""] ?? BODY;
}

const PILLAR_LABELS = ["년주", "월주", "일주", "시주"];
const DAY_PILLAR_INDEX = 2;

export default async function Image({
  params,
}: {
  // Next 16 에서 `params` 는 Promise 다 (`opengraph-image.md`).
  params: Promise<{ shareId: string }>;
}) {
  // 폰트 읽기와 조회를 나란히 — 둘은 서로를 기다릴 이유가 없다.
  // `process.cwd()` 는 Next 프로젝트 디렉터리(= front/)다.
  const [font, { shareId }] = await Promise.all([
    readFile(join(process.cwd(), "assets/GothicA1-ExtraBold.ttf")),
    params,
  ]);
  const reading = await getSharedReading(shareId);

  // 만료·오타로 못 찾았을 때. **빈 기둥 칸을 그리지 않는다** — 흰 네모 여덟 개는
  // 만료된 링크로 읽히지 않고 고장으로 읽힌다. 대신 제품 소개를 그려서, 링크가
  // 죽은 뒤에도 카드가 제 할 일(열어 볼 이유를 만드는 것)을 하게 둔다.
  if (!reading) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            background: PAPER,
            color: BODY,
            padding: "72px 80px",
            fontFamily: "GothicA1",
          }}
        >
          <div style={{ display: "flex", fontSize: 28, color: MUTED, letterSpacing: 6 }}>
            AI OF TELLERS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", fontSize: 76, color: BODY }}>
              당신의 사주팔자,
            </div>
            <div style={{ display: "flex", fontSize: 76, color: GOLD }}>
              정확하게 읽습니다
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderTop: `2px solid ${HAIRLINE}`,
              paddingTop: 22,
              fontSize: 26,
              color: GOLD_SOFT,
            }}
          >
            <div style={{ display: "flex" }}>회원가입 없이 · 여덟 글자까지 무료</div>
            <div style={{ display: "flex", color: MUTED }}>공유된 링크가 만료되었습니다</div>
          </div>
        </div>
      ),
      { ...size, fonts: [{ name: "GothicA1", data: font, style: "normal", weight: 800 }] },
    );
  }

  const pillars = reading.pillarsHangul;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          color: BODY,
          padding: "52px 64px",
          fontFamily: "GothicA1",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 26, color: MUTED, letterSpacing: 6 }}>
            AI OF TELLERS
          </div>
          <div style={{ display: "flex", fontSize: 26, color: GOLD_SOFT }}>
            친구가 보내 준 사주
          </div>
        </div>

        {/* 기둥 격자. satori 는 flex 만 지원하므로 칸을 직접 그린다 —
            `/verdict` 카드의 미터와 같은 수법이다. */}
        <div style={{ display: "flex", justifyContent: "center", gap: 22 }}>
          {pillars.map((hangul, i) => {
            const isDay = i === DAY_PILLAR_INDEX;
            const gan = hangul[0] ?? "";
            const zhi = hangul[1] ?? "";
            return (
              <div
                key={i}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
              >
                <div style={{ display: "flex", fontSize: 20, color: isDay ? GOLD : MUTED }}>
                  {PILLAR_LABELS[i] ?? ""}
                </div>
                <div
                  style={{
                    display: "flex",
                    width: 134,
                    height: 134,
                    borderRadius: 22,
                    alignItems: "center",
                    justifyContent: "center",
                    background: isDay ? GOLD : SURFACE,
                    border: isDay ? "none" : `3px solid ${HAIRLINE}`,
                    fontSize: 86,
                    // 금빛으로 채운 칸에서는 오행색이 읽히지 않는다. 대비가 먼저다.
                    color: isDay ? ON_GOLD : colorOf(GAN_WUXING, gan),
                  }}
                >
                  {gan}
                </div>
                <div
                  style={{
                    display: "flex",
                    width: 134,
                    height: 134,
                    borderRadius: 22,
                    alignItems: "center",
                    justifyContent: "center",
                    background: SURFACE,
                    border: `3px solid ${HAIRLINE}`,
                    fontSize: 86,
                    color: colorOf(ZHI_WUXING, zhi),
                  }}
                >
                  {zhi}
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `2px solid ${HAIRLINE}`,
            paddingTop: 20,
          }}
        >
          <div style={{ display: "flex", fontSize: 26, color: BODY }}>
            {`일간 ${reading.dayMasterHangul} · 힘은 ${reading.strengthVerdict}`}
          </div>

          {/* 오행 다섯 칸 고정. 0 인 오행을 빼면 칸 수가 사람마다 달라져, 무엇이
              비어 있는지가 보이지 않는다 — 비어 있다는 것도 정보다. */}
          <div style={{ display: "flex", gap: 8 }}>
            {WUXING_ORDER.map((key) => {
              const count = reading.visibleWuxing[key] ?? 0;
              return (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    width: 52,
                    height: 40,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                    background: count > 0 ? WUXING_COLOR[key] : WARM,
                    border: count > 0 ? "none" : `2px solid ${HAIRLINE}`,
                    color: count > 0 ? ON_GOLD : MUTED,
                  }}
                >
                  {`${key}${count}`}
                </div>
              );
            })}
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
