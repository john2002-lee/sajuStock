"use client";

import Image from "next/image";
import { useId, useState } from "react";
import { TALISMAN_PRICE } from "@/shared/legal/talisman";
import type { TalismanItem } from "../model/catalog";
import { TalismanCheckout } from "./TalismanCheckout";

/**
 * 부적 한 줄. "구매" 를 누르면 **그 자리에서** 고지·동의·결제 수단이 펼쳐진다.
 *
 * 펼침으로 둔 이유: 환불 제한 고지는 결제 버튼 가까이 있어야 효력이 있다
 * (`PurchaseCard` 머리말 — 전자상거래법 제17조 제6항). 버튼만 있는 행에서 바로
 * 결제창이 열리면 그 고지를 둘 자리가 없다.
 */
export function TalismanRow({ item }: { item: TalismanItem }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="rounded-card-sm border border-hairline bg-surface-warm">
      <div className="flex items-center gap-4 px-3 py-3 sm:gap-5 sm:px-4">
        <Image
          src={item.previewSrc}
          alt={`${item.name} 견본`}
          width={84}
          height={168}
          className="h-auto w-[72px] flex-none rounded-[8px] sm:w-[84px]"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold text-ink">{item.name}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">{item.description}</p>
        </div>
        <div className="flex flex-none flex-col items-end gap-2">
          <span className="text-[15px] font-bold text-gold-text-strong">
            {TALISMAN_PRICE.toLocaleString("ko-KR")}원
          </span>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
            className="min-h-[var(--tap)] rounded-pill bg-button-gradient px-4 text-[13px] font-bold text-on-primary shadow-cta"
          >
            {open ? "닫기" : "구매"}
          </button>
        </div>
      </div>

      {open && (
        <div id={panelId} className="border-t border-hairline px-4 pt-4 pb-5">
          <TalismanCheckout item={item} />
        </div>
      )}
    </div>
  );
}
