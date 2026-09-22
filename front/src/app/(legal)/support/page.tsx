import type { Metadata } from "next";
import Link from "next/link";
import { RETENTION_DAYS, SUPPORT_EMAIL } from "@/lib/config/public";
import { REFUND_REQUEST_FIELDS } from "@/shared/legal/refund";
import { BusinessInfoTable } from "../_components/BusinessInfoTable";
import { DocHeading, Section } from "../_components/Section";

/**
 * `/support` — 고객센터.
 *
 * ## 왜 필요한가
 *
 * 결제가 막힌 사람에게 전액 환불을 약속하는 화면이 둘 있는데
 * (`PaySuccessScreen`, `PaidReportScreen`), 그 두 화면의 연락처는
 * `SUPPORT_EMAIL` 이 설정돼 있을 때만 그려진다. 설정돼 있지 않던 동안 **환불을
 * 약속받은 사람에게 연락할 방법이 한 줄도 없었다.**
 *
 * 페이지는 환경변수와 무관하게 존재하므로, 그 화면들이 **조건 없이** 가리킬 수
 * 있는 곳이 생긴다. 이메일이 비어 있으면 이 페이지가 그 사실을 말한다 — 링크가
 * 조용히 사라지는 것보다 낫다.
 *
 * ## 채널이 이메일 하나인 이유
 *
 * 소유자가 정했다(maverock@daum.net). 전화·카카오 채널을 적어 두고 받지 못하는
 * 것보다, 실제로 확인하는 창구 하나를 적는 편이 낫다 — `public.ts` 의
 * `resolveSupportEmail` 이 죽은 주소를 떨어뜨리는 것과 같은 판단이다.
 *
 * 전화번호는 사업자 정보 표에 있다(전자상거래법 제13조가 요구한다). 발급 전에는
 * 그 표 전체가 임시값으로 표시된다.
 */

export const metadata: Metadata = {
  title: "고객센터",
  description: "AI Of Tellers 문의 접수처와 문의 유형별 안내.",
};

const INQUIRY_GUIDE: readonly { 유형: string; 안내: string }[] = [
  {
    유형: "결제 문의",
    안내:
      "결제 실패, 중복 결제, 영수증이 필요하신 경우 주문번호와 결제하신 날짜를 함께 " +
      "보내 주세요. 카드 명세서에는 “AI Of Tellers 정밀 사주 리포트” 로 표시됩니다.",
  },
  {
    유형: "리포트를 받지 못한 경우",
    안내:
      "결제는 되었는데 리포트가 열리지 않으면 주문번호를 보내 주세요. 담당자가 결제 " +
      "내역과 대조한 뒤 리포트를 보내 드리거나 환불해 드립니다.",
  },
  {
    유형: "리포트 링크를 잃어버린 경우",
    안내:
      `구매하신 리포트는 ${RETENTION_DAYS}일간 보관되며 그 주소를 아는 사람만 열 수 ` +
      "있습니다. 회원가입이 없어 계정으로 다시 찾아 드릴 수 없으므로, 주문번호를 " +
      "보내 주시면 확인 후 안내해 드립니다.",
  },
  {
    유형: "환불 문의",
    안내: "환불 가능 여부는 리포트 제공 상태에 따라 달라집니다. 환불정책을 먼저 확인해 주세요.",
  },
  {
    유형: "개인정보 문의",
    안내:
      "열람·정정·삭제·처리정지를 요청하실 수 있습니다. 회원가입이 없으므로 본인 " +
      "확인은 주문번호와 결제 정보로 합니다.",
  },
  {
    유형: "풀이 내용 문의",
    안내:
      "사주 풀이는 참고용 콘텐츠이며 해석에는 유파에 따른 차이가 있습니다. 계산 " +
      "결과가 다른 만세력과 다르다고 느끼시면 입력하신 생년월일시와 함께 알려 주세요.",
  },
];

export default function SupportPage() {
  return (
    <>
      <DocHeading title="고객센터" effectiveOn="2026년 9월 21일" />

      <Section title="문의 접수">
        {SUPPORT_EMAIL ? (
          <>
            <p>
              문의는 이메일로 받습니다.{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-ink underline underline-offset-2"
              >
                {SUPPORT_EMAIL}
              </a>
            </p>
            <p>
              접수 후 <strong className="font-semibold text-ink">영업일 기준 1일 이내</strong>
              에 답변해 드립니다. 주말과 공휴일은 제외됩니다.
            </p>
          </>
        ) : (
          <p className="text-down">
            문의 이메일이 아직 설정되지 않았습니다. 서비스 개시 전에 반드시 실제 주소를
            넣어야 합니다.
          </p>
        )}
      </Section>

      <Section title="문의하실 때 함께 적어 주실 것">
        <p>
          회원가입이 없는 서비스라 <strong className="font-semibold text-ink">주문번호가
          주문을 특정하는 유일한 단서</strong>입니다. 결제와 관련된 문의에는 아래를 함께
          적어 주세요.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {REFUND_REQUEST_FIELDS.map((field) => (
            <li key={field}>{field}</li>
          ))}
        </ul>
      </Section>

      <Section title="문의 유형별 안내">
        <dl className="space-y-3">
          {INQUIRY_GUIDE.map((item) => (
            <div key={item.유형} className="rounded-card-sm border border-line-20 px-4 py-3">
              <dt className="mb-1 font-semibold text-ink">{item.유형}</dt>
              <dd className="text-[14.5px] leading-[1.7] text-muted-75">{item.안내}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="함께 보시면 좋은 문서">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <Link href="/refund" className="text-ink underline underline-offset-2">
              환불정책
            </Link>{" "}
            — 상황별 환불 기준과 접수 방법
          </li>
          <li>
            <Link href="/terms" className="text-ink underline underline-offset-2">
              이용약관
            </Link>{" "}
            — 서비스의 성격과 결제·환불 조항
          </li>
          <li>
            <Link href="/privacy" className="text-ink underline underline-offset-2">
              개인정보처리방침
            </Link>{" "}
            — 수집 항목과 보관 기간
          </li>
        </ul>
      </Section>

      <Section title="판매자 정보">
        <BusinessInfoTable />
      </Section>
    </>
  );
}
