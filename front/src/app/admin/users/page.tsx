import { cookies } from "next/headers";
import { fetchUsers, UserTable } from "@/features/common/admin";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { ApiError } from "@/lib/api";
import { requireAdmin } from "@/app/_data/admin";
import { button, Icon } from "@/shared/ui";
import { Notice } from "@/shared/components/feedback";
import { AdminShell } from "../_components/AdminShell";
import { AdminUnavailable } from "../_components/AdminUnavailable";
import { createAccountAction } from "../_actions";
import { FLASH_PASSWORD_COOKIE } from "../_flash-password";

/** 관리자 · 회원 관리. 현황과 같은 이유로 캐시하지 않는다. */
export const revalidate = 0;

interface AdminUsersPageProps {
  searchParams: Promise<{
    q?: string;
    done?: string;
    error?: string;
    created?: string;
  }>;
}

const DONE_MESSAGES: Record<string, string> = {
  deleted: "회원을 삭제했습니다. 그 계정의 관심종목·투자 성향도 함께 지워졌습니다.",
};

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const actor = await requireAdmin();
  const { q = "", done, error: actionError, created } = await searchParams;
  // 비밀번호는 주소가 아니라 쿠키로 온다 — `_actions.ts` 의 `FLASH_PASSWORD_COOKIE`
  // 주석 참고. 서버 컴포넌트는 쿠키를 지울 수 없어 여기서 읽기만 하고, 60초
  // 만료가 노출 창을 닫는다.
  const password = (await cookies()).get(FLASH_PASSWORD_COOKIE)?.value;

  let page;
  try {
    page = await fetchUsers(actor, { q });
  } catch (error) {
    return (
      <AdminShell actor={actor} current="users">
        <AdminUnavailable error={error instanceof ApiError ? error : null} />
      </AdminShell>
    );
  }

  return (
    <AdminShell actor={actor} current="users">
      {done && DONE_MESSAGES[done] ? (
        <Notice tone="success">{DONE_MESSAGES[done]}</Notice>
      ) : null}

      {created && password ? (
        <div
          role="status"
          className="flex flex-col gap-1.5 border-2 border-ink px-3 py-3"
          style={{ fontSize: 12.5, lineHeight: 1.6 }}
        >
          <span className="flex items-start gap-2 font-medium">
            <Icon name="check" size={15} className="mt-0.5 flex-none" />
            {created} 계정을 만들었습니다.
          </span>
          {/* **다시 볼 수 없는 값이다.** 해시만 저장하므로 이 자리를 지나가면
              관리자도 복구할 수 없다 — 그 사실을 화면이 말한다. */}
          <span className="num select-all border border-line-30 px-2 py-1.5">
            {password}
          </span>
          <span className="text-muted-55" style={{ fontSize: 11.5 }}>
            임시 비밀번호입니다. 지금 복사해 당사자에게 전달하세요 — 이 화면을 벗어나면
            다시 볼 수 없습니다.
          </span>
        </div>
      ) : null}

      {actionError ? (
        <Notice tone="alert">{actionError}</Notice>
      ) : null}

      {/* 계정 발급. 공개 가입이 닫혀 있으므로(개발자 모드 전용) **배포에서 계정이
          생기는 유일한 자리**다. */}
      <details className="border border-line-25">
        <summary
          className="flex min-h-[var(--tap)] cursor-pointer items-center gap-2 px-3 py-2.5 font-medium md:min-h-0"
          style={{ fontSize: 13 }}
        >
          <Icon name="plus" size={15} />
          계정 발급
        </summary>
        <form
          action={createAccountAction}
          className="flex flex-col gap-2 border-t border-line-20 px-3 py-3 md:flex-row md:items-end"
        >
          <label className="flex flex-1 flex-col gap-1">
            <span
              className="font-mono uppercase tracking-label text-muted-45"
              style={{ fontSize: 10 }}
            >
              이메일
            </span>
            <input
              name="email"
              type="email"
              required
              placeholder="user@example.com"
              className="min-h-[var(--tap)] border border-line-control bg-field px-3 py-2 md:min-h-0"
              style={{ fontSize: 13 }}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span
              className="font-mono uppercase tracking-label text-muted-45"
              style={{ fontSize: 10 }}
            >
              이름 (선택)
            </span>
            <input
              name="name"
              type="text"
              className="min-h-[var(--tap)] border border-line-control bg-field px-3 py-2 md:min-h-0"
              style={{ fontSize: 13 }}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span
              className="font-mono uppercase tracking-label text-muted-45"
              style={{ fontSize: 10 }}
            >
              임시 비밀번호 ({PASSWORD_MIN_LENGTH}자 이상)
            </span>
            <input
              name="password"
              type="text"
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="off"
              className="min-h-[var(--tap)] border border-line-control bg-field px-3 py-2 md:min-h-0"
              style={{ fontSize: 13 }}
            />
          </label>
          <button
            type="submit"
            className={button()}
            style={{ fontSize: 13 }}
          >
            발급
          </button>
        </form>
      </details>

      {/* 검색은 **GET 폼**이다 — 결과가 URL 에 남아 공유·뒤로가기가 그대로 되고,
          이 화면에서 브라우저로 내려가는 JS 가 0 이다 (조건 검색 칩과 같은 판단). */}
      <form action="/admin/users" method="get" className="flex items-center gap-2 pt-1">
        <label htmlFor="q" className="sr-only">
          이메일 또는 이름으로 검색
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="이메일 · 이름"
          className="min-h-[var(--tap)] flex-1 border border-line-control bg-field px-3 py-2 md:min-h-0 md:max-w-[320px]"
          style={{ fontSize: 13 }}
        />
        <button
          type="submit"
          className={button()}
          style={{ fontSize: 13 }}
        >
          <Icon name="search" size={14} />
          찾기
        </button>
      </form>

      <p className="num text-muted-45" style={{ fontSize: 10.5 }}>
        전체 {page.total.toLocaleString("ko-KR")}명 · 관리자 {page.adminCount}명
      </p>

      <UserTable rows={page.rows} total={page.total} />
    </AdminShell>
  );
}
