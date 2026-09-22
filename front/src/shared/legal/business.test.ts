import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { businessRows, resolveBusiness, type BusinessEnv } from "./business.ts";

/**
 * 이 파일은 **오래 약속만 되어 있던 테스트**다.
 *
 * `business.ts` 머리말은 오래전부터 "테스트가 그 대응을 강제한다 — 플래그만 내리고
 * 값을 안 바꾸는 것도, 값만 바꾸고 고지를 안 지우는 것도 걸린다" 고 적고 있었는데,
 * 그런 테스트는 없었다. 플래그가 손으로 켜는 `const` 였기 때문에 애초에 강제할
 * 방법도 없었다.
 *
 * 이제 플래그는 값에서 파생되므로 그 약속이 **구조적으로** 참이다. 그래서 여기서
 * 시험하는 것은 파생 규칙 자체다.
 *
 * 지키는 것은 하나다 — **진짜와 가짜가 섞인 표가 나가지 않는 것.** 전부 가짜인
 * 표는 "아직 등록 전" 으로 읽히지만, 절반만 진짜인 표는 읽는 사람이 어느 줄을
 * 믿어야 할지 알 수 없다.
 */

const REAL: BusinessEnv = {
  name: "에이아이오브텔러스",
  owner: "홍길동",
  regNo: "123-45-67890",
  ecommerceNo: "2026-서울강남-01234",
  address: "서울특별시 강남구 테헤란로 1",
  phone: "02-1234-5678",
};

describe("전부 갖췄을 때", () => {
  test("실제 정보로 서고 임시값 고지가 내려간다", () => {
    const r = resolveBusiness(REAL);

    assert.equal(r.isPlaceholder, false);
    assert.equal(r.info.상호, "에이아이오브텔러스");
    assert.equal(r.info.사업자등록번호, "123-45-67890");
  });

  test("앞뒤 공백은 환경변수에 흔히 섞인다", () => {
    const r = resolveBusiness({ ...REAL, name: "  에이아이오브텔러스  " });

    assert.equal(r.isPlaceholder, false);
    assert.equal(r.info.상호, "에이아이오브텔러스");
  });
});

describe("하나라도 없으면 **전체가** 임시값", () => {
  // 절반만 진짜인 표를 막는 것이 이 묶음의 전부다.
  for (const missing of [
    "name",
    "owner",
    "regNo",
    "ecommerceNo",
    "address",
    "phone",
  ] as const) {
    test(`${missing} 하나가 비면 나머지가 진짜여도 표 전체가 임시값이다`, () => {
      const r = resolveBusiness({ ...REAL, [missing]: undefined });

      assert.equal(r.isPlaceholder, true, missing);
      // 다른 칸까지 전부 임시값으로 떨어져야 한다 — 섞이면 안 된다.
      assert.equal(r.info.상호, "(임시) 상호");
      assert.equal(r.info.전화번호, "(임시) 전화번호");
    });
  }

  test("빈 문자열과 공백만 있는 값은 없는 것과 같다", () => {
    assert.equal(resolveBusiness({ ...REAL, owner: "" }).isPlaceholder, true);
    assert.equal(resolveBusiness({ ...REAL, owner: "   " }).isPlaceholder, true);
  });

  test("자리값을 환경변수에 그대로 붙여넣어도 통과하지 못한다", () => {
    // 대시보드에 "(임시) 상호" 를 넣어 두고 다 됐다고 여기는 상황을 막는다.
    assert.equal(resolveBusiness({ ...REAL, name: "(임시) 상호" }).isPlaceholder, true);
  });
});

describe("사업자등록번호 형식", () => {
  test("000-00-00000 은 형식은 맞지만 아무의 것도 아니다", () => {
    assert.equal(resolveBusiness({ ...REAL, regNo: "000-00-00000" }).isPlaceholder, true);
  });

  test("자릿수가 틀리면 받지 않는다", () => {
    for (const bad of ["1234567890", "12-345-67890", "123-45-6789", "123-45-678901"]) {
      assert.equal(resolveBusiness({ ...REAL, regNo: bad }).isPlaceholder, true, bad);
    }
  });
});

describe("개인정보 보호책임자", () => {
  test("따로 두지 않으면 대표자가 맡는다 — 1인 사업자에서 실제로 같은 사람이다", () => {
    const r = resolveBusiness(REAL);

    assert.equal(r.officer.성명, "홍길동");
    assert.equal(r.officer.직위, "대표");
    assert.equal(r.officer.연락처, "02-1234-5678");
  });

  test("따로 지정하면 그쪽이 이긴다", () => {
    const r = resolveBusiness({
      ...REAL,
      officerName: "김보호",
      officerTitle: "정보보호팀장",
      officerContact: "privacy@example.com",
    });

    assert.equal(r.officer.성명, "김보호");
    assert.equal(r.officer.직위, "정보보호팀장");
    assert.equal(r.officer.연락처, "privacy@example.com");
  });
});

describe("businessRows", () => {
  test("법이 요구하는 여섯 항목을 정해진 순서로 낸다", () => {
    const rows = businessRows(resolveBusiness(REAL).info);

    assert.deepEqual(
      rows.map(([label]) => label),
      ["상호", "대표자", "사업자등록번호", "통신판매업신고번호", "주소", "전화번호"],
    );
  });

  test("빈 값을 내보내지 않는다 — 표에 빈 줄이 생기면 누락처럼 보인다", () => {
    for (const [label, value] of businessRows(resolveBusiness({}).info)) {
      assert.ok(value.trim().length > 0, label);
    }
  });
});
