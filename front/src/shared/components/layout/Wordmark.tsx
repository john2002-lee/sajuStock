import Link from "next/link";

/**
 * 서비스명 워드마크 겸 홈 버튼. 모든 화면 좌상단에 같은 자리·같은 모양으로 놓인다.
 *
 * 이미지·SVG 가 아니라 텍스트다 — 제호(Masthead)가 이미 Noto Serif KR 로
 * 조판돼 있고, 같은 글자를 이미지로 다시 만들면 테마 반전 때 색이 따라오지 않는다.
 * 색은 `text-ink` 하나로 두어 라이트/터미널 모두 배경 대비 전경색을 그대로 받는다.
 *
 * variant
 *  - "masthead" 신문 제호. 3b 홈·2a 상세·4b 관심종목 헤더용 (모바일 20 → 데스크탑 24px)
 *  - "compact"  좁은 바 안에 들어가는 한 줄 (2b 콘솔 상단 바·모바일 팔레트 헤더)
 */
export function Wordmark({
  variant = "masthead",
  caption,
  href = "/",
}: {
  variant?: "masthead" | "compact";
  caption?: string;
  /**
   * 눌렀을 때 갈 곳. 기본은 서비스 선택 화면(`/`)이고, 서비스 안쪽 화면은
   * **자기 서비스 홈**을 준다 — 주식은 `/stock`, 사주는 `/saju`.
   *
   * 전부 `/` 로 두는 안을 먼저 검토했다가 접었다. `/stocks/005930` 을 보던 사람이
   * 제호를 누르면 "어느 서비스를 쓰시겠습니까" 가 뜨는데, 그 사람은 서비스를
   * 바꾸겠다고 한 적이 없다. 서비스 선택으로 가는 길은 푸터의 이동 줄에 있다
   * (`Footer.tsx` 의 '서비스 이동 줄' 절).
   */
  href?: string;
}) {
  if (variant === "compact") {
    return (
      <Link
        href={href}
        aria-label="종목 원장 홈으로"
        // -mx/-my 로 히트 영역만 44px 로 넓히고 글자 위치는 그대로 둔다.
        // 좁은 바 안에서 min-h-11 을 그냥 주면 바 높이가 같이 늘어난다.
        className="-my-2 flex min-h-[var(--tap)] items-center py-2 text-ink"
      >
        <span
          className="font-display font-bold leading-none tracking-[-0.01em] text-20"
        >
          종목 원장<span className="text-up">.</span>
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-label="종목 원장 홈으로"
      // min-w-0: 마스트헤드 우측 덩어리(검색·토글·액션)와 폭을 다툴 때 이쪽이
      // 먼저 줄어들 수 있게 한다. 없으면 캡션 길이만큼 헤더가 밀려 나간다.
      className="-my-1 flex min-w-0 min-h-[var(--tap)] flex-col justify-center gap-[3px] py-1 text-ink"
    >
      <span className="whitespace-nowrap font-display font-bold leading-none tracking-[-0.01em] text-20 md:text-26">
        종목 원장<span className="text-up">.</span>{" "}
        <span className="font-mono tracking-[0.02em] text-muted-50 text-13 md:text-16">
          The Stock Ledger
        </span>
      </span>
      {caption ? (
        // 캡션은 잘려도 되는 부가 정보다 — 시세 지연 고지가 길어져도 제호가 접히거나
        // 우측 컨트롤을 화면 밖으로 밀지 않는다.
        <span
          className="truncate font-mono uppercase leading-none tracking-label-wide text-muted-50 text-11"
        >
          {caption}
        </span>
      ) : null}
    </Link>
  );
}
