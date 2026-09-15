import { count as fmtCount, stamp } from "@/lib/format";
import type { MemberVisit, VisitStats } from "../model/types";

export interface VisitPanelProps {
  visits: VisitStats;
}

/**
 * 접속 통계 — 총·일일 접속자수, 30일 추이, 회원별 접속수와 최근 접속일시.
 *
 * ## 회원 관리의 `활성 세션` 과 다른 질문에 답한다
 *
 * 그쪽은 NextAuth 의 만료되지 않은 세션 수라 "지금 로그인해 있나" 다. 여기는
 * 누적과 추이다 — 어제 몇 명 왔는지, 이 회원이 마지막으로 언제 왔는지는 그쪽으로
 * 알 수 없었다.
 *
 * ## 총접속자수 옆에 구성을 반드시 함께 쓴다
 *
 * 접속 정의가 "익명 포함" 이다. 사주 서비스는 회원가입을 받지 않으므로 방문자
 * 다수가 익명이고, 숫자만 크게 써 두면 **회원 수로 오해된다.** 그래서 익명·회원을
 * 나눠 바로 아래에 적는다.
 *
 * 서버 컴포넌트다 — 막대는 CSS 폭이고 상호작용이 없다 (`OpsPanel` 과 같다).
 */
export function VisitPanel({ visits }: VisitPanelProps) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2.5">
        <SectionTitle>접속자</SectionTitle>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
          <Big label="총 접속자" value={fmtCount(visits.totalVisitors)} />
          <Big label={`오늘 (${visits.today})`} value={fmtCount(visits.todayVisitors)} />
          <Big label="회원" value={fmtCount(visits.memberVisitors)} />
          <Big label="익명" value={fmtCount(visits.anonVisitors)} />
        </div>
        {/* 총 방문일을 함께 적는다. 접속자수만으로는 재방문이 있었는지 알 수 없고,
            방문자와 방문일이 같으면 **아무도 두 번 오지 않았다**는 뜻이다. */}
        <p className="num text-muted-45" style={{ fontSize: 10 }}>
          총 방문일 {fmtCount(visits.totalVisitDays)}건 · 방문자당 평균{" "}
          {perVisitor(visits)}일 · 접속 1회는 하루 기준입니다
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        <SectionTitle>최근 {visits.daily.length}일</SectionTitle>
        {/* **방문 0 인 날도 칸을 차지한다.** 서버가 축을 채워 보내므로 여기서
            빈 날을 만들지 않는다 — 두 곳이 날짜를 판단하면 하루 밀린다. */}
        <Trend daily={visits.daily} />
      </div>

      <div className="flex flex-col gap-2.5">
        <SectionTitle>회원별 접속</SectionTitle>
        {visits.members.length > 0 ? (
          <>
            <MemberTable rows={visits.members} />
            {visits.memberTotal > visits.members.length ? (
              <p className="num text-muted-45" style={{ fontSize: 10 }}>
                {fmtCount(visits.members.length)} / {fmtCount(visits.memberTotal)}명
                표시
              </p>
            ) : null}
          </>
        ) : (
          /* "회원이 없다" 와 "회원은 있는데 아무도 접속 기록이 없다" 를 구분해
             말한다. 후자는 기록 경로(`VisitBeacon`)가 죽었을 때의 모습이다. */
          <p className="text-muted-45" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
            접속 기록이 있는 회원이 없습니다. 회원이 아직 없거나, 로그인한 방문이
            한 번도 기록되지 않았습니다.
          </p>
        )}
      </div>
    </section>
  );
}

/** 방문자당 평균 방문일. **분모가 0 일 때 NaN 을 그리지 않는다** (`Coverage` 와 같은 이유). */
function perVisitor(visits: VisitStats): string {
  if (visits.totalVisitors <= 0) return "0";
  return (visits.totalVisitDays / visits.totalVisitors).toFixed(1);
}

