import Link from "next/link";
import { notFound } from "next/navigation";
import { markEmailVerified } from "@/lib/auth/accounts";
import { consumeVerificationToken, SIGNUP_ENABLED } from "@/lib/auth/signup";
import { marketCaptionSuffix } from "@/lib/config/marketHours";
import { masthead } from "@/lib/format";
import { Masthead } from "@/shared/components/layout/Masthead";
import { Icon } from "@/shared/ui";

/**
 * 가입 인증 링크가 도착하는 곳 — **개발자 모드에서만 열린다.**
 *
 * 가입(`/signup`)과 한 쌍이라 같은 조건으로 잠근다. 가입이 닫혀 있는데 이 화면만
 * 열려 있으면, 관리자가 만든 계정(이미 인증 표시가 붙어 있다)에 아무 영향도 없는
 * 화면이 하나 떠 있게 될 뿐이다.
 *
 * ## GET 으로 상태를 바꾼다
 *
 * 링크를 여는 것만으로 `emailVerified` 가 채워진다 — 메일 클라이언트가 링크를 미리
 * 열어 보는(prefetch) 경우 사용자가 누르기 전에 토큰이 소모될 수 있다는 뜻이다.
 * 그 대가를 받아들인 이유는 개발자 모드 전용 기능이고, 대안(폼 + POST)이 메일에서
 * 한 단계를 더 요구하기 때문이다. 공개 가입을 열 때 다시 볼 자리다.
 */
export const revalidate = 0;

interface VerifyPageProps {
  searchParams: Promise<{ email?: string; token?: string }>;
}

export default async function VerifyPage({ searchParams }: VerifyPageProps) {
  if (!SIGNUP_ENABLED) notFound();

  const { email, token } = await searchParams;
  const caption = `${masthead(new Date().toISOString())} · ${marketCaptionSuffix()}`;

  // 토큰을 먼저 소모하고, 그다음 계정을 인증 표시한다. 순서가 반대면 토큰 소모에
  // 실패했을 때 이미 인증된 계정이 남는다.
  const consumed =
    Boolean(email && token) && (await consumeVerificationToken(email!, token!));
  if (consumed) await markEmailVerified(email!);

  return (
    <main className="mx-auto flex w-full max-w-shell flex-col gap-5 px-4 pb-[30px] pt-[26px] md:px-8">
      <Masthead caption={caption} />

      <section className="mx-auto flex w-full max-w-[420px] flex-col gap-5 pt-6">
        <h1 className="font-display font-bold leading-none tracking-[-0.01em] text-[19px] md:text-[22px]">
          {consumed ? "이메일 인증 완료" : "인증하지 못했습니다"}
        </h1>

        <p
          className="flex items-start gap-2 border-y border-line-20 py-3 text-muted-70"
          style={{ fontSize: 12.5, lineHeight: 1.65 }}
        >
          <Icon
            name={consumed ? "check" : "bell"}
            size={15}
            className="mt-0.5 flex-none text-muted-45"
          />
          {consumed
            ? "이제 이메일과 비밀번호로 로그인할 수 있습니다."
            : "링크가 만료되었거나 이미 사용되었습니다. 다시 가입을 시도하면 새 링크가 발송됩니다."}
        </p>

        <Link
          href={consumed ? "/login" : "/signup"}
          className="min-h-[var(--tap)] border-2 border-ink py-2.5 text-center font-medium hover:bg-ink hover:text-on-ink"
          style={{ fontSize: 14 }}
        >
          {consumed ? "로그인하러 가기" : "다시 가입하기"}
        </Link>
      </section>
    </main>
  );
}
