/**
 * 오행 → 표시 색·이름. 순수 조회표 — I/O 없음.
 *
 * 백엔드가 오행을 한글 한 글자("목"·"화"…)로 주므로 그 값을 그대로 키로 쓴다.
 */

import { GAN_HANGUL, GAN_WUXING, ZHI_HANGUL, ZHI_WUXING } from "./ganzhi";
import type { WuxingKey } from "./types";

export const WUXING_LABEL: Readonly<Record<WuxingKey, string>> = {
  목: "목(木)",
  화: "화(火)",
  토: "토(土)",
  금: "금(金)",
  수: "수(水)",
};

/**
 * 오행 → **완전한** Tailwind 클래스 이름.
 *
 * 절대 조각을 이어 붙여 만들지 말 것 (`text-wuxing-${key}` 금지).
 *
 * Tailwind 는 소스 텍스트에서 **온전한 클래스 이름**을 찾는다. 템플릿 리터럴은
 * 그 스캔에 보이지 않으므로 유틸이 아예 생성되지 않는다. 원본 프로젝트에서 정확히
 * 그 일이 있었다 — 모든 `bg-wuxing-*` 이 transparent 로 떨어져 오행 막대에 채움이
 * 없었고, `text-wuxing-*` 도 다섯 중 넷이 본문 색으로 흘렀다(하나만 우연히
 * 다른 파일에 문자열로 있어서 동작했다).
 *
 * 아래 두 표가 그 다섯 문자열을 파일 안에 **문자 그대로** 존재하게 하는 장치다.
 */
const WUXING_TEXT_CLASS: Readonly<Record<WuxingKey, string>> = {
  목: "text-wuxing-wood",
  화: "text-wuxing-fire",
  토: "text-wuxing-earth",
  금: "text-wuxing-metal",
  수: "text-wuxing-water",
};

const WUXING_BG_CLASS: Readonly<Record<WuxingKey, string>> = {
  목: "bg-wuxing-wood",
  화: "bg-wuxing-fire",
  토: "bg-wuxing-earth",
  금: "bg-wuxing-metal",
  수: "bg-wuxing-water",
};

function isWuxingKey(value: string): value is WuxingKey {
  return value in WUXING_TEXT_CLASS;
}

/**
 * 한글 독음 한 글자 → 오행.
 *
 * 티저의 4기둥 격자는 `Teaser.pillars_hangul`("갑자")만 갖고 있어 한자 간지를 모른다.
 * 그래서 한글에서 거슬러 올라가는 역방향 표가 필요하다 — 새 데이터 소스를 들이는
 * 대신 이미 있는 `GAN_HANGUL`/`ZHI_HANGUL` 을 뒤집어 만든다.
 *
 * 한글 사주 독음은 언제나 정확히 두 글자다: 첫 글자가 천간, 둘째가 지지.
 */
function buildReverse(
  hangulOf: Readonly<Record<string, string>>,
  wuxingOf: Readonly<Record<string, string>>,
): Record<string, WuxingKey> {
  const out: Record<string, WuxingKey> = {};
  for (const [hanja, hangul] of Object.entries(hangulOf)) {
    const wx = wuxingOf[hanja];
    if (wx && isWuxingKey(wx)) out[hangul] = wx;
  }
  return out;
}

const GAN_HANGUL_TO_WUXING = buildReverse(GAN_HANGUL, GAN_WUXING);
const ZHI_HANGUL_TO_WUXING = buildReverse(ZHI_HANGUL, ZHI_WUXING);

/** 기둥 첫 글자(천간)의 오행. 못 알아보면 null. */
export function ganWuxingOf(hangulChar: string): WuxingKey | null {
  return GAN_HANGUL_TO_WUXING[hangulChar] ?? null;
}

/** 기둥 둘째 글자(지지)의 오행. 못 알아보면 null. */
export function zhiWuxingOf(hangulChar: string): WuxingKey | null {
  return ZHI_HANGUL_TO_WUXING[hangulChar] ?? null;
}

/** 오행 글자의 색 클래스. 모르는 값이면 중립색으로 떨어진다. */
export function wuxingClass(kind: "text" | "bg", key: string): string {
  if (!isWuxingKey(key)) return kind === "text" ? "text-ink" : "bg-line-20";
  // 조립이 아니라 조회다 — 위 주석 참고.
  return kind === "text" ? WUXING_TEXT_CLASS[key] : WUXING_BG_CLASS[key];
}
