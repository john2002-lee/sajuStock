/**
 * 2b 터미널 콘솔의 라벨 토큰.
 *
 * 이 화면의 모든 섹션 머리는 mono uppercase + 넓은 자간이다. 조각이 여러 파일로
 * 갈라져 있어도 라벨이 같아 보여야 하므로 한 곳에서 소유한다.
 *
 * 조립 루트(ConsoleView)는 app/ 에 남아 있어 이 토큰을 feature 공개 경계로 받는다.
 */
export const CONSOLE_LABEL = "font-mono font-medium uppercase text-muted-60";

export const CONSOLE_LABEL_STYLE = {
  fontSize: 9.5,
  letterSpacing: "0.2em",
} as const;
