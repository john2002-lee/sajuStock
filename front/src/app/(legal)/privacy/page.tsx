import { Fragment } from "react";
import type { Metadata } from "next";
import {
  IS_PLACEHOLDER,
  PLACEHOLDER_NOTICE,
  PRIVACY_OFFICER,
  businessRows,
} from "@/shared/legal/business";
import { RETENTION_DAYS, SUPPORT_EMAIL } from "@/lib/config/public";

/**
 * 개인정보처리방침.
 *
 * ## 여기 적힌 모든 사실은 이 제품의 실제 동작이다 — 상용구가 아니다
 *
 * 코드와 대조한 근거를 남긴다. 이 문서가 코드와 조용히 어긋나는 것이 가장 흔한
 * 실패이므로, 어디를 보면 확인되는지 함께 적어 둔다.
 *
 *  - **무료 경로 수집 항목** — `schemas/saju.BirthInput`
 *    (year/month/day/hour/minute/gender/birth_place_code/is_lunar/is_leap_month).
 *    **저장하지 않는다**: `/saju/chart` 와 `/saju/report` 는 DB 를 만지지 않고,
 *    결과는 브라우저 `sessionStorage` 에만 있다(`features/saju/model/storage.ts`).
 *  - **유료 경로 수집 항목** — `models/saju_order.SajuOrderRow` 가 생년월일시를
 *    JSONB 로 보관하고 `SajuReportRow` 가 리포트 본문을 보관한다. 계정을 요구하지
 *    않으므로 이 둘이 사주 쪽에서 저장되는 전부다.
 *  - **회원 항목** — 이메일·이름·비밀번호 해시·인증 시각(`lib/auth/accounts.ts` 의
 *    `users` 테이블). 닉네임과 생년월일은 받지 않는다. 관심종목·보유 정보는
 *    `models/watchlist.py`.
 *  - **보관 기간** — `saju_report_price` 옆의 `saju_order_retention_days`(30일).
 *    화면과 이 문서가 같은 숫자를 말하도록 `RETENTION_DAYS` 를 렌더한다 —
 *    하드코딩한 숫자면 백엔드 설정이 바뀔 때 이 문서만 조용히 뒤처진다.
 *  - **AI 제공사에 무엇을 보내는가** — `domain/saju/report_prompt.build_prompt` 는
 *    **계산이 끝난 값만** 보낸다(사주 여덟 글자·오행·십신·강약·대운/세운).
 *    생년월일시·성별·출생지 원문은 프롬프트에 들어가지 않는다. 반면 추가 질문의
 *    자유 입력은 `normalize_free_text` 로 한 줄로 접고 `_defuse_delimiters` 로
 *    구분자만 무력화한 뒤 **그대로** 전달된다 — 둘 다 비식별 처리가 아니므로
 *    아래 4항은 "별도의 비식별 처리 없이" 라고 적는다.
 *  - **역추정 가능성** — 계산 결과만으로도 생년월일과 성별을 좁힐 수 있다. 여덟
 *    글자와 대운 시작 연도가 태어난 날을 하루 단위까지, 시주가 시각을 두 시간
 *    범위까지 좁히고, 대운의 순행·역행은 태어난 해의 천간과 성별로 결정된다
 *    (`domain/saju/luck.py`). 그래서 이 데이터를 결합에 의해 개인을 알아볼 수 있는
 *    정보로 보아 취급한다 — 4항이 그것을 밝힌다.
 *  - **결제** — 토스페이먼츠(`integrations/payment/toss.py`). 카드 정보는 서비스가
 *    받지 않는다.
 *
 * 사업자 정보와 문의처는 **지어내지 않고** 임시값임을 표시한 채 둔다
 * (`shared/legal/business.ts`).
 */

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "종목 원장이 수집하는 개인정보 항목 · 이용 목적 · 보관 기간 · 파기 절차",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 font-display text-[17px] text-ink">{title}</h2>
      <div className="space-y-2.5 text-[15px] leading-[1.75] text-muted-75">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <>
      <h1 className="mb-2 font-display text-[26px] font-normal leading-tight text-ink">
        개인정보처리방침
      </h1>
      <p className="mb-10 text-12 text-muted-60">시행일: 2026년 8월 25일</p>

      <Section title="1. 수집하는 개인정보 항목">
        <p>
          종목 원장(이하 &ldquo;서비스&rdquo;)이 수집하는 항목은 이용하시는 기능에 따라
          다릅니다.
        </p>

        <p className="pt-2">
          <strong className="font-semibold text-ink">사주 — 무료로 여덟 글자만 보실 때</strong>
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>생년월일시 (양력/음력, 윤달 여부, 시각 — 시각 모름 선택 가능)</li>
          <li>성별</li>
          <li>출생지 (지역 선택)</li>
        </ul>
        <p>
          이 경우{" "}
          <strong className="font-semibold text-ink">
            위 항목을 서버에 저장하지 않습니다.
          </strong>{" "}
          계산에만 쓰고 응답과 함께 버리며, 결과는 이용하시는 브라우저 안에만 남습니다.
        </p>

        <p className="pt-2">
          <strong className="font-semibold text-ink">사주 — 리포트를 구매하실 때</strong>
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>위 생년월일시·성별·출생지</li>
          <li>생성된 리포트 본문</li>
          <li>주문 정보 (주문 번호, 금액, 결제 상태, 결제 식별자)</li>
          <li>추가 질문을 이용하신 경우, 선택하거나 직접 입력한 질문과 그에 대한 답변</li>
        </ul>
        <p>
          다시 보실 수 있도록 보관하며, 주문 생성일로부터{" "}
          <strong className="font-semibold text-ink">{RETENTION_DAYS}일</strong> 후
          파기합니다.
        </p>
        <p>
          추가 질문의 자유 입력란에는 이름·연락처·주민등록번호·건강 상태 등 민감한 내용을
          적지 않는 것을 권장합니다. 이 텍스트는 아래 4항과 같이 AI 제공사에 별도의
          비식별 처리 없이 전달됩니다.
        </p>

        <p className="pt-2">
          <strong className="font-semibold text-ink">회원으로 가입하실 때</strong>
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>이메일 주소, 이름(선택)</li>
          <li>비밀번호 (원문을 저장하지 않으며, 복원이 불가능한 형태로만 보관합니다)</li>
          <li>관심종목 목록과 이용자가 직접 입력한 보유 수량·평균 단가(선택)</li>
        </ul>
        <p>
          회원 가입은 관심종목을 여러 기기에서 이어 보기 위한 것입니다. 사주 서비스는
          회원 가입 없이 이용하며, 가입 시 생년월일시를 받지 않습니다.
        </p>

        <p className="pt-2">
          결제 시 결제수단 정보는 서비스가 직접 저장하지 않으며, 결제대행사(토스페이먼츠)가
          처리합니다.
        </p>
      </Section>

      <Section title="2. 개인정보의 수집 및 이용 목적">
        <ul className="list-disc space-y-1 pl-5">
          <li>사주 계산(진태양시 보정 포함) 및 유료 리포트 생성·전달</li>
          <li>결제 처리 및 결제 관련 문의 대응</li>
          <li>리포트 생성 실패 등 문제 발생 시 고객 문의 대응(제10조 참조)</li>
          <li>회원 식별 및 관심종목 동기화</li>
        </ul>
      </Section>

      <Section title="3. 개인정보의 보유 및 이용 기간">
        <p>
          서비스는 위 목적을 달성하는 데 필요한 기간 동안만 개인정보를 보유합니다. 사주
          주문·리포트·추가 질문은 주문 생성일로부터{" "}
          <strong className="font-semibold text-ink">{RETENTION_DAYS}일</strong>이 경과하면
          지체없이 파기합니다.
        </p>
        <p>
          다만 관련 법령(전자상거래 등에서의 소비자보호에 관한 법률, 전자금융거래법 등)에서
          별도의 보존 기간을 정하는 거래·결제 기록이 있는 경우, 해당 법령이 정한 기간
          동안은 그 범위 내에서 보존할 수 있습니다.
        </p>
        <p>
          회원 정보와 관심종목은 회원 탈퇴 시까지 보관하며, 아래 제10조의 문의처로 탈퇴를
          요청하시면 지체 없이 파기합니다. 위 {RETENTION_DAYS}일 보관 기간은 회원 가입
          여부와 무관하게 사주 주문 데이터에 적용됩니다.
        </p>
      </Section>

      <Section title="4. 개인정보의 제3자 제공 및 처리위탁">
        <p>
          서비스는 원칙적으로 개인정보를 외부에 제공하지 않으며, 다음의 경우에 한해 처리를
          위탁합니다.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="font-semibold text-ink">AI 제공사 (Google)</strong> — 리포트
            문장 생성을 위해, 계산이 이미 끝난 사주 데이터(사주 여덟 글자 · 오행 · 십신 ·
            강약 · 대운/세운 등)를 전달합니다. 생년월일시·성별·출생지를 그대로 보내지는
            않지만,{" "}
            <strong className="font-semibold text-ink">
              전달되는 계산 결과만으로도 생년월일과 성별을 역으로 추정할 수 있습니다
            </strong>
            . 사주 여덟 글자와 대운 시작 연도가 태어난 날을 하루 단위까지, 시주가 태어난
            시각을 두 시간 범위까지 좁히고, 대운의 순행·역행 방향은 태어난 해의 천간과
            성별에 의해 결정되기 때문입니다. 따라서 이 데이터는 「개인정보 보호법」상
            결합에 의해 개인을 알아볼 수 있는 정보로 보아 취급합니다. 추가 질문을
            이용하시는 경우, 위 계산 결과와 함께 직접 입력하신 질문 내용도 별도의 비식별
            처리 없이 그대로 전달됩니다.
          </li>
          <li>
            <strong className="font-semibold text-ink">토스페이먼츠</strong> — 결제 승인 및
            처리를 위해 결제 정보를 전달·처리합니다.
          </li>
        </ul>
        <p>
          주식 서비스의 AI 판단에는 종목·시세·재무·공시 등 공개 정보만 전달하며, 이용자를
          식별할 수 있는 정보나 사주 데이터는 전달하지 않습니다.
        </p>
      </Section>

      <Section title="5. 이용자의 권리">
        <p>
          이용자는 자신의 개인정보에 대한 열람·정정·삭제를 요청할 수 있습니다. 다만 현재
          서비스에는 로그인한 뒤 스스로 개인정보를 열람·정정·삭제할 수 있는 화면이 없으므로,
          회원·비회원 모두 아래 제10조의 문의처로 요청해 주시면 처리해 드립니다. 비회원의
          주문에 관한 요청은 결제 시 발급된 리포트 접근 링크(토큰)를 통해 본인의 주문임을
          확인한 뒤 처리합니다.
        </p>
      </Section>

      <Section title="6. 개인정보의 파기 절차 및 방법">
        <p>
          보유 기간이 경과하거나 처리 목적이 달성된 개인정보는 지체없이 삭제합니다. 전자적
          파일 형태의 정보는 복구할 수 없는 방법으로 삭제합니다.
        </p>
      </Section>

      <Section title="7. 만 14세 미만 아동의 개인정보">
        <p>
          서비스는 만 14세 미만 아동을 대상으로 하지 않으며, 만 14세 미만 아동의 개인정보를
          법정대리인의 동의 없이 수집하지 않습니다. 만 14세 미만 아동의 정보가 수집된
          사실을 알게 된 경우 지체없이 파기하며, 법정대리인은 아래 문의처를 통해 해당
          정보의 열람·정정·삭제를 요청할 수 있습니다.
        </p>
      </Section>

      <Section title="8. 개인정보 보호책임자">
        <p>
          서비스는 개인정보 처리에 관한 업무를 총괄하여 책임지고, 이용자의 불만 및 피해
          구제를 처리하기 위하여 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.
        </p>
        {IS_PLACEHOLDER && <p className="text-down">{PLACEHOLDER_NOTICE}</p>}
        <p>
          개인정보 보호책임자 — 성명 {PRIVACY_OFFICER.성명} · 직위 {PRIVACY_OFFICER.직위} ·
          연락처 {PRIVACY_OFFICER.연락처}
        </p>
      </Section>

      <Section title="9. 권익침해 구제방법">
        <p>
          개인정보 침해로 인한 상담·분쟁 조정이 필요한 경우 아래 기관에 도움을 요청할 수
          있습니다. 서비스와 무관한 독립 기관입니다.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>개인정보 분쟁조정위원회 — 1833-6972 (privacy.go.kr)</li>
          <li>개인정보침해 신고센터 — 118 (privacy.kisa.or.kr)</li>
          <li>대검찰청 사이버수사과 — 1301 (spo.go.kr)</li>
          <li>경찰청 사이버수사국 — 182 (ecrm.police.go.kr)</li>
        </ul>
      </Section>

      <Section title="10. 문의처">
        <p>개인정보 관련 문의는 아래로 연락해 주세요.</p>
        {SUPPORT_EMAIL ? (
          <p>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-ink underline underline-offset-2">
              {SUPPORT_EMAIL}
            </a>
          </p>
        ) : (
          <p className="text-down">
            문의 이메일이 아직 설정되지 않았습니다. 서비스 개시 전에 반드시 실제 주소를
            넣어야 합니다.
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
