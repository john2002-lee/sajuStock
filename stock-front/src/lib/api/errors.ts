/**
 * 백엔드 에러 봉투 → ApiError 정규화.
 *
 * fetch 경로와 axios 경로가 같은 예외 타입을 던져야 호출부가 전송 수단을
 * 몰라도 된다. 그래서 클라이언트 구현이 아니라 여기에 둔다.
 */

export class ApiError extends Error {
  readonly status: number;
  /** stock_not_found · provider_unavailable · llm_unavailable … */
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }

  /** 종목을 찾지 못한 경우 — 후보 선택 화면으로 보낸다 */
  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** yfinance·KRX 등 외부 공급자 문제 — 재시도가 의미 있다 */
  get isUpstream(): boolean {
    return this.status === 503 || this.code === "provider_unavailable";
  }

  /**
   * 백엔드에 닿지도 못한 경우 — 서버가 안 떠 있거나 주소·포트가 틀렸다.
   *
   * 다른 실패와 구분해야 하는 이유: 재시도가 소용없고, 사용자(개발자)가 할 일이
   * "잠시 뒤 다시"가 아니라 "백엔드를 켜라"다. 이걸 뭉뚱그리면 화면이
   * "yfinance 응답이 늦습니다" 라고 거짓말을 한다.
   */
  get isOffline(): boolean {
    return this.status === 0;
  }
}

/** back/app/core/exceptions.py 가 내려주는 형태 */
export interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    /** `validation_error` 일 때만 채워진다 (`handle_validation_error`). */
    fields?: Array<{ loc?: unknown; msg?: string; type?: string }>;
  };
}

/**
 * Pydantic 이 붙이는 접두사. `ValueError` 를 그대로 옮기면서 생기는 것이라
 * 사용자에게 보일 문장이 아니다.
 */
const PYDANTIC_PREFIX = /^Value error,\s*/;

/**
 * 검증 실패의 **구체적인 사유**를 뽑아 한 문장으로 만든다.
 *
 * 백엔드의 검증 봉투는 `message` 에 일반 문구("요청 값을 확인해주세요.")를 두고,
 * 진짜 이유는 `fields[].msg` 에 담는다. `message` 만 읽으면 사용자는 **무엇이
 * 잘못됐는지 알 수 없다** — 사주 입력 폼에서 "1920년 이전 출생은 지원하지
 * 않습니다" 가 "요청 값을 확인해주세요." 로 뭉개져 나오던 것이 그 예다.
 *
 * 필드가 여럿이면 줄바꿈이 아니라 공백으로 잇는다. 이 문자열은 한 줄짜리
 * `<p role="alert">` 에 들어가는 일이 많고, 거기서 개행은 보이지 않는다.
 */
function validationDetail(envelope: ErrorEnvelope | undefined): string | null {
  const fields = envelope?.error?.fields;
  if (!Array.isArray(fields) || fields.length === 0) return null;

  const messages = fields
    .map((f) => (typeof f.msg === "string" ? f.msg.replace(PYDANTIC_PREFIX, "").trim() : ""))
    .filter(Boolean);

  return messages.length > 0 ? messages.join(" ") : null;
}

export function toApiError(status: number, body: unknown): ApiError {
  const envelope = body as ErrorEnvelope | undefined;
  const code = envelope?.error?.code ?? `http_${status}`;
  const message =
    (code === "validation_error" ? validationDetail(envelope) : null) ??
    envelope?.error?.message ??
    `요청이 실패했습니다 (${status})`;

  return new ApiError(status, code, message);
}

/** 응답 본문을 읽을 수 없을 때(프록시 오류 등)의 폴백 */
export function toTransportError(message: string): ApiError {
  return new ApiError(0, "network_error", message);
}
