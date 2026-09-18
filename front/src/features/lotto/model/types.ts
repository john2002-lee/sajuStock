/** 로또 한 회차. `numbers` 는 오름차순 6개다 — 동행복권이 그렇게 준다. */
export interface Draw {
  readonly round: number;
  /** `YYYYMMDD`. 원본이 주는 형태를 그대로 둔다. */
  readonly date: string;
  readonly numbers: readonly number[];
  readonly bonus: number;
}

/**
 * 자리별 분포. 화면의 "출현비율" 과 번호 생성의 가중치가 모두 여기서 나온다.
 *
 * `observed`/`expected` 는 `[자리 0..5][번호 0..45]` 다. 번호를 1부터 그대로
 * 색인하려고 길이를 46 으로 두고 0 번은 비워 둔다 — 생성 쪽이 `[k]` 로 바로
 * 찾으므로 `k - 1` 오프셋을 들고 다니지 않아도 된다.
 */
export interface PositionStats {
  readonly rounds: number;
  readonly latestRound: number;
  readonly observed: readonly (readonly number[])[];
  readonly expected: readonly (readonly number[])[];
}
