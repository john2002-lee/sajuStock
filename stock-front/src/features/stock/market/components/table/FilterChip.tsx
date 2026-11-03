import Link from "next/link";

export interface FilterChipProps {
  /** 이 칩을 눌렀을 때 갈 주소. model 의 `rankingHref`·`screenerHref` 가 만든 것이다 */
  href: string;
  label: string;
  selected: boolean;
}

/**
 * 필터·조건 칩 하나. `<button>` 이 아니라 **링크**다.
 *
 * 상태가 URL 에 있으므로 칩은 주소를 바꾸는 것 외에 하는 일이 없다. 링크로 두면 이
 * 화면 전체가 서버 컴포넌트로 남고(클라이언트 번들 0), 공유 가능한 주소와 뒤로가기·
 * 새 탭으로 열기가 공짜로 따라온다.
 *
 * 선택 상태는 반전 solid 다 — 검색 팔레트 모드 칩과 같은 규칙.
 * 색만으로 상태를 말하지 않도록 `aria-current` 를 함께 붙인다.
 *
 * 모바일에서만 44px 히트 영역을 잡는다 (WCAG 2.5.5). 데스크탑에서 `min-h-0` 으로
 * 푸는 것은 마우스에는 그 높이가 필요 없고, 툴바 한 줄이 44px 로 부풀면 검색
 * 필드와 높이가 어긋나기 때문이다.
 */
export function FilterChip({ href, label, selected }: FilterChipProps) {
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      // 알약이다. 칩은 **누를 수 있는 값**이고, 각진 칸은 이 화면에서 표를 뜻한다 —
      // 필터 줄이 표와 같은 모양이면 어디까지가 컨트롤인지 경계가 흐려진다.
      // 활성의 반전 solid 는 그대로 둔다: 색 규약은 검색 팔레트 모드 칩과 같다.
      className={`flex min-h-[var(--tap)] items-center rounded-full border px-[13px] py-[7px] font-medium md:min-h-0 ${
        selected
          ? "border-ink bg-ink text-on-ink"
          : "border-line-28 hover:bg-surface"
      } text-13`}
    >
      {label}
    </Link>
  );
}
