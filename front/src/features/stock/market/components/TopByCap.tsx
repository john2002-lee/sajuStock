import Link from "next/link";
import { decimal, marketCapKR } from "@/lib/format";
import { Delta, SectionLabel, Sparkline } from "@/shared/ui";
import { ROW_LINK } from "./table";
import type { RankedStock } from "../services/getStockRanking";

/**
 * 홈의 **시가총액 상위 요약**.
 *
 * ## 왜 홈에 두는가
 *
 * 진입 밴드(`FindBand`)의 첫 타일이 "큰 회사부터 — 이름을 아는 회사부터 봅니다" 라고
 * 말해 놓고 **링크만** 준다. 입문자의 동선을 정확히 짚어 놓고 한 번 더 누르게 하는
 * 셈이라, 그 자리에서 바로 몇 줄을 보여준다.
 *
 * 홈에는 등락률(오늘 얼마나 움직였나)만 있고 **규모 축이 없었다.** 시가총액은 "이
 * 회사가 얼마나 큰가" 라서 등락률과 겹치지 않는다.
 *
 * ## 왜 탐색 화면의 `RankingTable` 을 안 쓰는가
 *
 * 저쪽은 정렬·필터·페이지네이션이 붙은 7열 표다. 홈은 **읽고 지나가는 자리**라
 * 컨트롤이 필요 없고, 전체 폭을 표에 내주면 그 아래 블록들이 밀린다. 같은 데이터의
 * 다른 밀도이지 같은 컴포넌트가 아니다.
 *
 * 그래서 공용에서 가져오는 것은 **행 링크의 선·여백(`ROW_LINK`)뿐**이다. 그건 글자
 * 하나까지 같았다. 반면 종목명 블록은 `StockNameCell` 로 바꾸지 않았다 — 여기는
 * 이름이 16px 이고 그쪽은 14px 인데, 그 차이가 바로 위에 적은 "다른 밀도" 다.
 * 크기를 프롭으로 갈라 합치면 근거가 사라지고 옵션만 남는다.
 */
export function TopByCap({ rows, scope }: { rows: RankedStock[]; scope: string }) {
  if (rows.length === 0) return null;

  return (
    <section className="flex flex-col gap-2.5">
      <SectionLabel
        variant="panel"
        right={
          <Link href="/stocks" className="hover:text-ink">
            전체 보기 →
          </Link>
        }
      >
        시가총액 상위
      </SectionLabel>

      <div role="table" aria-label="시가총액 상위" aria-rowcount={rows.length}>
        {rows.map((row) => (
          <Link
            key={row.code}
            role="row"
            href={`/stocks/${row.code}`}
            className={`grid grid-cols-[26px_1.4fr_104px_92px_1fr] items-center ${ROW_LINK}`}
          >
            <span
              role="cell"
              className="num font-mono text-muted-40 text-11"
            >
              {row.rank}
            </span>

            <span role="cell" className="flex min-w-0 flex-col gap-[2px] pr-3">
              <span className="truncate font-display font-medium text-16">
                {row.name}
              </span>
              <span className="truncate font-mono text-muted-50 text-10">
                {row.code} · {row.board}
              </span>
            </span>

            {/* 시총 배치가 아직 안 채운 종목은 `null` 이다 — 0 으로 그리면 "시총 0원인
                회사" 가 되므로 대시로 비운다 (`RankedStock.marketCap` 주석). */}
            <span
              role="cell"
              className="num text-right font-medium text-13"
            >
              {row.marketCap === null ? (
                <span className="text-muted-35">—</span>
              ) : (
                marketCapKR(row.marketCap)
              )}
            </span>

            <span role="cell" className="num text-right text-13">
              {decimal(row.price, 0)}
            </span>

            <span role="cell" className="flex items-center justify-end gap-3 pl-3">
              <Sparkline
                points={row.spark}
                changePercent={row.changePercent}
                w={72}
                h={20}
              />
              <Delta changePercent={row.changePercent} arrow={false} size={13} />
            </span>
          </Link>
        ))}
      </div>

      <p className="font-mono text-muted-45 text-10">
        {scope}
      </p>
    </section>
  );
}
