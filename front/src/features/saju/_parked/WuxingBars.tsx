import { WUXING_KEYS } from "../model/types";
import { WUXING_LABEL, wuxingClass } from "../model/wuxing";

/**
 * 오행 글자 빈도 막대.
 *
 * **강약이 아니다.** 이 값은 원국에 드러난 글자를 가중치 없이 센 것이고, 강약은
 * 득령·득지·득세를 가중해 따로 판정한다. 두 가지를 한 블록에 섞으면 "수가 4개니까
 * 신강"처럼 읽히는데 그것은 틀린 추론이다 — 그래서 이 컴포넌트는 강약을 **받지도
 * 않는다.** 표시 위치도 강약 카드와 떨어뜨려 둔다.
 */
export function WuxingBars({ counts }: { counts: Record<string, number> }) {
  const total = WUXING_KEYS.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
  // 0으로 나누지 않는다. 기둥이 하나라도 있으면 total 은 6 이상이지만, 방어적으로 둔다.
  const max = Math.max(1, ...WUXING_KEYS.map((key) => counts[key] ?? 0));

  return (
    <div className="space-y-2">
      {WUXING_KEYS.map((key) => {
        const count = counts[key] ?? 0;
        return (
          <div key={key} className="flex items-center gap-3">
            <span className={`w-12 text-[11px] ${wuxingClass("text", key)}`}>
              {WUXING_LABEL[key]}
            </span>
            <div className="h-2 flex-1 bg-line-14">
              <div
                className={`h-full ${wuxingClass("bg", key)}`}
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="w-6 text-right text-[11px] tabular-nums text-muted-60">
              {count}
            </span>
          </div>
        );
      })}

      <p className="pt-1 text-[10px] leading-relaxed text-muted-50">
        원국에 드러난 글자 {total}개의 빈도입니다. 가중치 없는 집계이므로 일간의
        강약과는 별개입니다.
      </p>
    </div>
  );
}
