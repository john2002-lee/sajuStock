import type { Currency } from "@/shared/types";
import type { StockDetail } from "../../model/types";
import { StockChart } from "../StockChart";
import { CONSOLE_LABEL, CONSOLE_LABEL_STYLE } from "./tokens";

/** 2b 콘솔 차트 블록 — 레전드는 텍스트 라벨만, 그리기는 StockChart 가 한다. */
export function ConsoleChart({
  candles,
  currency,
}: {
  candles: StockDetail["candles"];
  currency: Currency;
}) {
  return (
    <section className="flex flex-col gap-2.5 border-t border-line-14 px-5 py-3.5">
      {/* 계열 이름(MA20·BB·VOL)을 여기 나열하지 않는다 — 지표를 켜고 끌 수 있게
          되면서 `StockChart` 의 토글 칩이 그 목록을 들고 있고, 정적으로 적어 두면
          꺼진 지표까지 늘 표시해 화면과 어긋난다 (에디토리얼의 `ChartLegend` 를
          걷어낸 것과 같은 이유). 조작 안내만 남긴다. */}
      <div className="flex flex-wrap items-baseline justify-end gap-4">
        <span className="flex gap-3.5">
          <span className={CONSOLE_LABEL} style={CONSOLE_LABEL_STYLE}>
            scroll=zoom
          </span>
          <span className={CONSOLE_LABEL} style={CONSOLE_LABEL_STYLE}>
            hover=ohlcv
          </span>
        </span>
      </div>
      <StockChart
        candles={candles}
        currency={currency}
        height={320}
        heightClassName="h-[220px] md:h-[320px]"
      />
    </section>
  );
}
