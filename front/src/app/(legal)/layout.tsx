import Link from "next/link";
import type { Metadata } from "next";

/**
 * 법적 문서 셸 — 약관과 개인정보처리방침이 쓴다.
 *
 * ## 왜 서비스 레이아웃 밖에 있나
 *
 * 이 문서들은 **제품 전체**를 덮는다. 사주 결제가 필요하게 만들었지만, 계정과
 * 관심종목을 다루는 주식 쪽도 같은 문서가 덮는다. `(saju)` 안에 두면 주소가
 * `/saju/terms` 가 되어 "사주 서비스만의 약관" 처럼 읽히고, 주식 쪽 푸터에서
 * 링크할 때 어색해진다.
 *
 * `data-service` 를 주지 않으므로 **주식 팔레트(종이 위 에디토리얼)** 로 그려진다.
 * 법적 문서는 어느 서비스의 것도 아니라, 두 팔레트 중 하나를 고르는 것보다 제품의
 * 기본값에 두는 것이 맞다.
 *
 * ## 읽히도록 만드는 것이 이 레이아웃의 일이다
 *
 * 약관은 읽으라고 두는 것이지 갖춰 놓으라고 두는 것이 아니다. 본문 폭을
 * `max-w-2xl` 로 묶어 한 줄이 너무 길어지지 않게 하고, 사주 화면에서 잡아 둔
 * 가독성 규칙(`word-break: keep-all`, 15px 본문, 1.75 행간)을 그대로 쓴다 —
 * 그쪽에서 명암비까지 재서 고친 값이라 여기서 다시 정할 이유가 없다.
 */
export const metadata: Metadata = {
  title: { template: "%s · 종목 원장", default: "약관" },
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper text-muted-75">
      {/* 제호만 있는 얇은 머리. 이 화면에 온 사람이 하려는 일은 읽는 것이고,
          끝나면 돌아가는 것이다 — 그 둘 말고는 아무것도 두지 않는다. */}
      <header className="border-b border-line-20 px-5 py-4 md:px-8">
        <Link
          href="/"
          className="font-display text-[17px] text-ink hover:text-muted-65"
        >
          종목 원장
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-12 md:px-8">{children}</main>

      <footer className="border-t border-line-20 px-5 py-6 md:px-8">
        <nav
          aria-label="법적 문서"
          className="mx-auto flex max-w-2xl flex-wrap gap-x-4 gap-y-2 font-mono text-10 uppercase tracking-[0.14em] text-muted-45"
        >
          <Link href="/terms" className="hover:text-ink">
            이용약관
          </Link>
          <Link href="/privacy" className="hover:text-ink">
            개인정보처리방침
          </Link>
          <Link href="/saju/intro" className="hover:text-ink">
            서비스 소개
          </Link>
          <Link href="/" className="hover:text-ink">
            서비스 선택
          </Link>
        </nav>
      </footer>
    </div>
  );
}
