import type { Metadata } from "next";
import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/config/public";
import { REFUND_REQUEST_FIELDS, REFUND_RULES } from "@/shared/legal/refund";
import { BusinessInfoTable } from "../_components/BusinessInfoTable";
import { DocHeading, Section } from "../_components/Section";

/**
 * `/refund` — 환불정책.
 *
 * ## 왜 약관 제6조가 있는데 따로 두나
 *
 * 내용은 약관 제6조와 같다. 따로 두는 이유는 **닿는 거리** 때문이다.
 *
 *  1. 전자상거래법은 환불 기준을 구매 **전에** 볼 수 있게 요구하는데, 약관 제6조에
 *     묻혀 있으면 사는 사람이 조 번호를 찾아 스크롤해야 한다. 구매 화면에서
 *     한 번에 닿는 주소가 있어야 한다(`PurchaseCard` 의 환불 줄이 여기를 가리킨다).
 *  2. PG 심사는 환불정책을 **별도 항목**으로 확인한다.
 *
 * 두 문서가 어긋나면 안 되므로, 두 곳이 같이 쓰는 문장은 `shared/legal/refund` 에
 * 두고 양쪽이 가져다 쓴다. 백엔드도 같은 문장을 들고 있다(그쪽 주석 참조).
 *
 * 문서(`사주풀이서비스_사이트기본페이지_자료.docx`)의 초안 표를 참고하되 우리가
 * 실제로 파는 것에 맞췄다 — 상담형 리포트 항목은 뺐고(그런 상품이 없다), 회원
 * 탈퇴 관련 문구도 뺐다(회원가입이 없다).
 */

export const metadata: Metadata = {
  title: "환불정책",
  description: "AI Of Tellers 사주 리포트의 환불 기준과 접수 방법.",
};

export default function RefundPolicyPage() {
  return (
    <>
      <DocHeading title="환불정책" effectiveOn="2026년 9월 21일" />

      <Section title="1. 이 정책이 다루는 것">
        <p>
          AI Of Tellers 가 판매하는 유료 상품은{" "}
          <strong className="font-semibold text-ink">정밀 사주 리포트</strong> 하나이며,
          결제 승인 직후 생성이 시작되는 디지털 콘텐츠입니다. 아래 기준은 그 상품에
          적용됩니다.
        </p>
        <p>
          같은 내용이{" "}
          <Link href="/terms" className="text-ink underline underline-offset-2">
            이용약관
          </Link>{" "}
          제6조에도 있습니다. 두 문서가 다르게 읽히는 부분이 있다면 이용자에게 유리한
          쪽으로 해석합니다.
        </p>
      </Section>

      <Section title="2. 상황별 환불 기준">
        <dl className="space-y-3">
          {REFUND_RULES.map((rule) => (
            <div
              key={rule.상황}
              className="rounded-card-sm border border-line-20 px-4 py-3"
            >
              <dt className="mb-1 font-semibold text-ink">{rule.상황}</dt>
              <dd className="text-[14.5px] leading-[1.7] text-muted-75">{rule.처리}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="3. 청약철회가 제한되는 이유">
        <p>
          「전자상거래 등에서의 소비자보호에 관한 법률」 제17조는 디지털 콘텐츠의 제공이
          시작된 경우 청약철회를 제한할 수 있도록 하되,{" "}
          <strong className="font-semibold text-ink">
            그 사실을 미리 알리고 동의를 받은 경우
          </strong>
          에만 인정합니다.
        </p>
        <p>
          그래서 결제 화면에서 상품 구성·가격·제공 시점·환불 제한을 먼저 보여 드리고,
          제한에 동의하셔야 결제 버튼이 눌리도록 해 두었습니다. 동의하지 않으시면
          결제가 진행되지 않습니다.
        </p>
        <p>
          결제 전에는 여덟 글자와 무료 요약을 먼저 보실 수 있습니다. 어떤 내용을 사는
          것인지 확인하신 뒤 결정해 주세요.
        </p>
      </Section>

      <Section title="4. 환불 접수 방법">
        {SUPPORT_EMAIL ? (
          <p>
            아래 내용을 적어{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-ink underline underline-offset-2"
            >
              {SUPPORT_EMAIL}
            </a>{" "}
            로 보내 주세요.
          </p>
        ) : (
          <p className="text-down">
            문의 이메일이 아직 설정되지 않았습니다. 서비스 개시 전에 실제 주소를 넣어야
            합니다.
          </p>
        )}
        <ul className="list-disc space-y-1 pl-5">
          {REFUND_REQUEST_FIELDS.map((field) => (
            <li key={field}>{field}</li>
          ))}
        </ul>
        <p>
          회원가입이 없으므로 주문번호가 주문을 특정하는 유일한 단서입니다. 결제 완료
          화면의 주소를 저장해 두시면 확인이 빠릅니다.
        </p>
        <p>
          환불은 결제하신 수단으로 돌려 드립니다. 카드 결제는 카드사 처리 일정에 따라
          청구 취소 또는 대금 환입까지 며칠이 더 걸릴 수 있습니다.
        </p>
      </Section>

      <Section title="5. 환불이 자동으로 이루어지지 않는 이유">
        <p>
          결제 승인 결과가 미상인 주문은 자동으로 취소하지 않고{" "}
          <strong className="font-semibold text-ink">사람이 결제 내역과 대조</strong>
          합니다. 자동 취소는 실제로는 승인된 결제를 취소해 버리거나, 반대로 취소되지
          않은 결제를 취소된 것으로 처리할 수 있기 때문입니다.
        </p>
        <p>
          그 대조에 걸리는 시간이 위 표의 &ldquo;영업일 기준 1일&rdquo; 입니다.
        </p>
      </Section>

      <Section title="6. 판매자 정보">
        <BusinessInfoTable />
      </Section>
    </>
  );
}
