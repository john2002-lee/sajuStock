import { Fragment } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { IS_PLACEHOLDER, PLACEHOLDER_NOTICE, businessRows } from "@/shared/legal/business";
import { SUPPORT_EMAIL } from "@/lib/config/public";

/**
 * 이용약관.
 *
 * ## 환불 조항이 이 페이지의 유일한 필수 정답이다
 *
 * 이 제품은 **자동 환불하지 않는다.** `integrations/payment/toss.py` 의
 * `TossPaymentsProvider` 에는 취소·환불 메서드가 아예 없고, 승인 결과를 확정할 수
 * 없을 때 `saju_order_service.confirm_payment` 가 하는 일은 주문을
 * `needs_attention` 으로 표시하는 것뿐이다 — 사람이 토스 대시보드에서 처리한다.
 *
 * 그리고 화면은 이미 그 사람에게 약속을 하고 있다(`PaySuccessScreen`·
 * `PaidReportScreen` 이 띄우는 `saju_payment_needs_attention` 문장):
 *
 *   "결제 처리 중 문제가 발생해 담당자가 직접 확인하고 있습니다. 영업일 기준 1일
 *    이내로 결제하신 금액을 전액 환불해 드립니다."
 *
 * **제6조는 그 문장을 그대로 쓴다.** 약관이 "환불 불가" 라고 적으면서 화면은 전액
 * 환불을 약속하는 상태가 가장 나쁘다 — 어느 쪽을 믿어야 하는지 고객이 알 수 없고,
 * 분쟁에서는 화면의 약속이 이긴다. 한쪽을 고칠 때 반드시 다른 쪽도 고쳐야 한다.
 */

export const metadata: Metadata = {
  title: "이용약관",
  description: "종목 원장 서비스 이용약관 · 환불 정책 · 사업자 정보",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 font-display text-[17px] text-ink">{title}</h2>
      <div className="space-y-2.5 text-[15px] leading-[1.75] text-muted-75">{children}</div>
    </section>
  );
}

