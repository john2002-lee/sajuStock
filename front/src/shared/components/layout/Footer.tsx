import Link from "next/link";
import { QUOTE_DELAY_NOTE } from "@/lib/config/marketHours";
import { SUPPORT_EMAIL } from "@/lib/config/public";

/**
 * 전역 푸터 — 고지와 서비스 간 이동을 모든 화면에 상시 노출한다.
 *
 * 예전에는 고지 셋(출처·시세 지연·투자 면책)이 **실패할 때만** 보였다. "yfinance
 * 응답이 늦습니다" 는 에러 화면에만 있고 성공한 화면에는 출처가 어디에도 없었으며,
 * 투자 면책도 AI 드로어를 연 사람만 봤다. 관심종목 표의 AI 판정(`VerdictCell`)이나
 * 종목 상세의 애널리스트 요약(`ReportDigest`)처럼 판단을 담은 다른 자리에는 없었다.
 * 여기 한 곳에 상시 두면 화면마다 따로 챙기지 않아도 된다.
 *
 * ## `service` 가 생긴 이유 — 한 문장이 두 서비스 모두에 맞을 수는 없다
 *
 * 이 푸터는 루트 레이아웃에 하나만 놓여 **모든** 화면에 같은 문장을 깔았다.
 * 서비스가 주식·사주로 갈리면서 그 문장이 절반의 화면에서 틀리게 됐다 —
 * 사주 온보딩은 시세를 그리지 않는데 "시세·재무·뉴스" 를 면책하고 있었고, 정작
 * 그 화면이 반드시 말해야 하는 **"사주로 종목을 추천하지 않는다"**(통합 기획 4.2)
 * 는 어디에도 없었다.
 *
 * 그래서 붙이는 자리를 루트에서 **서비스 레이아웃**으로 내리고, 무엇을 고지할지는
 * 붙이는 쪽이 고른다.
 *
 * | `service` | 부르는 곳 |
 * |---|---|
 * | `"stock"` | `app/(stock)/layout.tsx` |
 * | `"saju"`  | `app/(saju)/layout.tsx` |
 * | `"both"`  | 서비스 선택(`/`) · 404 · 루트 오류 · 계정 — 어느 쪽인지 모르는 화면 |
 *
 * ## 서비스 이동 줄
 *
 * 제호(`Wordmark`)는 **지금 있는 서비스의 홈**으로 간다 — 주식 화면에서 누르면
 * `/stock` 이다. 그러면 서비스 선택 화면(`/`)으로 돌아갈 길이 없어지므로, 그
 * 하나뿐인 출구를 여기 둔다. 화면마다 헤더에 칸을 하나씩 더 만드는 것보다
 * 낫다 — 서비스를 바꾸는 일은 자주 하는 동작이 아니다.
 *
 * ## 법적 문서 링크 — 구매 전에 닿아야 한다
 *
 * 전자상거래법은 약관·환불정책·사업자정보를 **구매 전에** 접근할 수 있게 요구한다.
 * 사주 결제는 `/saju/teaser` 에서 일어나고, 그 화면에서 두 문서로 가는 길은 이
 * 푸터뿐이다. 어느 화면에는 있고 어느 화면에는 없는 푸터는 같은 결함을 퍼널 뒤쪽으로
 * 미루는 것에 지나지 않으므로, `service` 와 무관하게 항상 그린다.
 *
 * `body` 가 `flex flex-col` 이라 본문이 짧은 화면에서도 `mt-auto` 로 뷰포트 바닥에
 * 붙는다. 서비스 레이아웃 안에서 렌더돼도 그대로다 — 프로바이더·프래그먼트는 DOM
 * 노드를 만들지 않으므로 이 `<footer>` 는 여전히 `body` 의 직계 자식이다.
 */
export function Footer({
  service = "both",
}: {
  service?: "stock" | "saju" | "both";
}) {
  return (
    <footer className="mt-auto border-t border-line-20">
      <div
        className="mx-auto flex w-full max-w-shell flex-col gap-2.5 px-4 pt-6 md:px-8"
        style={{ paddingBottom: "calc(28px + var(--safe-b))" }}
      >
        {service !== "saju" ? (
          <p
            className="text-pretty text-muted-60 text-12 leading-[1.7]"
          >
            시세·재무·뉴스·AI 판단은 투자 판단의 참고 자료이며 투자 권유가 아닙니다.
            투자에 따른 손익의 책임은 이용자 본인에게 있습니다.
          </p>
        ) : null}

        {service !== "stock" ? (
          <p
            className="text-pretty text-muted-60 text-12 leading-[1.7]"
          >
            사주 풀이는 참고용이며, 이 서비스는 사주로{" "}
            <strong className="font-medium">종목을 추천하지 않습니다.</strong>{" "}
            의료·법률·투자 판단을 대신하지 않습니다. 무료로 보시는 동안 생년월일시는
            서버에 저장되지 않으며, 리포트를 구매하시면 다시 보실 수 있도록 30일간
            보관 후 삭제합니다.
          </p>
        ) : null}

        {/* 서비스 이동 — 제호가 서비스 홈으로 가므로 선택 화면으로 돌아갈 길은 여기다 */}
        <nav
          aria-label="서비스"
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5 font-mono uppercase text-muted-45 text-10 tracking-[0.14em]"
        >
          <Link href="/" className="hover:text-ink">
            서비스 선택
          </Link>
          <span aria-hidden className="text-line-30">
            ·
          </span>
          <Link
            href="/stock"
            className={service === "stock" ? "text-ink" : "hover:text-ink"}
            aria-current={service === "stock" ? "true" : undefined}
          >
            주식
          </Link>
          <span aria-hidden className="text-line-30">
            ·
          </span>
          <Link
            href="/saju"
            className={service === "saju" ? "text-ink" : "hover:text-ink"}
            aria-current={service === "saju" ? "true" : undefined}
          >
            사주
          </Link>
        </nav>

        {/* 법적 문서 — 서비스와 무관하게 항상 (위 "법적 문서 링크" 절). */}
        <nav
          aria-label="약관 및 정책"
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono uppercase text-muted-45 text-10 tracking-[0.14em]"
        >
          <Link href="/terms" className="hover:text-ink">
            이용약관
          </Link>
          <span aria-hidden className="text-line-30">
            ·
          </span>
          <Link href="/privacy" className="hover:text-ink">
            개인정보처리방침
          </Link>
          {service !== "stock" ? (
            <>
              <span aria-hidden className="text-line-30">
                ·
              </span>
              <Link href="/saju/intro" className="hover:text-ink">
                서비스 소개
              </Link>
            </>
          ) : null}
          {SUPPORT_EMAIL ? (
            <>
              <span aria-hidden className="text-line-30">
                ·
              </span>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-ink">
                문의
              </a>
            </>
          ) : null}
        </nav>

        {service !== "saju" ? (
          <p
            className="font-mono text-muted-45 text-10 tracking-[0.02em]"
          >
            데이터 제공 Yahoo Finance(yfinance) · KRX · {QUOTE_DELAY_NOTE}
          </p>
        ) : null}
      </div>
    </footer>
  );
}
