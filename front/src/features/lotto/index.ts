/**
 * 로또 feature 의 공개 경계 — **브라우저에 실려도 되는 것만.**
 *
 * 화면 단위인 `LottoSection` 은 여기 없다. 회차 데이터(89KB)를 읽는 서버
 * 컴포넌트라 `./server.ts` 에 있다.
 *
 * 번호를 만드는 모델(`generate` · `stats` · `draws`)도 지금은 내보내지 않는다.
 * 서버에서만 쓰이므로 열어 둘 이유가 없고, 열어 두면 클라이언트 컴포넌트가
 * 무심코 가져가 같은 계산을 브라우저에서 한 번 더 하게 된다.
 */
export { NumberBalls } from "./components/NumberBalls";

export type { Draw, PositionStats } from "./model/types";
