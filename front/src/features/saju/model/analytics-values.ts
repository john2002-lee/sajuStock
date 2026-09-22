import type {
  DayMaster,
  DominantElement,
  RootPath,
} from "@/shared/analytics/events";
import { SHARE_PATH } from "./share";

/**
 * 사주 계산 결과에서 **이벤트에 실을 두 값**을 뽑는다.
 *
 * ## 왜 로마자인가
 *
 * `甲` 이나 `목` 을 그대로 보내면 값이 표기에 묶인다. 화면 문구를 한 번 다듬거나
 * 백엔드가 한자 대신 한글을 주기 시작하면 그 순간부터 같은 사실이 두 이름으로
 * 쌓이고, 과거 데이터와 갈라진다.
 *
 * ## 왜 `ganzhi.ts` 의 표에서 파생시키지 않는가
 *
 * 그 파일이 스스로 금지한다 — "계산에 쓰이는 어떤 값도 여기서 파생시키지 말 것".
 * 그 표는 **표시 색**을 위한 것이고, 틀려도 글자 색이 이상해질 뿐이다. 분석 값이
 * 거기 얹히면 색을 고치는 작업이 지표를 조용히 바꿔 놓을 수 있다. 열 글자짜리
 * 표를 한 벌 더 두는 편이 싸다.
 *
 * ## 여기 없는 것
 *
 * 네 기둥도, 대운도, 생년월일시도 뽑지 않는다. 그 조합은 생년월일시로 역산되고,
 * 이 저장소는 그것을 민감정보로 다루기로 이미 결정했다
 * (`docs/analytics/saju-amplitude-taxonomy.md` 6절).
 */

/** 천간 열 → 일간 값. 명리의 고정된 사실이라 바뀌지 않는다. */
const DAY_MASTER_BY_GAN: Readonly<Record<string, DayMaster>> = {
  甲: "jia",
  乙: "yi",
  丙: "bing",
  丁: "ding",
  戊: "wu",
  己: "ji",
  庚: "geng",
  辛: "xin",
  壬: "ren",
  癸: "gui",
};

/**
 * 오행 다섯 → 원소 값.
 *
 * 키 순서가 곧 **동점을 끊는 순서**다 (목화토금수 — `types.ts` 의 `WUXING_KEYS` 와
 * 같은 표시 순서). 아래 `toDominantElement` 주석이 왜 순서를 고정해야 하는지 적는다.
 */
const ELEMENT_BY_WUXING: Readonly<Record<string, DominantElement>> = {
  목: "wood",
  화: "fire",
  토: "earth",
  금: "metal",
  수: "water",
};

/**
 * 일간 한 글자를 이벤트 값으로. 모르는 글자는 `undefined` 다.
 *
 * 추측해서 아무 값이나 돌려주면 한 사람의 일간이 조용히 틀린 칸에 쌓인다.
 * `undefined` 는 이벤트 조립기가 떨어뜨리므로 그 속성이 아예 실리지 않고,
 * "값이 없다" 가 데이터에 정직하게 남는다.
 */
export function toDayMaster(gan: string): DayMaster | undefined {
  return DAY_MASTER_BY_GAN[gan];
}

/**
 * 드러난 글자의 오행 집계에서 **최다 원소**를 고른다.
 *
 * 동점을 객체 키 순서에 맡기지 않는다. 그러면 같은 사주가 응답 모양에 따라 다른
 * 값으로 쌓일 수 있고, 그건 아무도 눈치채지 못하는 종류의 흔들림이다. 표시 순서
 * (목화토금수)로 고정해 **같은 입력이 언제나 같은 값**이 되게 한다.
 *
 * 집계가 비었거나 전부 0 이면 `undefined` — 최다가 없는 것이지 목이 아니다.
 */
export function toDominantElement(
  visibleWuxing: Record<string, number>,
): DominantElement | undefined {
  let best: DominantElement | undefined;
  let bestCount = 0;

  for (const [wuxing, element] of Object.entries(ELEMENT_BY_WUXING)) {
    const count = visibleWuxing[wuxing] ?? 0;
    if (count > bestCount) {
      best = element;
      bestCount = count;
    }
  }

  return best;
}

/**
 * 리퍼러에서 **어느 문으로 들어왔는지**를 읽는다.
 *
 * 따로 세는 문이 둘이다 — 소개 화면(`intro`)과 **친구가 보낸 공유 링크**(`share`).
 * 나머지는 전부 `root` 이고, 검색이었는지 광고였는지는 오토캡처 attribution 이
 * utm·리퍼러로 이미 말해 준다 — 여기서 같은 것을 두 번 세면 두 값이 언젠가 어긋난다.
 *
 * `share` 를 세는 이유는 그것이 **공유 기능의 유일한 성과 지표**이기 때문이다.
 * 발급·클릭은 보낸 쪽 이야기이고, 실제로 사람이 왔는지는 이 값만이 안다. 섞으면
 * 서버에 여덟 글자를 7일 저장하기로 한 거래가 남는 장사였는지 판단할 근거가 없다.
 *
 * 리퍼러를 해석하지 못하면 `unknown` 이다. `root` 로 접으면 "직접 들어온 사람"
 * 안에 정체불명이 섞이는데, 그건 나중에 되돌릴 수 없는 오염이다.
 */
export function rootPathFromReferrer(
  referrer: string,
  origin: string,
): RootPath {
  // 리퍼러가 비는 경우가 직접 진입이다 — 주소를 치거나, 북마크거나, 리퍼러를
  // 떼는 정책의 사이트에서 왔거나.
  if (!referrer) return "root";

  try {
    const from = new URL(referrer);
    if (from.origin !== origin) return "root";
    // 공유 링크를 먼저 본다. `SHARE_PATH` 를 문자열로 다시 적지 않는 것은,
    // 경로가 바뀌는 날 이 값이 조용히 `root` 로 떨어지는 것을 막으려는 것이다.
    //
    // **끝의 슬래시가 중요하다.** `SHARE_PATH` 만으로 비교하면 `/saju/summary`
    // 처럼 같은 접두사를 가진 다른 주소가 함께 걸려 공유 유입이 부풀어 오른다.
    if (from.pathname.startsWith(`${SHARE_PATH}/`)) return "share";
    return from.pathname.startsWith("/saju/intro") ? "intro" : "root";
  } catch {
    return "unknown";
  }
}

/**
 * 유저 속성에 넣을 날짜. **KST 기준 `YYYY-MM-DD`** 다.
 *
 * UTC 로 찍으면 한국의 하루가 두 날에 걸쳐 쌓인다 — 밤 9시 이후 결제가 다음 날로
 * 넘어가는데, 결제가 몰리는 시간대가 하필 거기다. "최초 결제일" 같은 값이 하루씩
 * 틀리면 코호트가 통째로 어긋난다.
 *
 * `en-CA` 로케일이 `YYYY-MM-DD` 를 준다 — 문자열을 직접 조립하는 것보다 안전하고,
 * 자릿수 패딩을 스스로 처리한다.
 */
export function kstDate(at: number | Date = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}
