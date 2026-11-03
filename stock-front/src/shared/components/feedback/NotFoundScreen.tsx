import Link from "next/link";
import { button, Chip, Icon, SectionLabel, type IconName } from "@/shared/ui";
import type { Market } from "@/shared/types";

/**
 * 404 화면의 몸통. ErrorScreen 과 같은 자리(shared/components/feedback)에 둔다 —
 * 둘 다 "요청이 실패했을 때의 지면"이고, 루트 not-found 뿐 아니라 세그먼트
 * not-found(예: /stocks/[symbol])에서도 문구만 바꿔 그대로 쓴다.
 *
 * ErrorScreen 과 달리 서버 컴포넌트다. 재시도 핸들러가 없어 클라이언트로
 * 내려보낼 이유가 없다 — 404 는 다시 시도해도 404다. 되돌아갈 길(destinations)과
 * 대신 볼 것(suggestions)을 주는 게 이 화면의 일이다.
 */

/** 되돌아갈 내부 라우트 한 줄. 외부 링크는 이 화면의 목적이 아니라 받지 않는다. */
export interface NotFoundDestination {
  /** 앱 내부 경로 ("/", "/watchlist") */
  href: string;
  label: string;
  /** 라벨 아래 mono 캡션 — 그 화면이 무엇인지 한 줄로 */
  hint: string;
  icon: IconName;
}

/**
 * "대신 이걸 찾으셨나요" 종목 한 건.
 *
 * features/search 의 `Suggestion` 을 그대로 받지 않는 이유: shared 는 features 를
 * import 할 수 없다(CONVENTIONS 의존 방향). 이 화면이 실제로 그리는 네 필드만
 * 구조적으로 정의하고, 변환은 두 도메인을 아는 app 계층이 한다.
 */
export interface NotFoundSuggestion {
  name: string;
  /** 라우팅에 쓰는 사람이 읽는 코드 (005930) */
  code: string;
  /** 정규화 심볼 (005930.KS) */
  symbol: string;
  market: Market;
}

export interface NotFoundScreenProps {
  /** 지면 좌측에 크게 조판되는 숫자. 기본 404 */
  status?: number;
  /** market home · stock detail 처럼 어느 화면인지 — eyebrow 라벨에 쓰인다 */
  scope: string;
  title: string;
  description: string;
  /** 우측 레일의 이동 경로. 최소 1개는 있어야 화면이 막다른 길이 되지 않는다 */
  destinations: readonly NotFoundDestination[];
  /** 비우면 좌측 본문 열 자체가 렌더되지 않는다 */
  suggestions?: readonly NotFoundSuggestion[];
  suggestionsTitle?: string;
  /** 목록 라벨 우측의 백엔드 메서드 캡션 (개발 참고용) */
  suggestionsNote?: string;
  /** 히어로의 1차 행동 버튼 */
  primaryAction?: { href: string; label: string };
  /** 요청한 주소 같은 진단 한 줄 — RequestedPath 를 넣는다 */
  trace?: React.ReactNode;
  /** 하단 API 메모 */
  note?: string;
}

