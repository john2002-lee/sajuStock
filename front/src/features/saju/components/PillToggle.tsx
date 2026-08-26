"use client";

/**
 * pill 세그먼트 컨트롤 — 양력/음력, 남성/여성.
 *
 * `aria-pressed`(`aria-checked` 가 아니다)로 선택을 표시하고, 각 버튼이 보이는
 * 글자와 같은 `aria-label` 을 갖는다. 그래야 선택 상태가 금빛 채움만으로 전달되지
 * 않고 보조기기에도 읽힌다.
 */
export interface PillToggleOption<T extends string> {
  value: T;
  label: string;
}

export interface PillToggleProps<T extends string> {
  options: PillToggleOption<T>[];
  value: T;
  onChange: (v: T) => void;
  groupLabel: string;
}

export function PillToggle<T extends string>({
  options,
  value,
  onChange,
  groupLabel,
}: PillToggleProps<T>) {
  return (
    <div role="group" aria-label={groupLabel} className="flex gap-1 rounded-pill bg-surface-warm p-1">
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            aria-label={opt.label}
            onClick={() => onChange(opt.value)}
            // `min-h-[var(--tap)]` — 터치 히트 영역 44px 최소치(WCAG 2.5.5).
            // `py-2` 만으로는 36px 이라 모자랐고, 이 컨트롤은 폼에서 가장 자주
            // 눌리는 것 중 하나다(양력/음력·성별). 옆의 밑줄 입력도 같은 값을
            // 쓰므로 한 줄에 나란히 설 때 높이가 맞는다.
            className={
              "flex min-h-[var(--tap)] flex-1 items-center justify-center rounded-pill px-4 text-sm font-semibold transition " +
              (selected ? "bg-gold-gradient text-on-primary shadow-card-sm" : "text-ink-body")
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
