/**
 * 새 회차를 받아 `_data/draws.json` 에 붙인다. 매주 GitHub Actions 가 돌린다.
 *
 * ```
 * node scripts/update-lotto-draws.ts
 * ```
 *
 * ## 왜 신규만 받나 — 전체 재수집은 금지다
 *
 * 처음 1241회를 모을 때 8스레드로 125번을 몰아 쳤더니 **IP 가 차단됐다.** curl 도
 * python 도 타임아웃만 돌아왔고, 브라우저 세션으로만 복구됐다. 주 1회 한 건이면
 * 그럴 일이 없다. 전체 재수집 스크립트를 CI 에 두지 않는 이유가 이것이다.
 *
 * ## 밀린 회차를 따라잡는다
 *
 * 실행이 몇 주 빠졌을 수도 있다(러너 장애·API 개편). 그래서 "다음 회차가 있으면
 * 받는다" 를 신규가 없을 때까지 반복하되, 상한(`MAX_CATCH_UP`)과 호출 간 간격을
 * 둔다 — 따라잡기가 곧 몰아치기가 되면 위의 차단을 자기 손으로 부른다.
 *
 * ## 검증에 실패하면 **쓰지 않는다**
 *
 * 응답 형식이 바뀌면 `parseWireDraws` 가 그 회차를 버리고, 그러면 신규가 0건이
 * 되어 파일을 건드리지 않는다. 직전 스냅샷이 그대로 살아 있는 채로 다음 주에 다시
 * 시도한다. 화면 쪽도 같은 전제로 만들어져 있다 — 데이터가 비어도 유효한 조합을
 * 낸다(`model/generate.ts`).
 *
 * 성공하면 파일만 바뀐다. 커밋·푸시는 워크플로가 한다
 * (`.github/workflows/lotto-weekly.yml`).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseDraws } from "../src/features/lotto/model/draws.ts";
import { parseWireDraws } from "../src/features/lotto/model/wire.ts";
import type { Draw } from "../src/features/lotto/model/types.ts";

const DATA_PATH = path.join(
  import.meta.dirname,
  "..",
  "src",
  "features",
  "lotto",
  "_data",
  "draws.json",
);

const ENDPOINT = "https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do";

/** 한 번 실행에서 따라잡을 최대 회차 수. 약 두 달치다. */
const MAX_CATCH_UP = 8;

/** 연속 호출 사이 간격. 차단을 부르지 않을 만큼 느리게. */
const CALL_GAP_MS = 1500;

const HEADERS = {
  // 브라우저 UA 와 Referer 가 없으면 거부된다(실측).
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  Referer: "https://www.dhlottery.co.kr/lt645/result",
  "X-Requested-With": "XMLHttpRequest",
  Accept: "application/json, text/javascript, */*; q=0.01",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 한 회차를 조회한다. 일시적 실패는 지수 백오프로 재시도한다. */
async function fetchRound(round: number, tries = 4): Promise<Draw[]> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < tries; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
    try {
      const url = `${ENDPOINT}?srchDir=center&srchLtEpsd=${round}`;
      const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return parseWireDraws(await response.json());
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`${round}회 조회 실패: ${String(lastError)}`);
}

async function main(): Promise<void> {
  const raw: unknown = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
  const draws = parseDraws(raw);

  if (draws.length === 0) {
    throw new Error("기존 데이터를 읽지 못했습니다 — 파일이 비었거나 형식이 깨졌습니다.");
  }

  let latest = draws[draws.length - 1].round;
  const before = latest;
  console.log(`현재 최신 회차: ${latest}회 (총 ${draws.length}회)`);

  for (let step = 0; step < MAX_CATCH_UP; step++) {
    if (step > 0) await sleep(CALL_GAP_MS);

    const wanted = latest + 1;
    const fetched = await fetchRound(wanted);
    const next = fetched.find((item) => item.round === wanted);

    if (!next) {
      console.log(`${wanted}회는 아직 없습니다.`);
      break;
    }

    draws.push(next);
    latest = next.round;
    console.log(`${next.round}회 추가: ${next.numbers.join(", ")} + ${next.bonus}`);
  }

  if (latest === before) {
    // **조용한 영구 실패를 막는다.**
    //
    // 응답 형식이 바뀌면 `parseWireDraws` 가 그 회차를 버리고, 그러면 여기까지
    // 내려와 "신규 없음" 으로 정상 종료한다 — 워크플로가 성공으로 끝나므로 알림이
    // 가지 않고, 데이터는 몇 달이고 멈춘 채 화면은 옛 회차를 자신 있게 표시한다.
    //
    // 추첨은 주 1회다. 마지막 회차가 10일보다 오래됐다면 새 회차가 **반드시**
    // 존재하므로, 못 받은 것은 우리 쪽 문제다. 그때만 실패로 끝내 알림을 부른다.
    // 정상 주간 실행(추첨 당일·다음 날)에서는 걸리지 않는다.
    const lastDate = draws[draws.length - 1].date;
    const lastAt = Date.UTC(
      Number(lastDate.slice(0, 4)),
      Number(lastDate.slice(4, 6)) - 1,
      Number(lastDate.slice(6, 8)),
    );
    const staleDays = Math.floor((Date.now() - lastAt) / 86400000);

    if (staleDays > 10) {
      throw new Error(
        `${latest}회(${lastDate}) 이후 ${staleDays}일이 지났는데 새 회차를 받지 못했습니다. ` +
          "응답 형식이 바뀌었을 수 있습니다 — model/wire.ts 의 필드 이름을 확인하십시오.",
      );
    }

    console.log(`신규 회차가 없습니다(마지막 추첨 ${staleDays}일 전). 파일을 건드리지 않습니다.`);
    return;
  }

  // 쓰기 직전 마지막 관문. 여기서 걸리면 파일은 그대로 남는다.
  const verified = parseDraws({ draws });
  if (verified.length !== draws.length) {
    throw new Error(`검증에서 ${draws.length - verified.length}개 회차가 걸러졌습니다.`);
  }
  verified.forEach((item, index) => {
    if (item.round !== index + 1) {
      throw new Error(`회차가 이어지지 않습니다: ${index + 1}번째 자리에 ${item.round}회`);
    }
  });

  const payload = {
    latestRound: latest,
    updatedAt: new Date().toISOString().slice(0, 10),
    draws: verified,
  };
  writeFileSync(DATA_PATH, JSON.stringify(payload), "utf-8");
  console.log(`${before}회 → ${latest}회 갱신 완료 (총 ${verified.length}회)`);
}

await main();
