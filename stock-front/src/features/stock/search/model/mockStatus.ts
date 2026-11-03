// 목 모드의 상장사 목록 준비 상태.
//
// BFF 라우트 안에 있던 것을 feature 로 내렸다. 3단 파이프라인(KRX → KIND → 내부)의
// 순서와 "어디까지 실패로 표시하는가"는 **search 도메인 지식**이고, 라우트가 알아야
// 할 것은 그것을 JSON 으로 내보내는 방법뿐이다.

import { LISTED_TOTAL, LISTED_WARMUP_MS } from "./mock";
import {
  SOURCE_LABELS,
  type ListedCompaniesStatus,
  type ListedSource,
  type SourceStep,
} from "./types";

/** 실제 수집이 내려가는 순서. 앞이 실패해야 뒤가 쓰인다 */
const PIPELINE: ListedSource[] = ["KRX", "KIND", "INTERNAL"];

/**
 * 실제로 쓰인 경로를 기준으로 3단계 상태를 만든다.
 * 그 앞은 실패, 그 자리는 사용, 뒤는 대기다.
 */
function mockSteps(used: ListedSource): SourceStep[] {
  const usedAt = PIPELINE.indexOf(used);
  return PIPELINE.map((source, index) => ({
    label: SOURCE_LABELS[source],
    source,
    state: index < usedAt ? "실패" : index === usedAt ? "사용" : "대기",
  }));
}

/** `?source=` 를 아는 값으로 좁힌다. 개발 중 폴백 배너를 확인할 때 쓴다 */
export function parseListedSource(value: string | null): ListedSource {
  return value === "KIND" || value === "INTERNAL" ? value : "KRX";
}

/**
 * 워밍업을 흉내 낸 상태.
 *
 * `bootedAt` 을 인자로 받는다 — 모듈 전역에 시각을 굳히면 이 함수를 테스트에서
 * 임의 시점으로 부를 수 없고, 서버가 오래 떠 있으면 늘 `ready: true` 만 나온다.
 */
export function mockListedStatus(
  source: ListedSource,
  bootedAt: number,
  now: number,
): ListedCompaniesStatus {
  const ratio = Math.min(1, (now - bootedAt) / LISTED_WARMUP_MS);
  return {
    ready: ratio >= 1,
    loaded: Math.round(LISTED_TOTAL * ratio),
    total: LISTED_TOTAL,
    source,
    steps: mockSteps(source),
  };
}
