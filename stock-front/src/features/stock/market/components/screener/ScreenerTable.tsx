import type { ScreenerQuery } from "../../model/screener";
import { hasAnyCondition } from "../../model/screener";
import { TableShell } from "../table";
import type { ScreenerResult } from "../../services/getScreener";
import { ScreenerCard } from "./ScreenerCard";
import { ScreenerHeadRow } from "./ScreenerHeadRow";
import { ScreenerRow } from "./ScreenerRow";

export interface ScreenerTableProps {
  result: ScreenerResult;
  /** 빈 목록을 어떻게 설명할지 정하는 데 쓴다 */
  query: ScreenerQuery;
}

/**
 * 조건 검색 목록 — 데스크탑 표 / 모바일 행을 조립한다.
 *
 * 껍데기는 공용 `TableShell` 이 한다(랭킹 표와 같은 방식으로 갈라야 한다).
 * 안에 들어가는 행은 열이 달라 각자 남는다 — 그쪽은 시세 6열, 여기는 지표 7열이다.
 *
 * **빈 상태는 공용으로 올리지 않는다.** 아래 `EmptyState` 가 이 화면에서만 뜻이 있는
 * 세 갈래를 설명한다.
 */
export function ScreenerTable({ result, query }: ScreenerTableProps) {
  if (result.rows.length === 0) {
    return <EmptyState result={result} query={query} />;
  }

  return (
    <TableShell
      label="조건 검색 결과"
      rowCount={result.rows.length}
      desktop={
        <>
          <ScreenerHeadRow sort={query.sort} order={result.order} />
          {result.rows.map((row) => (
            <ScreenerRow key={row.code} row={row} />
          ))}
        </>
      }
      mobile={result.rows.map((row) => (
        <li key={row.code}>
          <ScreenerCard row={row} sort={query.sort} />
        </li>
      ))}
    />
  );
}

/**
 * 빈 결과를 **세 가지로 갈라 설명한다.**
 *
 * 이 화면에서 "0건" 은 뜻이 하나가 아니다.
 *
 *   ① 배치가 아직 지표를 못 채웠다      → 기다리면 채워진다. 조건을 바꿔도 소용없다
 *   ② 조건이 너무 좁다                  → 조건을 풀면 나온다
 *   ③ 조건이 없는데도 0건               → 백엔드가 꺼져 있거나 목록이 비었다
 *
 * 셋을 "표시할 종목이 없습니다" 하나로 뭉개면, ①인 사람이 조건을 계속 바꾸며
 * 헤매게 된다. 백엔드가 `covered`/`universe_size` 를 함께 주는 이유가 이것이다.
 */
function EmptyState({ result, query }: ScreenerTableProps) {
  const filling = result.covered < result.universeSize;
  const progress =
    result.universeSize > 0
      ? `${result.covered.toLocaleString("ko-KR")} / ${result.universeSize.toLocaleString("ko-KR")}종목`
      : null;

  return (
    <div className="flex flex-col items-center gap-1.5 py-10 text-center">
      <p className="text-muted-60 text-13">
        {hasAnyCondition(query)
          ? "조건에 맞는 종목이 없습니다."
          : "표시할 종목이 없습니다."}
      </p>

      {filling && progress ? (
        <p className="num text-muted-45 text-11">
          지표 수집 {progress} — 아직 채우는 중입니다
        </p>
      ) : null}
    </div>
  );
}
