"use client";

import { segmented } from "@/shared/ui";
import { useId, useState } from "react";
import { MoverList } from "./MoverList";
import type { Mover } from "../model/types";

/**
 * 모바일(<768) 전용 상승률/하락률 전환. 데스크탑은 2열로 나란히 보여주므로
 * 이 컴포넌트를 쓰지 않는다.
 *
 * 시안에는 '거래량' 탭이 하나 더 있으나 대응 데이터도 화면 설계도 없어 넣지 않았다.
 */
export function MoversTabs({
  gainers,
  losers,
}: {
  gainers: Mover[];
  losers: Mover[];
}) {
  const tabs = [
    { key: "up", label: "상승률", items: gainers },
    { key: "down", label: "하락률", items: losers },
  ];
  const [active, setActive] = useState(0);
  const baseId = useId();

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = (active + step + tabs.length) % tabs.length;
    setActive(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  }

  return (
    <section className="flex flex-col gap-2.5">
      <div
        role="tablist"
        aria-label="등락 상위"
        onKeyDown={onKeyDown}
        className="flex gap-1"
      >
        {tabs.map((tab, index) => {
          const isActive = index === active;
          return (
            <button
              key={tab.key}
              id={`${baseId}-tab-${index}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`${baseId}-panel-${index}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActive(index)}
              className={segmented({ active: isActive })}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {tabs.map((tab, index) => (
        <div
          key={tab.key}
          id={`${baseId}-panel-${index}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${index}`}
          hidden={index !== active}
        >
          <MoverList
            title={tab.label}
            scope="KOSPI+KOSDAQ"
            items={tab.items}
            headless
          />
        </div>
      ))}
    </section>
  );
}
