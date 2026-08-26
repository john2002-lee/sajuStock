import Link from "next/link";

/**
 * 시장 현황(`/stock`)에서 사주 서비스로 건너가는 입구 — **서비스 간 다리다.**
 *
 * 서비스 선택 화면(`/`)과 푸터의 서비스 이동 줄이 같은 곳으로 가므로 유일한 길은
 * 아니지만, **주식을 보던 중에** 건너가는 길은 여전히 이것 하나다.
 *
 * ## 문구가 성향에서 사주로 바뀐 이유
 *
 * 예전 이름은 `ProfileBand` 였고 "설문 20문항 대신 성향을 만드세요" 라고 적혀
 * 있었다. 사주 화면이 투자 성향 온보딩이던 시절의 문구인데, 지금 `/saju` 는 사주
 * 서비스(입력 → 여덟 글자 → 풀이)이고 성향 온보딩은 얼려 두었다
 * (`features/saju/_parked/`). **누르면 나오지 않는 것을 광고하고 있었다.**
 *
 * ## 그래도 판단 옆에 두지 않는다
 *
 * 종목 판단 카드 바로 옆이 아니라 홈의 한 블록으로 두는 것은 통합 기획 5.7 의
 * "판단 영역과 재미 영역을 시각적으로 분리한다" 를 지키기 위해서다. 사주가 종목
 * 판단의 근거처럼 읽히는 배치를 만들지 않는다.
 */
export function SajuBand() {
  return (
    <Link
      href="/saju"
      className="group flex items-center justify-between gap-4 border border-line-20 bg-surface px-4 py-4 hover:border-ink md:px-5"
    >
      <div className="space-y-1">
        <p className="text-13 text-ink">태어난 시각부터 바로잡은 사주 여덟 글자</p>
        <p className="text-11 leading-relaxed text-muted-60">
          경도·균시차·서머타임을 보정해 계산합니다. 회원가입 없이 여덟 글자를 바로
          확인하실 수 있습니다.
        </p>
      </div>
      <span className="flex-none text-11 uppercase tracking-[0.16em] text-muted-50 group-hover:text-ink">
        사주 보기
      </span>
    </Link>
  );
}
