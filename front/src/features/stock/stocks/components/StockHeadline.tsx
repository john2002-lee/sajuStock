import { direction, price as fmtPrice, type Direction } from "@/lib/format";
import { QUOTE_DELAY_NOTE } from "@/lib/config/marketHours";
import { Chip, Delta } from "@/shared/ui";
import type { Quote, StockRef } from "../model/types";

const CURRENCY_UNIT: Record<Quote["currency"], string> = {
  KRW: "원",
  USD: "USD",
};

/**
 * 등락 알약의 **배경**. 글자색은 여전히 `Delta` 가 소유한다 — 여기 있는 것은
 * 그 색을 옅게 깐 판이다.
 *
 * **부호를 여기서 다시 보지 않는다.** `direction()` 이 방향 판정의 유일한
 * 출처이고(`lib/format/direction`), 이 표는 그 결과를 받기만 한다. 보합에
 * 색을 주지 않는 것도 그 함수가 `flat` 을 따로 두기 때문이다.
 *
 * `bg-up/12` 같은 opacity modifier 를 쓰지 않는다 — 이유는 `--up-wash` 토큰
 * 주석에 있다(구형 브라우저 폴백이 불투명 원색이라 빨강 위 빨강이 된다).
 *
 * 클래스를 **문자열로 온전히** 적는다 — `bg-${d}/12` 로 조립하면 Tailwind 가
 * 스캔에서 못 보고 유틸을 아예 만들지 않는다(오행 막대가 실제로 그렇게 투명하게
 * 렌더된 적이 있다, `globals.css` 주석).
 */
const DELTA_WASH: Record<Direction, string> = {
  up: "bg-up-wash",
  down: "bg-down-wash",
  flat: "bg-surface",
};

export function StockHeadline({
  stock,
  quote,
}: {
  stock: StockRef;
  quote: Quote;
}) {
  return (
    // 모바일은 세로 스택 — 46px 종목명과 44px 가격을 375px 안에 나란히 두면
    // 둘 다 잘린다. 데스크탑(≥768)은 기존 좌우 배치 그대로다.
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="font-display font-bold leading-none tracking-[-0.02em] text-34 md:text-48">
          {stock.name}
        </h1>
        {stock.nameEn ? (
          <p className="font-mono leading-none tracking-[0.03em] text-muted-55 text-13 md:text-16">
            {stock.nameEn}
          </p>
        ) : null}
        <div className="mt-0.5 flex flex-wrap gap-1.5">
          <Chip>{stock.symbol}</Chip>
          <Chip>{stock.market}</Chip>
          {stock.sector ? <Chip variant="solid">{stock.sector}</Chip> : null}
        </div>
      </div>

      {/* 모바일에서는 가격을 왼쪽 정렬해 종목명과 축을 맞춘다 */}
      <div className="flex flex-col items-start gap-1.5 md:items-end">
        <p className="num font-medium leading-none tracking-[-0.02em] text-34 md:text-48">
          {fmtPrice(quote.price, quote.currency)}
          <span className="ml-1 text-muted-50 text-16">
            {CURRENCY_UNIT[quote.currency]}
          </span>
        </p>
        {/* **등락을 알약으로 담는다.** 예전에는 가격 아래 맨 숫자였는데, 48px
            가격 바로 밑에서 색만 다른 숫자는 가격의 일부처럼 읽혔다. 배경을 주면
            "이건 별개의 값" 이라는 경계가 생긴다.

            색은 여전히 `Delta` 가 소유한다 — 배경은 그 색을 **옅게 깐 것**이고
            (`/12`), 글자는 원래 색 그대로다. 여기서 등락 색을 다시 계산하지
            않는다 (`lib/format/direction` 이 유일한 출처). */}
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 ${DELTA_WASH[direction(quote.changePercent)]}`}
        >
          <Delta change={quote.change} changePercent={quote.changePercent} size={16} />
        </span>
        {/* 지연 고지를 가격 바로 밑에 둔다 — 마스트헤드 캡션은 스크롤로 사라지지만
            이 숫자는 화면에 계속 남는다. 한 줄로 유지해야 헤드라인이 리플로우되지 않는다. */}
        <p
          className="font-mono uppercase tracking-[0.1em] text-muted-45 text-11"
        >
          {QUOTE_DELAY_NOTE} · 상승 빨강 / 하락 파랑
        </p>
      </div>
    </div>
  );
}
