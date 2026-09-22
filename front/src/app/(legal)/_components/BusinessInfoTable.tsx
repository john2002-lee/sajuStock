import { Fragment } from "react";
import {
  BUSINESS_INFO,
  HOSTING_PROVIDER,
  IS_PLACEHOLDER,
  PLACEHOLDER_NOTICE,
  businessRows,
} from "@/shared/legal/business";
import { SUPPORT_EMAIL } from "@/lib/config/public";

/**
 * 전자상거래법 제13조가 요구하는 사업자 정보 표.
 *
 * 약관과 개인정보처리방침에 **같은 `<dl>` 블록이 두 벌** 있었고, 환불정책과
 * 고객센터가 붙으면 네 벌이 된다. 법적 문서가 서로 다른 사업자를 가리키는 사고는
 * 그렇게 시작한다.
 *
 * ## 임시값일 때 고지를 함께 낸다
 *
 * 위험한 것은 값이 비어 있는 것이 아니라 **그럴듯하게 채워져 있는 것**이다.
 * `IS_PLACEHOLDER` 는 `shared/legal/business` 가 환경변수에서 **파생**한 값이라,
 * 실제 값을 넣는 순간 이 고지가 저절로 사라진다.
 *
 * ## 공정위 조회 링크는 진짜 번호일 때만
 *
 * 등록되지 않은 번호로 조회 링크를 걸면 눌러 본 사람이 "조회 결과 없음" 을 본다 —
 * 없는 것보다 나쁘다.
 */
export function BusinessInfoTable() {
  return (
    <>
      {IS_PLACEHOLDER && <p className="text-down">{PLACEHOLDER_NOTICE}</p>}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pt-1">
        {businessRows().map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-muted-60">{label}</dt>
            <dd className="text-muted-75">{value}</dd>
          </Fragment>
        ))}

        {SUPPORT_EMAIL ? (
          <>
            <dt className="text-muted-60">이메일</dt>
            <dd className="text-muted-75">
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-ink underline underline-offset-2"
              >
                {SUPPORT_EMAIL}
              </a>
            </dd>
          </>
        ) : null}

        <dt className="text-muted-60">호스팅</dt>
        <dd className="text-muted-75">{HOSTING_PROVIDER}</dd>
      </dl>

      {!IS_PLACEHOLDER && (
        <p className="pt-1 text-12 text-muted-60">
          사업자등록 정보는{" "}
          <a
            href={`https://www.ftc.go.kr/bizCommPop.do?wrkr_no=${BUSINESS_INFO.사업자등록번호.replace(/-/g, "")}`}
            target="_blank"
            rel="noreferrer noopener"
            className="text-ink underline underline-offset-2"
          >
            공정거래위원회 통신판매사업자 조회
          </a>
          에서 확인하실 수 있습니다.
        </p>
      )}
    </>
  );
}
