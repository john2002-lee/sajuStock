import Link from "next/link";
import { auth, AUTH_ENABLED, signOut } from "@/auth";
import { adminActorOf } from "@/lib/auth/admin";
import { Icon } from "@/shared/ui";

/**
 * 제호 우측 컨트롤 덩어리에 들어가는 계정 표시.
 *
 * ## 로그인이 꺼져 있으면 **아무것도 그리지 않는다**
 *
 * 자격 증명이 없는 채로 버튼을 보여 주면 누르는 순간 깨진다. 그보다는 없는 편이
 * 정직하고, 관심종목은 익명 신원으로 그대로 동작하므로 사용자가 잃는 것도 없다.
 * 키가 `.env.local` 에 들어오면 이 컴포넌트가 저절로 나타난다.
 *
 * ## 서버 컴포넌트다
 *
 * 세션을 읽는 데 클라이언트 훅(`useSession`)이 필요 없고, 그러려면 Provider 를
 * 트리에 얹어야 한다. 로그아웃만 form action 으로 처리하면 클라이언트 JS 가 0이다 —
 * 제호는 모든 화면에 있으므로 그 차이가 전 페이지에 적용된다.
 *
 * ## 좁은 화면에서 **사라지지 않는다**
 *
 * 예전에는 두 갈래 모두 `hidden md:flex` 였다. 제호 우측이 좁다는 이유였는데, 그
 * 결과 모바일에서는 로그인할 방법도 로그아웃할 방법도 없었다 — 하단 탭바에도 계정
 * 자리가 없으므로 완전히 도달 불가였다. 숨기는 대신 **글자를 접는다.** 글리프는
 * 남으므로 44px 히트 영역과 `aria-label` 이 그대로 살아 있다.
 */
export async function AccountMenu() {
  if (!AUTH_ENABLED) return null;

  const session = await auth();

  if (!session?.user) {
    return (
      <Link
        href="/login"
        aria-label="로그인"
        className="flex flex-none items-center gap-1.5 whitespace-nowrap border border-line-28 px-2.5 py-2 font-medium hover:border-ink md:px-3 text-13"
      >
        <Icon name="login" size={15} className="text-muted-45" />
        <span className="hidden md:inline">로그인</span>
      </Link>
    );
  }

  // 이름이 없는 계정(매직링크로만 가입)은 이메일 앞부분을 쓴다. 그마저 없으면
  // '내 계정' — 빈 자리를 두면 로그인했는지 아닌지 화면에서 알 수 없다.
  const label =
    session.user.name || session.user.email?.split("@")[0] || "내 계정";

  // 관리자에게만 보인다. **이건 보안이 아니라 편의다** — 링크를 숨겨도 URL 은
  // 칠 수 있고, 실제 차단은 `/admin` 의 `requireAdmin()` 이 404 로 한다.
  const admin = adminActorOf(session);

  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
      className="flex flex-none items-center gap-2"
    >
      {admin ? (
        <Link
          href="/admin"
          aria-label="관리자"
          className="flex flex-none items-center gap-1.5 whitespace-nowrap border border-line-28 px-2.5 py-2 font-medium hover:border-ink md:px-3 text-13"
        >
          <Icon name="chart" size={15} className="text-muted-45" />
          <span className="hidden md:inline">관리자</span>
        </Link>
      ) : null}

      {/* 계정 이름은 좁은 화면에서 접는다. 로그인 여부는 글리프가 로그인(→)에서
          로그아웃(←)으로 바뀌는 것으로 이미 구분된다. */}
      <span
        className="hidden max-w-[120px] truncate text-muted-60 md:inline text-13"
        title={session.user.email ?? undefined}
      >
        {label}
      </span>
      <button
        type="submit"
        aria-label={`로그아웃 (${label})`}
        className="flex flex-none items-center gap-1.5 whitespace-nowrap border border-line-28 px-2.5 py-2 font-medium hover:border-ink md:px-3 text-13"
      >
        <Icon name="logout" size={15} className="text-muted-45" />
        <span className="hidden md:inline">로그아웃</span>
      </button>
    </form>
  );
}