export function NotFoundScreen({
  status = 404,
  scope,
  title,
  description,
  destinations,
  suggestions,
  suggestionsTitle = "자주 찾는 종목",
  suggestionsNote,
  primaryAction,
  trace,
  note,
}: NotFoundScreenProps) {
  const hasSuggestions = suggestions !== undefined && suggestions.length > 0;

  return (
    <div className="flex flex-col gap-[26px]">
      {/* ── 히어로 ──
          모바일은 숫자와 본문이 세로로 쌓이고, ≥768 에서 숫자 열(고정) + 본문 열로
          갈라지며 사이에 세로 헤어라인이 선다. 신문 1면의 큰 활자 + 기사 블록. */}
      <section className="flex flex-col gap-5 pt-1 md:flex-row md:items-start md:gap-9">
        <div className="flex flex-none items-baseline gap-3 md:w-[188px] md:flex-col md:items-start md:gap-1.5">
          <span
            aria-hidden
            className="font-mono leading-[0.8] tracking-[-0.02em] text-ink"
            // 390px 프레임에서 76px, 1180 컨테이너에서 150px. 컨테이너 폭이 아니라
            // 뷰포트에 걸어야 태블릿 구간에서도 매끄럽게 줄어든다.
            style={{ fontSize: "clamp(76px, 15vw, 150px)" }}
          >
            {status}
          </span>
          <span
            className="font-mono uppercase tracking-label text-muted-45 text-10"
          >
            http status
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3.5 md:border-l md:border-line-20 md:pl-9">
          <p
            className="font-mono uppercase tracking-label text-muted-60 text-11"
          >
            {scope} · not found
          </p>

          <h1
            className="text-balance font-display font-bold leading-[1.15] tracking-[-0.01em]"
            // ErrorScreen 의 34px 과 같은 위계. 모바일에서만 한 단계 줄인다.
            style={{ fontSize: "clamp(26px, 5.5vw, 34px)" }}
          >
            {title}
          </h1>

          <p className="text-pretty text-muted-70 text-14">
            {description}
          </p>

          {trace}

          {primaryAction ? (
            <div className="pt-0.5">
              <Link
                href={primaryAction.href}
                className={button()}
              >
                <Icon name="arrow-left" size={15} />
                {primaryAction.label}
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      {/* ── 본문 + 우측 레일 ──
          홈(3b)과 같은 1fr / 328px 격자. 1280 미만에서는 레일이 본문 아래로 내려온다.
          후보 목록이 없으면 격자를 만들 이유가 없다 — 레일 하나가 1180px 폭으로
          늘어나지 않게 폭만 묶는다. */}
      <div
        className={
          hasSuggestions
            ? "grid items-start gap-[26px] xl:grid-cols-[1fr_328px]"
            : "max-w-[420px]"
        }
      >
        {hasSuggestions ? (
          <section className="flex flex-col gap-2.5">
            <SectionLabel right={suggestionsNote}>
              {suggestionsTitle}
            </SectionLabel>
            <ul className="flex flex-col">
              {suggestions.map((item, index) => (
                // 구분선은 li 가 갖는다 — Link 는 li 의 유일한 자식이라
                // last: 변형자가 항상 참이 되어 마지막 줄만 지울 수 없다.
                <li
                  key={item.symbol}
                  className="border-b border-dotted border-line-22"
                >
                  <Link
                    href={`/stocks/${item.code}`}
                    className="group flex min-h-[var(--tap)] items-center gap-3.5 py-3 hover:bg-surface-hover"
                  >
                    <span
                      aria-hidden
                      className="num w-[18px] flex-none text-muted-30 text-11"
                    >
                      {index + 1}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                      <span
                        className="truncate font-display font-medium text-16"
                      >
                        {item.name}
                      </span>
                      <span
                        className="num text-muted-50 text-11"
                      >
                        {item.symbol}
                      </span>
                    </span>
                    <Chip size={10}>{item.market}</Chip>
                    <Icon
                      name="arrow-right"
                      size={15}
                      className="flex-none text-muted-30 group-hover:text-ink"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <aside className="flex flex-col gap-4 bg-surface p-4">
          <SectionLabel variant="panel">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="compass" size={13} />
              이동
            </span>
          </SectionLabel>

          <nav aria-label="다른 화면으로 이동">
            <ul className="flex flex-col">
              {destinations.map((destination) => (
                <li
                  key={destination.href}
                  className="border-b border-dotted border-line-22 last:border-b-0"
                >
                  <Link
                    href={destination.href}
                    className="group flex min-h-[var(--tap)] items-center gap-3 py-2.5"
                  >
                    <Icon
                      name={destination.icon}
                      size={16}
                      className="flex-none text-muted-50 group-hover:text-ink"
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                      <span
                        className="truncate font-display font-medium group-hover:underline group-hover:underline-offset-4 text-14"
                      >
                        {destination.label}
                      </span>
                      <span
                        className="truncate font-mono text-muted-50 text-10"
                      >
                        {destination.hint}
                      </span>
                    </span>
                    <Icon
                      name="arrow-right"
                      size={14}
                      className="flex-none text-muted-30 group-hover:text-ink"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {note ? (
            <p
              className="num border-t border-line-20 pt-[9px] text-muted-45 text-10 leading-[1.6]"
            >
              {note}
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
