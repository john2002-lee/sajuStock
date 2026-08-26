/**
 * 브라우저에서도 읽을 수 있는 설정. **클라이언트 컴포넌트가 import 해도 된다.**
 *
 * 옆의 `env.ts` 와 갈라 둔 이유는 이름이 아니라 **경계**다. 그쪽은 백엔드 주소·타임아웃
 * 처럼 서버만 알아야 하는 값이고, 여기 있는 것은 화면에 그려질 값이다. 한 파일에
 * 섞으면 클라이언트 컴포넌트가 `env.ts` 를 import 하는 순간 백엔드 주소가 브라우저
 * 번들로 따라 들어간다.
 *
 * Next 는 `NEXT_PUBLIC_*` 를 **정적이고 리터럴인** `process.env.NEXT_PUBLIC_X`
 * 접근에만 인라인한다. 빌드 시점의 텍스트 치환이라 계산된 키 조회
 * (`process.env[name]`)는 평가하지 못하고 브라우저에 `undefined` 를 실어 보낸다.
 * **아래 export 는 반드시 리터럴 접근으로 두고**, 루프나 헬퍼로 리팩터링하지 않는다.
 */

/**
 * 결제·리포트 문제로 막힌 고객이 연락할 곳.
 *
 * 다른 값처럼 `!` 로 단정하지 않는다 — 이것은 진짜로 선택값이다. 아직 운영 메일함이
 * 없고, **결제가 막힌 사람에게 "사람이 확인하고 있습니다" 라고 약속하는 바로 그
 * 순간에 지어낸 주소를 보여 주는 것**은 그 약속을 뒷받침하는 게 아니라 무너뜨린다.
 * 값이 없으면 화면은 연락처 줄을 빼고 렌더한다.
 *
 * 서비스 개시 전에 **실제로 수신되는 주소**로 반드시 설정해야 한다.
 */
export const SUPPORT_EMAIL = resolveSupportEmail(process.env.NEXT_PUBLIC_SUPPORT_EMAIL);

/**
 * 예약 도메인 자리값을 프로덕션 빌드에서 떨어뜨린다.
 *
 * `NEXT_PUBLIC_*` 는 **빌드 시점에** 번들로 인라인된다. 그래서 로컬 작업용으로
 * `support@example.com` 을 켜 둔 기계에서 프로덕션 빌드를 만들면 죽은 주소가
 * 환불 안내에 박혀 나간다. 그것은 주소가 없는 것보다 나쁘다 — 위 주석이 막으려던
 * 바로 그 실패에 "메일을 보내고 아무 답도 못 받는" 단계가 하나 더 붙는다.
 *
 * example.com/.net/.org 과 .test/.invalid/.example 은 RFC 2606·6761 이 예약해 둔
 * 도메인이라 **누구도 그곳에서 메일을 받지 않는다.** 따라서 미설정으로 취급해도
 * 실제 메일함을 버릴 일이 없다. 프로덕션이 아니면 그대로 둔다 — 개발 중에 자리값이
 * 보이는 것이 이 링크가 존재한다는 사실을 알아차리는 방법이다.
 */
function resolveSupportEmail(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (process.env.NODE_ENV !== "production") return raw;
  return /@(example\.(com|net|org)|[^@]*\.(test|invalid|example|localhost))$/i.test(raw)
    ? undefined
    : raw;
}

/**
 * 결제 보관 기간(일). 법적 문서와 화면이 **같은 숫자**를 말하게 하는 값이다.
 *
 * 진짜 출처는 백엔드의 `saju_order_retention_days` 이고, 화면은 대개
 * `GET /api/saju/payment-config` 로 받는다. 그런데 약관·개인정보처리방침은 결제
 * 설정을 조회할 이유가 없는 정적 문서다 — 그 한 값을 위해 백엔드에 의존하면
 * 백엔드가 죽었을 때 법적 문서가 렌더되지 않는다.
 *
 * 그래서 여기에 두고, 백엔드와 어긋나지 않도록 **기본값을 같게** 맞춘다.
 * 백엔드에서 이 값을 바꾸면 `SAJU_RETENTION_DAYS` 도 함께 설정해야 한다.
 */
export const RETENTION_DAYS = Number(process.env.NEXT_PUBLIC_SAJU_RETENTION_DAYS ?? 30);
