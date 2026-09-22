import Link from "next/link";
import { QUOTE_DELAY_NOTE } from "@/lib/config/marketHours";
import { RETENTION_DAYS, SUPPORT_EMAIL } from "@/lib/config/public";
import { BUSINESS_INFO, IS_PLACEHOLDER, businessRows } from "@/shared/legal/business";

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
 * 서비스가 주식·사주로 갈리면서 그 문장이 절반의 화면에서 틀리게 됐다 — 사주
 * 온보딩은 시세를 그리지 않는데 "시세·재무·뉴스" 를 면책하고 있었다.
 *
 * 그래서 붙이는 자리를 루트에서 **서비스 레이아웃**으로 내리고, 무엇을 고지할지는
 * 붙이는 쪽이 고른다.
 *
 * ## "사주로 종목을 추천하지 않는다" 는 **빼기로 했다** (2026-09-15)
 *
 * 한때 사주 푸터가 그 문장을 들고 있었다(통합 기획 4.2). 두 서비스를 성향으로
 * 잇는 방향이 전제였는데 **그 방향을 접었다** — 사주와 주식은 지금 서로를 모르는
 * 별개 솔루션이다(`front/CONVENTIONS.md` 의 서비스 경계, 실제로 두 feature 사이에
 * import 가 한 줄도 없다).
 *
 * 하지 않는 일을 굳이 부인하면 **하고 있다는 인상을 먼저 준다.** 사주만 보러 온
 * 사람에게 종목·투자라는 말을 꺼낼 이유가 없다. 일반 면책(의료·법률·투자 판단을
 * 대신하지 않는다)은 남겨 둔다 — 그쪽은 이 서비스가 실제로 오해받을 수 있는 자리다.
 *
 * **기획 문서는 아직 반대로 적혀 있다.** 그것을 근거로 되돌리지 말 것.
 *
 * | `service` | 부르는 곳 |
 * |---|---|
 * | `"stock"` | `app/(stock)/layout.tsx` |
 * | `"saju"`  | `app/(saju)/layout.tsx` |
 * | `"both"`  | 404 · 루트 오류 · 계정 · 관리자 — 어느 쪽인지 모르는 화면 |
 *
 * ## 서비스 이동 줄은 걷어냈다
 *
 * "서비스 선택 · 주식 · 사주" 세 링크가 여기 있었다. 서비스 선택 화면이 사라지고
 * 주식이 개발 전용으로 내려가면서 **셋 중 둘이 갈 곳을 잃었고**, 남은 하나(사주)는
 * 이제 제호가 가리키는 곳과 같다.
 *
 * 주식으로 들어가는 길은 관리자 화면(`app/admin/_components/AdminShell.tsx`)에 있다 —
 * 공개 푸터에서 광고할 표면이 아니다.
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
            사주 풀이는 참고용이며, 의료·법률·투자 판단을 대신하지 않습니다.
            무료로 보시는 동안 생년월일시는 서버에 저장되지 않으며, 리포트를
            구매하신 후 URL을 저장해 두시면 다시 보실 수 있도록 {RETENTION_DAYS}일간
            보관 후 삭제합니다.
          </p>
        ) : null}

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
          <span aria-hidden className="text-line-30">
            ·
          </span>
          <Link href="/refund" className="hover:text-ink">
            환불정책
          </Link>
          <span aria-hidden className="text-line-30">
            ·
          </span>
          <Link href="/support" className="hover:text-ink">
            고객센터
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

        {/* 사업자 정보 — 전자상거래법 제13조가 **모든 화면에서** 볼 수 있기를
            요구한다. 그래서 개별 문서가 아니라 여기에 둔다.

            **임시값일 때는 아예 그리지 않는다.** 등록되지 않은 번호를 첫 화면부터
            모든 화면에 뿌리는 것은, 없는 것보다 나쁘다 — 읽는 사람은 그것이 진짜
            등록번호라고 믿는다. 법적 문서 안에서는 "아직 등록 전" 이라는 고지와
            함께 나오므로 그쪽은 그대로 둔다(`BusinessInfoTable`).
            `SUPPORT_EMAIL` 이 비었을 때 연락처 줄을 빼는 것과 같은 규칙이다. */}
        {!IS_PLACEHOLDER ? (
          <p className="text-pretty text-muted-45 text-10 leading-[1.7]">
            {businessRows()
              .map(([label, value]) => `${label} ${value}`)
              .join(" · ")}
            {" · "}
            <a
              href={`https://www.ftc.go.kr/bizCommPop.do?wrkr_no=${BUSINESS_INFO.사업자등록번호.replace(/-/g, "")}`}
              target="_blank"
              rel="noreferrer noopener"
              className="hover:text-ink"
            >
              사업자정보 확인
            </a>
          </p>
        ) : null}
      </div>
    </footer>
  );
}
