import { ApiError, toApiError, toTransportError } from "@/lib/api/errors";

/**
 * 브라우저 → 우리 BFF(`/api/*`) 클라이언트. **브라우저에서 BFF 를 부르는 유일한 통로다.**
 *
 * ## 왜 axios 를 걷어냈나
 *
 * 예전에는 이 파일이 axios 인스턴스였고, 그것을 쓰는 곳은 자동완성·상장사 상태 둘뿐
 * 이었다. 나머지 브라우저 호출(관심종목 변이·담기 토글·최근 종목 이름 조회)은 전부
 * 맨 `fetch` 에 각자의 에러 처리를 달고 있었다 — 같은 BFF 표면에 실패 계약이 넷이라
 * 어떤 화면은 서버가 준 한글 메시지를 띄우고 어떤 화면은 `String(status)` 를 띄웠다.
 *
 * 수렴 방향을 axios 가 아니라 fetch 로 잡은 이유는 **번들**이다. axios 는 GET 두 개를
 * 위해 브라우저로 실려 갔는데(검색 팔레트가 루트 레이아웃에 있어 루트 번들이다), 여기서
 * 쓰던 기능은 쿼리 직렬화·인터셉터·타임아웃뿐이고 셋 다 fetch 로 짧게 대체된다.
 * 서버 → FastAPI 경로(`lib/api/axios.ts`)는 그대로 axios 다 — 그쪽은 브라우저에 실리지
 * 않으므로 걷어낼 이유가 없다.
 *
 * ## 예외 하나
 *
 * SSE 스트림(`features/advice/model/stream.ts`)은 이 클라이언트를 쓰지 않는다. 여기는
 * 본문을 JSON 으로 읽어 값으로 돌려주는데, 스트림은 `response.body` 를 그대로 들고
 * 읽어야 하기 때문이다.
 */

/** axios 인스턴스가 쓰던 값을 그대로 옮겼다. */
const DEFAULT_TIMEOUT_MS = 20_000;

export interface BffRequestOptions {
  /** 쿼리 파라미터. undefined·null·빈 문자열은 생략된다 (`lib/api` 의 규칙과 같다). */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** React Query 가 넘겨주는 취소 신호. 타이핑 중 이전 요청이 끊긴다. */
  signal?: AbortSignal;
  timeoutMs?: number;
}

function buildPath(path: string, query?: BffRequestOptions["query"]): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * 실패 응답 → `ApiError`.
 *
 * **몸통 모양이 두 가지다.** BFF 라우트는 `{ error: "사람이 읽는 문장" }` 을 내고
 * (`app/api/watchlist/_helpers.ts`), 백엔드 봉투가 그대로 흘러나오는 경우는
 * `{ error: { code, message } }` 다. 앞의 것을 `toApiError` 에 그냥 넘기면
 * `error.code` 가 undefined 라 "요청이 실패했습니다 (401)" 같은 일반 문장으로
 * 덮여, 서버가 애써 쓴 안내가 사라진다. 그래서 여기서 갈라 본다.
 */
function toBffError(status: number, body: unknown): ApiError {
  const envelope = body as { error?: unknown } | undefined;
  if (typeof envelope?.error === "string") {
    return new ApiError(status, `http_${status}`, envelope.error);
  }
  return toApiError(status, body);
}

async function request<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body: unknown,
  options: BffRequestOptions = {},
): Promise<T | null> {
  const { query, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(buildPath(path, query), {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: combined,
    });
  } catch (error) {
    // 호출부가 끊은 것은 실패가 아니다. 원본을 그대로 올려야 React Query 가
    // 취소로 알아보고 에러 상태를 만들지 않는다.
    if (signal?.aborted) throw error;
    if (timeout.aborted) {
      throw toTransportError("요청이 시간 내에 완료되지 않았습니다.");
    }
    throw toTransportError(
      error instanceof Error ? error.message : "네트워크에 연결하지 못했습니다.",
    );
  }

  if (!response.ok) {
    throw toBffError(response.status, await response.json().catch(() => null));
  }

  // 204(내용 없음)는 실패가 아니다 — 상장사 상태 조회가 백엔드를 못 읽었을 때
  // 이 형태로 온다. 몸통이 빈 응답도 같이 받아 준다.
  if (response.status === 204) return null;
  return (await response.json().catch(() => null)) as T | null;
}

export const bff = {
  get: <T>(path: string, options?: BffRequestOptions) =>
    request<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: BffRequestOptions) =>
    request<T>("POST", path, body ?? {}, options),
  put: <T>(path: string, body?: unknown, options?: BffRequestOptions) =>
    request<T>("PUT", path, body ?? {}, options),
  patch: <T>(path: string, body?: unknown, options?: BffRequestOptions) =>
    request<T>("PATCH", path, body ?? {}, options),
  delete: <T>(path: string, options?: BffRequestOptions) =>
    request<T>("DELETE", path, undefined, options),
};

export { ApiError };
