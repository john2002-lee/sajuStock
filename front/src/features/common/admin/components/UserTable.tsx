import Link from "next/link";
import type { AdminUser } from "../model/types";

export interface UserTableProps {
  rows: readonly AdminUser[];
  total: number;
}

/** 데스크탑 5열: 회원 · 권한 · 관심종목 · 세션 · 가입 확인 */
const GRID = "grid grid-cols-[1.7fr_84px_92px_72px_92px] items-center gap-3";

/**
 * 회원 목록.
 *
 * 랭킹·조건 검색 표와 같은 방식이다 — `<table>` 이 아니라 CSS 그리드 + ARIA 이고,
 * `sr-only` 를 그리드 아이템에 직접 주지 않는다(position:absolute 가 되어 열이
 * 밀린다). 모바일은 열 구조가 달라 별도 마크업으로 접는다.
 *
 * **관심종목 수를 목록에서 보여주는 이유**: 삭제를 누르기 전에 "이 계정에 무엇이
 * 달려 있는지" 가 목록 단계에서 이미 보여야 한다. 상세에 들어가야만 알 수 있으면
 * 목록에서 지울 대상을 잘못 고른다.
 */
export function UserTable({ rows, total }: UserTableProps) {
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-muted-60" style={{ fontSize: 12.5 }}>
        조건에 맞는 회원이 없습니다.
      </p>
    );
  }

  return (
    <>
      <div role="table" aria-label="회원 목록" className="hidden md:block">
        <div
          role="row"
          className={`${GRID} sticky top-0 z-10 border-b border-line-20 bg-paper pb-2 pt-3 font-mono uppercase tracking-label-wide text-muted-50`}
          style={{ fontSize: 10 }}
        >
          <span role="columnheader">회원</span>
          <span role="columnheader">권한</span>
          <span role="columnheader" className="text-right">
            관심종목
          </span>
          <span role="columnheader" className="text-right">
            세션
          </span>
          <span role="columnheader" className="text-right">
            메일 인증
          </span>
        </div>

        {rows.map((row) => (
          <Link
            key={row.id}
            role="row"
            href={`/admin/users/${row.id}`}
            className={`${GRID} border-b border-dotted border-line-22 py-2.5 hover:bg-surface-hover`}
          >
            <span role="cell" className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-medium" style={{ fontSize: 13 }}>
                {row.email ?? "(이메일 없음)"}
              </span>
              <span className="truncate text-muted-45" style={{ fontSize: 10 }}>
                {row.name ?? "이름 없음"}
              </span>
            </span>
            <span role="cell">
              <RoleBadge role={row.role} />
            </span>
            <span role="cell" className="num text-right" style={{ fontSize: 12.5 }}>
              {row.watchlistCount}
            </span>
            <span
              role="cell"
              className="num text-right text-muted-60"
              style={{ fontSize: 12.5 }}
            >
              {row.activeSessions}
            </span>
            <span
              role="cell"
              className="num text-right text-muted-60"
              style={{ fontSize: 11.5 }}
            >
              {row.emailVerified ? "완료" : "—"}
            </span>
          </Link>
        ))}
      </div>

      <ol className="flex flex-col md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/admin/users/${row.id}`}
              className="flex min-h-[var(--tap)] items-center gap-3 border-b border-dotted border-line-22 py-2.5 hover:bg-surface-hover"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium" style={{ fontSize: 13.5 }}>
                  {row.email ?? "(이메일 없음)"}
                </span>
                <span className="num truncate text-muted-45" style={{ fontSize: 10 }}>
                  관심종목 {row.watchlistCount} · 세션 {row.activeSessions}
                </span>
              </span>
              <RoleBadge role={row.role} />
            </Link>
          </li>
        ))}
      </ol>

      <p className="num pt-1 text-muted-45" style={{ fontSize: 10 }}>
        {total > rows.length
          ? `전체 ${total.toLocaleString("ko-KR")}명 중 ${rows.length.toLocaleString("ko-KR")}명`
          : `${rows.length.toLocaleString("ko-KR")}명`}
      </p>
    </>
  );
}

/**
 * 권한 뱃지. 관리자만 반전 solid 다.
 *
 * 일반 회원에게도 뱃지를 그리는 이유: 빈칸으로 두면 "권한 정보를 못 받았다" 와
 * "일반 회원이다" 가 화면에서 같아진다.
 */
export function RoleBadge({ role }: { role: AdminUser["role"] }) {
  const admin = role === "admin";
  return (
    <span
      className={`inline-flex items-center border px-1.5 py-px font-mono uppercase tracking-label ${
        admin ? "border-ink bg-ink text-on-ink" : "border-line-28 text-muted-60"
      }`}
      style={{ fontSize: 9 }}
    >
      {admin ? "admin" : "user"}
    </span>
  );
}
