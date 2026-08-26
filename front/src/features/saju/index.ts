/**
 * 사주 feature 의 공개 경계 — **브라우저에 실려도 되는 것만.**
 *
 * 서버 전용 조회(`getBirthPlaces`)는 여기 없다. `./server.ts` 에 있고, 이유는
 * `features/watchlist/server.ts` 주석과 같다 — 그 함수가 `@/lib/api` 를 타고 axios
 * 인스턴스를 끌고 오는데, 클라이언트 컴포넌트가 이 배럴 하나를 부르는 것만으로
 * 서버 HTTP 계층이 브라우저 번들에 실린다.
 *
 * `_parked/` 의 투자 성향 온보딩은 **일부러 내보내지 않는다.** 빌드에서 제외돼
 * 있고, 왜 그런지는 그 폴더의 README 에 있다.
 */

/** 화면 단위 — 각 라우트가 이것 하나씩만 조립한다. */
export { SajuHeader } from "./components/SajuHeader";
export { SajuEntry } from "./components/SajuEntry";
export { TeaserScreen } from "./components/TeaserScreen";
export { ReportScreen } from "./components/ReportScreen";
export { IntroStory } from "./components/IntroStory";
export { PaySuccessScreen } from "./components/PaySuccessScreen";
export { PayFailNotice } from "./components/PayFailNotice";
export { PaidReportScreen } from "./components/PaidReportScreen";
export { PayButton, type PayButtonProps } from "./components/PayButton";

/** 웹툰 조각 — 다른 화면이 같은 목소리를 이어 쓸 때를 위해 연다. */
export { Panel, PanelLabel, ShamanBeat, SpeechBubble } from "./components/Panel";
export { Shaman, type ShamanExpression, type ShamanProps } from "./components/Shaman";
export { ShamanDance, type ShamanDanceProps } from "./components/ShamanDance";
export { MeridianDiagram } from "./components/MeridianDiagram";
export { ConventionNotice } from "./components/ConventionNotice";
export { PillToggle, type PillToggleProps } from "./components/PillToggle";
export { BirthForm, type BirthFormProps, type BirthFormValues } from "./components/BirthForm";
export { TeaserView, StartOverPrompt, type TeaserViewProps } from "./components/TeaserView";
export { WebtoonReport, type WebtoonReportProps } from "./components/WebtoonReport";
export { LuckPanel, PillarsPanel, WuxingPanel } from "./components/ChartPanels";
export { FollowUpChat, type ChatTurn, type FollowUpTarget } from "./components/FollowUpChat";

export { WUXING_KEYS } from "./model/types";
export { WUXING_LABEL, ganWuxingOf, wuxingClass, zhiWuxingOf } from "./model/wuxing";
export { splitSections, extractPreamble, type DisplaySection } from "./model/sections";
export { toBeats, cueFor, type Beat } from "./model/beats";
export {
  loadReading,
  saveReading,
  clearReading,
  type StoredReading,
} from "./model/storage";

export type {
  BirthInput,
  BirthPlace,
  Conventions,
  DaYun,
  Gender,
  Luck,
  PillarDetail,
  ProfileAxes,
  ProfileDraft,
  ReportSection,
  SajuChart,
  SajuReading,
  SajuReport,
  SeUn,
  Strength,
  StrengthVerdict,
  PaymentConfig,
  Teaser,
  WuxingKey,
} from "./model/types";
