import { Icon } from "@/shared/ui";

export interface BrowseHeaderProps {
  /** 모집단 캡션 ("시가총액 상위 200종목"). 백엔드 워밍업 전에는 빈 문자열이 온다 */
  scope: string;
}

/**
 * 종목 탐색 화면의 정체성 블록 — 제목과 모집단 고지.
 *
 * 예전에는 이 자리가 11px mono 한 줄이었다. 24px 워드마크 바로 밑에서 캡션 크기
 * 제목이라 페이지 정체성이 서지 않았다. 제목을 본문 조판(serif)으로 올리고,
 * 모집단은 그 아래 mono 캡션으로 내려 위계를 둘로 벌린다.
 *
 * 나침반 아이콘은 모바일 탭바의 '탐색' 과 같은 글리프다 — 탭을 눌러 들어온 사람이
 * 같은 표식을 여기서 다시 본다.
 *
 * **모집단을 그대로 밝힌다.** "시가총액 상위 200종목" 은 전 종목을 훑은 결과가
 * 아니라는 고지다. 이 줄을 빼면 목록이 시장 전체를 대표하는 것처럼 읽힌다.
 *
 * 검색은 여기 없다. 목록을 훑는 것과 이름으로 찾는 것은 대안 관계라 컨트롤 존
 * (BrowseToolbar)에서 필터·정렬과 한 덩어리로 묶었다.
 *
 * 데이터가 없고 /stocks 한 라우트에서만 쓰이므로 라우트 전용 `_components/` 에 둔다
 * — 두 번째 사용처가 생기면 shared/components/layout 으로 올린다.
 */
export function BrowseHeader({ scope }: BrowseHeaderProps) {
  return (
    <section className="flex flex-col gap-[7px]">
      <h1 className="flex items-center gap-2 font-display font-bold leading-none tracking-[-0.01em] text-20 md:text-26">
        <Icon name="compass" size={18} className="flex-none text-muted-45" />
        종목 탐색
      </h1>

      <p
        className="font-mono leading-none tracking-label-wide text-muted-50 text-11"
      >
        {scope || "랭킹 준비 중"}
      </p>
    </section>
  );
}
