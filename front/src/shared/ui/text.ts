/**
 * 타입 스케일의 **타입**. `globals.css` 의 `--text-*` 와 같은 표여야 한다.
 *
 * ## 왜 숫자를 그대로 두고 유니온으로 좁혔나
 *
 * 원자 넷(`Chip`·`Delta`·`SectionLabel`·`StatRow`)이 폰트 크기를 **숫자 prop 으로**
 * 받아 인라인 style 로 심고 있었다. P0 의 기계 치환이 못 건드린 자리다 — 값이
 * 호출부에 있어서 파일을 고쳐도 `size={12.5}` 가 그대로 살아남는다.
 *
 * 문자열 토큰(`size="sm"`)으로 바꾸는 안도 있었지만 **`Delta` 가 숫자를 필요로 한다.**
 * 방향 표식 아이콘 크기를 글자 크기에서 도출하기 때문이다(`size * 0.78` — 아이콘의
 * 광학 크기가 글자보다 커 보이는 것을 보정한 값). 문자열로 바꾸면 그 안에서 다시
 * 숫자로 되돌리는 표가 필요해진다.
 *
 * 그래서 **숫자는 그대로 두고 스케일 밖의 값을 타입 오류로 만든다.** `size={12.5}`
 * 는 이제 컴파일되지 않는다 — 스케일을 지키는 일을 사람의 기억이 아니라 tsc 가 한다.
 */
export type TextSize = 10 | 11 | 12 | 13 | 14 | 16 | 20 | 26 | 34 | 48;

/** `TextSize` → 유틸 클래스. 템플릿으로 조립하면 Tailwind 가 스캔에서 못 본다. */
export const TEXT_CLASS: Record<TextSize, string> = {
  10: "text-10",
  11: "text-11",
  12: "text-12",
  13: "text-13",
  14: "text-14",
  16: "text-16",
  20: "text-20",
  26: "text-26",
  34: "text-34",
  48: "text-48",
};

const SCALE: readonly TextSize[] = [10, 11, 12, 13, 14, 16, 20, 26, 34, 48];

/**
 * 한 단 아래. 캡션이 제목보다 작아야 하는 자리에서 쓴다.
 *
 * 예전에는 `size - 1.5` 였다. 스케일이 균일하지 않아(10→11 은 1, 34→48 은 14)
 * 뺄셈으로는 "한 단 아래" 를 표현할 수 없다 — 가장 작은 단에서는 스케일 밖으로
 * 떨어지기까지 한다.
 */
export function smaller(size: TextSize): TextSize {
  const index = SCALE.indexOf(size);
  return index <= 0 ? size : SCALE[index - 1];
}
