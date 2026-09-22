"use client";

import Link from "next/link";
import { CHECKOUT_CONFIGURED, CHECKOUT_UNAVAILABLE_NOTICE } from "@/lib/config/payment-mode";
import { REPORT_PRODUCT_NAME } from "@/shared/legal/product";
import { useId, useState } from "react";
import type { BirthInput, PaymentState } from "../model/types";
import { PayButton } from "./PayButton";

/**
 * 티저 화면의 구매 카드 — **결제 전에 밝혀야 하는 것을 전부 담은 자리.**
 *
 * ## 왜 따로 떼어냈나
 *
 * 전에는 `TeaserView` 안에 인라인으로 있었고, 가격과 버튼 말고는 아무것도 없었다.
 * 유일한 고지(보관 기간)는 **버튼 뒤에** 있었다 — 읽고 나서 누르는 순서가 아니라
 * 누르고 나서 읽는 순서였다. 전자상거래법이 요구하는 것은 구매 **전** 고지다.
 *
 * 세 가지 결제 상태가 붙으면서 카드 하나가 화면 절반을 차지하는 분량이 됐다.
 * `TeaserView` 는 사주를 보여 주는 화면이고 이쪽은 물건을 파는 자리라, 섞어 두면
 * 둘 다 읽기 어려워진다.
 *
 * ## 6줄짜리 고지표는 약관으로 옮겼다
 *
 * 한때 상품명·구성·가격·제공 시점·보관 기간·환불이 표로 여기 있었다. 법이 요구하는
 * 것을 빠짐없이 적었지만 **사무실 서류처럼 읽혔고**, 사주를 보러 온 사람이 마지막에
 * 만나는 화면이 계약서가 됐다.
 *
 * 전문은 이용약관 제2조(서비스의 구성)가 들고, 여기에는 사는 순간 실제로 알아야
 * 하는 것만 남긴다 — **얼마인지, 언제 받는지, 무를 수 있는지.** 나머지는 한 번 더
 * 눌러야 나오는 것이 맞다.
 *
 * ## 세 가지 상태 (`PaymentState`)
 *
 * | 상태 | 그리는 것 | 왜 |
 * |---|---|---|
 * | `loading` | 버튼 자리를 비워 둔다 | 아직 얼마인지 모른다 |
 * | `ready` + `enabled` + 결제 재료 있음 | 고지 + 동의 + 결제 버튼 | 정상 판매 |
 * | `ready` + `enabled` + **결제 재료 없음** | 안내만 (버튼 없음) | 서버는 팔 수 있는데 **이 빌드가** 결제창을 못 연다 |
 * | `ready` + `!enabled` | 무료 열람 버튼 | **서버가** 팔 수 없다고 답했다 (키 미설정) |
 * | `unreachable` | 다시 시도 버튼 | 모른다 — 팔지도, 공짜로 주지도 않는다 |
 *
 * 마지막 칸이 이 파일에서 가장 중요하다. 예전에는 `unreachable` 과 `!enabled` 가
 * 같은 `null` 이라, **개발자 도구로 요청 하나만 막으면 유료 리포트가 무료로
 * 열렸다.** 우연이 아니라 누구나 재현할 수 있는 우회로였다.
 *
 * ## 세 번째 칸이 왜 생겼나
 *
 * 판매 가능 여부의 판단이 두 곳으로 갈려 있었다. 서버는 자기 키만 보고
 * `enabled: true` 를 주고, 이 카드는 그 답만 믿고 결제 버튼을 그렸다. 어느 쪽도
 * **브라우저 번들에 토스 클라이언트 키가 들어왔는지**는 보지 않았다. 그 결과 키
 * 없이 배포된 빌드에서 버튼이 눌릴 때마다 실패했고, 화면은 "잠시 후 다시 시도해
 * 주세요" 라고 안내했다 — 재시도로는 영원히 해결되지 않는 상태였다.
 *
 * **무료로 열어 주지 않는다.** 서버는 이것이 파는 물건이라고 답했으므로, 우리 설정
 * 실수를 이유로 공짜로 주는 것은 `unreachable` 을 무료로 열지 않는 것과 같은
 * 이유로 틀렸다. 대신 버튼을 내리고 사실을 말한다 — **누를 수 없는 것이 눌러도
 * 실패하는 것보다 정직하다.**
 *
 * ## 무엇이 이 화면에 **남아야만** 하는가
 *
 * 전자상거래법 제17조 제2항 단서가 이 화면의 모양을 정한다. 디지털 콘텐츠의 환불
 * 제한은 **구매자가 동의해서** 서는 것이 아니라, 파는 쪽이 제6항의 조치 —
 * "청약철회가 불가능하다는 사실을 소비자가 쉽게 알 수 있는 곳에 명확하게 표시" —
 * 를 했을 때만 선다. 그 표시를 약관 링크 뒤로 넘기면 조치 미이행이 되고, 단서가
 * 발동해 **리포트를 끝까지 읽은 사람도 7일 안에 전액 환불을 요구할 수 있다.**
 * 약관에 뭐라고 적어 두었든 제35조로 무효다.
 *
 * 요건은 **위치**이지 형식이 아니다. 그래서 6줄짜리 표를 한 줄 카피로 바꾸는 것은
 * 괜찮고, 값을 약관으로 옮기는 것은 안 된다. 여기 남는 다섯 가지가 그 목록이다.
 *
 * | 화면에 남는 것 | 근거 |
 * |---|---|
 * | 상품명 (토스 `orderName` 과 **글자 그대로** 같아야 한다) | 카드 명세서에 찍히는 이름이 사이트에 없으면 "모르는 결제" 민원에 소명할 수 없다 |
 * | 가격·부가세 포함 여부 | 제8조 제2항 |
 * | 제공 시점 | 제8조 제2항 · 환불 제한의 기준 시점이라 같은 자리에 있어야 뜻이 산다 |
 * | 열람 기간과 링크 분실 시 안내 | 제13조 제2항 |
 * | 환불 제한 사실 | **제17조 제6항 — 이 한 줄이 빠지면 제한 자체가 없다** |
 *
 * 시험 사용 조치(시행령 제21조의2 제1호 '일부 이용의 허용')는 이미 이행 중이다 —
 * 이 카드 위에서 **구매자 본인의** 여덟 글자·오행·일간·신강약을 무료로 보여 준다
 * (`shared/legal/product` 의 `FREE_INCLUDES`). 일반 샘플이 아니라 본인 콘텐츠의
 * 일부라 오히려 강한 이행이다.
 *
 * ## "청약철회" 라고 쓰지 않는 이유
 *
 * 법령 용어라 정확하지만 **온라인에서 물건 사는 사람이 쓰는 말이 아니고**, 1,000원
 * 짜리를 사는 자리에 계약서 무게를 얹는다. 법이 지키려는 것은 특정 단어가 아니라
 * 구매자가 실제로 이해하는 것이므로, "풀이가 다 만들어진 뒤에는 환불되지 않습니다"
 * 가 같은 사실을 더 잘 전한다. 기준 시점도 이쪽이 정확하다 — 제17조 제2항 제5호는
 * "제공이 개시된 경우" 이지 "생성이 시작된 경우" 가 아니다. 법령 용어는 약관 제6조와
 * `/refund` 가 들고 있고, 다툼이 생기면 그쪽이 근거가 된다.
 *
 * ## 개인정보 동의는 **묶지 않는다**
 *
 * 개인정보보호법 제22조 제1항은 동의 사항을 구분해 각각 받도록 한다. 약관·환불·
 * 개인정보를 체크박스 하나로 묶는 것은 그 자체로 위법이다.
 *
 * 그런데 애초에 **동의를 받을 일이 아니다.** 생년월일시·성별·출생지는 리포트를
 * 만드는 데 반드시 필요하므로 같은 법 제15조 제1항 제4호(계약 이행)로 동의 없이
 * 처리한다. 동의 기반으로 바꾸면 처리 근거는 약해지고 형식 위반만 남는다. 그래서
 * 개인정보처리방침은 **링크로 알리기만** 한다.
 *
 * ## 이 체크박스의 한계
 *
 * `useState` 라 브라우저를 벗어나지 않는다 — 나중에 "동의한 적 없다" 는 다툼에서
 * 증거가 되지 못한다. 그래도 두는 이유는, 법이 요구하는 것이 동의가 아니라 **표시**
 * 이고 그 표시는 렌더되는 것으로 이행되기 때문이다. 체크박스는 읽고 지나가게 만드는
 * 장치다. 증거까지 남기려면 주문에 함께 저장해야 한다.
 */

