import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { SIGNUP_ENABLED } from "@/lib/auth/signup";
import { marketCaptionSuffix } from "@/lib/config/marketHours";
import { masthead } from "@/lib/format";
import { Notice } from "@/shared/components/feedback";
import { Masthead } from "@/shared/components/layout/Masthead";
import { signUpAction } from "./_actions";

/**
 * 회원가입 — **개발자 모드에서만 열린다.**
 *
 * 지금 계정은 관리자가 발급한다(2026-08-18 결정). 이 화면은 나중에 공개 가입을 열
 * 때를 위해 미리 만들어 둔 것이고, 그때까지는 배포 환경에서 **존재하지 않는다.**
 *
 * `notFound()` 로 막는다 — "권한이 없습니다" 는 여기 뭔가 있다는 것을 알려 준다.
 * 열려 있지 않은 가입 폼의 존재를 광고할 이유가 없다 (`/admin` 과 같은 판단).
 *
 * 가입 즉시 로그인되지 않는다. 인증 메일의 링크를 열어야 `emailVerified` 가 채워지고,
 * 그전에는 `auth.ts` 의 authorize 가 거절한다.
 */
export const revalidate = 0;

interface SignupPageProps {
  searchParams: Promise<{ error?: string; sent?: string }>;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  if (!SIGNUP_ENABLED) notFound();

  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const { error, sent } = await searchParams;
  const caption = `${masthead(new Date().toISOString())} · ${marketCaptionSuffix()}`;

  return (
    <main className="mx-auto flex w-full max-w-shell flex-col gap-5 px-4 pb-[30px] pt-[26px] md:px-8">
      <Masthead caption={caption} />

      <section className="mx-auto flex w-full max-w-[420px] flex-col gap-5 pt-6">
        <div className="flex flex-col gap-[7px]">
          <h1 className="font-display font-bold leading-none tracking-[-0.01em] text-[19px] md:text-[22px]">
            회원가입
          </h1>
          <p
            className="font-mono leading-none tracking-label-wide text-muted-50"
            style={{ fontSize: 10.5 }}
          >
            개발자 모드 전용
          </p>
        </div>

        {/* 이 화면이 배포에 없다는 사실을 화면이 직접 말한다 — 스크린샷만 보고
            "가입이 열려 있다" 고 오해하는 일을 막는다. */}
        <p
          className="border-y border-line-20 py-3 text-muted-70"
          style={{ fontSize: 12.5, lineHeight: 1.65 }}
        >
          이 화면은 <strong>로컬 개발 환경에서만</strong> 열립니다. 실제 서비스에서는
          계정을 관리자가 발급하며, 이 주소는 404 입니다.
        </p>

        {sent ? (
          <Notice tone="success">
            인증 메일을 보냈습니다. 링크를 열면 가입이 끝납니다. 메일이 오지 않으면
            개발 서버 콘솔에 같은 주소가 찍혀 있습니다.
          </Notice>
        ) : null}

        {error ? (
          <Notice tone="alert">{error}</Notice>
        ) : null}

        <form action={signUpAction} className="flex flex-col gap-2">
          <label
            htmlFor="signup-email"
            className="font-mono uppercase tracking-label text-muted-45"
            style={{ fontSize: 10 }}
          >
            이메일
          </label>
          <input
            id="signup-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="min-h-[var(--tap)] border border-line-control bg-field px-3.5 py-2.5"
            style={{ fontSize: 13.5 }}
          />

          <label
            htmlFor="signup-name"
            className="mt-1.5 font-mono uppercase tracking-label text-muted-45"
            style={{ fontSize: 10 }}
          >
            이름 (선택)
          </label>
          <input
            id="signup-name"
            name="name"
            type="text"
            autoComplete="name"
            className="min-h-[var(--tap)] border border-line-control bg-field px-3.5 py-2.5"
            style={{ fontSize: 13.5 }}
          />

          <label
            htmlFor="signup-password"
            className="mt-1.5 font-mono uppercase tracking-label text-muted-45"
            style={{ fontSize: 10 }}
          >
            비밀번호
          </label>
          <input
            id="signup-password"
            name="password"
            type="password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            className="min-h-[var(--tap)] border border-line-control bg-field px-3.5 py-2.5"
            style={{ fontSize: 13.5 }}
          />
          {/* 길이만 요구한다. 대문자·특수문자 규칙을 두지 않는 근거는
              `lib/auth/password.ts` 의 `passwordProblem` 주석에 있다 (NIST SP 800-63B). */}
          <p className="text-muted-55" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
            {PASSWORD_MIN_LENGTH}자 이상. 길이가 가장 크게 기여하므로 문자 종류는
            강제하지 않습니다.
          </p>

          <button
            type="submit"
            className="mt-1.5 min-h-[var(--tap)] border-2 border-ink py-2.5 font-medium hover:bg-ink hover:text-on-ink"
            style={{ fontSize: 14 }}
          >
            가입하고 인증 메일 받기
          </button>
        </form>

        <p className="text-muted-55" style={{ fontSize: 12 }}>
          이미 계정이 있다면{" "}
          <Link href="/login" className="underline">
            로그인
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
