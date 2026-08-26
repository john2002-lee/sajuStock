import { ThemeToggle } from "@/shared/theme";
import { Wordmark } from "./Wordmark";

export interface MastheadProps {
  /** 제호 밑 한 줄 (기준 시각 · 시세 지연 고지 등) */
  caption: string;
  /** 검색 트리거 슬롯. features/search 소유라 호출부가 넣는다 */
  search?: React.ReactNode;
  /** 화면별 주요 이동 (관심 종목 · 시장 현황 …) */
  action?: React.ReactNode;
  /**
   * 제호를 눌렀을 때 갈 곳. 기본은 서비스 선택 화면(`/`)이고, 서비스 안쪽 화면은
   * 자기 서비스 홈을 준다 — 주식은 `/stock`. 이유는 `Wordmark` 의 `href` 주석에 있다.
   */
  home?: string;
}

/**
 * 신문 제호. 종목 상세 · 홈 · 종목 탐색 · 관심종목 · 404 가 같은 마크업을 공유한다.
 *
 * 검색·액션은 슬롯으로 받는다 — 검색 트리거는 features/search,
 * AI 판단 버튼은 features/advice 소유이고 shared/ 는 features/ 를 import 할 수 없다.
 *
 * **2구역이다: 제호 | 우측 컨트롤 덩어리(검색·토글·액션).**
 *
 * 원래는 3구역이었고 검색이 가운데 칸(`flex-1 justify-center`)에 있었다. 의도는
 * "주 진입 수단을 부가 기능처럼 보이지 않게" 였는데 실제로는 반대로 작동했다:
 * 넓은 화면에서 검색 상자가 제호와도 토글과도 붙지 않은 채 양쪽에 빈 공간을 끼고
 * 혼자 떠 있었다. 이 검색은 ⌘K 로 어디서나 열리는 **전역 팔레트**이지 특정 화면의
 * 도구가 아니라, 같은 성격의 전역 컨트롤(테마 토글·화면 이동)과 한 덩어리로 묶는
 * 편이 정확하다. 2b 콘솔 상단 바(ConsoleView)가 이미 그렇게 하고 있다.
 *
 * 본문으로 내리는 안도 검토했다가 접었다. 필터·정렬 옆에 두면 "타이핑하면 표가
 * 걸러진다" 는 잘못된 기대를 만드는데, 실제로는 팔레트가 열려 다른 종목으로 **이동**한다.
 *
 * 예외는 홈뿐이다 — 홈은 검색이 화면의 주 동사라 본문 첫 블록에서 히어로로 받고
 * (FindBand) 이 슬롯을 비운다. 같은 동작을 한 화면에 두 번 두지 않기 위함이다.
 *
 * 모바일 노출 여부는 **호출부가 정한다**(대개 `hidden md:block` 으로 감싼다).
 * 여기서 일괄로 숨기지 않는 이유: 종목 상세의 오류 화면 3종은 하단 탭바가 없어
 * 마스트헤드 검색이 유일한 진입로다.
 *
 * 제호 자체가 홈 링크다 (Wordmark).
 */
export function Masthead({ caption, search, action, home }: MastheadProps) {
  return (
    <header className="flex items-end justify-between gap-3 border-b-2 border-ink pb-3 md:gap-6">
      <Wordmark caption={caption} href={home} />

      {/* **flex-wrap 이 안전망이다.**
          이 줄에 컨트롤이 늘어난 뒤(담기·계정) 768px 부근에서 버튼들이 눌려
          "AI 판 단 열 기" 처럼 글자가 세로로 접혔다. 원인은 둘이었다: 제호 제목이
          whitespace-nowrap 이라 안 줄어드는데 이 덩어리만 min-w-0 이라 압박을 전부
          받았고, 그 안의 버튼에 flex-none 이 없어 내용보다 작게 눌렸다.

          버튼마다 flex-none·whitespace-nowrap 을 달아 **눌리지 않게** 하고, 그래도
          안 들어가면 여기서 **다음 줄로 넘긴다.** 폭을 하나하나 계산해 맞추는 방식은
          컨트롤을 하나 더할 때마다 다시 깨진다 — 실제로 그렇게 깨졌다.

          min-w-0 은 남겨 둔다. 검색 필드(lg 이상에서만 보인다)가 줄어들 여지를
          갖는 편이 줄바꿈보다 먼저 시도되는 선택지다. */}
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2.5">
        {search}
        <ThemeToggle />
        {action}
      </div>
    </header>
  );
}
