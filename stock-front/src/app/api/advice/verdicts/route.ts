import { NextResponse } from "next/server";
import { adviceOwnerKey } from "@/app/_data/advice";
import {
  getVerdictHistory,
  saveVerdict,
  type VerdictCreateBody,
} from "@/features/stock/advice/server";
import { badRequest, toResponse, unauthorized } from "../_helpers";

/**
 * AI 판단 기록 BFF — 내 이력 조회 · 저장.
 *
 * ## 소유자를 `adviceOwnerKey()` 로 받는다 — `readOwnerKey()` 가 아니다
 *
 * 둘은 익명에게 다른 답을 준다. 앞은 `null`(계정이 없다), 뒤는 브라우저 쿠키다.
 * AI 판단은 이미 **계정을 요구**하므로(`app/_data/advice.ts` — 종목당 LLM 4회라
 * 쿠키를 버리고 다시 오는 것으로 상한을 우회할 수 없어야 한다) 기록도 같은 문을
 * 써야 한다. 여기서 `readOwnerKey()` 를 쓰면 **판단은 못 받는데 기록은 쓸 수 있는**
 * 앞뒤가 안 맞는 상태가 된다.
 *
 * ## `owner_key` 를 본문으로 받지 않는다
 *
 * 서버가 세션에서 채운다. 본문으로 받으면 남의 목록에 쓸 수 있다.
 */

export const revalidate = 0;

export async function GET(request: Request) {
  const owner = await adviceOwnerKey();
  if (!owner) return unauthorized();

  const limitParam = new URL(request.url).searchParams.get("limit");
  const parsed = Number(limitParam);
  // 백엔드가 1~100 을 강제하지만 여기서도 자른다 — 이상한 값이 상류까지 가서
  // 422 로 돌아오면 화면은 "내 기록을 못 불러왔다" 로만 읽는다.
  const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : 6;

  // 서비스가 실패를 삼키고 빈 배열을 준다 — 홈의 한 섹션이 화면 전체를 죽이면 안 된다.
  return NextResponse.json({ items: await getVerdictHistory(owner, limit) });
}

export async function POST(request: Request) {
  const owner = await adviceOwnerKey();
  if (!owner) return unauthorized();

  const body = (await request.json().catch(() => null)) as VerdictCreateBody | null;
  if (!body) return badRequest();

  // 최소한만 본다. 나머지 검증(길이·범위·enum)은 백엔드 Pydantic 이 하고,
  // 여기서 규칙을 복사하면 두 벌이 되어 언젠가 갈라진다.
  if (!body.code || !body.symbol || !body.decision) {
    return badRequest("종목과 판단이 있어야 기록할 수 있습니다.");
  }

  try {
    return NextResponse.json(await saveVerdict(owner, body));
  } catch (error) {
    return toResponse(error);
  }
}
