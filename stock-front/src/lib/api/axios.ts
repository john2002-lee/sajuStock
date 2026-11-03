import axios, { AxiosError } from "axios";
import { API_BASE_URL, API_TIMEOUT_MS } from "@/lib/config/env";
import { toApiError, toTransportError } from "./errors";

/**
 * 서버(라우트 핸들러·서버 컴포넌트) → FastAPI 용 axios 인스턴스.
 *
 * 브라우저 번들에 들어가면 안 된다 — baseURL 이 내부 백엔드 주소다.
 * 브라우저에서 BFF 를 부를 때는 lib/http/browser.ts 를 쓴다.
 *
 * 응답 인터셉터에서 백엔드 에러 봉투를 ApiError 로 바꾼다. 이러면 호출부가
 * axios 인지 fetch 인지 몰라도 `error instanceof ApiError` 로 동일하게 다룬다.
 */
export const backendApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  headers: { "Content-Type": "application/json" },
  // 4xx 도 예외로 올려 인터셉터 한 곳에서 처리한다.
  validateStatus: (status) => status >= 200 && status < 300,
});

backendApi.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response) {
      throw toApiError(error.response.status, error.response.data);
    }
    // 타임아웃·DNS·커넥션 거부 — 응답 자체가 없다.
    throw toTransportError(
      error.code === "ECONNABORTED"
        ? "백엔드 응답이 시간 내에 오지 않았습니다."
        : (error.message ?? "백엔드에 연결하지 못했습니다."),
    );
  },
);
