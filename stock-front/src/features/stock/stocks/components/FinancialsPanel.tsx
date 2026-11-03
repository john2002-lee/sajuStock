import { compact, marketCapKR, multiple, price, unsignedPercent, ymd } from "@/lib/format";
import { DottedRow, SectionLabel, StatRow } from "@/shared/ui";
import type { Currency } from "@/shared/types";
import type { AnnualFinancial, Fundamentals, QuarterlyFinancial } from "../model/types";

/**
 * 재무 탭. 밸류에이션 지표 + 연간 실적.
 *
 * 값이 없는 행은 대시(—)를 그리지 않고 **행 자체를 뺀다** (ReportDigest 와 같은 규칙).
 * 무배당 종목에 "배당수익률 —"이 남으면 데이터가 있는데 못 읽은 것처럼 보인다.
 *
 * 조회 실패는 예외가 아니라 `null` 로 온다 — 재무 한 칸 때문에 상세 페이지가
 * 에러 화면이 되면 안 되기 때문이다 (services/getStockDetail.ts).
 */
export function FinancialsPanel({
  fundamentals,
  currency = "KRW",
}: {
  fundamentals: Fundamentals | null;
  currency?: Currency;
}) {
  const rows = fundamentals ? valuationRows(fundamentals, currency) : [];
  const annual = fundamentals?.annual ?? [];
  const quarterly = fundamentals?.quarterly ?? [];

  if (rows.length === 0 && annual.length === 0 && quarterly.length === 0) {
    return (
      <p className="py-6 text-center text-muted-60 text-13">
        재무 정보를 불러오지 못했습니다.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {rows.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionLabel variant="rule" size={11}>
            밸류에이션
          </SectionLabel>
          <div className="grid grid-cols-1 gap-x-8 gap-y-[11px] md:grid-cols-2">
            {rows.map((row) => (
              <StatRow key={row.label} label={row.label} value={row.value} />
            ))}
          </div>
        </section>
      ) : null}

      {annual.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionLabel variant="rule" size={11} right="최대 4개년">
            연간 실적
          </SectionLabel>
          <div className="flex flex-col">
            <AnnualHeader />
            {annual.map((row) => (
              <AnnualRow key={row.year} row={row} currency={currency} />
            ))}
          </div>
        </section>
      ) : null}

      {/* **연간 다음이다.** 연간이 확정 실적이고 분기는 그 안의 흐름이라,
          큰 그림을 먼저 보고 내려온다. 공급자가 분기를 안 주는 종목도 있어
          (해외·신규 상장) 없으면 블록째 그리지 않는다. */}
      {quarterly.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionLabel variant="rule" size={11} right="최근 5분기">
            분기 실적
          </SectionLabel>
          <div className="flex flex-col">
            <AnnualHeader periodLabel="분기" />
            {quarterly.map((row) => (
              <QuarterRow
                key={`${row.year}Q${row.quarter}`}
                row={row}
                currency={currency}
              />
            ))}
          </div>
          {/* 분기는 계절성이 있어 **직전 분기와의 비교가 오해를 부른다.**
              반도체 4분기가 3분기보다 낮은 것은 나빠진 것이 아닐 수 있다. */}
          <p className="text-muted-45 text-11 leading-relaxed">
            분기 실적은 계절성이 있어 직전 분기보다 <span className="text-muted-60">전년
            동기</span>와 비교하는 편이 정확합니다.
          </p>
        </section>
      ) : null}
    </div>
  );
}

interface Row {
  label: string;
  value: string;
}

/** null 인 항목은 배열에 담기지 않는다 — 그게 이 함수의 전부다. */
function valuationRows(f: Fundamentals, currency: Currency): Row[] {
  const rows: Row[] = [];
  const push = (label: string, value: string | null) => {
    if (value !== null) rows.push({ label, value });
  };
  const num = (value: number | null, format: (v: number) => string) =>
    value === null ? null : format(value);

  push("PER", num(f.per, (v) => multiple(v)));
  push("PBR", num(f.pbr, (v) => multiple(v)));
  push("EPS", num(f.eps, (v) => price(v, currency)));
  push("BPS", num(f.bps, (v) => price(v, currency)));
  // ROE·배당수익률은 등락이 아니라 수준이라 부호를 붙이지 않는다 (percent() 금지).
  push("ROE", num(f.roePercent, (v) => unsignedPercent(v)));
  push("시가총액", num(f.marketCap, (v) => amount(v, currency)));
  push("배당수익률", num(f.dividendYieldPercent, (v) => unsignedPercent(v)));
  push("주당배당금", num(f.dividendPerShare, (v) => price(v, currency)));
  push("배당락일", f.exDividendDate === null ? null : ymd(f.exDividendDate));
  push("다음 실적발표", f.nextEarningsDate === null ? null : ymd(f.nextEarningsDate));

  return rows;
}

