"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Skeleton } from "@/shared/components/feedback";
import { Wordmark } from "@/shared/components/layout/Wordmark";
import { Icon } from "@/shared/ui";
import { useTheme } from "@/shared/theme";
import { useListedCompaniesStatus } from "../hooks/useListedCompaniesStatus";
import { useRecentSearches } from "../hooks/useRecentSearches";
import { useSuggestions } from "../hooks/useSuggestions";
import { useWatchlistStatus } from "../hooks/useWatchlistStatus";
import { parseQuery } from "../model/match";
import type { Suggestion } from "../model/types";
import { DelayBanner } from "./DelayBanner";
import { SourceFallbackBanner } from "./SourceFallbackBanner";
import { KeyHints } from "./KeyHints";
import { ModeChips } from "./ModeChips";
import { SuggestionRow } from "./SuggestionRow";

/**
 * 커맨드 팔레트 오버레이 (3a 라이트).
 *
 * 캐럿: 시안은 2×24px 빨강 블록이지만 여기서는 실제 <input> 의
 * caret-color 로 구현한다. 가짜 캐럿을 쓰려면 입력을 div 로 흉내 내야 하는데
 * 그러면 한글 IME 조합이 깨진다 — 이 화면에서 가장 중요한 입력 방식이다.
 */
