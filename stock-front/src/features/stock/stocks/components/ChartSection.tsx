import type { Currency } from "@/shared/types";
import { SectionLabel } from "@/shared/ui";
import type { Candle } from "../model/types";
import { StockChart } from "./StockChart";

/**
 * 2a 차트 블록. 748×344 는 README 가 지정한 데스크탑 치수다.
 *
 * 모바일에서는 좌우 컨테이너 패딩(px-4)을 음수 마진으로 상쇄해 풀블리드로 빼고
 * 높이를 220px 로 줄인다 — 세로로 이어붙인 화면에서 344px 차트는 첫 화면을
 * 통째로 먹는다. 라벨·레전드는 패딩 안에 그대로 둔다.
 */
export function ChartSection({
  candles,
  currency,
}: {
  candles: Candle[];
  /** 축·툴팁 가격 서식. 해외 종목은 소수 2자리다 (`StockChart`) */
  currency: Currency;
}) {
  return (
    <section className="flex flex-col gap-3.5">
      {/* 휠·커서 안내는 마우스가 있을 때만 참이다. 터치에서는 설명이 틀린 데다
          390px 에서 라벨을 두 줄로 밀어낸다 — 데스크탑에서만 노출한다. */}
      <SectionLabel
        right={
          <span className="hidden md:inline">
            휠 = 기간 확대/축소 · 커서 = 시세 확인
          </span>
        }
      >
        가격 · 이동평균 · 볼린저밴드
      </SectionLabel>
      {/* 범례는 따로 두지 않는다 — 지표를 켜고 끌 수 있게 되면서 `StockChart` 의
          토글 칩이 색 견본을 함께 들고 있다. 정적 범례를 남기면 꺼진 지표까지
          늘 표시해 화면과 어긋난다 (`StockChart` 의 보기 설정 주석). */}
      {/* 음수 마진만으로 풀블리드. 100vw 를 쓰면 세로 스크롤바 폭까지 더해져
          데스크탑에서 가로 스크롤이 생긴다.

          예전에는 `md:max-w-[748px]` 로 폭을 묶어 뒀다(README 가 지정한 데스크탑
          치수). 화면 폭을 1440 으로 올리면서 걷어냈다 — 본문 칸이 1000px 을 넘는데
          차트만 748 에 멈추면 그 오른쪽이 통째로 빈다. 차트는 문장이 아니라 표에
          가까워서, 넓어지면 봉 하나당 픽셀이 늘어 읽기 쉬워진다. */}
      {/* 모바일에서는 풀블리드(`-mx-4`)라 라운드를 주지 않는다 — 화면 끝까지 닿는
          면에 모서리를 깎으면 잘린 것처럼 보인다. 데스크탑에서만 카드로 담는다.
          `overflow-hidden` 이 함께 가야 캔버스가 모서리를 넘지 않는다. */}
      <div className="-mx-4 md:mx-0 md:overflow-hidden md:rounded-14">
        <StockChart
          candles={candles}
          currency={currency}
          height={344}
          heightClassName="h-[220px] md:h-[344px]"
        />
      </div>
    </section>
  );
}
