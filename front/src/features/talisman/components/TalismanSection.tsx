import { TALISMAN_DOWNLOAD_DAYS, TALISMAN_PRICE } from "@/shared/legal/talisman";
import { TALISMAN_ITEMS } from "../model/catalog";
import { TalismanRow } from "./TalismanRow";

/**
 * 메인 화면의 부적 진열대. 로또 섹션(`LottoSection`)과 **같은 2단**이다 — 왼쪽은
 * 무엇인지, 오른쪽은 고를 것. 사용자가 시안 세 개 중 이 모양을 골랐다(B안).
 *
 * 서버 컴포넌트다. 펼치고 결제하는 것만 행(`TalismanRow`)이 클라이언트에서 한다.
 *
 * 견본만 보여 준다. 원본은 결제가 확인된 토큰으로만 내려간다
 * (`back/app/api/v1/endpoints/talismans.py`).
 */
export function TalismanSection() {
  return (
    <section
      aria-labelledby="talisman-heading"
      className="mx-auto w-full max-w-5xl px-5 pb-14 sm:px-6 lg:pb-20"
    >
      <div className="grid gap-y-8 border-t border-hairline pt-10 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:items-start lg:gap-x-16">
        <header>
          <p className="font-mono-kr text-[10px] tracking-[0.22em] text-gold-text">TALISMAN</p>
          <h2
            id="talisman-heading"
            className="mt-3 font-display text-[24px] font-light leading-[1.3] text-ink sm:text-[28px]"
          >
            마음을 담은 <span className="text-gold-text">디지털 부적</span>
          </h2>
          <p className="mt-4 text-pretty text-[14px] leading-relaxed text-muted">
            바라는 마음을 담아 그린 소장용 부적 이미지입니다. 결제하면 바로 원본을 내려받을
            수 있어요.
          </p>
          <p className="mt-3 font-mono-kr text-[11px] tracking-[0.06em] text-muted-3">
            각 {TALISMAN_PRICE.toLocaleString("ko-KR")}원 · 결제 후 {TALISMAN_DOWNLOAD_DAYS}일
            안에 1회 다운로드
          </p>
        </header>

        <ul className="grid gap-3">
          {TALISMAN_ITEMS.map((item) => (
            <li key={item.id}>
              <TalismanRow item={item} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
