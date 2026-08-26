import { ApiError, bff } from "@/lib/http/browser";

/**
 * 백그라운드 작업을 시작하고 결과가 나올 때까지 **짧은 조회를 반복한다.**
 *
 * ## 왜 이 파일이 생겼나
 *
 * 리포트 생성은 실측 36초다. 예전에는 그것을 요청 하나로 기다렸고, 브라우저 → BFF
 * 구간의 기본 타임아웃이 20초라 **매번 20초에 끊겼다.** 사용자는 "지금은 풀이를
 * 들려드리기 어렵네" 를 봤고, 서버 로그에는 성공이 남았다 — 화면이 거짓말을 하고
 * 있었다.
 *
 * 타임아웃을 올리는 것으로는 부족하다. 그러면 모바일 네트워크, 중간 프록시, 화면을
 * 끄는 것까지 전부 그 하나의 연결에 매달린다. 긴 요청을 **없애고** 짧은 조회를
 * 반복하면 그 의존이 사라진다.
 *
 * ## 취소는 신호로 한다
 *
 * `signal` 로 끊으면 진행 중인 조회와 예정된 다음 조회가 함께 멈춘다. 컴포넌트가
 * 사라진 뒤에도 타이머가 돌면 `setState` 가 허공에 나가고, 무엇보다 사용자가 화면을
 * 떠난 뒤에도 폴링이 계속된다.
 *
 * **작업 자체는 취소되지 않는다.** 서버 쪽 생성은 그대로 끝나고 TTL 이 지나 사라진다.
 * 이미 시작된 LLM 호출을 중간에 죽여도 비용은 돌아오지 않으므로, 사용자가 새로고침해
 * 돌아왔을 때 결과가 남아 있는 편이 낫다.
 */

/** 백엔드 작업 상태 봉투(`schemas/saju.SajuReportJob`·`SajuFollowUpJob`). */
export interface JobEnvelope {
  status: "running" | "done" | "failed";
  error?: string | null;
}

/**
 * 조회 간격. 리포트가 36초쯤이라 24번 남짓 묻는다.
 *
 * 더 짧게 하면(0.5초) 서버가 아무 일도 없는 응답을 70번 만들고, 더 길게 하면(5초)
 * 다 된 결과를 최대 5초 늦게 보여 준다. 조회 하나가 즉시 끝나는 값싼 요청이므로
 * 사용자가 느끼는 지연을 줄이는 쪽으로 잡았다.
 */
const POLL_INTERVAL_MS = 1_500;

/**
 * 전체 기다림의 상한.
 *
 * 실측 36초, 정책 위반으로 재생성이 붙는 최악의 경우가 그 두 배쯤이다. 3분은 그보다
 * 넉넉하되 **무한이 아니다** — 상한이 없으면 서버가 물려 있을 때 화면이 영원히
 * 춤추고, 그것이 바로 이 작업이 고치려던 증상이다.
 */
const DEADLINE_MS = 180_000;

export class JobFailedError extends Error {}
export class JobTimeoutError extends Error {}

/**
 * 끊을 수 있는 대기. 폴링 루프는 반드시 이것을 써야 한다 — 맨 `setTimeout` 은
 * 컴포넌트가 사라진 뒤에도 깨어나 사라진 화면에 `setState` 를 한다.
 */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("취소됨"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("취소됨"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface RunJobOptions<TResult> {
  /** 작업을 시작하는 BFF 경로. `{ job_id }` 를 돌려줘야 한다. */
  startPath: string;
  /** 작업 번호로 상태 조회 경로를 만든다. */
  statusPath: (jobId: string) => string;
  /** 시작 요청 본문. */
  body: unknown;
  /**
   * 완료된 봉투에서 결과를 꺼낸다. 리포트는 `report`, 추가 질문은 `answer` 라
   * 이름이 다르므로 호출부가 알려 준다.
   */
  resultOf: (envelope: JobEnvelope) => TResult | null | undefined;
  signal?: AbortSignal;
}

/**
 * 작업을 시작하고 끝날 때까지 기다린다.
 *
 * 던지는 것: `JobFailedError`(작업이 실패했다 — 메시지는 서버가 준 사람 말),
 * `JobTimeoutError`(상한을 넘겼다), `ApiError`(시작 요청이 거절됐거나 작업이 사라졌다),
 * 그리고 `signal` 로 끊었을 때의 취소 예외.
 */
export async function runJob<TResult>({
  startPath,
  statusPath,
  body,
  resultOf,
  signal,
}: RunJobOptions<TResult>): Promise<TResult> {
  const started = await bff.post<{ job_id?: string }>(startPath, body, { signal });
  const jobId = started?.job_id;
  if (!jobId) {
    throw new JobFailedError("작업을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  const startedAt = Date.now();
  const path = statusPath(jobId);

  for (;;) {
    await abortableSleep(POLL_INTERVAL_MS, signal);

    const elapsed = Date.now() - startedAt;

    const envelope = await bff.get<JobEnvelope>(path, { signal });
    if (!envelope) {
      throw new JobFailedError("작업 상태를 읽지 못했습니다.");
    }

    if (envelope.status === "failed") {
      throw new JobFailedError(
        envelope.error ?? "작업이 실패했습니다. 잠시 후 다시 시도해 주세요.",
      );
    }

    if (envelope.status === "done") {
      const result = resultOf(envelope);
      if (result === null || result === undefined) {
        // 완료라면서 결과가 없다 — 서버 계약이 깨진 경우다. 조용히 계속 기다리면
        // 화면이 영원히 춤추므로 실패로 끝낸다.
        throw new JobFailedError("결과가 비어 있습니다. 다시 시도해 주세요.");
      }
      return result;
    }

    if (elapsed > DEADLINE_MS) {
      throw new JobTimeoutError(
        "풀이가 예상보다 오래 걸리고 있습니다. 잠시 후 다시 시도해 주세요.",
      );
    }
  }
}

/**
 * 작업 실패 → 화면에 띄울 문장.
 *
 * `ApiError` 를 별도로 보는 이유: 그쪽 메시지는 서버가 사용자를 향해 쓴 문장이라
 * (검증 사유·결제 상태) 우리가 지어낸 일반 문구보다 항상 정확하다.
 */
export function jobErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof JobFailedError || error instanceof JobTimeoutError) {
    return error.message;
  }
  return fallback;
}
