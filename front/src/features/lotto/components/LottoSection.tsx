import { kstStamp } from "../model/clock";
import { generateSets } from "../model/generate";
import { getLottoSnapshot } from "../services/getLottoStats";
import { NumberBalls } from "./NumberBalls";

/**
 * 이번 주 조합 세 세트 — **서버 컴포넌트다.**
 *
 * ## 왜 클라이언트 JS 가 없나
 *
 * 이 화면에서 사람이 하는 일은 "번호를 본다" 하나다. 누를 것도, 입력할 것도 없다.
 * 그래서 브라우저로 보내는 자바스크립트가 0 바이트이고, 89KB 짜리 회차 데이터도
 * 서버에 남는다(`services/getLottoStats.ts`). 번호는 서버에서 계산돼 HTML 에
 * 실려 나가므로 **첫 페인트에 이미 보인다** — 유입 매체로서 이것이 제일 중요하다.
 *
 * ## 왜 방문 시각을 시드에 넣나
 *
 * 방문할 때마다 그 시점의 최신 집계로 새로 뽑아야 한다는 요구다. 그래서 시드가
 * `회차 + 밀리초` 이고, 요청마다 다른 조합이 나온다. 브라우저 식별자
 * (localStorage·쿠키)는 쓰지 않는다 — 무료 경로에서 아무것도 저장하지 않는다는
 * 사주 쪽 약속(`features/saju/model/storage.ts`)을 로또가 깨뜨릴 이유가 없고,
 * 시각만으로도 "방문마다 새로" 는 충족된다.
 *
 * 대가가 둘 있다.
 *
 * 1. 이 섹션이 들어간 라우트는 **정적으로 굳힐 수 없다.** 그래서 페이지 쪽에
 *    `revalidate = 0` 을 명시한다 — 없으면 응답이 캐시되어 모두가 같은 시각의
 *    같은 번호를 보게 되고, 요구가 조용히 무효가 된다.
 * 2. 새로 고치면 계속 다시 뽑힌다. 광고 게이트가 없으므로 막을 이유가 없고,
 *    사용자가 어리둥절하지 않게 **화면에 그렇게 적는다.**
 *
 * ## "그 시각에 확률이 높은 번호" 는 없다
 *
 * 그런 번호가 있다면 여기 적었을 것이다. 1241회를 전부 넣어 검정했을 때 여섯
 * 자리 모두 순서통계량 이론분포와 일치했고(카이제곱 p=0.27~0.95), 백테스트에서도
 * 무작위와 구분되지 않았다(5등 이상 2.191% vs 무작위 2.353%). 로또는 회차마다
 * 독립시행이라 지난 결과가 다음 확률을 바꾸지 않는다.
 *
 * `alpha` 가 하는 일은 **덜 나온 번호를 조금 더 자주 고르는 것** 뿐이고, 그것이
 * 당첨 확률을 올리지는 않는다. 그래서 카피에서 "예측" · "다음에 나올 번호" ·
 * "당첨 확률" 을 쓰지 않는다. 사실이 아닌 말을 걸면 표시광고법 문제가 되고,
 * 무엇보다 사주 쪽이 쌓는 "계산이 정확한 곳" 이라는 평판을 같이 깎는다.
 *
 * ## 화면에서 특정 복권을 가리키지 않는다
 *
 * 상품명 · 발행처 · **회차 수** 를 모두 빼고 **"이번 주 행운의 번호"** 로만 부른다.
 * 회차가 몇 회인지 적으면 그 숫자 하나로 어떤 상품인지 특정되므로, 상품명을 지운
 * 의미가 없어진다.
 *
 * 사주 사이트의 결이 그쪽에 가깝고, 상품을 지칭하지 않으면 그 상품에 대한 주장으로
 * 읽힐 여지도 함께 사라진다. 대가는 검색 유입이다 — 상품명으로 찾는 사람에게는 이
 * 페이지가 잡히지 않고 `/lotto` 경로만 단서로 남는다.
 *
 * 근거를 아주 지우지는 않는다. "지난 기록을 자리별로 집계해" 와 "통계 기반 무작위
 * 조합" 이 그 자리이고, 둘 다 숫자를 말하지 않으면서 사실이다.
 */

/** 세트 이름. 숫자로 매기면 화면의 번호들과 섞여 읽힌다. */
const SET_LABELS = ["A", "B", "C"] as const;

