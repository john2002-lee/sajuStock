/**
 * 로또 feature 의 **서버 전용 공개 경계.**
 *
 * `getLottoSnapshot` 이 `_data/draws.json`(89KB)을 import 하고, `LottoSection` 이
 * 그것을 부른다. 클라이언트 컴포넌트가 배럴 하나를 부르는 것만으로 그 파일이
 * 브라우저 번들에 실리는 일을 막으려고 갈라 두었다 — `features/saju/server.ts` 와
 * 같은 이유다.
 *
 * 브라우저에 실려도 되는 것(`NumberBalls`)은 `index.ts` 에 있다.
 */
export { LottoSection, type LottoSectionProps } from "./components/LottoSection";
export { getLottoSnapshot, type LottoSnapshot } from "./services/getLottoStats";
