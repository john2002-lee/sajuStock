import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, AUTH_ENABLED, PASSWORD_LOGIN_ENABLED, signIn } from "@/auth";
import { safeNextPath } from "@/lib/auth/next-path";
import { SIGNUP_ENABLED } from "@/lib/auth/signup";
import { marketCaptionSuffix } from "@/lib/config/marketHours";
import { masthead } from "@/lib/format";
import { Notice } from "@/shared/components/feedback";
import { Masthead } from "@/shared/components/layout/Masthead";
import { Icon } from "@/shared/ui";

/**
 * 로그인 화면.
 *
 * ## 이 화면은 **운영자용 입구**다
 *
 * 한때 여기는 "로그인하면 대시보드와 AI 판단이 열립니다" 를 파는 화면이었다. 지금은
 * 아니다 — 공개 회원가입이 닫혀 있고(`lib/auth/signup`), `auth.ts` 의 `signIn`
 * 콜백이 관리자가 아닌 계정을 문턱에서 돌려보낸다. 그러니 **일반 방문자에게 이
 * 화면은 들어갈 수 없는 문**이고, 화면 문구도 그렇게 말해야 한다.
 *
 * 팔지 않는 대신 **잃는 것이 없다는 것**을 말한다. 사주는 로그인 없이 처음부터
 * 끝까지 돌아간다. 문 앞에서 돌아선 사람이 제품을 못 쓰는 것으로 오해하면 안 된다.
 *
 * **이 문단이 아래 문구의 근거다.** 가입을 열거나 게이트를 옮기면 함께 고친다.
 *
 * ## 설정된 수단만 보여 준다
 *
 * DB 주소가 없으면 비밀번호 칸이 없고, 구글 키가 없으면 구글 버튼이 없다. 둘 다 없으면
 * 이 화면은 아예 안내로 바뀐다 — 누르면 깨지는 버튼을 두지 않는다.
 *
 * 이메일 매직링크는 2026-08-18 에 걷어냈다. 비밀번호 로그인이 생기면서 같은 성격의
 * 입구가 셋이 됐고, 그중 "비밀번호 없이 메일로" 가 가장 덜 쓰였다.
 */
export const revalidate = 0;

const GOOGLE_ON = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

/**
 * Auth.js 가 `?error=` 로 넘기는 코드 → 사람이 읽는 문장.
 *
 * **`Configuration` 을 "설정이 잘못됐습니다" 로 번역하면 안 된다.** 이 화면에 그
 * 코드로 도착하는 가장 흔한 경로가 **사용자가 구글 화면에서 취소한 경우**이기
 * 때문이다 — 취소는 `iss` 없는 에러 응답으로 돌아오고, Auth.js 는 그것을
 * `CallbackRouteError` 로 감싸 이 코드로 내보낸다 (`auth.ts` 의 `pages.error` 주석).
 *
 * 그래서 문장을 **양쪽 다 포함하도록** 쓴다. 취소한 사람에게는 "다시 시도" 가
 * 답이고, 진짜 설정 문제라면 로그에 원인이 남아 있다는 것을 알려 준다. 어느 쪽인지
 * 화면이 단정하지 않는 편이 정직하다.
 */
const ERROR_MESSAGES: Record<string, string> = {
  Configuration:
    "로그인이 완료되지 않았습니다. 구글 화면에서 취소했다면 다시 시도하시면 됩니다. " +
    "반복된다면 서버 로그에 원인이 남아 있습니다.",
  /**
   * 관리자가 아닌 계정이 **문턱에서** 돌아왔다 (`auth.ts` 의 `signIn` 콜백). 구글
   * 버튼은 아무나 누를 수 있으므로 이 코드로 도착하는 가장 흔한 경로가 그쪽이다.
   *
   * "다른 계정으로 시도해 보세요" 라고 하지 않는다 — **계정을 바꿔도 결과가 같다.**
   * 회원이 아니라는 사실과, 그래도 잃는 것이 없다는 사실(사주는 로그인이 필요 없다)을
   * 함께 적는다.
   */
  AccessDenied:
    "회원이 아닙니다. 계정은 운영·관리용으로만 발급됩니다. " +
    "사주는 로그인 없이 그대로 이용하실 수 있습니다.",
  /**
   * 비밀번호 로그인 실패. **하나로 합친 것이 의도다** — "없는 계정" 과 "비밀번호
   * 틀림" 을 구분해 주면 어떤 이메일이 가입돼 있는지 알려주는 것이 된다.
   * 인증 안 된 계정도 여기로 온다 (`auth.ts` 의 authorize).
   */
  CredentialsSignin:
    "이메일 또는 비밀번호가 올바르지 않습니다. 가입 후 이메일 인증을 마치지 않았다면 " +
    "받은 메일의 링크를 먼저 열어 주세요.",
};

