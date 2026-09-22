/**
 * 사업자 정보 — 전자상거래법이 **구매 전에** 노출하도록 요구하는 항목들.
 *
 * ## 왜 한곳에 모으나
 *
 * 이 값들은 약관·개인정보처리방침·환불정책·고객센터·푸터가 전부 필요로 한다.
 * 화면마다 적어 두면 실제 정보로 바꿀 때 한 곳이 빠지고, 그 순간 **법적 문서들이
 * 서로 다른 사업자를 가리킨다.** 고칠 곳이 하나여야 그 사고가 나지 않는다.
 *
 * ## 값은 환경변수에서 온다 — 코드를 고치지 않고 채우기 위해
 *
 * 사업자등록증과 통신판매업 신고증이 나오면 **값만** 넣으면 된다. 코드 리뷰도
 * 배포 검토도 필요 없는 상태로 남겨 두는 것이 이 설계의 목적이다.
 *
 * 변수 이름은 **ASCII 로만** 짓는다. Vercel 대시보드와 dotenv·셸이 받는 이름이
 * `[A-Za-z0-9_]` 뿐이라 `NEXT_PUBLIC_BIZ_상호` 같은 이름은 넣을 수조차 없다.
 * 한글은 화면에 그릴 **라벨**로만 쓰고, 그래서 `businessRows()` 는 객체 키 순서에
 * 기대지 않고 순서와 라벨을 명시적으로 든다.
 *
 * `NEXT_PUBLIC_*` 는 **빌드 시점에 리터럴 치환**된다(`lib/config/public.ts` 머리말).
 * 그래서 아래 접근은 통째로 적어야 하고, 대시보드에서 값을 바꾼 뒤에는 **다시
 * 빌드해야** 화면이 바뀐다.
 *
 * ## 임시값 판정은 전부 아니면 전무다
 *
 * 항목마다 따로 판정하면 하나를 빠뜨렸을 때 **진짜와 가짜가 섞인 표**가 나간다 —
 * 전부 가짜인 것보다 나쁘다. 읽는 사람이 어느 줄을 믿어야 할지 알 수 없기 때문이다.
 * 그래서 필수 항목이 하나라도 비었거나 형식이 틀리면 표 전체가 임시값으로 떨어지고
 * `PLACEHOLDER_NOTICE` 가 함께 나온다.
 *
 * 형식 검사는 `public.ts` 의 `resolveSupportEmail` 이 예약 도메인을 떨어뜨리는 것과
 * 같은 장치다 — **자리값을 환경변수에 붙여넣어도 진짜로 통과하지 못하게** 한다.
 * `000-00-00000` 은 사업자등록번호 형식은 맞지만 유효한 번호가 아니다.
 */

/** 전자상거래법 제13조가 요구하는 항목들. 한 줄이라도 비면 전체가 임시값이 된다. */
export interface BusinessInfo {
  상호: string;
  대표자: string;
  사업자등록번호: string;
  통신판매업신고번호: string;
  주소: string;
  전화번호: string;
}

/** 개인정보 보호법이 따로 요구하는 항목. */
export interface PrivacyOfficer {
  성명: string;
  직위: string;
  연락처: string;
}

/**
 * 표시 순서. `Object.entries` 에 기대지 않는 이유는 위 머리말에 있다 — 순서와
 * 라벨이 객체 키에 묶여 있으면 키 이름을 바꾸는 순간 화면이 따라 바뀐다.
 */
const ROW_ORDER: readonly (keyof BusinessInfo)[] = [
  "상호",
  "대표자",
  "사업자등록번호",
  "통신판매업신고번호",
  "주소",
  "전화번호",
];

/**
 * 값이 서로 달라야 한다. 빈 항목을 모두 같은 문구로 채우면 표에서 어느 줄이
 * 무엇인지 구분되지 않고, 테스트도 어느 항목을 집었는지 알 수 없다.
 */
const PLACEHOLDER_INFO: BusinessInfo = {
  상호: "(임시) 상호",
  대표자: "(임시) 대표자명",
  사업자등록번호: "000-00-00000",
  통신판매업신고번호: "(임시) 통신판매업신고번호",
  주소: "(임시) 사업장 주소",
  전화번호: "(임시) 전화번호",
};

const PLACEHOLDER_OFFICER: PrivacyOfficer = {
  성명: "(임시) 책임자 성명",
  직위: "(임시) 직위",
  연락처: "(임시) 연락처",
};

/** `123-45-67890`. 자릿수만 본다 — 국세청 체크섬까지 볼 이유는 없다. */
const REG_NO = /^\d{3}-\d{2}-\d{5}$/;

/** 형식은 맞지만 아무의 것도 아닌 번호. 자리값이 그대로 배포되는 것을 막는다. */
const NOT_A_REAL_REG_NO = "000-00-00000";

/** `2026-서울강남-1234` 처럼 자유 형식이라 "비지 않았는가" 만 본다. */
function filled(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed.length === 0) return null;
  // 자리값을 환경변수에 그대로 붙여넣은 경우.
  if (trimmed.includes("(임시)")) return null;
  return trimmed;
}

