import { stamp } from "@/lib/format";
import { actionLabel, type AuditEntry } from "../model/types";

export interface AuditListProps {
  rows: readonly AuditEntry[];
}

/**
 * 감사 로그 — 관리자가 한 일과 **거절된 시도**.
 *
 * 거절(`ok=false`)을 성공과 같은 모양으로 그리면 안 된다. "마지막 관리자를 강등하려
 * 했다" 가 조용히 섞여 있으면 그 신호를 볼 수 없고, 그 신호는 실수일 수도 침입일
 * 수도 있어서 사람이 봐야 한다.
 *
 * 색으로만 구분하지 않는다 — 거절 줄에는 `거절` 라벨이 글자로 붙는다.
 */
export function AuditList({ rows }: AuditListProps) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-muted-60" style={{ fontSize: 12.5 }}>
        아직 기록이 없습니다.
      </p>
    );
  }

  return (
    <ol className="flex flex-col">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex flex-col gap-1 border-b border-dotted border-line-22 py-2.5"
        >
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-medium" style={{ fontSize: 13 }}>
              {actionLabel(row.action)}
            </span>
            {!row.ok ? (
              <span
                className="border border-line-35 px-1.5 py-px font-mono uppercase tracking-label text-muted-60"
                style={{ fontSize: 9 }}
              >
                거절
              </span>
            ) : null}
            <span className="num text-muted-45" style={{ fontSize: 10 }}>
              {stamp(row.createdAt)}
            </span>
          </span>

          <span className="text-muted-70" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
            {row.actorEmail ?? "알 수 없음"} → {row.targetEmail ?? "알 수 없음"}
            {row.detail ? ` · ${row.detail}` : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}

// 시각 포맷터를 여기서 다시 구현하지 않는다. 예전 지역 구현은 `getHours()` 를 써서
// **서버 지역 시각**이었고, UTC 컨테이너에서는 감사 로그만 같은 화면의 다른 캡션(KST)과
// 9시간 어긋났다. `lib/format` 의 `stamp` 가 KST 로 고정한다.
