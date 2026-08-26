import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSharedVerdict } from "@/features/stock/advice/server";
import { ymd } from "@/lib/format";
import { Footer } from "@/shared/components/layout/Footer";
import { Masthead } from "@/shared/components/layout/Masthead";
import { button, Meter } from "@/shared/ui";

/**
 * 공유된 AI 판단 한 건 — **로그인 없이 열리는 유일한 화면.**
 *
 * ## 라우트 그룹 밖이다
 *
 * `(stock)` 안에 두면 주식 서비스 셸(제목 템플릿·하단 탭바)이 붙는다. 이 주소로
 * 오는 사람은 대개 **이 제품을 처음 보는 사람**이라, 담아 둔 종목도 없는 채로
 * "대시보드 · 시장 · 검색 · 탐색" 을 하단에 광고하는 셈이 된다. 푸터는 직접 든다
 * (`app/page.tsx` · `not-found` 와 같은 자세).
 *
 * ## 색인하지 않는다
 *
 * `share_id` 는 128비트 난수라 추측으로 닿을 수 없지만, **크롤러는 링크를 따라온다.**
 * 누군가 이 주소를 공개된 곳에 붙이는 순간 검색 결과에 남고, 그때는 "링크를 아는
 * 사람만" 이라는 약속이 깨진다. `robots: noindex` 가 그 사이를 막는다.
 *
 * ## 무엇을 보여주지 않는가
 *
 * 소유자·심볼·판단 시점 가격이 응답에 없다 — 백엔드가 빼고 준다. 링크를 받은
 * 사람에게 필요한 것은 종목과 판단이고, 그 이상은 링크를 넘겨받은 제3자에게까지
 * 흘러간다. 2축 판단(`personal`)은 **애초에 저장되지 않는다.**
 */

export const revalidate = 0;

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SharedVerdictPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const verdict = await getSharedVerdict(shareId);

  // 서비스가 실패도 `null` 로 접는다 — 여기서 404 로 착지시키면 "링크가 틀렸다" 와
  // "서버가 아프다" 가 같은 화면이 되지만, 링크를 받은 사람이 할 수 있는 일은
  // 어느 쪽이든 같다(보낸 사람에게 다시 묻기).
  //
  // **알려진 한계: 화면은 404 인데 상태 코드는 200 이다.** 실측으로 확인했다
  // (`/verdict/<없는id>` → 200 + 404 화면). 루트 `app/loading.tsx` 가 만드는
  // Suspense 경계 때문에 셸이 먼저 흘러나가 헤더가 이미 커밋된 뒤에 `notFound()`
  // 가 불리기 때문이다 — 이 저장소가 `/dashboard` 의 `redirect()` 에서 이미
  // 겪은 것과 **같은 함정**이고(기획 7.1.1: "307 이 아니라 meta refresh 로
  // 내려간다"), 그때 답은 렌더 앞단(`proxy.ts`)에서 끊는 것이었다.
  //
  // 여기서는 그 답을 쓸 수 없다 — 링크가 유효한지는 DB 를 봐야 알고 Edge 는 DB 를
  // 못 본다. 지금 감수하는 이유는 영향이 좁아서다: 이 주소는 `noindex` 라 검색
  // 결과에 남지 않고, 사람에게는 404 화면이 정확히 보인다. 기계가 200 을 읽는
  // 것이 문제가 되는 날(예: 링크 검사기) 다시 본다.
  if (!verdict) notFound();

  return (
    <>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-[30px] pt-[26px] md:px-8">
        <Masthead caption="공유된 AI 판단" />

        <section className="flex flex-col gap-4 rounded-14 bg-ink p-6 text-on-ink">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono uppercase tracking-label text-on-ink-55 text-11">
              final decision
            </span>
            {verdict.source === "llm" ? null : (
              <span className="rounded-6 border border-on-ink-45 px-1.5 py-0.5 font-mono uppercase tracking-label-tight text-on-ink-75 text-10">
                규칙 기반 판단
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-display font-medium text-on-ink-78 text-16">
              {verdict.name}
            </span>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-display font-bold leading-none text-48">
                {verdict.decision}
              </span>
              <span className="num text-up-on-ink text-13">
                신뢰도 {verdict.confidence}%
              </span>
            </div>
          </div>

          <Meter value={verdict.confidence} inverted label="판단 신뢰도" />

          <p className="font-display text-pretty text-on-ink-90 text-14 leading-[1.75]">
            {verdict.answer}
          </p>

          <p className="border-t border-on-ink-15 pt-[9px] font-mono text-on-ink-45 text-10 leading-[1.6]">
            {ymd(verdict.createdAt)} 분석
            <br />
            투자 판단의 참고 자료이며 투자 권유가 아닙니다.
          </p>
        </section>

        {/* 이 화면에 온 사람은 대개 제품을 처음 본다. 판단 하나만 보여주고 끝내면
            "그래서 이게 뭔가" 가 남는다 — 같은 종목으로 들어가는 문을 준다. */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Link href={`/stocks/${verdict.code}`} className={button()}>
            {verdict.name} 보기
          </Link>
          <Link href="/stock" className={button({ tone: "quiet" })}>
            시장 현황
          </Link>
        </div>

        <p className="text-muted-55 text-12 leading-relaxed">
          이 판단은 AI 에이전트 셋의 의견을 종합해 만든 것이며, 받은 사람의 투자 성향은
          반영되어 있지 않습니다.
        </p>
      </main>

      <Footer service="stock" />
    </>
  );
}