export interface LottoSectionProps {
  /** 세트 아래에 붙일 것 — 보통 사주로 가는 링크다. */
  readonly action?: React.ReactNode;
  /**
   * 제목의 단계. `/lotto` 에서는 이 섹션이 페이지의 주인공이라 `1`, 사주 랜딩
   * 하단에 붙을 때는 입력 화면의 `h1` 아래이므로 `2` 다. 단계를 건너뛴 제목은
   * 스크린리더의 목차를 어긋나게 한다.
   */
  readonly level?: 1 | 2;
}

export function LottoSection({ action, level = 2 }: LottoSectionProps) {
  const { stats, latestDraw } = getLottoSnapshot();
  const Heading = level === 1 ? "h1" : "h2";

  // 데이터가 비는 경우는 갱신이 실패한 배포다. 번호 생성은 그래도 유효한 조합을
  // 내지만(`generate.ts`), 근거로 내세울 회차가 없으면 조용히 접는다 — 숫자만
  // 덜렁 놓으면 어디서 나온 값인지 말할 수 없다.
  if (!latestDraw) return null;

  // 방문 시각을 시드에 섞는다 — 요청마다 다른 조합이 나온다(위 주석).
  const now = new Date();
  const sets = generateSets(latestDraw.round, String(now.getTime()), stats, {
    count: SET_LABELS.length,
  });
  const pickedAt = kstStamp(now);

  return (
    <section
      aria-labelledby="lotto-heading"
      className="mx-auto w-full max-w-5xl px-5 pb-14 sm:px-6 lg:pb-20"
    >
      {/* 두 단의 리듬을 입력 화면(`SajuEntry`)과 맞춘다 — 왼쪽은 무엇인지, 오른쪽은
          그 결과. 한 단으로 두면 넓은 화면에서 세트 카드가 900px 넘게 늘어나 공
          여섯 개가 왼쪽에 뭉치고 오른쪽이 텅 빈다. 오른쪽 단을 460px 로 묶는
          이유도 같다: 공 여섯 개(44px × 6 + 간격)가 꼭 맞는 폭이다. */}
      <div className="grid gap-y-8 border-t border-hairline pt-10 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:items-start lg:gap-x-16">
        <header className="lg:col-start-1 lg:row-start-1">
          <p className="font-mono-kr text-[10px] tracking-[0.22em] text-gold-text">LUCKY NUMBERS</p>

          <Heading
            id="lotto-heading"
            className="mt-3 font-display text-[24px] font-light leading-[1.3] text-ink sm:text-[28px]"
          >
            이번 주 <span className="text-gold-text">행운의 번호</span>
          </Heading>

          <p className="mt-4 text-pretty text-[14px] leading-relaxed text-muted">
            지난 기록을 자리별로 집계해, 지금 이 시각에 새로 뽑았습니다.
          </p>

          <p className="mt-3 font-mono-kr text-[11px] tracking-[0.06em] text-muted-3">
            {pickedAt} 기준
          </p>
        </header>

        {/* 세로로 쌓는다. 셋을 가로로 늘어놓으면 모바일에서 공 지름이 줄어 숫자가
            읽히지 않고, 데스크톱에서는 세 칸이 서로 비교 대상처럼 보인다 — 우열이
            없는 세 조합인데. */}
        <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <ul className="grid gap-3">
            {sets.map((numbers, index) => (
              <li
                key={SET_LABELS[index]}
                className="flex items-center gap-4 rounded-card-sm border border-hairline bg-surface-warm px-4 py-3.5 sm:gap-5 sm:px-5"
              >
                <span
                  aria-hidden
                  className="font-mono-kr text-[12px] tracking-[0.1em] text-muted-3"
                >
                  {SET_LABELS[index]}
                </span>
                <NumberBalls numbers={numbers} />
              </li>
            ))}
          </ul>

          {/* "새로 고치면 다시 뽑힌다" 를 적어 둔다. 적지 않으면 뒤로 갔다 온
              사용자가 아까 본 번호를 찾다가 버그로 읽는다. */}
          <p className="mt-4 text-[12.5px] leading-relaxed text-muted-3">
            새로 고치면 다시 뽑습니다. 번호는 통계 기반 무작위 조합입니다.
          </p>
        </div>

        {action ? <div className="lg:col-start-1 lg:row-start-2">{action}</div> : null}
      </div>
    </section>
  );
}
