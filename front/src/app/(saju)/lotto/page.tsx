import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLottoSnapshot, LottoSection } from "@/features/lotto/server";

/**
 * `/lotto` — 로또 조합 화면.
 *
 * ## 왜 `(saju)` 그룹 안인가
 *
 * 라우트 그룹은 URL 에 나타나지 않으므로 이 파일이 곧 `/lotto` 이고, 동시에 사주
 * 셸(헤더 · 금빛 팔레트 · 푸터)을 그대로 입는다. 새 그룹을 만들면 레이아웃과
 * 팔레트를 복제해야 하는데, 두 화면이 같은 사이트로 보여야 하는 마당에 갈라 둘
 * 이유가 없다.
 *
 * ## 왜 사주 랜딩 하단 섹션만으로 끝내지 않나
 *
 * 그 섹션은 이미 사주를 보러 온 사람에게만 보인다. 검색으로 들어오는 길이 없다 —
 * 랜딩의 제목과 본문은 사주 이야기이므로 로또로는 잡히지 않는다. 같은 컴포넌트를
 * 여기 한 번 더 세워 **로또가 주인공인 문서**를 만든다(그래서 `level={1}`).
 *
 * 이 화면에서 사주로 넘기는 것이 이 기능의 목적이다. 토요일 추첨이라는 주 1회
 * 재방문 트리거를 사주는 갖지 못했다.
 *
 * ## `revalidate = 0` 이 필요한 이유
 *
 * 조합은 방문 시각을 시드로 뽑는다(`LottoSection`). 응답이 캐시되면 그 시각이
 * 함께 굳어 **모든 방문자가 같은 번호를 보게** 되고, "방문할 때마다 새로" 라는
 * 요구가 조용히 무효가 된다. `Date` 는 Next 가 동적이라고 판단하는 API 가 아니라
 * 자동으로는 막히지 않으므로 여기서 명시한다.
 *
 * 비용은 없다고 봐도 된다. 1241회 집계는 모듈 스코프에 한 번만 담기고
 * (`services/getLottoStats.ts`), 요청마다 하는 일은 조합 세 개를 뽑는 것뿐이다.
 * 번호는 서버 HTML 에 실려 나가므로 **첫 페인트에 보인다** — 유입 매체로서 지켜야
 * 할 것은 그것이다.
 *
 * (이 그룹은 어차피 요청 렌더다. `(saju)/layout.tsx` 의 `AccountMenu` 가
 * `auth()` 로 세션을 읽기 때문이다. 그래도 그 사정에 기대지 않고 적어 둔다 —
 * 레이아웃이 바뀌는 날 이 화면이 조용히 굳으면 알아차리기 어렵다.)
 */

export const revalidate = 0;

export const metadata: Metadata = {
  title: { absolute: "AI Of Tellers · 이번 주 행운의 번호" },
  description:
    "지난 기록을 자리별로 집계해 뽑은 이번 주 행운의 번호 세 조합. 회원가입 없이 바로 확인하세요.",
};

export default function LottoPage() {
  // 회차 데이터가 없으면 `LottoSection` 은 아무것도 그리지 않는다. 그러면 이
  // 라우트는 헤더와 푸터만 남은 **빈 200** 이 되는데, metadata 는 여전히 번호를
  // 약속하므로 검색엔진에는 soft 404 로 보인다. 검색 유입이 이 페이지의 존재
  // 이유이므로 그 상태를 색인시키는 것이 가장 나쁘다. 404 로 분명히 말한다.
  // (랜딩 하단 섹션은 같은 상황에서 조용히 사라지는 편이 맞다 — 그 화면의 주인공은
  // 사주 입력 폼이다.)
  if (!getLottoSnapshot().latestDraw) notFound();

  return (
    <LottoSection
      level={1}
      action={
        <div className="rounded-card-sm border border-hairline bg-surface-warm px-5 py-5">
          <p className="text-[14px] leading-relaxed text-ink-body">
            태어난 시각을 진태양시로 바로잡아 계산하는 사주팔자도 무료로 보실 수 있습니다.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-pill bg-button-gradient px-6 py-3 text-[14px] font-bold text-on-primary shadow-cta"
          >
            사주팔자 보기
          </Link>
        </div>
      }
    />
  );
}