export function SearchPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const baseId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const { isTerminal } = useTheme();
  const { codes: recentCodes, push: pushRecent } = useRecentSearches();
  // 접두어(`>` `:` `@`)를 떼어내고 검색 범위를 좁힌다. 칩 활성 상태도 여기서 나온다.
  const parsed = useMemo(() => parseQuery(query), [query]);
  const { result, loading } = useSuggestions({ parsed, recentCodes });
  const status = useListedCompaniesStatus();
  const { codes: watched, toggle: toggleWatch } = useWatchlistStatus();

  /** 그룹을 가로질러 ↑↓ 로 이동하기 위한 평탄화 목록 */
  const flat = useMemo(
    () =>
      result.groups.flatMap((group) =>
        group.items.map((item) => ({ group: group.key, item })),
      ),
    [result.groups],
  );

  /** 그룹별 시작 인덱스 — 렌더 중 카운터를 증가시키지 않기 위해 미리 계산한다 */
  const groupOffsets = useMemo(() => {
    const offsets: Record<string, number> = {};
    let cursor = 0;
    for (const group of result.groups) {
      offsets[group.key] = cursor;
      cursor += group.items.length;
    }
    return offsets;
  }, [result.groups]);

  // 결과가 바뀌면 활성 행을 처음으로 되돌린다.
  // effect + setState 대신 렌더 중 조정 — React 가 권장하는 패턴이다.
  const [seenResult, setSeenResult] = useState(result);
  if (seenResult !== result) {
    setSeenResult(result);
    setActive(0);
  }

  const optionId = useCallback(
    (index: number) => `${baseId}-option-${index}`,
    [baseId],
  );

  const select = useCallback(
    (item: Suggestion) => {
      pushRecent(item.code, item.name);
      onClose();
      router.push(`/stocks/${item.code}`);
    },
    [onClose, pushRecent, router],
  );

  /**
   * ⌥⏎ RUN AI — 상세로 가되 AI 드로어를 연 상태로 연다.
   * `?ai=1` 은 AdviceProvider 의 초기값이므로 도착 즉시 useAiAdvice 가 돌기 시작한다.
   * README 상 4a 다크 전용 단축키라 터미널 테마에서만 등록한다.
   */
  const runAi = useCallback(
    (item: Suggestion) => {
      pushRecent(item.code, item.name);
      onClose();
      router.push(`/stocks/${item.code}?ai=1`);
    },
    [onClose, pushRecent, router],
  );

  // 열려 있는 동안 배경 스크롤을 막는다.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // 활성 행이 화면 밖으로 나가지 않게 따라간다.
  useEffect(() => {
    listRef.current
      ?.querySelector(`#${CSS.escape(optionId(active))}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, optionId]);

  function onKeyDown(event: React.KeyboardEvent) {
    // IME 조합 중의 Enter 는 한글 확정이지 선택이 아니다.
    if (composingRef.current) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (flat.length) setActive((i) => (i + 1) % flat.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (flat.length) setActive((i) => (i - 1 + flat.length) % flat.length);
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(Math.max(0, flat.length - 1));
        break;
      case "Enter":
        event.preventDefault();
        if (!flat[active]) break;
        // ⌥⏎(Alt+Enter) 는 터미널 테마 전용 — 라이트(3a)에는 힌트도 핸들러도 없다.
        if (isTerminal && event.altKey) runAi(flat[active].item);
        else select(flat[active].item);
        break;
      case "Tab":
        // ⇥ 는 관심 추가에 배정돼 있다. 동시에 포커스가 팔레트 밖으로
        // 나가지 않게 하는 트랩 역할도 한다.
        event.preventDefault();
        if (flat[active]) toggleWatch(flat[active].item);
        inputRef.current?.focus();
        break;
      case "Escape":
        event.preventDefault();
        onClose();
        break;
      default:
        break;
    }
  }

  const listboxId = `${baseId}-listbox`;
  const showDelayBanner = status !== null && !status.ready;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-backdrop"
      style={{ paddingTop: "var(--pal-inset)", paddingBottom: "var(--pal-inset)" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="종목 검색"
        onKeyDown={onKeyDown}
        // 모바일(<768)에서는 --pal-w 가 100%, --pal-inset 이 0 이라 전체 화면이 된다
        // (globals.css 의 미디어 쿼리). 여기서는 분기하지 않는다.
        // `overflow-hidden` 이 반경과 한 벌이다 — 안쪽의 그룹 머리·행 hover 가
        // 배경을 칠하므로, 넘침을 자르지 않으면 네 모서리에서 각진 색이 삐져나온다.
        className="flex max-h-full w-full flex-col overflow-hidden border shadow-palette"
        style={{
          width: "var(--pal-w)",
          background: "var(--pal-bg)",
          borderColor: "var(--pal-border)",
          borderRadius: "var(--pal-radius)",
          animation: "var(--pal-pop)",
        }}
      >
        {/* 모바일 전용 헤더 — 전체 화면이라 뒤 페이지의 로고가 가려진다.
            좌상단 홈 링크를 여기서도 유지하고, 우측에 '취소'를 둔다. */}
        <div
          className="flex items-center justify-between border-b border-line-14 px-4 py-2 md:hidden"
        >
          <Wordmark variant="compact" href="/stock" />
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 flex min-h-[var(--tap)] min-w-[var(--tap)] items-center justify-end text-muted-60 text-13"
          >
            취소
          </button>
        </div>

        {/* flex-wrap + 칩 묶음의 w-full: 좁은 폭에서 모드 칩이 입력과 자리를
            다투지 않고 아래 줄로 내려간다 (모바일 스펙: 입력 / 필터 칩 별도 행). */}
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-2"
          style={{
            padding: "var(--pal-input-py) var(--pal-row-px)",
            borderBottom: "var(--pal-head-border)",
          }}
        >
          {/* 터미널(4a)은 '>' 를 글자 그대로 둔다 — 아이콘이 아니라 사용자가
              실제로 입력하는 명령 프리픽스 문법이다 (`>` 이름 / `:` 코드 / `@` 티커).
              라이트(3a)의 ⌕ 만 아이콘으로 교체한다. */}
          {isTerminal ? (
            <span
              aria-hidden
              className="font-mono font-medium text-14"
              style={{ color: "var(--accent)" }}
            >
              &gt;
            </span>
          ) : (
            <Icon name="search" size={17} className="flex-none text-muted-45" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
            }}
            type="text"
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls={listboxId}
            aria-activedescendant={
              flat[active] ? optionId(active) : undefined
            }
            aria-autocomplete="list"
            aria-label={
              isTerminal
                ? "종목 검색. > 이름, : 코드, @ 해외 티커 접두어를 쓸 수 있습니다"
                : "종목명 · 코드 · 초성으로 검색"
            }
            placeholder={
              isTerminal ? "> 이름  |  : 코드  |  @ 티커" : "종목명 · 코드 · 초성"
            }
            autoComplete="off"
            spellCheck={false}
            className="min-w-[55%] flex-1 border-0 bg-transparent outline-none placeholder:text-muted-35"
            style={{
              fontSize: "var(--pal-query-size)",
              fontFamily: "var(--pal-query-font)",
              letterSpacing: "var(--pal-query-tracking)",
              caretColor: "var(--pal-caret)",
            }}
          />
          <span className="w-full md:w-auto">
            <ModeChips parsed={parsed} />
          </span>
          {/* 모바일은 위 헤더의 '취소'가 같은 일을 한다 */}
          <button
            type="button"
            onClick={onClose}
            aria-label="검색 닫기"
            className="hidden text-muted-45 hover:text-ink md:block"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div ref={listRef} className="flex flex-1 flex-col overflow-auto">
          <div id={listboxId} role="listbox" aria-label="검색 결과">
            {result.groups.map((group) => {
              const headerId = `${baseId}-group-${group.key}`;
              return (
                <div key={group.key} role="group" aria-labelledby={headerId}>
                  <div
                    className="flex items-baseline justify-between gap-4 border-y border-line-14"
                    style={{
                      background: "var(--pal-group-bg)",
                      padding:
                        "var(--pal-group-py) var(--pal-row-px) calc(var(--pal-group-py) - 2px)",
                    }}
                  >
                    <span
                      id={headerId}
                      className="font-mono font-medium uppercase"
                      style={{
                        fontSize: "var(--pal-group-size)",
                        letterSpacing: "var(--pal-group-tracking)",
                        color: "var(--pal-group-fg)",
                      }}
                    >
                      {group.label}
                    </span>
                    {/* 백엔드 메서드명은 개발 참고용 캡션이라 모바일 프레임
                        (3a·4a)에는 없다. 390px 에서 폭을 나눠 가지며 그룹
                        라벨을 두 줄로 접기까지 한다 — 데스크탑에서만 띄운다. */}
                    <span
                      className="hidden font-mono text-muted-45 md:inline"
                      style={{ fontSize: "var(--pal-note-size)" }}
                    >
                      {group.note}
                    </span>
                  </div>
                  {group.items.map((item, itemIndex) => {
                    const index = groupOffsets[group.key] + itemIndex;
                    return (
                      <SuggestionRow
                        key={`${group.key}-${item.symbol}`}
                        id={optionId(index)}
                        item={item}
                        active={index === active}
                        watched={watched.includes(item.code)}
                        onSelect={() => select(item)}
                        onHover={() => setActive(index)}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>

          {flat.length === 0 && parsed.query && loading ? (
            // 결과 자리를 비워두지 않고 행 골격을 세 줄 깔아둔다 (와이어프레임 1d).
            <div
              role="status"
              aria-live="polite"
              aria-busy
              className="flex flex-col gap-3.5 px-[22px] py-4"
            >
              <span className="sr-only">종목을 찾는 중입니다</span>
              {[0, 1, 2].map((row) => (
                <span key={row} className="flex items-center gap-3.5">
                  <Skeleton w="42%" h={17} i={row} />
                  <Skeleton w={52} h={16} i={row + 1} />
                  <Skeleton w={82} h={11} i={row + 2} />
                  <Skeleton w={92} h={26} i={row} />
                  <Skeleton w={88} h={20} i={row + 1} />
                </span>
              ))}
            </div>
          ) : null}

          {flat.length === 0 && !(parsed.query && loading) ? (
            <p
              role="status"
              className="px-[22px] py-10 text-center text-muted-60 text-13"
            >
              {parsed.query
                ? `'${parsed.query}'와 일치하는 종목이 없습니다.`
                : "종목명 · 6자리 코드 · 초성 · 해외 티커로 검색하세요."}
            </p>
          ) : null}

          {/* 소프트 키보드가 올라오면 마지막 행이 가린다. 목록 끝에 여백을 둔다. */}
          <div aria-hidden className="h-16 flex-none md:hidden" />
        </div>

        {/* 지연·폴백 안내는 스크롤 영역 밖에 둔다.
            안쪽에 있으면 결과가 몇 줄만 차도 밀려 올라가 사라지는데,
            이 배너는 "왜 느린지"를 설명하는 자리라 그때 가장 필요하다
            (README: ensure_listed_companies 지연 안내 — 반드시 구현). */}
        {showDelayBanner ? <DelayBanner status={status} /> : null}
        {status ? <SourceFallbackBanner status={status} /> : null}

        <KeyHints total={result.total} elapsedMs={result.elapsedMs} />
      </div>
    </div>
  );
}
