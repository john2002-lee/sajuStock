// 숫자 표시 포맷 단일 출처. 화면에서 toLocaleString 을 직접 부르지 않는다.

const KRW = new Intl.NumberFormat("ko-KR");

/** 71,400 — 원화는 정수, 해외 종목은 소수 2자리 */
export function price(value: number, currency: "KRW" | "USD" = "KRW"): string {
  if (currency === "USD") {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return KRW.format(Math.round(value));
}

/** +1.42% / -0.29% / 0.00% — 부호 항상 표기 */
export function percent(value: number, digits = 2): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

/** +1,000 / -202 — 전일 대비 금액 */
export function delta(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${KRW.format(Math.abs(Math.round(value)))}`;
}

/** 1.82x — 거래량 배율 */
export function ratio(value: number, digits = 2): string {
  return `${value.toFixed(digits)}x`;
}

/**
 * 2,842 — 건수·종목 수처럼 **단위가 없는 정수**.
 *
 * `price()` 로 대신 쓰지 않는다. 결과 문자열이 같아도 뜻이 다르고, 통화 서식이
 * 바뀌면(해외 종목 소수 2자리 등) 종목 수까지 따라 바뀐다. 이 함수가 없어서
 * 목록 요약과 스크리너 캡션이 `toLocaleString` 을 직접 부르고 있었다 — 이 파일
 * 첫 줄이 하지 말라고 적어 둔 바로 그것이다.
 */
export function count(value: number): string {
  return KRW.format(Math.round(value));
}

/** 12.4M / 843.2K / 1.2B — 거래량·차트 축 */
export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return String(Math.round(value));
}

/**
 * 421.8조 / 8,240억 / -341억 — 시가총액·매출·영업이익 한국식
 *
 * 부호를 분리해 처리하는 이유: 영업이익은 음수가 될 수 있는데, 크기 비교만 하면
 * 음수가 두 분기를 모두 빠져나가 `-34,109,363,660` 처럼 혼자 원 단위로 찍힌다
 * (에코프로비엠 FY2024 영업손실이 실제로 그 값이다).
 */
export function marketCapKR(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(1)}조`;
  if (abs >= 1e8) return `${sign}${KRW.format(Math.round(abs / 1e8))}억`;
  return `${sign}${KRW.format(abs)}`;
}

/** 21.06배 — PER·PBR. 국내 표기는 x 가 아니라 '배'다 (ratio 는 거래량 배율용) */
export function multiple(value: number, digits = 2): string {
  return `${decimal(value, digits)}배`;
}

/**
 * 30.79% — 부호 없는 비율.
 *
 * ROE·배당수익률·영업이익률은 등락이 아니라 수준이라 `+` 를 붙이면 안 된다.
 * (percent() 는 전일 대비처럼 방향이 의미를 갖는 값 전용이다.)
 */
export function unsignedPercent(value: number, digits = 2): string {
  return `${value.toFixed(digits)}%`;
}

/** 2,842.19 — 지수처럼 소수점을 유지해야 하는 값 */
export function decimal(value: number, digits = 2): string {
  return value.toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** +23.71 / -12.06 — 지수 변동폭. 부호 항상 표기 */
export function signedDecimal(value: number, digits = 2): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${decimal(Math.abs(value), digits)}`;
}
