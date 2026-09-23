import Link from "next/link";
import type { Metadata } from "next";
import { IS_PLACEHOLDER, PLACEHOLDER_NOTICE, PRIVACY_OFFICER } from "@/shared/legal/business";
import { RETENTION_DAYS, SHARE_RETENTION_DAYS, SUPPORT_EMAIL } from "@/lib/config/public";
import { BusinessInfoTable } from "../_components/BusinessInfoTable";
import { DocHeading, Section } from "../_components/Section";

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
 *    **원칙적으로 저장하지 않는다**: `/saju/chart` 와 `/saju/report` 는 DB 를
 *    만지지 않고, 결과는 브라우저 `sessionStorage` 에만 있다
 *    (`features/saju/model/storage.ts`). **예외는 결과 공유 링크 하나다** —
 *    `POST /saju/shares` 가 여덟 글자와 요약을 `models/saju_share.SajuShareRow` 에
 *    `saju_share_retention_days`(7일)간 보관한다. 생년월일시는 그 경로에서도
 *    저장되지 않는다(계산에만 쓰고 버린다).
 *  - **유료 경로 수집 항목** — `models/saju_order.SajuOrderRow` 가 생년월일시를
 *    JSONB 로 보관하고 `SajuReportRow` 가 리포트 본문을 보관한다. 계정을 요구하지
 *    않으므로 이 둘이 사주 쪽에서 저장되는 전부다.
 *  - **유료 리포트 공유** — `POST /saju/shares/from-report` 가
 *    `SajuOrderRow.report_share_id` 에 난수를 하나 적고, `/saju/r/{id}` 가 그
 *    id 로 리포트를 **읽기 전용으로** 연다. 본문을 복사해 두지 않으므로 주문이
 *    파기되면 링크도 함께 죽는다. 응답은 `SajuSharedReport` 로 좁혀진다 —
 *    양력 생년월일·진태양시 보정 분값·접근 토큰이 들어가지 않는다. 끝난 추가
 *    질문 대화는 **들어간다**(`SharedFollowUpTurn`) — 구매자가 보낼 뜻으로 누르는
 *    버튼이 그 사실을 먼저 고지한다. `pending` 턴은 서버가 걸러 낸다.
 *    **공유되는 주소는 `/saju/reports/{token}` 이 아니다**: 그 토큰은 전체 접근
 *    자격 증명이라, 받은 사람이 생년월일을 보고 구매자의 남은 추가 질문까지 쓸 수
 *    있다.
 *  - **계정 항목** — 이메일·이름·비밀번호 해시·인증 시각(`lib/auth/accounts.ts` 의
 *    `users` 테이블). **일반 가입은 없다** — `auth.ts` 의 `signIn` 콜백이 관리자가
 *    아닌 계정을 문턱에서 돌려보내므로, 계정은 운영자용으로만 존재한다. 그래서
 *    이 문서도 '회원' 이 아니라 '운영자 계정' 으로 적는다.
 *  - **자동 수집** — 방문 기록은 `models/visit_day.py`(익명 `owner_key` · KST
 *    날짜 · 방문 시각 · 횟수), 이용 기록과 **세션 리플레이**는
 *    `shared/analytics/AmplitudeProvider.tsx` 다. 리플레이는 `sampleRate: 1` 이라
 *    **전수 녹화**이고 사주 화면만 `conservative` 마스킹이다 — 방침이 그 사실과
 *    한계를 모두 적는 이유다. 예전 판에는 이 항목이 통째로 빠져 있었다.
 *  - **보관 기간** — `saju_report_price` 옆의 `saju_order_retention_days`(7일).
 *    실제로 지우는 것은 `services/saju_purge_service` 다 — `payment/config` 가
 *    불릴 때 하루 한 번 얹혀 돌고, 결과가 `batch_runs` 에 남아 관리자 화면에서
 *    "정말 돌고 있나" 를 확인할 수 있다. 오래도록 **지우는 코드 없이 문구만**
 *    있었으므로, 그 사실이 다시 어긋나지 않게 여기 적어 둔다.
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
  description: "AI Of Tellers 이 수집하는 개인정보 항목 · 이용 목적 · 보관 기간 · 파기 절차",
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <DocHeading title="개인정보처리방침" effectiveOn="2026년 9월 21일" />

      <Section title="1. 수집하는 개인정보 항목">
        <p>
          AI Of Tellers(이하 &ldquo;서비스&rdquo;)이 수집하는 항목은 이용하시는 기능에 따라
          다릅니다. 서비스는 회원 가입을 받지 않으며, 사주는 로그인 없이 이용하십니다.
        </p>

        <p className="pt-2">
          <strong className="font-semibold text-ink">사주 — 무료로 보실 때</strong>
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
        <p>
          다만{" "}
          <strong className="font-semibold text-ink">결과 공유 링크를 만드실 때</strong>
          에는, 계산된 사주 여덟 글자와 무료 요약(일간·오행 분포·강약 판정 포함)을
          링크로 열 수 있도록{" "}
          <strong className="font-semibold text-ink">{SHARE_RETENTION_DAYS}일간</strong>{" "}
          보관한 후 파기합니다. 공유 버튼을 누르지 않으시면 이 보관은 발생하지 않으며,
          이 경우에도{" "}
          <strong className="font-semibold text-ink">
            생년월일시·성별·출생지 원문은 저장하지 않습니다.
          </strong>{" "}
          공유 링크는 주소를 아는 사람이면 누구나 열 수 있으므로 원하지 않는 상대에게
          전달되지 않도록 유의하시기 바랍니다.
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
          구매 후 리포트 주소를 저장해 두시면 다시 보실 수 있도록 보관하며, 주문
          생성일로부터 <strong className="font-semibold text-ink">{RETENTION_DAYS}일</strong>{" "}
          후 파기합니다.
        </p>
        <p>
          구매하신 리포트 화면에서{" "}
          <strong className="font-semibold text-ink">공유 링크를 만드실 때</strong>에는,
          받으신 분이 <strong className="font-semibold text-ink">리포트 본문과 사주 계산
          결과를 읽을 수 있는</strong> 별도의 주소가 만들어집니다. 이 주소는 구매하신
          리포트 주소와 다르며,{" "}
          <strong className="font-semibold text-ink">
            생년월일시는 이 주소로 전달되지 않으며, 받으신 분이 추가 질문을 하실 수도
            없습니다.
          </strong>{" "}
          다만 무당에게 물어보신 추가 질문과 그 답변은 풀이와 함께 전달되므로, 민감한
          내용을 적으신 경우에는 공유하지 않으시는 것을 권장합니다. 공유 링크는 위 주문
          보관 기간이 끝나면 함께 열람이 차단됩니다. 링크를 아는 사람이면 누구나 열 수
          있으므로 원하지 않는 상대에게 전달되지 않도록 유의하시기 바랍니다.
        </p>
        <p>
          추가 질문의 자유 입력란에는 이름·연락처·주민등록번호·건강 상태 등 민감한 내용을
          적지 않는 것을 권장합니다. 이 텍스트는 아래 4항과 같이 AI 제공사에 별도의
          비식별 처리 없이 전달됩니다.
        </p>

        <p className="pt-2">
          <strong className="font-semibold text-ink">이용하시는 동안 자동으로 쌓이는 것</strong>
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>브라우저에 저장되는 익명 식별자와 그 식별자 기준의 방문 일자·시각·방문 횟수</li>
          <li>
            서비스 이용 기록 — 화면 조회, 클릭, 접속 기기·브라우저·운영체제, 유입 경로,
            IP 주소로 추정한 접속 지역
          </li>
          <li>
            <strong className="font-semibold text-ink">화면 조작 기록(세션 리플레이)</strong> —
            어느 화면에서 어디를 누르고 어떻게 이동했는지를 재생할 수 있는 형태로
            기록합니다.
          </li>
        </ul>
        <p>
          이름·연락처 같은 신원 정보를 함께 받지는 않지만, 위 항목은 한 브라우저를 계속
          알아볼 수 있게 하므로 개인정보에 준하여 취급합니다. 사주 화면의 세션 리플레이는
          입력 칸의 글자와 화면에 표시된 사주 결과를 가리도록 설정해 두었으나{" "}
          <strong className="font-semibold text-ink">
            가림이 완전하다고 보증하지는 않습니다.
          </strong>{" "}
          원하지 않으시면 아래 5조의 방법으로 거부하실 수 있습니다.
        </p>

        <p className="pt-2">
          <strong className="font-semibold text-ink">운영자 계정</strong>
        </p>
        <p>
          서비스 운영·관리를 위해 발급하는 계정에 한해 이메일 주소와 이름, 복원이
          불가능한 형태의 비밀번호를 보관합니다.{" "}
          <strong className="font-semibold text-ink">
            일반 이용자에게는 계정을 발급하지 않습니다.
          </strong>
        </p>

        <p className="pt-2">
          결제수단 정보(카드번호 등)는 서비스가 직접 수집·저장하지 않으며,
          결제대행사(토스페이먼츠)가 처리합니다.
        </p>
      </Section>

      <Section title="2. 개인정보의 수집 및 이용 목적">
        <ul className="list-disc space-y-1 pl-5">
          <li>사주 계산(진태양시 보정 포함) 및 유료 리포트 생성·전달</li>
          <li>결제 처리 및 결제 관련 문의 대응</li>
          <li>리포트 생성 실패 등 문제 발생 시 고객 문의 대응(제10조 참조)</li>
          <li>이용 현황 통계와 오류 추적을 통한 서비스 개선</li>
          <li>운영자 식별 및 관리자 기능 접근 통제</li>
        </ul>
        <p>
          서비스는 위 정보를 광고 전송이나 맞춤형 광고에 이용하지 않으며, 판매하지
          않습니다.
        </p>
      </Section>

      <Section title="3. 개인정보의 보유 및 이용 기간">
        <p>
          서비스는 위 목적을 달성하는 데 필요한 기간 동안만 개인정보를 보유합니다. 사주
          주문·리포트·추가 질문은 주문 생성일로부터{" "}
          <strong className="font-semibold text-ink">{RETENTION_DAYS}일</strong>이 경과하면
          지체없이 파기합니다.
        </p>
        <p>
          결과 공유 링크에 담긴 사주 여덟 글자와 무료 요약은 링크 생성일로부터{" "}
          <strong className="font-semibold text-ink">{SHARE_RETENTION_DAYS}일</strong>이
          경과하면 열람이 차단되며 파기합니다.
        </p>
        <p>
          다만 관련 법령(전자상거래 등에서의 소비자보호에 관한 법률, 전자금융거래법 등)에서
          별도의 보존 기간을 정하는 거래·결제 기록이 있는 경우, 해당 법령이 정한 기간
          동안은 그 범위 내에서 보존할 수 있습니다.
        </p>
        <p>
          접속 기록과 서비스 이용 기록은 통계에 필요한 기간 동안 보관하며, 분석 도구에
          전송된 기록은 해당 도구의 보관 정책을 따릅니다. 운영자 계정 정보는 계정을 삭제할
          때까지 보관합니다.
        </p>
      </Section>

      <Section title="4. 개인정보의 제3자 제공 및 처리위탁">
        <p>
          서비스는 개인정보를 제3자에게 제공하지 않으며, 다음의 경우에 한해 처리를
          위탁합니다. 수탁자는 위탁받은 목적 범위 안에서만 정보를 처리합니다.
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
          <li>
            <strong className="font-semibold text-ink">Amplitude</strong> — 이용 현황 통계와
            화면 조작 기록(세션 리플레이)의 저장·분석을 위탁합니다. 위 1조의 자동 수집
            항목이 전달되며, 서버는 국외(미국)에 있습니다.
          </li>
        </ul>
      </Section>

      <Section title="5. 이용자의 권리와 거부 방법">
        <p>
          이용자는 자신의 개인정보에 대한 열람·정정·삭제를 요청할 수 있습니다. 다만 현재
          서비스에는 스스로 개인정보를 열람·정정·삭제할 수 있는 화면이 없으므로, 아래
          제10조의 문의처로 요청해 주시면 처리해 드립니다. 구매하신 리포트에 관한 요청은
          결제 시 발급된 리포트 접근 링크(토큰)로 본인의 주문임을 확인한 뒤 처리합니다.
        </p>
        <p>
          위 1조의 자동 수집(방문 기록 · 이용 기록 · 세션 리플레이)은 브라우저의 쿠키 차단
          또는 사이트 데이터 삭제 기능으로 거부하실 수 있습니다. 거부하셔도 사주 계산과
          리포트 이용에는 지장이 없습니다.
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
          <BusinessInfoTable />
        <p>
          환불·결제 문의는{" "}
          <Link href="/support" className="text-ink underline underline-offset-2">
            고객센터
          </Link>
          를 이용해 주세요.
        </p>
      </Section>
    </>
  );
}