export interface BusinessEnv {
  readonly name?: string;
  readonly owner?: string;
  readonly regNo?: string;
  readonly ecommerceNo?: string;
  readonly address?: string;
  readonly phone?: string;
  readonly officerName?: string;
  readonly officerTitle?: string;
  readonly officerContact?: string;
}

export interface ResolvedBusiness {
  readonly info: BusinessInfo;
  readonly officer: PrivacyOfficer;
  /** 아래 값이 실제 사업자 정보가 아니라 임시값인가. */
  readonly isPlaceholder: boolean;
}

/**
 * 환경변수를 표로 바꾼다. **순수 함수라 테스트가 닿는다.**
 *
 * `process.env` 를 안에서 읽지 않는 것이 중요하다 — 그러면 테스트가 값을 줄 수
 * 없고, 빌드 시점 치환 때문에 `NODE_ENV` 분기도 테스트에서 재현되지 않는다
 * (`resolveSupportEmail` 이 그래서 시험되지 못하고 있다).
 *
 * 개인정보 보호책임자는 **따로 두지 않으면 대표자가 맡는다.** 1인 사업자에서는
 * 실제로 같은 사람이고, 변수를 더 만들수록 대시보드에서 빠뜨릴 칸이 늘어난다.
 */
export function resolveBusiness(env: BusinessEnv): ResolvedBusiness {
  const name = filled(env.name);
  const owner = filled(env.owner);
  const address = filled(env.address);
  const phone = filled(env.phone);
  const ecommerceNo = filled(env.ecommerceNo);

  const rawRegNo = filled(env.regNo);
  const regNo =
    rawRegNo !== null && REG_NO.test(rawRegNo) && rawRegNo !== NOT_A_REAL_REG_NO
      ? rawRegNo
      : null;

  // **하나라도 없으면 전부 임시값이다** (머리말의 "전부 아니면 전무").
  if (
    name === null ||
    owner === null ||
    regNo === null ||
    ecommerceNo === null ||
    address === null ||
    phone === null
  ) {
    return { info: PLACEHOLDER_INFO, officer: PLACEHOLDER_OFFICER, isPlaceholder: true };
  }

  return {
    info: {
      상호: name,
      대표자: owner,
      사업자등록번호: regNo,
      통신판매업신고번호: ecommerceNo,
      주소: address,
      전화번호: phone,
    },
    officer: {
      성명: filled(env.officerName) ?? owner,
      직위: filled(env.officerTitle) ?? "대표",
      연락처: filled(env.officerContact) ?? phone,
    },
    isPlaceholder: false,
  };
}

const RESOLVED = resolveBusiness({
  name: process.env.NEXT_PUBLIC_BIZ_NAME,
  owner: process.env.NEXT_PUBLIC_BIZ_OWNER,
  regNo: process.env.NEXT_PUBLIC_BIZ_REG_NO,
  ecommerceNo: process.env.NEXT_PUBLIC_BIZ_ECOMMERCE_NO,
  address: process.env.NEXT_PUBLIC_BIZ_ADDRESS,
  phone: process.env.NEXT_PUBLIC_BIZ_PHONE,
  officerName: process.env.NEXT_PUBLIC_BIZ_OFFICER_NAME,
  officerTitle: process.env.NEXT_PUBLIC_BIZ_OFFICER_TITLE,
  officerContact: process.env.NEXT_PUBLIC_BIZ_OFFICER_CONTACT,
});

export const BUSINESS_INFO: BusinessInfo = RESOLVED.info;
export const PRIVACY_OFFICER: PrivacyOfficer = RESOLVED.officer;

/** 아래 값이 실제 사업자 정보가 아니라 임시값임을 나타낸다. */
export const IS_PLACEHOLDER: boolean = RESOLVED.isPlaceholder;

/**
 * 호스팅 서비스 제공자. 전자상거래법이 사업자 정보와 함께 요구한다.
 *
 * 환경변수가 아닌 이유: 발급을 기다리는 값이 아니라 **이미 확정된 사실**이다.
 * 화면은 Vercel 에서, API 는 Google Cloud Run 에서 돈다.
 */
export const HOSTING_PROVIDER = "Vercel Inc. (웹) · Google Cloud Run (API)";

/**
 * 임시값이 노출되는 동안 함께 보여야 하는 문구.
 *
 * 이것이 있어야 표를 읽은 사람이 "아직 등록되지 않은 사업자" 와 "잘못 적힌 사업자"
 * 를 구분할 수 있다.
 */
export const PLACEHOLDER_NOTICE =
  "아래 사업자 정보는 아직 등록되지 않은 임시값입니다. 실제 서비스 개시 전에 " +
  "실제 정보로 교체됩니다.";

/** 표로 그리기 위한 `[라벨, 값]` 목록. 순서는 `ROW_ORDER` 가 정한다. */
export function businessRows(info: BusinessInfo = BUSINESS_INFO): Array<[string, string]> {
  return ROW_ORDER.map((label) => [label, info[label]]);
}
