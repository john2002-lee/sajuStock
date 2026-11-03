"use client";

import { useState } from "react";

/** 밑줄 텍스트 버튼이지만 모바일 히트 영역은 44px 를 채운다 (글자 위치는 그대로). */
const ACTION =
  "inline-flex min-h-[var(--tap)] items-center border-b border-line-control hover:border-ink disabled:border-transparent disabled:text-muted-35 md:min-h-0";

export function BulkActionBar({
  count,
  analyzing,
  remaining,
  onMoveGroup,
  onBulkAlert,
  onDelete,
  onCancelAnalysis,
}: {
  count: number;
  analyzing: boolean;
  remaining: number;
  onMoveGroup: () => void;
  onBulkAlert: () => void;
  onDelete: () => void;
  onCancelAnalysis: () => void;
}) {
  /**
   * 삭제는 **두 번 눌러야 실행된다.**
   *
   * 예전에는 한 번에 선택한 종목을 전부 지웠다 — 되돌리기도 확인도 없이. 관심종목은
   * 사용자가 시간을 들여 모은 목록이라 오조작 한 번의 값이 크다.
   *
   * `window.confirm` 대신 그 자리에서 묻는다: 네이티브 대화상자는 이 화면의 톤과
   * 이질적이고, 무엇을 지우는지(몇 종목인지)를 문구에 담기 어렵다.
   */
  const [confirming, setConfirming] = useState(false);

  // 선택이 바뀌면 확인 상태를 버린다 — "3종목 삭제" 를 확인하던 중에 선택이 5종목이
  // 되면, 다음 클릭이 사용자가 확인한 적 없는 것을 지운다.
  //
  // effect + setState 대신 렌더 중 조정이다. 이 저장소가 이미 쓰는 패턴이고
  // (`useAiAdvice` · `SearchPalette`), effect 로 하면 확인 버튼이 한 프레임 남는다.
  const [seenCount, setSeenCount] = useState(count);
  if (seenCount !== count) {
    setSeenCount(count);
    setConfirming(false);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-surface px-[18px] py-3.5">
      <span className="flex items-center gap-[22px]">
        <span
          className="num font-medium tracking-[0.1em] text-12"
        >
          선택 {count}종목
        </span>
        <span
          className="flex gap-2.5 text-muted-70 text-13"
        >
          <button type="button" onClick={onMoveGroup} className={ACTION}>
            그룹 이동
          </button>
          <button type="button" onClick={onBulkAlert} className={ACTION}>
            알림 일괄 설정
          </button>

          {confirming ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  onDelete();
                }}
                // 실패·파괴는 `down` 이다. 이 팔레트에서 빨강(`--up`)은 상승이라
                // 삭제에 쓰면 잘된 일처럼 읽힌다 (OpsPanel · BatchRow 주석).
                className={`${ACTION} border-down font-medium text-down`}
              >
                {count}종목 삭제
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className={ACTION}
              >
                취소
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className={ACTION}
            >
              삭제
            </button>
          )}
        </span>
      </span>

      {analyzing ? (
        <span
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-muted-70 text-12"
        >
          <span
            aria-hidden
            className="dot block h-[11px] w-[11px] animate-dot-spin border-[1.6px] border-line-25 border-t-up"
          />
          AI 분석 진행 중 · {remaining}종목 남음 — 종목당 여러 번의 모델 호출이라
          시간이 걸립니다
          <button
            type="button"
            onClick={onCancelAnalysis}
            className={`${ACTION} border-down font-medium text-down`}
          >
            멈추기
          </button>
        </span>
      ) : (
        // 사용자에게 하는 말이다. 예전에는 이 자리에 백엔드 메서드명과 **TODO 가
        // 그대로** 떠 있었다("generate_stock_advice ×N … → 지연 안내 필요").
        // 그 TODO 가 요구하던 지연 안내를 이제 여기서 한다.
        <span className="text-muted-45 text-11">
          AI 분석은 종목당 여러 번의 모델 호출을 거쳐 수십 초가 걸릴 수 있습니다.
        </span>
      )}
    </div>
  );
}
