"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/shared/ui";
import { ThemeChoice } from "@/shared/theme";
import { BrandName } from "@/shared/components/layout/BrandName";

/**
 * 사주 화면의 상단 헤더.
 *
 * 원본 SajuService 의 헤더(메뉴 · 워드마크 · 계정)와 같은 자리·같은 유리 배경이되,
 * 담는 것이 다르다. 여기서는 **화면 밝기**와 **계정**이 필요하다:
 *
 *  - 워드마크를 누르면 사주 홈(`/`)으로 간다. 사주가 제품의 메인이 되면서 루트가
 *    곧 사주 입력 화면이 됐다 — 예전처럼 서비스 선택 화면으로 가지 않는다.
 *  - 메뉴에 밝기 선택(시스템·라이트·다크)과 계정을 담는다.
 *
 * ## 계정이 여기 있어야 하는 이유
 *
 * 계정 표시는 서비스 선택 화면(`app/page.tsx`)에만 있었다. 그 화면이 사라지면서
 * **공개 표면에서 로그인할 자리가 한 곳도 남지 않았다.** 사주는 로그인 없이 끝까지
 * 돌아가지만, 관리자는 로그인해야 `/admin` 에 들어가고 주식 서비스는 그 뒤에 있다 —
 * 여기가 비면 운영자가 자기 제품에 못 들어간다.
 *
 * `AccountMenu` 는 세션을 읽는 **서버 컴포넌트**라 이 클라이언트 컴포넌트가 직접
 * import 할 수 없다. 그래서 레이아웃이 만들어 `account` 로 넘겨준다.
 *
 * ## 왜 메뉴로 접었나
 *
 * 밝기 선택은 세 칸이라 폭을 먹는데, 사주 화면의 헤더는 원본처럼 좁고 조용해야
 * 한다. 상시 노출하면 헤더가 컨트롤 바가 되고, 이 서비스가 처음 보여 주려는 것
 * (제목과 입력 카드)에서 눈이 먼저 흩어진다.
 *
 * ## 접근성
 *
 * `aria-expanded` 로 열림을 알리고, `aria-controls` 로 무엇이 열리는지 잇는다.
 * Escape 로 닫고 포커스를 트리거로 되돌린다 — 키보드 사용자가 메뉴를 닫았을 때
 * 포커스가 문서 처음으로 튕기지 않게. 바깥 클릭도 닫는다.
 */
export function SajuHeader({ account }: { account?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      // 트리거는 제외한다 — 그러지 않으면 닫는 클릭과 여는 클릭이 같은 틱에서
      // 겹쳐 메뉴가 열리자마자 닫힌다.
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-header-glass backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-5 py-3 sm:px-6">
        {/* 워드마크 = 사주 홈. 루트가 곧 사주 입력 화면이므로 이 링크 하나가
            "처음으로" 를 맡는다 — 예전에 옆에 있던 "사주 보기" 링크는 같은 곳을
            가리키게 되어 뺐다. */}
        <Link
          href="/"
          className="flex min-h-[var(--tap)] items-center gap-2 font-display text-[17px] text-gold-text-strong"
          aria-label="AI Of Tellers 처음으로"
        >
          {/* 이름이 길어졌다(FEEL → AI Of Tellers). `whitespace-nowrap` 이 없으면
              좁은 화면에서 "Tellers" 가 아래로 접혀 제호가 두 줄이 된다. */}
          <BrandName className="whitespace-nowrap" />
          <span className="font-mono-kr text-[9.5px] tracking-[0.2em] text-muted-2">SAJU</span>
        </Link>

        <div className="flex items-center gap-1">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
            className="flex min-h-[var(--tap)] min-w-[var(--tap)] items-center justify-center gap-1.5 rounded-pill px-3 text-[13px] text-ink-body transition-colors hover:bg-surface-warm hover:text-gold-text-strong"
          >
            <Icon name={open ? "close" : "menu"} size={18} />
            <span className="hidden sm:inline">메뉴</span>
          </button>
        </div>
      </div>

      {open && (
        <div
          ref={panelRef}
          id={menuId}
          className="border-t border-hairline bg-surface shadow-card"
        >
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-5 py-5 sm:px-6">
            <section className="space-y-2.5">
              <h2 className="font-mono-kr text-[10px] tracking-[0.2em] text-gold-text">화면 밝기</h2>
              <ThemeChoice />
              <p className="text-[12px] leading-relaxed text-muted-2">
                시스템은 기기 설정을 따릅니다.
              </p>
            </section>

            <section className="space-y-2.5 border-t border-hairline pt-5">
              <h2 className="font-mono-kr text-[10px] tracking-[0.2em] text-gold-text">이동</h2>
              <nav className="flex flex-col">
                {[
                  { href: "/", label: "사주 보기", hint: "생년월일시 입력부터" },
                  { href: "/saju/intro", label: "서비스 소개", hint: "어떻게 계산하는지" },
                ].map((item) => (
                  <Link
                    key={item.href + item.label}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex min-h-[var(--tap)] items-baseline justify-between gap-4 rounded-card-sm px-2 py-2 text-[14px] text-ink transition-colors hover:bg-surface-warm hover:text-gold-text-strong"
                  >
                    {item.label}
                    <span className="text-[11.5px] text-muted-2">{item.hint}</span>
                  </Link>
                ))}
              </nav>
            </section>

            {/* 계정 — 로그인이 꺼져 있으면 레이아웃이 `account` 를 아예 넘기지
                않는다. 여기서 `AccountMenu` 의 렌더 결과로 판단할 수는 없다:
                엘리먼트는 그것이 `null` 을 그리더라도 truthy 라, 제목만 남고
                아래가 빈 섹션이 된다. */}
            {account ? (
              <section className="space-y-2.5 border-t border-hairline pt-5">
                <h2 className="font-mono-kr text-[10px] tracking-[0.2em] text-gold-text">계정</h2>
                <div className="flex flex-wrap items-center gap-2">{account}</div>
                <p className="text-[12px] leading-relaxed text-muted-2">
                  사주는 로그인 없이 보실 수 있습니다. 계정은 운영·관리용입니다.
                </p>
              </section>
            ) : null}
          </div>
        </div>
      )}
    </header>
  );
}
