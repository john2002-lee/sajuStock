"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/shared/ui";
import { ThemeChoice } from "@/shared/theme";

/**
 * 사주 화면의 상단 헤더.
 *
 * 원본 SajuService 의 헤더(메뉴 · 워드마크 · 계정)와 같은 자리·같은 유리 배경이되,
 * 담는 것이 다르다. 여기서는 **나가는 길**과 **화면 밝기**가 필요하다:
 *
 *  - 워드마크를 누르면 서비스 선택(`/`)으로 간다. 사주 화면에는 데스크톱에서
 *    나갈 길이 푸터뿐이었다(`ServiceBar` 는 `md:hidden`). 위에도 하나 둔다.
 *  - 메뉴에 밝기 선택(시스템·라이트·다크)과 주식 서비스로 가는 길을 담는다.
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
export function SajuHeader() {
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
        {/* 워드마크 = 서비스 선택으로 나가는 길. 사주 화면에서 제호를 누르면
            사주 홈으로 가는 것이 자연스러워 보이지만, 그쪽은 바로 아래 "사주"
            링크가 맡는다 — 위쪽은 **서비스 밖으로** 나가는 자리다. */}
        <Link
          href="/"
          className="flex min-h-[var(--tap)] items-center gap-2 font-display text-[17px] text-gold-text-strong"
          aria-label="서비스 선택으로"
        >
          천명
          <span className="font-mono-kr text-[9.5px] tracking-[0.2em] text-muted-2">SAJU</span>
        </Link>

        <div className="flex items-center gap-1">
          <Link
            href="/saju"
            className="hidden min-h-[var(--tap)] items-center px-3 text-[13px] text-ink-body hover:text-gold-text-strong sm:flex"
          >
            사주 보기
          </Link>

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
                시스템은 기기 설정을 따릅니다. 밝기는 주식 서비스에도 함께 적용됩니다.
              </p>
            </section>

            <section className="space-y-2.5 border-t border-hairline pt-5">
              <h2 className="font-mono-kr text-[10px] tracking-[0.2em] text-gold-text">이동</h2>
              <nav className="flex flex-col">
                {[
                  { href: "/saju", label: "사주 보기", hint: "생년월일시 입력부터" },
                  { href: "/saju/intro", label: "서비스 소개", hint: "어떻게 계산하는지" },
                  { href: "/stock", label: "주식 서비스", hint: "시장 현황 · 종목 분석" },
                  { href: "/", label: "서비스 선택", hint: "두 서비스의 갈림길" },
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
          </div>
        </div>
      )}
    </header>
  );
}