/**
 * "천원의 행복" 다섯 글자에 무지개 다섯 색. 글자 수와 색 수가 정확히 맞는다.
 *
 * ## 왜 어두운 배지인가
 *
 * 처음에는 흰 배지에 선명한 무지개를 올렸는데 **10px 글자가 읽히지 않았다** —
 * 흰 바탕에서 주황 2.99:1 · 노랑 2.42:1 · 초록 3.40:1 로, AA(4.5:1) 한참 아래다.
 * 읽히게 만들려면 색을 깊게 내려야 하고, 그러면 무지개가 흙색이 된다.
 *
 * 그래서 바탕을 뒤집었다. 어두운 바탕에서는 순색에 가까운 밝은 색을 쓸 수 있어
 * **선명함과 가독성을 동시에** 얻는다 (최저 5.69:1).
 *
 * 바탕색은 검정이 아니라 따뜻한 갈흑(`#2A2118`)이다 — 금빛 지면에 검정을 놓으면
 * 이 화면에서 유일하게 차가운 면이 된다. 무지개는 이 배지 하나에만 쓰므로 토큰이
 * 아니라 리터럴로 둔다(오행색과 섞이면 의미 있는 색과 장식이 뒤엉킨다).
 */
const HAPPINESS_PILL_BG = "#2A2118";
const HAPPINESS_LETTERS: readonly (readonly [string, string])[] = [
  ["천", "#FF6B6B"], // 빨
  ["원", "#FFA94D"], // 주
  // 낱자로 쪼개면 JSX 사이의 공백이 사라지므로 어절 공백을 글자에 붙여 둔다.
  ["의 ", "#FFD43B"], // 노
  ["행", "#51CF66"], // 초
  ["복", "#4DABF7"], // 파
];

