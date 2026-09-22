import Link from "next/link";
import type { Metadata } from "next";
import { REPORT_PRICE, RETENTION_DAYS, SUPPORT_EMAIL } from "@/lib/config/public";
import { REFUND_ON_FAILURE } from "@/shared/legal/refund";
import {
  DELIVERY_NOTE,
  PAID_INCLUDES,
  REPORT_PRODUCT_NAME,
} from "@/shared/legal/product";
import { BusinessInfoTable } from "../_components/BusinessInfoTable";
import { DocHeading, Section } from "../_components/Section";

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
  description: "AI Of Tellers 서비스 이용약관 · 환불 정책 · 사업자 정보",
};

export default function TermsOfServicePage() {
  return (
    <>
      <DocHeading title="이용약관" effectiveOn="2026년 9월 21일" />

      <Section title="제1조 (목적)">
        <p>
          이 약관은 AI Of Tellers(이하 &ldquo;서비스&rdquo;)가 제공하는 사주팔자 계산 및
          리포트 서비스의 이용과 관련하여 서비스와 이용자 간의 권리·의무 및 책임사항을
          정함을 목적으로 합니다.
        </p>
      </Section>

      <Section title="제2조 (서비스의 구성)">
        <p>
          서비스는 이용자가 입력한 생년월일시·성별·출생지를 바탕으로 진태양시 보정을
          적용해 사주팔자를 계산하고, 그 해석을 제공합니다.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="font-semibold text-ink">무료</strong> — 사주 여덟 글자,
            오행 분포, 일간, 신강·신약 판정과 요약.
          </li>
          <li>
            <strong className="font-semibold text-ink">유료</strong> — 정밀 사주 리포트.
            판정의 근거, 십신 해석, 대운과 세운의 흐름, 연애·재물·직업에 관한 해설을
            제공합니다. 자세한 거래조건은 아래와 같습니다.
          </li>
        </ul>

        {/* 결제 화면에 6줄짜리 표로 있던 것을 이리로 옮겼다. 사는 순간 읽어야 하는
            것(가격·제공 시점·청약철회 제한)은 결제 화면에 요약으로 남기고, 전문은
            약관인 여기에 둔다 — 화면은 사는 자리이지 읽는 자리가 아니다.

            값은 화면과 **같은 출처**에서 온다. 상품명·구성·제공 시점은
            `shared/legal/product`, 가격과 보관 기간은 `lib/config/public` 이고,
            결제 화면도 같은 것을 쓴다. 약관에 숫자를 손으로 적어 두면 가격을 바꾼
            날 약관만 조용히 뒤처진다. */}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-card-sm border border-line-20 px-4 py-4 text-[14.5px] leading-[1.7]">
          <dt className="text-muted-60">상품명</dt>
          <dd className="text-muted-75">{REPORT_PRODUCT_NAME}</dd>

          <dt className="text-muted-60">구성</dt>
          <dd className="text-muted-75">{PAID_INCLUDES.join(" · ")}</dd>

          <dt className="text-muted-60">가격</dt>
          <dd className="text-muted-75">
            {REPORT_PRICE.toLocaleString("ko-KR")}원 (부가세 포함)
          </dd>

          <dt className="text-muted-60">제공 시점</dt>
          <dd className="text-muted-75">{DELIVERY_NOTE}</dd>

          <dt className="text-muted-60">제공 방법</dt>
          <dd className="text-muted-75">
            결제 완료 후 발급되는 리포트 주소로 즉시 열람하실 수 있습니다. 별도의 설치나
            배송은 없습니다.
          </dd>

          <dt className="text-muted-60">보관 기간</dt>
          <dd className="text-muted-75">
            {RETENTION_DAYS}일. 그 동안 받으신 주소로 다시 보실 수 있으며, 기간이 지나면
            리포트와 입력하신 정보를 함께 파기합니다.
          </dd>

          <dt className="text-muted-60">청약철회</dt>
          <dd className="text-muted-75">
            리포트 생성이 시작되면 청약철회가 제한됩니다. 아래 제6조와{" "}
            <Link href="/refund" className="text-ink underline underline-offset-2">
              환불정책
            </Link>
            을 확인해 주세요.
          </dd>
        </dl>

        <p>
          서비스가 제공하는 것은{" "}
          <strong className="font-semibold text-ink">참고용 콘텐츠</strong>이며, 특정 결과나
          이익을 보장하지 않습니다.
        </p>
      </Section>

      <Section title="제3조 (계정)">
        <p>
          <strong className="font-semibold text-ink">이 서비스에는 회원가입이 없습니다.</strong>{" "}
          무료 계산과 유료 리포트 구매 모두 계정을 요구하지 않으며, 이름·이메일·연락처를
          받지 않습니다.
        </p>
        <p>
          서비스 운영에 필요한 관리자 계정이 별도로 존재하나 이는 운영자 전용이며
          이용자에게 제공되지 않습니다.
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
            이 경우 {REFUND_ON_FAILURE}
          </strong>{" "}
          이 환불 처리는 자동으로 이루어지지 않으며, 담당자가 결제대행사(토스페이먼츠)
          대시보드를 통해 직접 처리합니다.
        </p>
        <p>
          결제는 완료되었으나 리포트가 정상적으로 도착하지 않는 등 위와 같은 문제를 겪은
          경우, 아래 제10조의 문의처로 연락해 주시면 확인 후 처리해 드립니다.
        </p>
        <p>
          상황별 환불 기준과 접수 방법은{" "}
          <Link href="/refund" className="text-ink underline underline-offset-2">
            환불정책
          </Link>
          에 자세히 적어 두었습니다.
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
          <BusinessInfoTable />
      </Section>
    </>
  );
}