/** 원화는 조·억, 그 외는 K/M/B. 통화 판정은 심볼에서 오므로 여기서 다시 하지 않는다. */
function amount(value: number, currency: Currency): string {
  return currency === "KRW" ? marketCapKR(value) : compact(value);
}

const CELL = "num flex-1 text-right text-13";

function AnnualHeader({ periodLabel = "FY" }: { periodLabel?: string } = {}) {
  return (
    <DottedRow align="baseline" className="pb-[7px]">
      <span
        className="w-12 font-mono uppercase tracking-label text-muted-45 text-11"
      >
        {periodLabel}
      </span>
      {/* 열이 넷이 되면서 '영업이익률' 을 '이익률' 로 줄였다 — 375px 에서 네 열이
          한 줄에 들어가야 한다. 어느 이익의 비율인지는 바로 왼쪽 열이 말한다. */}
      {["매출", "영업이익", "순이익", "이익률"].map((label) => (
        <span
          key={label}
          className="flex-1 text-right text-muted-45 text-11"
        >
          {label}
        </span>
      ))}
    </DottedRow>
  );
}

function AnnualRow({ row, currency }: { row: AnnualFinancial; currency: Currency }) {
  return <PeriodRow label={String(row.year)} row={row} currency={currency} />;
}

/**
 * 분기 행. 라벨만 다르고 **셀 넷은 연간과 같다** — 같은 지표를 다른 기간으로
 * 보는 것이라, 열이 갈리면 두 표를 나란히 읽을 수 없다.
 *
 * 라벨은 `25 Q3` 다. 네 자리 연도를 다 쓰면 12px 폭에서 분기가 밀려난다.
 */
function QuarterRow({ row, currency }: { row: QuarterlyFinancial; currency: Currency }) {
  return (
    <PeriodRow
      label={`${String(row.year).slice(2)} Q${row.quarter}`}
      row={row}
      currency={currency}
    />
  );
}

/** 연간·분기가 공유하는 한 행. 기간 라벨만 밖에서 받는다. */
function PeriodRow({
  label,
  row,
  currency,
}: {
  label: string;
  row: Pick<AnnualFinancial, "revenue" | "operatingIncome" | "netIncome">;
  currency: Currency;
}) {
  // 매출이 0이면 이익률이 의미가 없다 — 나눗셈 자체를 하지 않는다.
  const margin =
    row.revenue && row.operatingIncome !== null
      ? (row.operatingIncome / row.revenue) * 100
      : null;
  const loss = row.operatingIncome !== null && row.operatingIncome < 0;

  return (
    <DottedRow align="baseline" className="py-[7px]">
      <span className="num w-12 font-medium text-13">{label}</span>
      <span className={CELL}>
        {row.revenue === null ? "—" : amount(row.revenue, currency)}
      </span>
      {/* 영업이익은 PER 과 달리 방향이 의미를 갖는 값이라 적자에 색을 준다. */}
      <span className={`${CELL} ${loss ? "text-down" : ""}`}>
        {row.operatingIncome === null ? "—" : amount(row.operatingIncome, currency)}
      </span>
      {/* 순이익도 같은 규칙이다. **영업이익과 부호가 다를 수 있다** — 영업에서
          벌고도 금융비용·손상으로 적자가 나는 해가 있어서, 색을 각자 판단한다. */}
      <span
        className={`${CELL} ${
          row.netIncome !== null && row.netIncome < 0 ? "text-down" : ""
        }`}
      >
        {row.netIncome === null ? "—" : amount(row.netIncome, currency)}
      </span>
      <span
        className={`${CELL} ${margin !== null && margin < 0 ? "text-down" : "text-muted-60"}`}
      >
        {margin === null ? "—" : unsignedPercent(margin, 1)}
      </span>
    </DottedRow>
  );
}
