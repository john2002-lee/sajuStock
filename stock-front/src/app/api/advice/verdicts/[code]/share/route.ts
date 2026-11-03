import { NextResponse } from "next/server";
import { adviceOwnerKey } from "@/app/_data/advice";
import { enableVerdictShare } from "@/features/stock/advice/server";
import { toResponse, unauthorized } from "../../../_helpers";

/**
 * 공유 켜기 BFF.
 *
 * 켜는 것만 있고 끄는 것은 없다. **끄기는 링크를 되돌려 받지 못한다** — 이미
 * 퍼진 주소를 죽이는 것과 "공유한 적 없음" 으로 되돌리는 것은 다른 일이고,
 * 후자는 불가능하다. 그 차이를 화면에서 정직하게 말할 준비가 되면 그때 만든다.
 *
 * 두 번 눌러도 백엔드가 **같은 `share_id`** 를 준다. 새로 발급하면 먼저 보낸
 * 링크가 죽는다.
 */

export const revalidate = 0;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const owner = await adviceOwnerKey();
  if (!owner) return unauthorized();

  // Next 16 은 동적 세그먼트를 Promise 로 준다.
  const { code } = await params;

  try {
    return NextResponse.json(await enableVerdictShare(owner, code));
  } catch (error) {
    // 404 는 "기록이 아직 없다" 다 — AI 판단을 먼저 받아야 한다는 뜻이고,
    // 봉투가 코드를 보존하므로 화면이 그렇게 안내할 수 있다 (`_helpers` 주석).
    return toResponse(error);
  }
}