const DEFAULT_ERROR = "로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.";

interface LoginPageProps {
  /** Next 16 은 searchParams 를 Promise 로 준다 */
  searchParams: Promise<{ error?: string; next?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, next } = await searchParams;

  /**
   * 로그인 뒤 갈 자리. **검사를 통과한 값만** 쓴다 — 이 값으로 `redirect()` 를
   * 부르므로, 검사가 없으면 우리 도메인의 로그인 화면을 지나 남의 사이트로
   * 도착하는 링크가 만들어진다 (`lib/auth/next-path` 주석).
   *
   * 돌아갈 자리를 들고 오지 않았으면 **관리자 화면**으로 보낸다. 예전 기본값은
   * `/dashboard` 였다 — 그때는 누구나 로그인할 수 있었기 때문이다. 지금은
   * `auth.ts` 의 `signIn` 콜백이 관리자가 아닌 사람을 문턱에서 돌려보내므로 여기까지
   * 온 사람은 운영자이고, 그에게 첫 화면은 운영 현황이어야 한다. **주식 서비스로
   * 들어가는 문도 그 화면에 있다** (`app/admin/_components/AdminShell.tsx`).
   */
  const target = safeNextPath(next) ?? "/admin";

  // 이미 로그인했으면 여기 머물 이유가 없다. **`target` 으로 보낸다** — 다른 탭에서
  // 이미 로그인한 상태로 이 링크를 따라온 경우, 대시보드로 보내면 방금 누른 것과
  // 무관한 화면이 뜬다.
  const session = await auth();
  if (session?.user) redirect(target);

  const errorMessage = error
    ? (ERROR_MESSAGES[error] ?? DEFAULT_ERROR)
    : null;

  const caption = `${masthead(new Date().toISOString())} · ${marketCaptionSuffix()}`;

