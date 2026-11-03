import { decimal, price as fmtPrice } from "@/lib/format";
import { Delta } from "@/shared/ui";
import type { Quote, StockRef } from "../../model/types";
import { CONSOLE_LABEL } from "./tokens";

/** 2b 콘솔 중앙 열 머리 — 종목명 + 현재가. */
export function ConsoleHeadline({
  stock,
  quote,
}: {
  stock: StockRef;
  quote: Quote;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
      <span className="flex flex-col gap-1.5">
        <span className="flex items-baseline gap-2.5">
          <h1 className="font-display font-bold text-26">
            {stock.name}
          </h1>
          <span
            className="num text-muted-60 text-12 tracking-[0.1em]"
          >
            {stock.symbol} · {stock.market}
          </span>
        </span>
        {stock.nameEn ? (
          <span
            className={`${CONSOLE_LABEL} text-11 tracking-[0.14em]`}
          >
            {stock.nameEn}
          </span>
        ) : null}
      </span>

      <span className="flex items-baseline gap-3">
        <span className="num font-medium leading-none text-34">
          {quote.currency === "USD"
            ? decimal(quote.price, 2)
            : fmtPrice(quote.price)}
        </span>
        {/* 화살표·색 분기를 여기서 다시 쓰지 않는다 — Delta 가 유일한 소유자다.
            이전 구현은 글리프는 change 부호로, 색은 changePercent 부호로 갈라
            둘이 어긋날 수 있었다. */}
        <Delta
          change={quote.change}
          changePercent={quote.changePercent}
          size={13}
          layout="column"
        />
      </span>
    </div>
  );
}
