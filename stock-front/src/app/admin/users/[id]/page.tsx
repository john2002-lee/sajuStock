import { fetchUser, fetchUsers, RoleBadge } from "@/features/common/admin";
import { ApiError } from "@/lib/api";
import { requireAdmin } from "@/app/_data/admin";
import { button, Icon } from "@/shared/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { changeRoleAction, deleteUserAction } from "../../_actions";
import { Notice } from "@/shared/components/feedback";
import { AdminShell } from "../../_components/AdminShell";
import { AdminUnavailable } from "../../_components/AdminUnavailable";

export const revalidate = 0;

interface AdminUserPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; done?: string; confirm?: string }>;
}

const DONE_MESSAGES: Record<string, string> = {
  granted: "관리자 권한을 부여했습니다.",
  revoked: "관리자 권한을 회수했습니다.",
};

/**
 * 관리자 · 회원 상세 — 보기 · 권한 수정 · 삭제.
 *
 * ## 되돌릴 수 없는 일은 **한 화면에 나란히 두지 않는다**
 *
 * 권한 변경과 삭제가 같은 버튼 줄에 있으면 잘못 누른다. 삭제는 아래로 내리고,
 * 누르면 곧바로 지우지 않고 **확인 단계**(`?confirm=delete`)로 넘어가 이메일을
 * 직접 입력하게 한다. 백엔드의 `cleanup_orphans` 가 "기본이 모의 실행" 인 것과
 * 같은 결이다 — 숫자를 먼저 보고 납득한 다음 지운다.
 *
 * ## 서버 액션이라 이 화면에도 클라이언트 JS 가 없다
 *
 * 확인 단계를 클라이언트 상태가 아니라 **URL**로 들고 있기 때문에 가능하다.
 * 가드는 액션 안에도 있다 — 화면의 `requireAdmin()` 은 액션을 보호하지 못한다
 * (`_actions.ts` 주석).
 */