  return (
    <main className="mx-auto flex w-full max-w-shell flex-col gap-5 px-4 pb-[30px] pt-[26px] md:px-8">
      <Masthead caption={caption} />

      <section className="mx-auto flex w-full max-w-[420px] flex-col gap-5 pt-6">
        <div className="flex flex-col gap-[7px]">
          <h1 className="font-display font-bold leading-none tracking-[-0.01em] text-[19px] md:text-[22px]">
            로그인
          </h1>
          <p
            className="font-mono leading-none tracking-label-wide text-muted-50"
            style={{ fontSize: 10.5 }}
          >
            운영·관리자 전용 입구입니다
          </p>
        </div>

        {/* 들어갈 수 있는 사람이 누구인지 먼저, 못 들어가도 잃는 것이 없다는 것을 그다음 */}
        <p
          className="border-y border-line-20 py-3 text-muted-70"
          style={{ fontSize: 12.5, lineHeight: 1.65 }}
        >
          <strong>계정은 운영·관리용입니다.</strong> 공개 회원가입은 열려 있지 않고,
          관리자로 등록된 계정만 로그인할 수 있습니다.{" "}
          {/* 태그 옆의 줄바꿈은 JSX 가 공백째 지운다 — `{" "}` 로 명시한다 */}
          <strong>사주는 로그인 없이</strong> 처음부터 끝까지 이용하실 수 있으니, 사주를
          보러 오셨다면 이 화면을 지나치셔도 됩니다.
        </p>

        {/* 실패 안내는 버튼 **위**에 둔다 — 아래 두면 다시 누를 버튼을 지나친 뒤에야
            읽게 되고, 모바일에서는 화면 밖일 수도 있다. role="alert" 로 스크린리더가
            페이지 도착과 함께 읽는다. */}
        {errorMessage ? (
          <Notice tone="alert">{errorMessage}</Notice>
        ) : null}

        {/* **비밀번호가 첫 자리다.** 계정을 관리자가 발급하는 지금, 대부분의 사람이
            여기로 들어온다. 구글은 이미 그렇게 만든 계정을 위해 남겨 둔다. */}
        {PASSWORD_LOGIN_ENABLED ? (
          <form
            action={async (formData: FormData) => {
              "use server";
              const email = String(formData.get("email") ?? "");
              const password = String(formData.get("password") ?? "");
              try {
                await signIn("password", { email, password, redirectTo: target });
              } catch (error) {
                // 성공도 예외로 온다 — `redirectTo` 가 NEXT_REDIRECT 를 던진다.
                // 그것까지 삼키면 로그인에 성공하고도 화면이 안 넘어간다.
                if (error instanceof AuthError) {
                  // **실패해도 돌아갈 자리를 잃지 않는다.** 여기서 `next` 를 떨어뜨리면
                  // 비밀번호를 한 번 틀린 사람만 대시보드로 가게 된다.
                  const query = new URLSearchParams({ error: error.type });
                  if (next) query.set("next", target);
                  redirect(`/login?${query}`);
                }
                throw error;
              }
            }}
            className="flex flex-col gap-2"
          >
            <label
              htmlFor="password-email"
              className="font-mono uppercase tracking-label text-muted-45"
              style={{ fontSize: 10 }}
            >
              이메일 · 비밀번호
            </label>
            <input
              id="password-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="min-h-[var(--tap)] border border-line-control bg-field px-3.5 py-2.5"
              style={{ fontSize: 13.5 }}
            />
            <input
              id="password-password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="비밀번호"
              aria-label="비밀번호"
              className="min-h-[var(--tap)] border border-line-control bg-field px-3.5 py-2.5"
              style={{ fontSize: 13.5 }}
            />
            <button
              type="submit"
              className="min-h-[var(--tap)] border-2 border-ink py-2.5 font-medium hover:bg-ink hover:text-on-ink"
              style={{ fontSize: 14 }}
            >
              로그인
            </button>
            <p className="text-muted-55" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
              계정은 관리자가 발급합니다. 받지 못했다면 담당자에게 문의해 주세요.
              {SIGNUP_ENABLED ? (
                <>
                  {" "}
                  <Link href="/signup" className="underline">
                    회원가입
                  </Link>
                  <span className="text-muted-40"> (개발자 모드에서만 열립니다)</span>
                </>
              ) : null}
            </p>
          </form>
        ) : null}

        {PASSWORD_LOGIN_ENABLED && GOOGLE_ON ? (
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-line-20" />
            <span
              className="font-mono uppercase tracking-label text-muted-45"
              style={{ fontSize: 10 }}
            >
              또는
            </span>
            <span className="h-px flex-1 bg-line-20" />
          </div>
        ) : null}

        {!AUTH_ENABLED ? (
          <Notice>
            로그인 수단이 아직 설정되지 않았습니다. <code>front/.env.local</code> 에
            DB 주소(<code>AUTH_DATABASE_URL</code> — 비밀번호 로그인) 또는 구글
            OAuth(<code>AUTH_GOOGLE_ID</code>·<code>AUTH_GOOGLE_SECRET</code>)를 넣으면
            이 화면에 입력 칸이 나타납니다.
          </Notice>
        ) : null}

        {GOOGLE_ON ? (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: target });
            }}
          >
            <button
              type="submit"
              className="flex min-h-[var(--tap)] w-full items-center justify-center gap-2 border-2 border-ink py-3 font-medium hover:bg-ink hover:text-on-ink"
              style={{ fontSize: 14 }}
            >
              <Icon name="user" size={16} />
              구글로 계속하기
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
