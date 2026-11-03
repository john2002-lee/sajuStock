"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 알림 조건 텍스트. 클릭하면 그 자리에서 편집한다.
 *
 * 항상 <input> 으로 두지 않는 이유: 6행 × 텍스트 필드가 되면 표가 폼처럼 보여
 * 에디토리얼 톤이 무너진다. 시안도 평문으로 그려져 있다.
 */
export function AlertCondition({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== value) onChange(next);
    else setDraft(value);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        aria-label="알림 조건"
        className="w-full min-w-0 border-b border-ink bg-transparent outline-none text-12"
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className={`truncate text-left ${
        disabled
          ? "text-muted-35"
          : "text-muted-70 hover:border-b hover:border-dotted hover:border-line-35"
      } text-12`}
      title={disabled ? "알림을 켜야 조건을 설정할 수 있습니다" : "클릭해 수정"}
    >
      {value}
    </button>
  );
}
