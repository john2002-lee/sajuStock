import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedReadingView } from "@/features/saju";
import { getSharedReading } from "@/features/saju/server";

/**
 * `/saju/s/{shareId}` — 공유된 사주 여덟 글자. **로그인 없이 열린다.**
 *
 * ## `(saju)` **안**이다 — `/verdict/[shareId]` 와 반대 판단
 *
 * 주식 쪽 공유 화면은 `(stock)` 그룹 **밖**에 있다. 처음 온 사람에게 쓸 일 없는
 * 기능을 광고하지 않으려는 것이었다.
 *
 * 여기서는 반대다. `(saju)/layout.tsx` 의 `data-service="saju"` 한 줄이
 * `globals.css` 의 금빛 팔레트(`--saju-*`)를 켜는 스위치라, 그룹 밖에서 그리면
 * 여덟 글자가 주식용 중성 팔레트로 나온다 — 오행 색이 통째로 어긋난다. 그리고 사주
 * 셸에는 하단 탭바가 없어서(`ServiceBar` 를 걷어냈다) 광고할 막다른 길도 없다.
 *
 * **이것을 `/verdict` 와 맞추려고 그룹 밖으로 옮기지 말 것.**
 *
 * ## 색인하지 않는다
 *
 * `shareId` 는 128비트 난수라 추측으로 닿을 수 없지만 **크롤러는 링크를 따라온다.**
 * 누군가 이 주소를 공개된 곳에 붙이는 순간 검색 결과에 남고, 그때 "링크를 아는
 * 사람만" 이라는 약속이 깨진다. `robots.ts` 의 차단 목록에도 같은 경로가 있다.
 *
 * ## `revalidate = 0`
 *
 * 만료가 캐시보다 오래 살면 안 된다. 응답이 캐시되면 7일이 지나 404 가 되어야 할
 * 링크가 계속 열린다 — `/saju/teaser` 가 이벤트 판정 때문에 같은 설정을 쓰는 것과
 * 같은 부류의 이유다.
 */

export const revalidate = 0;

export const metadata: Metadata = {
  title: "공유된 사주",
  robots: { index: false, follow: false },
};

export default async function SharedSajuPage({
  params,
}: {
  // Next 16 에서 `params` 는 Promise 다.
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const reading = await getSharedReading(shareId);

  // 서비스가 실패도 `null` 로 접는다 — 없는 링크·만료된 링크·백엔드 장애를 화면이
  // 구분하지 않는다. 링크를 받은 사람이 할 수 있는 일이 셋 다 같고(보낸 사람에게
  // 다시 묻기), 구분해 주면 "있었지만 만료됐다" 가 곧 그 사람이 이 서비스를 썼다는
  // 확인이 된다.
  //
  // **알려진 한계: 화면은 404 인데 상태 코드는 200 이다.** 루트 `app/loading.tsx` 가
  // 만드는 Suspense 경계 때문에 셸이 먼저 흘러나가 헤더가 커밋된 뒤에 `notFound()`
  // 가 불린다 — `/verdict/[shareId]` 가 실측으로 확인한 것과 같은 함정이고, 거기
  // 적힌 이유로 여기서도 감수한다(`proxy.ts` 로 앞당길 수 없다: 링크가 유효한지는
  // DB 를 봐야 알고 Edge 는 DB 를 못 본다). 이 주소는 `noindex` 라 검색 결과에
  // 남지 않고, 사람에게는 404 화면이 정확히 보인다.
  if (!reading) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-6 sm:py-14">
      <SharedReadingView reading={reading} />
    </main>
  );
}
