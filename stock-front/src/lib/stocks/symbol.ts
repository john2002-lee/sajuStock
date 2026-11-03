/**
 * 종목 심볼의 **모양** 판정. 존재 여부는 모른다.
 *
 * ## 왜 lib 에 있나
 *
 * 두 도메인이 같은 질문을 한다 — 검색은 "해외 티커 조회 행을 띄울까", 종목 상세는
 * "이 문자열을 상류(yfinance)로 보낼까". 같은 정규식을 두 feature 에 복사하면 한쪽만
 * 고치는 자리가 되므로 아래 계층에 한 벌 둔다 (`app → features → shared → lib`).
 *
 * ## 왜 모양만 보나 — 이것이 증폭구를 막는다
 *
 * 백엔드는 KRX 목록에 없는 문자열을 **그대로 야후 티커로 써서** 504봉을 내려받는다
 * (`normalize_stock_candidates` 의 마지막 분기). 그래서 `/stocks/<아무문자열>` 이
 * 요청 하나당 상류 호출 1~3회가 되고, 스캐너로 수천 건을 돌리면 야후가 IP 를 조여
 * **정상 종목의 시세·재무·뉴스가 동시에** 죽는다. 응답이 404 가 아니라 200 이라
 * 멈출 신호도 없다.
 *
 * 여기서 거르는 것은 "없는 종목" 이 아니라 **애초에 종목일 수 없는 문자열**이다.
 * `ASDFGH` 처럼 티커 모양인 오탈자는 통과하고, 그건 어떤 검사로도 막을 수 없다 —
 * 목표는 무한한 입력 공간을 유한하게 만드는 것이다.
 */

/** KRX 6자리 코드. 화면의 모든 내부 링크가 이 모양이다 (`/stocks/005930`) */
const KRX_CODE = /^\d{6}$/;

/** 접미사까지 붙은 형태. 자동완성·상세 응답의 `symbol` 이 이 모양으로 돌아온다 */
const KRX_SYMBOL = /^\d{6}\.(KS|KQ)$/i;

/**
 * 해외 티커 형태.
 *
 * 첫 글자는 영문, 이어서 영문·점·하이픈 최대 5자 (BRK.B · RDS-A 같은 형태를 덮는다).
 * 한글·숫자만·6자 초과·공백 포함은 통과하지 못한다 — 아무 입력에나 조회 링크를
 * 띄우면 오탈자를 유효한 종목처럼 보이게 만든다.
 */
const TICKER = /^[A-Za-z][A-Za-z.\-]{0,5}$/;

export function isTickerLike(raw: string): boolean {
  return TICKER.test(raw.trim());
}

/**
 * 상류로 보낼 만한 모양인가. 아니면 조회 없이 후보 화면으로 돌린다.
 *
 * `KRX_SYMBOL` 을 함께 받는 이유: 자동완성이 돌려준 `005930.KS` 를 그대로 주소에
 * 실어 오는 경로가 있고, 백엔드도 그 형태를 해석한다. 여기서 막으면 정상 링크가
 * 후보 화면으로 떨어진다.
 */
export function isResolvableSymbol(raw: string): boolean {
  const value = raw.trim();
  return KRX_CODE.test(value) || KRX_SYMBOL.test(value) || isTickerLike(value);
}