export default async function AdminUserDetailPage({
  params,
  searchParams,
}: AdminUserPageProps) {
  const actor = await requireAdmin();
  const [{ id }, query] = await Promise.all([params, searchParams]);

  let user;
  let adminCount = 0;
  try {
    // 관리자 수는 "마지막 관리자인가" 를 화면이 미리 알기 위해 함께 받는다.
    // 서버가 어차피 거절하지만, 누를 수 있는 버튼을 두고 거절하는 것은 나쁜 화면이다.
    const [detail, page] = await Promise.all([
      fetchUser(actor, id),
      fetchUsers(actor, { limit: 1 }),
    ]);
    user = detail;
    adminCount = page.adminCount;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return (
      <AdminShell actor={actor} current="users">
        <AdminUnavailable error={error instanceof ApiError ? error : null} />
      </AdminShell>
    );
  }

  const isSelf = user.id === actor.userId;
  const isLastAdmin = user.role === "admin" && adminCount <= 1;
  // 강등을 막는 조건은 백엔드와 **같은 규칙**이다. 여기서만 바꾸면 화면과 서버가
  // 어긋나 "눌리는데 거절당하는" 버튼이 생긴다.
  const lockedReason = isSelf
    ? "자기 자신의 권한은 이 화면에서 바꿀 수 없습니다."
    : isLastAdmin
      ? "마지막 관리자입니다. 먼저 다른 관리자를 지정하세요."
      : null;

  const confirming = query.confirm === "delete";

  return (
    <AdminShell actor={actor} current="users">
      <Link
        href="/admin/users"
        className="flex items-center gap-1 text-muted-50 hover:text-ink"
        style={{ fontSize: 12 }}
      >
        <Icon name="arrow-left" size={14} />
        회원 목록
      </Link>

      {query.error ? <Notice tone="alert">{query.error}</Notice> : null}
      {query.done && DONE_MESSAGES[query.done] ? (
        <Notice tone="success">{DONE_MESSAGES[query.done]}</Notice>
      ) : null}

      <section className="flex flex-col gap-1.5 border-b border-line-20 pb-4">
        <span className="flex flex-wrap items-center gap-2">
          <h2 className="font-display font-bold" style={{ fontSize: 18 }}>
            {user.email ?? "(이메일 없음)"}
          </h2>
          <RoleBadge role={user.role} />
        </span>
        <dl className="num flex flex-wrap gap-x-5 gap-y-1 text-muted-60" style={{ fontSize: 11.5 }}>
          <Field label="이름" value={user.name ?? "없음"} />
          <Field label="관심종목" value={`${user.watchlistCount}건`} />
          <Field label="투자 성향" value={user.hasProfile ? "있음" : "없음"} />
          <Field label="세션" value={`${user.activeSessions}개`} />
          <Field label="메일 인증" value={user.emailVerified ? "완료" : "없음"} />
        </dl>
      </section>

      <section className="flex flex-col gap-2">
        <SectionTitle>권한</SectionTitle>
        {lockedReason ? (
          <p className="text-muted-60" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
            {lockedReason}
          </p>
        ) : (
          <form action={changeRoleAction} className="flex items-center gap-2">
            <input type="hidden" name="userId" value={user.id} />
            <input
              type="hidden"
              name="role"
              value={user.role === "admin" ? "user" : "admin"}
            />
            <button
              type="submit"
              className={button()}
              style={{ fontSize: 13 }}
            >
              <Icon name="user" size={14} />
              {user.role === "admin" ? "관리자 권한 회수" : "관리자로 지정"}
            </button>
          </form>
        )}
      </section>

      <section className="flex flex-col gap-2 pt-2">
        <SectionTitle>계정 삭제</SectionTitle>
        <p className="text-muted-70" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
          이 계정과 함께 <strong>관심종목 {user.watchlistCount}건</strong>
          {user.hasProfile ? " · 투자 성향 1건" : ""} 이 지워집니다. 되돌릴 수 없습니다.
        </p>

        {isSelf ? (
          <p className="text-muted-60" style={{ fontSize: 12.5 }}>
            자기 계정은 이 화면에서 삭제할 수 없습니다.
          </p>
        ) : confirming ? (
          // 확인 단계 — **이메일을 손으로 쓰게 한다.** 버튼 하나는 습관적으로 눌린다.
          <form action={deleteUserAction} className="flex flex-col gap-2">
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="expectedEmail" value={user.email ?? ""} />
            <label htmlFor="confirmEmail" style={{ fontSize: 12.5 }}>
              지울 계정의 이메일(<code>{user.email ?? "없음"}</code>)을 입력하세요.
            </label>
            <input
              id="confirmEmail"
              name="confirmEmail"
              autoComplete="off"
              className="min-h-[var(--tap)] border border-line-control bg-field px-3 py-2 md:max-w-[320px]"
              style={{ fontSize: 13 }}
            />
            <span className="flex gap-2">
              <button
                type="submit"
                className={button()}
                style={{ fontSize: 13 }}
              >
                영구 삭제
              </button>
              <Link
                href={`/admin/users/${user.id}`}
                className="flex min-h-[var(--tap)] items-center border border-line-28 px-3 py-2 hover:border-ink md:min-h-0"
                style={{ fontSize: 13 }}
              >
                취소
              </Link>
            </span>
          </form>
        ) : (
          <Link
            href={`/admin/users/${user.id}?confirm=delete`}
            className="flex w-fit min-h-[var(--tap)] items-center gap-1.5 border border-line-28 px-3 py-2 font-medium hover:border-ink md:min-h-0"
            style={{ fontSize: 13 }}
          >
            <Icon name="minus" size={14} />
            계정 삭제…
          </Link>
        )}
      </section>
    </AdminShell>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="font-mono uppercase tracking-label-wide text-muted-50"
      style={{ fontSize: 10 }}
    >
      {children}
    </h3>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex gap-1.5">
      <dt className="text-muted-45">{label}</dt>
      <dd>{value}</dd>
    </span>
  );
}
