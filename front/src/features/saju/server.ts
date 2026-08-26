/**
 * 사주 feature 의 **서버 전용 공개 경계.**
 *
 * `getBirthPlaces` 는 `@/lib/api` 를 타고 서버 → FastAPI 전송 계층(axios 인스턴스)을
 * 끌고 온다. 모듈 최상단에서 인스턴스를 만드는 코드는 사이드이펙트라 번들러가
 * 버리지 못하므로, 트리셰이킹에 기대는 대신 **애초에 안 닿게** 한다
 * (`features/watchlist/server.ts` 가 같은 이유로 갈라져 있고, 그쪽에는 실측값이 있다).
 *
 * 서버 컴포넌트·라우트 핸들러는 여기서, 나머지는 `index.ts` 에서 가져간다.
 */
export { getBirthPlaces } from "./services/getBirthPlaces";
export {
  fromBirthInput,
  toReading,
  toReport,
  type WireReading,
  type WireReport,
} from "./services/wire";