export default function TermsOfServicePage() {
  return (
    <>
      <h1 className="mb-2 font-display text-[26px] font-normal leading-tight text-ink">
        이용약관
      </h1>
      <p className="mb-10 text-12 text-muted-60">시행일: 2026년 8월 25일</p>

      <Section title="제1조 (목적)">
        <p>
          이 약관은 종목 원장(이하 &ldquo;서비스&rdquo;)이 제공하는 주식 정보 서비스와
          사주팔자 계산·리포트 서비스의 이용과 관련하여 서비스와 이용자 간의 권리·의무
          및 책임사항을 정함을 목적으로 합니다.
        </p>
      </Section>

      <Section title="제2조 (서비스의 구성)">
        <p>서비스는 두 개의 서비스로 구성됩니다.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="font-semibold text-ink">주식</strong> — 시장 지수·종목
            시세·재무·뉴스·애널리스트 리포트의 조회, 관심종목 관리, AI 판단 요약을
            제공합니다.
          </li>
          <li>
            <strong className="font-semibold text-ink">사주</strong> — 이용자가 입력한
            생년월일시·성별·출생지를 바탕으로 진태양시 보정을 적용해 사주팔자를 계산하고,
            무료 요약과 유료 상세 리포트를 제공합니다.
          </li>
        </ul>
        <p>
          두 서비스는 각자 답합니다. 사주로 읽은 성향을 종목 판단에 결합하는 기능은
          준비 중이며, 도입되더라도 성향은 판단을 보수적인 쪽으로만 움직이고 없던 매수
          판단을 만들어내지 않습니다.
        </p>
      </Section>

      <Section title="제3조 (회원)">
        <p>
          이용자는 이메일 주소와 비밀번호로 회원으로 가입할 수 있습니다. 회원 가입은
          관심종목을 여러 기기에서 이어 보기 위한 것이며,{" "}
          <strong className="font-semibold text-ink">
            사주 서비스는 회원 가입 없이 이용합니다
          </strong>{" "}
          — 무료 계산과 유료 리포트 구매 모두 계정을 요구하지 않습니다.
        </p>
        <p>
          회원은 아래 제10조의 문의처로 탈퇴를 요청할 수 있으며, 서비스는 요청을 받으면
          지체 없이 회원 정보를 파기합니다. 회원이 약관을 위반하거나 타인의 정보를
          도용한 경우 서비스는 해당 회원 정보를 삭제할 수 있습니다.
        </p>
      </Section>

      <Section title="제4조 (비회원 이용)">
        <p>
          회원가입 없이도 서비스를 이용할 수 있습니다. 사주 리포트를 구매하신 경우 결제
          완료 후 발급되는 리포트 접근 링크를 통해 결과를 확인합니다.{" "}
          <strong className="font-semibold text-ink">이 링크 자체가 자격 증명입니다</strong>
          — 링크를 아는 사람은 누구나 해당 리포트를 열 수 있으므로 타인에게 공유하지
          마시기 바랍니다.
        </p>
      </Section>

      <Section title="제5조 (결제)">
        <p>
          사주 리포트 결제는 토스페이먼츠를 통해 처리되며, 결제 수단 정보는 서비스가
          직접 저장하지 않습니다. 결제 승인이 확인되면 리포트 생성이 시작됩니다.
        </p>
        <p>
          결제 금액은 결제창을 열기 전에 서버가 확정하며, 승인 시 서버가 다시 대조합니다.
        </p>
      </Section>

      <Section title="제6조 (환불 정책)">
        <p>
          서비스가 제공하는 리포트는 결제 즉시 생성이 시작되는 디지털 콘텐츠로,
          정상적으로 생성이 완료된 리포트에 대해서는 별도의 청약철회·환불을 지원하지
          않습니다.
        </p>
        <p>
          다만 결제 처리 중 오류가 발생하거나 리포트 생성이 정상적으로 완료되지 못한
          경우, 서비스는 해당 주문을 담당자 확인이 필요한 상태로 표시하고 사람이 직접
          확인합니다.{" "}
          <strong className="font-semibold text-ink">
            이 경우 영업일 기준 1일 이내로 결제하신 금액을 전액 환불해 드립니다.
          </strong>{" "}
          이 환불 처리는 자동으로 이루어지지 않으며, 담당자가 결제대행사(토스페이먼츠)
          대시보드를 통해 직접 처리합니다.
        </p>
        <p>
          결제는 완료되었으나 리포트가 정상적으로 도착하지 않는 등 위와 같은 문제를 겪은
          경우, 아래 제10조의 문의처로 연락해 주시면 확인 후 처리해 드립니다.
        </p>
      </Section>

      <Section title="제7조 (이용자의 의무)">
        <p>
          이용자는 본인의 실제 생년월일시 등 정보를 정확히 입력해야 하며, 타인의 정보를
          무단으로 입력하여 서비스를 이용해서는 안 됩니다.
        </p>
        <p>
          서비스의 조회 기능을 자동화된 수단으로 과도하게 반복 호출하여 서비스 운영에
          지장을 주는 행위를 해서는 안 됩니다.
        </p>
      </Section>

      <Section title="제8조 (면책조항)">
        <p>
          <strong className="font-semibold text-ink">주식</strong> — 서비스가 제공하는
          시세·재무·뉴스·AI 판단은 외부 공급자의 데이터를 가공한 참고 자료이며 투자
          권유가 아닙니다. 시세는 실시간이 아닐 수 있습니다. 투자에 따른 손익의 책임은
          이용자 본인에게 있습니다.
        </p>
        <p>
          <strong className="font-semibold text-ink">사주</strong> — 리포트는 전통 명리학
          이론에 기반한 해설로, 그 내용의 정확성이나 특정 결과를 보장하지 않습니다.
          의료·법률·투자 판단을 대신하지 않으며, 리포트 내용을 근거로 한 이용자의 판단과
          그 결과에 대해 서비스는 책임을 지지 않습니다.
        </p>
        <p>
          강약 판정 등 일부 계산은 이 서비스가 정한 셈법을 따르므로 다른 만세력과 결과가
          다를 수 있습니다. 밤 11시 이후 출생은 다음 날로 세는 정자시설을 따릅니다.
        </p>
      </Section>

      <Section title="제9조 (개인정보)">
        <p>
          서비스의 개인정보 수집·이용·보관·파기에 관한 사항은{" "}
          <Link href="/privacy" className="text-ink underline underline-offset-2">
            개인정보처리방침
          </Link>
          을 따릅니다.
        </p>
      </Section>

      <Section title="제10조 (문의처 및 사업자 정보)">
        {SUPPORT_EMAIL ? (
          <p>
            문의:{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-ink underline underline-offset-2">
              {SUPPORT_EMAIL}
            </a>
          </p>
        ) : (
          <p className="text-down">
            문의 이메일이 아직 설정되지 않았습니다. 서비스 개시 전에 실제 주소를 넣어야
            합니다.
          </p>
        )}
        {IS_PLACEHOLDER && <p className="text-down">{PLACEHOLDER_NOTICE}</p>}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pt-1">
          {businessRows().map(([label, value]) => (
            <Fragment key={label}>
              <dt className="text-muted-60">{label}</dt>
              <dd className="text-muted-75">{value}</dd>
            </Fragment>
          ))}
        </dl>
      </Section>
    </>
  );
}
