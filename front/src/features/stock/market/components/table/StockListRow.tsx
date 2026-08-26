import Link from "next/link";
import { StockNameCell } from "./StockNameCell";
import { CARD_LINK } from "./tokens";

export interface StockListRowProps {
  code: string;
  name: string;
  /** 이름 아래 한 줄 — `코드 · 시장`, 화면에 따라 뒤에 시총·영문명이 붙는다 */
  meta: string;
  /** 왼쪽 순번. 생략하면 그 칸 자체가 없다 (순위가 뜻을 갖지 않는 목록) */
  rank?: number;
  /** 이름과 오른쪽 값 사이. 지금은 전부 `Sparkline` 이지만 이 조각은 모른다 */
  chart?: React.ReactNode;
  /** 오른쪽 위 — 가격 · 정렬 축의 지표값 */
  primary: React.ReactNode;
  /** 오른쪽 아래 — 등락률 · 지표 이름. 없으면 primary 만 선다 */
  secondary?: React.ReactNode;
}

/**
 * **좁은 목록의 한 줄.** 종목 하나를 순번 · 이름 · (그래프) · 값 두 개로 그린다.
 *
 * ## 세 벌이 따로 있었다
 *
 * `RankingCard`(모바일 랭킹) · `ScreenerCard`(모바일 조건 검색) · `MoverList` 의 행
 * (홈 등락 상위)이 **같은 모양을 각자 적고 있었다.** 링크 클래스도, 순번 칸도,
 * 이름 블록도 거의 같은데 여백과 선 색만 조금씩 달랐다(`line-20` vs `line-22`,
 * `pb-[9px]` vs `py-2.5`) — 의도된 차이라는 근거가 어디에도 없어서 표류로 본다.
 *
 * ## `table/index.ts` 가 "행·카드는 여기 오지 않는다" 고 적었던 것과의 관계
 *
 * 그 문장의 근거는 **"열이 다르면 행도 다르다"** 였고, 그건 **데스크탑 그리드 행**에
 * 대해서만 맞다. 이 조각은 그리드를 쓰지 않는다 — flex 한 줄이라 열 개념이 없고,
 * 그래서 6열 표든 7열 표든 같은 모양으로 접힌다. 실제로 세 화면이 같은 것을 그리고
 * 있었다는 사실이 그 증거다. 그리드 행은 그 규칙대로 각자 남는다.
 *
 * 오른쪽 값 두 개의 **뜻은 화면마다 다르다** — 랭킹은 가격/등락률, 조건 검색은
 * 정렬 축의 지표값/축 이름이다. 그 판단은 호출부가 하고 이 조각은 자리만 준다.
 */
export function StockListRow({
  code,
  name,
  meta,
  rank,
  chart,
  primary,
  secondary,
}: StockListRowProps) {
  return (
    <Link href={`/stocks/${code}`} className={CARD_LINK}>
      {rank === undefined ? null : (
        <span className="num w-6 flex-none text-right text-muted-35 text-12">
          {rank}
        </span>
      )}

      <StockNameCell name={name} meta={meta} />

      {chart}

      <span className="flex flex-none flex-col items-end gap-0.5">
        {primary}
        {secondary}
      </span>
    </Link>
  );
}
