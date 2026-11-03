"use client";

import { MAX_BULK_SYMBOLS } from "@/features/stock/advice";

const BOX = "border border-dashed px-3 py-2 text-12";

/**
 * 대시보드 상단의 상태 알림 넷.
 *
 * `DashboardBoard` 안에 인라인돼 있던 것을 뺐다. 넷 다 "지금 화면이 왜 이런지" 를
 * 말하는 같은 성격이라 한자리에 모아 두면 문구·여백이 갈라지지 않고, 조립하는 쪽은
 * 상태 소유에 집중할 수 있다.
 */
export function BoardNotices({
  reorderBlocked,
  notice,
  error,
  skipped,
}: {
  /** 순서 편집 중인데 정렬이 걸려 있어 드래그가 막힌 상태 */
  reorderBlocked: boolean;
  /** 아직 없는 기능을 눌렀을 때의 안내 */
  notice: string | null;
  /** 저장 실패 */
  error: string | null;
  /** 일괄 AI 상한에 걸려 빠진 종목 수 */
  skipped: number;
}) {
  return (
    <>
      {reorderBlocked ? (
        <p role="status" className={`${BOX} border-line-30 text-muted-70`}>
          정렬이 걸려 있는 동안에는 순서를 바꿀 수 없습니다. 정렬을 &lsquo;직접
          정렬&rsquo;로 두면 드래그 핸들이 나타납니다.
        </p>
      ) : null}

      {notice ? (
        <p role="status" className={`${BOX} border-line-30 text-muted-70`}>
          {notice}
        </p>
      ) : null}

      {/* 저장 실패는 반드시 말한다. 화면만 바뀐 채 조용히 끝나면 새로고침 한 번에
          되돌아가고, 사용자는 자기가 무엇을 잃었는지도 모른다.
          실패는 `down` 이다 — 이 팔레트에서 빨강(`--up`)은 **상승**이라, 실패에 쓰면
          잘된 일처럼 읽힌다 (OpsPanel · BatchRow 주석과 같은 규칙). */}
      {error ? (
        <p role="alert" className={`${BOX} border-down text-down`}>
          {error}
        </p>
      ) : null}

      {/* 상한에 걸려 빠진 종목이 있으면 반드시 밝힌다. 20개를 골랐는데 10개만 도는
          것을 말없이 하면 사용자는 그걸 고장으로 읽는다. */}
      {skipped > 0 ? (
        <p role="status" className={`${BOX} border-line-30 text-muted-70`}>
          한 번에 {MAX_BULK_SYMBOLS}종목까지 분석합니다 — {skipped}종목은 이번에
          제외했습니다. 종목당 AI 호출이 여러 번이라 둔 상한입니다. 남은 종목은
          분석이 끝난 뒤 다시 눌러 주세요.
        </p>
      ) : null}
    </>
  );
}
