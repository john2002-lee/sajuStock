export { AdviceProvider } from "./components/AdviceProvider";
export { AdviceDrawer } from "./components/AdviceDrawer";
export { AdviceTrigger } from "./components/AdviceTrigger";
export {
  useBulkAdvice,
  type BulkAdviceEntry,
  type BulkAdviceState,
  type BulkTarget,
} from "./hooks/useBulkAdvice";
export { ADVICE_STAGE_LABELS } from "./model/types";
export { VerdictHistory } from "./components/VerdictHistory";
/** 화면이 상한을 문장으로 옮겨 적지 않도록 숫자를 한 곳에서 가져간다 */
export { MAX_BULK_SYMBOLS, type AdviceResult } from "./model/cache";

export type {
  AdviceStage,
  AdviceStreamEvent,
  AgentOpinion,
  Decision,
  FitConcern,
  PersonalVerdict,
  Verdict,
} from "./model/types";

/** 저장된 판단의 표시 타입. 서비스(서버 전용)와 달리 브라우저에 실려도 된다. */
export {
  sinceVerdictPercent,
  type SharedVerdict,
  type VerdictRecord,
} from "./model/verdict";