export interface PurchaseCardProps {
  /** 결제 요청에 다시 실어야 하는 원본 입력. */
  birth: BirthInput;
  payment: PaymentState;
  /** 서버가 "팔 수 없다" 고 답했을 때의 무료 경로. */
  onOpenReport: () => void;
  /** 결제 설정을 다시 물어본다. */
  onRetryPayment: () => void;
}

export function PurchaseCard({
  birth,
  payment,
  onOpenReport,
  onRetryPayment,
}: PurchaseCardProps) {
  const [agreed, setAgreed] = useState(false);
  const agreeId = useId();

  const config = payment.status === "ready" ? payment.config : null;
  /**
   * 서버가 "팔 수 있다" 고 답했고 **이 빌드도 결제창을 열 수 있다.**
   *
   * 두 조건을 한 변수로 합치는 것이 요점이다. 아래 머리글(`PREMIUM ANALYSIS`)과
   * 가격·동의·결제 버튼이 전부 이 값을 보므로, 결제 재료가 없을 때 "프리미엄" 이라
   * 적힌 카드에 누를 수 없는 버튼이 남는 조합이 만들어지지 않는다.
   */
  const sellable = config?.enabled === true && CHECKOUT_CONFIGURED;
  /** 서버는 팔 수 있는데 이 빌드가 못 파는 경우. 무료로 열어 주지 않는다(머리말). */
  const misconfigured = config?.enabled === true && !CHECKOUT_CONFIGURED;

  return (
    <div className="bg-surface-raise rounded-card p-6 shadow-mockup sm:p-8">
      <p className="mb-2 text-center font-mono-kr text-[11px] tracking-[0.2em] text-gold-text-strong">
        {sellable ? "PREMIUM ANALYSIS" : "FULL READING"}
      </p>
      <h2 className="mb-1 text-center font-display text-xl text-ink">전체 리포트 보기</h2>
      {/* 상품명. 토스에 보내는 `orderName` 과 **같은 문자열**이어야 한다 — 카드
          명세서에 찍히는 이름이 사이트 어디에도 없으면 "이게 무슨 결제냐" 는 문의에
          답할 수가 없다. */}
      <p className="mb-4 text-center font-mono-kr text-[11.5px] text-muted-2">
        {REPORT_PRODUCT_NAME}
      </p>
      <p className="mb-6 text-center text-[13.5px] leading-relaxed text-ink-body">
        여덟 글자가 왜 그렇게 읽히는지, 십신과 대운의 흐름까지 무당이 직접 풀어 줍니다.
      </p>

      {sellable && config ? (
        <>
          {/* 가격. "천원의 행복" 배지는 **실제로 1,000원일 때만** 붙는다 — 가격의
              원본은 서버 한 곳이고, 문구를 무조건 그리면 가격을 올린 다음 회차에
              화면이 거짓을 말한다. */}
          <p className="mb-5 flex items-center justify-center gap-2 font-mono-kr text-2xl font-semibold text-gold-text-strong">
            {config.price === 1000 && (
              <span
                className="rounded-pill px-2.5 py-1 font-sans-kr text-[10px] font-bold tracking-wide"
                style={{ backgroundColor: HAPPINESS_PILL_BG }}
              >
                {HAPPINESS_LETTERS.map(([letter, color]) => (
                  <span key={letter} style={{ color }}>
                    {letter}
                  </span>
                ))}
              </span>
            )}
            {config.price.toLocaleString("ko-KR")}원
          </p>
          <p className="-mt-3 mb-5 text-center text-[11.5px] text-muted-2">부가세 포함</p>

          {/* 표 대신 한 줄. 언제 받고 언제까지 볼 수 있는지 — 사는 순간 궁금한 건
              이 둘이다. 상품명·구성 전문은 이용약관 제2조에 있다. */}
          <p className="mb-5 text-center text-[13px] leading-relaxed text-muted-2">
            결제하시면 바로 만들기 시작해 1분 안에 나오고,{" "}
            {config.retention_days}일 동안 받으신 링크로 다시 보실 수 있습니다. 링크를
            잃어버리셨다면 주문번호로{" "}
            <Link href="/support" className="underline underline-offset-2 hover:text-ink">
              고객센터
            </Link>
            에 문의해 주세요.
          </p>

          {/* **이 체크박스는 환불 제한 하나만 맡는다.** 정책 일괄 동의와 묶으면
              개인정보보호법 제22조 제1항(동의 사항을 구분해 각각)에 걸리고, 환불
              제한이 다른 문장들 사이에 묻혀 "쉽게 알 수 있는 곳" 요건도 약해진다. */}
          <label
            htmlFor={agreeId}
            className="mb-3 flex cursor-pointer items-start gap-2.5 text-left text-[13px] leading-relaxed text-ink-body"
          >
            <input
              id={agreeId}
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 size-4 flex-none accent-[color:var(--gold-text-strong)]"
            />
            <span>
              <strong className="font-semibold">
                풀이가 다 만들어진 뒤에는 환불되지 않습니다.
              </strong>{" "}
              확인했습니다.
            </span>
          </label>

          {/* 정책 동의는 체크가 아니라 고지다. 개인정보처리방침은 **동의 대상이
              아니라** 알리는 대상이다(머리말의 제15조 제1항 제4호). */}
          <p className="mb-5 text-left text-[12px] leading-relaxed text-muted-2">
            결제하시면{" "}
            <Link href="/terms" className="underline underline-offset-2 hover:text-ink">
              이용약관
            </Link>
            {" · "}
            <Link href="/refund" className="underline underline-offset-2 hover:text-ink">
              환불정책
            </Link>
            에 동의하신 것으로 봅니다. 입력하신 정보는{" "}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
              개인정보처리방침
            </Link>
            에 따라 처리합니다.
          </p>

          <PayButton birth={birth} amount={config.price} disabled={!agreed} />
        </>
      ) : misconfigured ? (
        // 서버는 팔 수 있다고 했지만 이 빌드에 결제 재료가 없다. 버튼을 그리지
        // 않는다 — 누를 수 없는 것이 눌러도 실패하는 것보다 정직하다.
        //
        // 재시도 버튼도 두지 않는다. 빌드에 박히는 값이라 눌러도 바뀌지 않는다.
        <div className="text-center">
          <p
            role="alert"
            className="mb-4 rounded-card-sm border border-hairline bg-surface-warm px-4 py-3 text-[13px] leading-relaxed text-wuxing-fire"
          >
            {CHECKOUT_UNAVAILABLE_NOTICE}
          </p>
          <p className="text-[12.5px] leading-relaxed text-muted-2">
            불편을 드려 죄송합니다.{" "}
            <Link href="/support" className="underline underline-offset-2 hover:text-ink">
              고객센터
            </Link>
            로 알려 주시면 빠르게 확인하겠습니다.
          </p>
        </div>
      ) : payment.status === "unreachable" ? (
        // **무료로 열어 주지 않는다.** 서버가 "팔 수 없다" 고 답한 것이 아니라
        // 서버에 닿지 못한 것이고, 그 둘을 같게 취급한 것이 우회로였다.
        <div className="text-center">
          <p
            role="alert"
            className="mb-4 rounded-card-sm border border-hairline bg-surface-warm px-4 py-3 text-[13px] leading-relaxed text-wuxing-fire"
          >
            결제 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </p>
          <button
            type="button"
            onClick={onRetryPayment}
            className="rounded-pill bg-button-gradient px-8 py-3.5 text-[15px] font-bold text-on-primary shadow-cta"
          >
            다시 시도하기
          </button>
        </div>
      ) : payment.status === "ready" ? (
        // 서버가 결제를 끌 수 있다고 알려 준 경우(키 미설정). 그때는 무료로 연다.
        <div className="text-center">
          <button
            type="button"
            onClick={onOpenReport}
            className="rounded-pill bg-button-gradient px-8 py-3.5 text-[15px] font-bold text-on-primary shadow-cta"
          >
            리포트 받아보기
          </button>
        </div>
      ) : (
        // `loading` — 얼마인지 모르는 동안 버튼을 그리면 가격이 나중에 바뀐다.
        <p className="text-center text-[13px] text-muted-2">결제 정보를 불러오는 중…</p>
      )}
    </div>
  );
}
