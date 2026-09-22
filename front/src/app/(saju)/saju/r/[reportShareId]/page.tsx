import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedReportView } from "@/features/saju";
import { getSharedReport } from "@/features/saju/server";

/**
 * `/saju/r/{id}` — 공유된 유료 리포트. **로그인 없이 열린다.**
 *
 * ## `/saju/reports/{token}` 과 무엇이 다른가
 *
 * 저 주소는 **자격 증명**이다. 그것을 아는 사람은 리포트뿐 아니라 양력 생년월일을
 * 보고 구매자의 남은 추가 질문까지 쓸 수 있다. 그래서 그 주소는 공유될 수 없고,
 * "입력창만 숨긴 페이지" 로도 해결되지 않는다 — 받은 사람이 주소를 고치면 그만이다.
 *
 * 이 주소는 그것과 **무관한 두 번째 난수**(`saju_orders.report_share_id`)이고,
 * 여기서 부르는 API 는 좁힌 응답만 준다(`SajuSharedReport`): 리포트 본문과 계산
 * 패널은 있고, 생년월일·보정 분값·추가 질문·접근 토큰은 없다.
 *
 * ## 왜 `/saju/s` 와 주소를 나눴나
 *
 * 담기는 것이 다르다. `/saju/s` 는 여덟 글자와 무료 요약뿐이고 이쪽은 **돈을 내고
 * 받은 풀이 전문**이 나간다. 경로가 같으면 로그·차단 목록·분석에서 둘을 구분할 수
 * 없고, 무엇이 얼마나 공개되는지를 주소만 보고 판단할 수 없게 된다.
 *
 * ## `(saju)` **안**이다
 *
 * `(saju)/layout.tsx` 의 `data-service="saju"` 한 줄이 금빛 팔레트(`--saju-*`)를
 * 켜는 스위치라, 그룹 밖에서 그리면 오행 색이 통째로 어긋난다 —
 * `/saju/s/[shareId]` 가 같은 이유로 여기 있고, 그쪽 주석에 근거가 더 있다.
 *
 * ## 색인하지 않는다
 *
 * id 는 128비트 난수라 추측으로 닿을 수 없지만 **크롤러는 링크를 따라온다.**
 * 누군가 이 주소를 공개된 곳에 붙이는 순간 남의 사주 풀이가 검색 결과에 남는다.
 * `robots.ts` 의 차단 목록과 이중으로 막는다.
 *
 * ## `revalidate = 0`
 *
 * 만료가 캐시보다 오래 살면 안 된다. 응답이 캐시되면 주문이 파기된 뒤에도 링크가
 * 계속 열린다 — 개인정보처리방침이 "파기한다" 고 적은 바로 그 값이다.
 */

export const revalidate = 0;

export const metadata: Metadata = {
  title: "공유된 사주 리포트",
  robots: { index: false, follow: false },
};

export default async function SharedSajuReportPage({
  params,
}: {
  // Next 16 에서 `params` 는 Promise 다.
  params: Promise<{ reportShareId: string }>;
}) {
  const { reportShareId } = await params;
  const report = await getSharedReport(reportShareId);

  // 서비스가 실패도 `null` 로 접는다 — 없는 링크·만료된 링크·백엔드 장애를 화면이
  // 구분하지 않는다. 받은 사람이 할 수 있는 일이 셋 다 같고(보낸 사람에게 다시
  // 묻기), 구분해 주면 "있었지만 만료됐다" 가 곧 그 사람이 리포트를 샀다는 확인이
  // 된다.
  //
  // **알려진 한계: 화면은 404 인데 상태 코드는 200 이다.** 루트 `app/loading.tsx`
  // 가 만드는 Suspense 경계 때문에 셸이 먼저 흘러나간다 — `/saju/s/[shareId]` 가
  // 같은 함정을 같은 이유로 감수한다. 이 주소는 `noindex` 라 검색 결과에 남지
  // 않고, 사람에게는 404 화면이 정확히 보인다.
  if (!report) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-6 sm:py-14">
      <SharedReportView report={report} />
    </main>
  );
}
