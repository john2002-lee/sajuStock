"use client";

import { Icon } from "@/shared/ui";
import type { Suggestion } from "../model/types";
import { HighlightedName } from "./HighlightedName";

/**
 * 치수·타이포는 --pal-* 테마 변수에서 읽는다. 라이트(3a)와 터미널(4a)은
 * 색뿐 아니라 패딩·글자 크기·폰트 계열까지 다르기 때문에, 컴포넌트에 테마 분기를
 * 넣는 대신 변수 한 겹으로 흡수한다.
 *
 * **시세 칸은 두지 않는다.** 한때 가격·스파크라인을 그리는 분기가 있었지만
 * 백엔드 자동완성 응답에는 시세가 없어(`model/types.ts` 의 주석) 목 모드 밖에서는
 * 한 번도 렌더되지 않는 코드였다 — 자동완성 한 번에 N종목의 시세를 얻으려면
 * 종목마다 상류를 불러야 해서 애초에 넣을 수 없는 값이다. 실제로 채울 수 있게
 * 되면(백엔드가 응답을 넓히면) 그때 되살린다.
 */
export function SuggestionRow({
  id,
  item,
  active,
  watched,
  onSelect,
  onHover,
}: {
  id: string;
  item: Suggestion;
  active: boolean;
  watched: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      onClick={onSelect}
      onMouseMove={onHover}
      className="flex cursor-pointer items-center gap-3.5 transition-colors duration-150"
      style={{
        padding: "var(--pal-row-py) var(--pal-row-px)",
        borderBottom: "1px var(--pal-row-style) var(--pal-row-line)",
        background: active ? "var(--pal-row-hover)" : undefined,
      }}
    >
      <span className="flex flex-1 flex-col gap-[3px]">
        <span
          style={{
            fontSize: "var(--pal-name-size)",
            fontWeight: "var(--pal-name-weight)" as unknown as number,
            fontFamily: "var(--pal-name-font)",
          }}
        >
          <HighlightedName name={item.name} match={item.match} />
          {watched ? (
            <Icon
              name="star-filled"
              size={12}
              label="관심 종목"
              className="ml-2 inline-block align-baseline text-up"
            />
          ) : null}
        </span>
        <span
          className="font-mono"
          style={{
            fontSize: "var(--pal-en-size)",
            letterSpacing: "var(--pal-en-tracking)",
            textTransform: "var(--pal-en-transform)" as "none" | "uppercase",
            color: "var(--pal-en-color)",
          }}
        >
          {item.nameEn ?? item.symbol}
        </span>
      </span>

      <span
        className="flex-none border border-line-25 font-mono font-medium text-muted-65"
        style={{
          fontSize: "var(--pal-chip-size)",
          padding: "var(--pal-chip-py) var(--pal-chip-px)",
          letterSpacing: "var(--pal-chip-tracking)",
        }}
      >
        {item.market}
      </span>

      <span
        className="num flex-none text-right font-medium text-muted-75"
        style={{ fontSize: "var(--pal-sym-size)", width: "var(--pal-sym-w)" }}
      >
        {item.symbol}
      </span>

    </div>
  );
}
