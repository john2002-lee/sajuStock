import Image from "next/image";
import Link from "next/link";
import { TALISMAN_LICENSE_NOTE } from "@/shared/legal/talisman";
import { findTalisman } from "../model/catalog";
import { formatKstDateTime } from "../model/checkout";
import { TalismanDownloadButton } from "./TalismanDownloadButton";

/**
 * 구매 완료 화면 — 원본을 **한 번** 내려받게 한다.
 *
 * 화면의 그림은 **견본**이다. 원본을 `<img>` 로 띄우면 그 요청이 일회 다운로드를
 * 써 버린다(그림을 보기만 하고 저장할 기회를 잃는다). 원본은 버튼으로만 나간다.
 */

export interface TalismanOrder {
  talisman_id: string;
  name: string;
  download_expires_at: string;
  expired: boolean;
  downloaded: boolean;
}

export function TalismanOrderView({ token, order }: { token: string; order: TalismanOrder }) {
  const item = findTalisman(order.talisman_id);
  const expiresAt = formatKstDateTime(order.download_expires_at);

  return (
    <div className="rounded-card bg-surface p-6 shadow-card sm:p-8">
      <p className="font-mono-kr text-xs tracking-[0.12em] text-gold-text">구매 완료</p>
      <h1 className="mt-2 font-display text-2xl text-ink">{order.name}</h1>
      {item && (
        <>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">{item.description}</p>
          <Image
            src={item.previewSrc}
            alt={`${order.name} 견본`}
            width={320}
            height={641}
            className="mx-auto mt-6 h-auto w-full max-w-[240px] rounded-[12px] shadow-card-sm"
          />
          <p className="mt-2 text-center text-[12px] text-muted-3">
            견본 이미지입니다. 받으시는 원본에는 &lsquo;견본&rsquo; 글자가 없습니다.
          </p>
        </>
      )}

      {order.downloaded ? (
        <p className="mt-6 rounded-card-sm border border-hairline bg-surface-warm px-4 py-3 text-[14px] leading-relaxed text-ink-body">
          이미 내려받으신 부적입니다. 원본은 한 번만 받으실 수 있어요. 받는 도중 실패했다면{" "}
          <Link href="/support" className="text-gold-text underline underline-offset-2">
            고객센터
          </Link>
          로 알려 주세요.
        </p>
      ) : order.expired ? (
        <p className="mt-6 rounded-card-sm border border-hairline bg-surface-warm px-4 py-3 text-[14px] leading-relaxed text-ink-body">
          다운로드 기간({expiresAt}까지)이 지났습니다.
        </p>
      ) : (
        <>
          <TalismanDownloadButton token={token} fallbackName={`talisman-${order.talisman_id}.png`} />
          <p className="mt-3 text-center text-[12.5px] leading-relaxed text-muted-3">
            <strong className="font-semibold text-ink-body">한 번만 받으실 수 있습니다.</strong>{" "}
            {expiresAt}까지 받아 주세요. 주소를 아는 사람은 누구나 받을 수 있으니 공유하지
            마세요.
          </p>
        </>
      )}

      <p className="mt-4 text-center text-[12px] leading-relaxed text-muted-3">{TALISMAN_LICENSE_NOTE}</p>
      <Link href="/" className="mt-4 block text-center text-[13px] text-muted-2 underline underline-offset-2">
        처음 화면으로
      </Link>
    </div>
  );
}
