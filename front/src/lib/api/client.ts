import { API_BASE_URL } from "@/lib/config/env";
import { backendApi } from "./axios";
import { toApiError, toTransportError } from "./errors";

/**
 * 서버 → FastAPI 호출. **전송 수단을 목적에 따라 나눈다.**
 *
 *   apiGetCached  네이티브 fetch   서버 컴포넌트의 캐시되는 조회
 *   apiGet/apiPost  axios          그 외 서버 측 호출 (캐시 없음)
 *   apiPostStream   네이티브 fetch  SSE 스트리밍
 *
 * 왜 전부 axios 로 통일하지 않는가:
 *
 * 1. **캐시** — `next: { revalidate: 60 }` 는 Next 가 전역 fetch 를 감싸서 만든
 *    데이터 캐시다. axios 는 Node 의 http 모듈을 직접 쓰므로 이 캐시에 참여할 수
 *    없다. 상세·홈을 axios 로 바꾸면 렌더마다 백엔드를 쳐서 호출 수가 늘어난다.
 * 2. **스트리밍** — 라우트 핸들러는 웹 표준 `Response` 를 반환해야 하는데,
 *    axios 의 `responseType: "stream"` 은 Node 스트림을 준다. 변환 계층을 하나 더
 *    끼우느니 fetch 의 `response.body`(ReadableStream)를 그대로 넘기는 편이 낫다.
 *
 * 나머지(캐시가 필요 없는 GET·POST)는 전부 axios 다 — 인터셉터 한 곳에서
 * 에러 봉투를 풀고, 타임아웃·헤더를 인스턴스 설정으로 공유한다.
 */

/** 캐시되는 조회의 기본 타임아웃. 서버 렌더가 상류를 오래 기다리지 않게 한다. */
export const CACHED_GET_TIMEOUT_MS = 5_000;

/**
 * 캐시 조회 결과. 타임아웃을 예외가 아니라 값으로 돌려준다 — 호출부가
 * "이 조각만 없는 화면"으로 degrade 할 수 있어야 하기 때문이다.
 */
export type CachedResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "timeout" };

export interface RequestOptions {
  /** 쿼리 파라미터. undefined·null·빈 문자열은 생략된다. */
  query?: Record<string, string | number | boolean | undefined | null>;
  timeoutMs?: number;
  signal?: AbortSignal;
  /**
   * 추가 요청 헤더.
   *
   * 지금 쓰는 곳은 관심종목의 `X-Owner-Key` 하나다. 사용자별 데이터라 소유자를
   * 실어 보내야 하는데, 그 값이 URL 이나 본문에 있으면 로그·캐시 키에 남는다.
   */
  headers?: Record<string, string>;
}

