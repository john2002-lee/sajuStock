import { masthead } from "@/lib/format";
import type { AdminActor } from "@/lib/auth/admin";
import { Footer } from "@/shared/components/layout/Footer";
import { Masthead } from "@/shared/components/layout/Masthead";
import { Icon } from "@/shared/ui";
import Link from "next/link";

export interface AdminShellProps {
  actor: AdminActor;
  current: "ops" | "users";
  children: React.ReactNode;
}

/**
 * 관리자 화면의 공통 껍데기 — 제호 · 탭 · 신원 표시.
 *
 * ## 레이아웃(`layout.tsx`)이 아니라 컴포넌트인 이유
 *
 * 레이아웃에서 `requireAdmin()` 을 부르면 그 결과를 페이지로 넘길 방법이 없어
 * 페이지가 같은 호출을 또 해야 한다. 그런데 **가드는 어차피 페이지마다 있어야 한다** —
 * 레이아웃 가드는 서버 액션·라우트 핸들러를 보호하지 못하므로 "여기 있으니 됐다" 는
 * 오해를 만든다. 그래서 가드는 페이지가 부르고, 껍데기는 그 결과를 받아 그린다.
 *
 * ## 신원을 화면에 띄운다
 *
 * 지금 누구로서 이 화면을 보고 있는지가 보여야 한다. 관리자 계정을 여러 개 쓰는
 * 상황에서 "누가 한 일인지" 를 나중에 감사 로그로만 알게 되면 늦다.
 *
 * 씨앗 권한(`ADMIN_EMAILS`)으로 들어온 경우 그 사실을 밝힌다 — DB 의 `role` 과
 * 무관하게 통과한 것이라, 환경 변수를 지우면 못 들어온다는 뜻이기 때문이다.
 *
 * ## 푸터를 직접 든다
 *
 * `/admin` 은 주식·사주 어느 서비스 그룹에도 들어 있지 않다. 계정 흐름도 아니라서
 * `(account)` 에도 넣지 않았다 — 운영 화면이고, `proxy.ts` 와 `requireAdmin()` 이
 * 앞뒤로 막는 별도의 문이다. 그래서 서비스 레이아웃이 붙이는 푸터가 여기에는 닿지
 * 않고, 양쪽 고지를 짧게 드는 `both` 를 스스로 붙인다.
 */
export function AdminShell({ actor, current, children }: AdminShellProps) {
  return (
    <>
      <main className="mx-auto flex w-full max-w-shell flex-col gap-4 px-4 pb-[30px] pt-[26px] md:px-8">
        <Masthead caption={`${masthead(new Date().toISOString())} · 관리자`} />

        <section className="flex flex-col gap-[7px]">
          <h1 className="flex items-center gap-2 font-display font-bold leading-none tracking-[-0.01em] text-[19px] md:text-[22px]">
            <Icon name="user" size={18} className="flex-none text-muted-45" />
            관리자
          </h1>
          <p
            className="font-mono leading-none tracking-label-wide text-muted-50"
            style={{ fontSize: 10.5 }}
          >
            {actor.email ?? actor.userId}
            {actor.viaSeed ? " · ADMIN_EMAILS 로 인정됨" : ""}
          </p>
        </section>

        <nav aria-label="관리자 화면" className="flex items-end gap-5 border-b border-line-20">
          <Tab href="/admin" label="운영 현황" active={current === "ops"} />
          <Tab href="/admin/users" label="회원 관리" active={current === "users"} />
        </nav>

        {children}
      </main>

      <Footer service="both" />
    </>
  );
}

function Tab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`-mb-px flex min-h-[var(--tap)] items-end border-b-2 pb-2 font-medium md:min-h-0 ${
        active
          ? "border-ink text-ink"
          : "border-transparent text-muted-50 hover:text-ink"
      }`}
      style={{ fontSize: 13 }}
    >
      {label}
    </Link>
  );
}
