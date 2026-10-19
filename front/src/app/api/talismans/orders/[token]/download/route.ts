import { API_BASE_URL } from "@/lib/config/env";
import { NextResponse } from "next/server";

/**
 * 부적 원본 다운로드 BFF — 백엔드의 바이트를 **그대로 흘려보낸다.**
 *
 * `apiGet`(axios, JSON) 대신 `fetch` 를 쓰는 이유: 응답이 이미지다. axios 로 받으면
 * 실패 응답의 JSON 봉투까지 바이트 배열이 되어 코드(미결제·만료)를 잃는다.
 *
 * 결제 확인은 백엔드가 한다. 이 라우트는 아무것도 판단하지 않고, 실패면 백엔드의
 * 봉투를 상태 코드와 함께 그대로 옮긴다.
 */

export const revalidate = 0;

interface RouteContext {
  params: Promise<{ token: string }>;
}

/**
 * 백엔드가 정한 헤더 중 브라우저까지 가야 하는 것.
 *
 * `content-length` 는 넘기지 않는다. 중간에서 응답이 압축되면 `fetch` 가 풀어 주므로
 * 길이가 달라지고, 옛 길이를 그대로 실으면 브라우저가 파일을 잘라 받는다.
 */
const PASSED_HEADERS = ["content-type", "content-disposition"] as const;

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const url = `${API_BASE_URL}/talismans/orders/${encodeURIComponent(token)}/download`;

  let upstream: Response;
  try {
    upstream = await fetch(url, { cache: "no-store" });
  } catch {
    return NextResponse.json(
      { error: { code: "talisman_upstream_unreachable", message: "서버에 연결하지 못했습니다." } },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const body = await upstream.json().catch(() => null);
    return NextResponse.json(
      body ?? { error: { code: `http_${upstream.status}`, message: "다운로드하지 못했습니다." } },
      { status: upstream.status },
    );
  }

  const headers = new Headers({
    // 토큰이 곧 자격 증명이다. 중간 캐시에 원본이 남으면 기간이 끝나도 열린다.
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  for (const name of PASSED_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: 200, headers });
}