export function buildUrl(
  path: string,
  query?: RequestOptions["query"],
): string {
  const url = new URL(`${API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function toParams(query?: RequestOptions["query"]) {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    params[key] = String(value);
  }
  return params;
}

/**
 * 캐시 조회의 옵션. **`headers` 와 `signal` 이 없는 것이 의도다.**
 *
 * `RequestOptions` 를 그대로 쓰면 `headers` 를 타입상 받아 놓고 아래 구현이
 * 조용히 버린다. 그 조합이 특히 위험한 이유는 Next 데이터 캐시의 키가 **URL**
 * 이기 때문이다 — `headers: { "X-Owner-Key": … }` 로 사용자를 구분하는 호출이
 * 하나라도 생기면, 헤더는 무시된 채 URL 만 같아서 **한 사람의 데이터가 다른
 * 사람에게 캐시로 서빙된다.** 지금은 `getWatchlist` 가 주석만으로 그것을 피하고
 * 있는데(그래서 그쪽은 `apiGet` 을 쓴다), 규약이 아니라 타입이 막아야 한다.
 *
 * `signal` 을 뺀 이유는 다르다 — 아래 구현이 일부러 signal 을 쓰지 않는다(취소하면
 * 캐시가 채워지지 않는다). 받을 수 있는 것처럼 두면 호출부가 취소를 기대한다.
 */
export interface CachedRequestOptions {
  query?: RequestOptions["query"];
  timeoutMs?: number;
  revalidate: number;
}

/**
 * 서버 컴포넌트 전용. Next 데이터 캐시를 타므로 `revalidate` 초 동안 같은 URL 은
 * 백엔드를 다시 치지 않는다. **여기만 네이티브 fetch 를 쓴다.**
 *
 * 사용자별 데이터에는 쓰지 않는다 — `CachedRequestOptions` 주석 참고.
 */
export async function apiGetCached<T>(
  path: string,
  options: CachedRequestOptions,
): Promise<CachedResult<T>> {
  const { query, revalidate, timeoutMs = CACHED_GET_TIMEOUT_MS } = options;

  // fetch 에 signal 을 주지 않는다.
  //
  // 실측 결과 signal 자체는 Data Cache 를 깨지 않았다(로그로 확인). 그런데도 쓰지
  // 않는 이유는 다른 데 있다: signal 로 끊으면 진행 중인 요청이 취소되어 **캐시가
  // 채워지지 않는다.** 상류가 느릴 때마다 매번 처음부터 다시 기다리게 된다.
  // Promise.race 로 기다림만 포기하면 요청은 계속 진행돼 캐시를 채우고,
  // 다음 요청은 즉시 HIT 이 된다.
  const request = fetch(buildUrl(path, query), {
    // Next 16 은 fetch 를 기본적으로 캐시하지 않는다. `next.revalidate` 만 주면
    // TTL 만 정해질 뿐 캐시 자체가 켜지지 않아 매 렌더마다 백엔드를 친다.
    // 캐시를 켜는 건 `cache: "force-cache"` 이고, revalidate 는 그 TTL 이다.
    cache: "force-cache",
    next: { revalidate },
  }).then(async (response) => {
    if (!response.ok) {
      throw toApiError(response.status, await response.json().catch(() => null));
    }
    // 본문까지 읽어야 Next 가 캐시 항목을 완성한다.
    return (await response.json()) as T;
  });

  // 레이스에서 진 쪽이 나중에 reject 하면 unhandled rejection 이 된다.
  // 여기서 미리 삼켜 두되, 아래 await 는 원본 프라미스를 그대로 본다.
  request.catch(() => {});

  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    const timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
    // 서버 렌더가 타이머 때문에 붙잡히지 않게 한다 (Node 전용, 없으면 무시).
    timer.unref?.();
  });

  let result: T | typeof TIMED_OUT;
  try {
    result = await Promise.race([request, timeout]);
  } catch (error) {
    // 상류 4xx/5xx·연결 실패는 그대로 올린다 — 404 는 후보 선택, 503 은 에러 화면
    // 으로 가야 하므로 타임아웃과 같은 취급을 하면 안 된다.
    if (error instanceof Error && !("status" in error)) {
      throw toTransportError(error.message);
    }
    throw error;
  }

  if (result === TIMED_OUT) return { ok: false, reason: "timeout" };
  return { ok: true, data: result };
}

const TIMED_OUT = Symbol("timeout");

/** 캐시가 필요 없는 서버 측 GET. */
export async function apiGet<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { data } = await backendApi.get<T>(path, {
    params: toParams(options.query),
    timeout: options.timeoutMs,
    signal: options.signal,
    headers: options.headers,
  });
  return data;
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  options: Omit<RequestOptions, "query"> = {},
): Promise<T> {
  const { data } = await backendApi.post<T>(path, body, {
    timeout: options.timeoutMs,
    signal: options.signal,
    headers: options.headers,
  });
  return data;
}

/** PATCH·PUT·DELETE. 관심종목처럼 상태를 바꾸는 BFF 라우트가 쓴다. */
export async function apiSend<T>(
  method: "put" | "patch" | "delete",
  path: string,
  body: unknown,
  options: Omit<RequestOptions, "query"> = {},
): Promise<T> {
  const { data } = await backendApi.request<T>({
    method,
    url: path,
    data: body,
    timeout: options.timeoutMs,
    signal: options.signal,
    headers: options.headers,
  });
  return data;
}

/**
 * SSE 스트리밍. 본문을 그대로 흘려보내야 하므로 fetch 를 쓴다 —
 * 반환한 `Response.body` 를 라우트 핸들러가 웹 스트림 그대로 프록시한다.
 */
export async function apiPostStream(
  path: string,
  body: unknown,
  options: {
    timeoutMs?: number;
    signal?: AbortSignal;
    /** 추가 요청 헤더. AI 판단의 공유 비밀키가 이 자리로 온다 */
    headers?: Record<string, string>;
  } = {},
): Promise<Response> {
  const { timeoutMs, signal, headers } = options;
  const timeout = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined;
  const combined =
    signal && timeout
      ? AbortSignal.any([signal, timeout])
      : (signal ?? timeout);

  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: combined,
    });
  } catch (error) {
    throw toTransportError(
      error instanceof Error ? error.message : "스트림을 열지 못했습니다.",
    );
  }

  if (!response.ok) {
    throw toApiError(response.status, await response.json().catch(() => null));
  }
  return response;
}