/**
 * 30일 막대. 높이가 그날의 접속자수다.
 *
 * 최댓값을 100% 로 두는 상대 척도다 — 절대 척도로 두면 방문이 적을 때 막대가
 * 전부 바닥에 붙어 추이가 안 보인다. 대신 최댓값을 숫자로 함께 적어, 막대 높이가
 * 무엇에 대한 비율인지 알 수 있게 한다.
 *
 * 최신이 먼저 오지만 **그래프는 왼쪽이 과거**여야 읽힌다. 그래서 여기서 뒤집는다.
 */
function Trend({ daily }: { daily: VisitStats["daily"] }) {
  if (daily.length === 0) {
    return (
      <p className="text-muted-45" style={{ fontSize: 11.5 }}>
        추이를 그릴 기간이 없습니다.
      </p>
    );
  }

  const peak = Math.max(...daily.map((point) => point.visitors), 1);
  const oldestFirst = [...daily].reverse();

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-[54px] items-end gap-[3px]">
        {oldestFirst.map((point) => (
          <div
            key={point.day}
            className="flex-1 bg-surface"
            style={{ height: "100%" }}
            title={`${point.day} · ${point.visitors}명`}
          >
            <div
              className="w-full bg-ink"
              style={{
                // 접속이 있는 날은 최소 2px 을 준다. 1명인 날이 0 인 날과
                // 똑같이 보이면 "아무도 안 왔다" 로 읽힌다.
                height: point.visitors > 0
                  ? `max(2px, ${Math.round((point.visitors / peak) * 100)}%)`
                  : "0%",
                marginTop: "auto",
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex items-baseline justify-between">
        <span className="num text-muted-45" style={{ fontSize: 10 }}>
          {oldestFirst[0]?.day}
        </span>
        <span className="num text-muted-45" style={{ fontSize: 10 }}>
          최대 {fmtCount(peak)}명
        </span>
        <span className="num text-muted-45" style={{ fontSize: 10 }}>
          {oldestFirst[oldestFirst.length - 1]?.day}
        </span>
      </div>
    </div>
  );
}

/**
 * 회원 표. **최근 접속일시 내림차순**이다 — 이 화면에서 가장 자주 찾는 것이
 * "요즘 오는 사람" 이다.
 *
 * 접속 기록이 없는 회원은 아예 나오지 않는다(백엔드가 inner join 한다).
 * "한 번도 안 온 회원" 은 회원 관리 화면이 답하는 질문이다.
 */
function MemberTable({ rows }: { rows: MemberVisit[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ fontSize: 12 }}>
        <thead>
          <tr className="border-b border-line-20 text-left">
            <Th>회원</Th>
            <Th align="right">접속수</Th>
            <Th align="right">최근 접속</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.userId} className="border-b border-dotted border-line-22">
              <td className="py-1.5 pr-3">
                {/* 이메일이 없는 계정이 있다(OAuth 가 안 주는 경우). 그때 이름,
                    이름도 없으면 id 를 보여준다 — 빈 칸은 어느 행인지 알 수 없다. */}
                <span>{row.email ?? row.name ?? row.userId}</span>
                {row.email && row.name ? (
                  <span className="text-muted-45"> · {row.name}</span>
                ) : null}
              </td>
              <td className="num py-1.5 pr-3 text-right">{fmtCount(row.visitCount)}</td>
              <td className="num py-1.5 text-right text-muted-60">
                {row.lastSeenAt ? stamp(row.lastSeenAt) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`pb-1.5 font-mono font-normal uppercase tracking-label text-muted-45 ${
        align === "right" ? "text-right" : "text-left"
      }`}
      style={{ fontSize: 9.5 }}
    >
      {children}
    </th>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span
        className="font-mono uppercase tracking-label text-muted-45"
        style={{ fontSize: 9.5 }}
      >
        {label}
      </span>
      <span className="num font-medium" style={{ fontSize: 20 }}>
        {value}
      </span>
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="font-mono uppercase tracking-label-wide text-muted-50"
      style={{ fontSize: 10 }}
    >
      {children}
    </h2>
  );
}
