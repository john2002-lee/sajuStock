import {
  BiBarChartAlt2,
  BiBell,
  BiBellOff,
  BiBrain,
  BiCaretDown,
  BiCaretUp,
  BiCheck,
  BiChevronDown,
  BiCompass,
  BiFilterAlt,
  BiGridVertical,
  BiHome,
  BiLeftArrowAlt,
  BiLogIn,
  BiLogOut,
  BiMinus,
  BiDesktop,
  BiMenu,
  BiMoon,
  BiNews,
  BiPlus,
  BiRefresh,
  BiRightArrowAlt,
  BiSearch,
  BiSolidStar,
  BiSortDown,
  BiStar,
  BiSun,
  BiTerminal,
  BiUser,
  BiX,
} from "react-icons/bi";
import type { IconType } from "react-icons";

/**
 * 아이콘 프리미티브 — BoxIcons(react-icons/bi) 를 감싸는 유일한 지점.
 *
 * 핸드오프 README 161행: "아이콘은 전용 에셋 없이 텍스트 글리프로 표현했습니다.
 * 구현 시 코드베이스의 아이콘 세트로 교체하세요. 크기는 12~17px, 색은 muted 계열."
 *
 * 왜 한 파일로 묶었나
 * - 다른 모듈은 react-icons 를 직접 import 하지 않는다. 아이콘 세트를 갈아끼울 때
 *   고칠 파일이 이 하나다 (CONVENTIONS: 경계는 index.ts 로만 노출).
 * - 이름을 REGISTRY 키에서 파생시켜 오타가 타입 에러가 된다. 문자열 유니온을
 *   따로 적어두면 레지스트리와 어긋나는 순간을 아무도 못 잡는다.
 * - react-icons 컴포넌트는 훅 없는 순수 SVG 함수라 서버 컴포넌트에서 그대로
 *   렌더된다. 'use client' 가 필요 없고, 웹폰트가 아니라 FOUT/CLS 도 없다.
 *
 * 색은 currentColor 를 그대로 상속한다 — 호출부가 text-muted-50 같은 토큰
 * 클래스를 이미 쓰고 있고, 여기서 색을 박으면 반전 배경(bg-ink)에서 어긋난다.
 */
const REGISTRY = {
  search: BiSearch,
  close: BiX,
  home: BiHome,
  star: BiStar,
  "star-filled": BiSolidStar,
  ai: BiBrain,
  plus: BiPlus,
  minus: BiMinus,
  drag: BiGridVertical,
  bell: BiBell,
  "bell-off": BiBellOff,
  "caret-up": BiCaretUp,
  "caret-down": BiCaretDown,
  "arrow-left": BiLeftArrowAlt,
  "arrow-right": BiRightArrowAlt,
  "chevron-down": BiChevronDown,
  check: BiCheck,
  retry: BiRefresh,
  chart: BiBarChartAlt2,
  compass: BiCompass,
  /** 모집단을 자르는 축 (종목 탐색의 '시장' 필터) */
  filter: BiFilterAlt,
  /** 순서를 바꾸는 축. 이 서비스의 정렬은 전부 내림차순이라 down 하나면 된다 */
  "sort-desc": BiSortDown,
  /** 계정 — 제호 우측의 로그인 표시 */
  user: BiUser,
  /** 로그인·로그아웃. 좁은 화면에서는 글자 없이 이 글리프만 남는다 (AccountMenu) */
  login: BiLogIn,
  logout: BiLogOut,
  /**
   * 테마(밝기) 전환 — 해·달.
   *
   * 뷰 전환 글리프(아래 terminal·article)와 **은유가 겹치지 않아야** 한다. 둘은
   * 나란히 서는데 하는 일이 완전히 다르다: 이쪽은 색, 저쪽은 화면 구조다.
   * 라벨만으로는 구분이 안 됐다 — 한때 둘 다 "EDITORIAL" 을 표시할 수 있었다.
   */
  moon: BiMoon,
  sun: BiSun,
  /** 시스템(OS) 밝기 설정을 따름 — 테마 3단 선택 */
  monitor: BiDesktop,
  /** 햄버거 — 사주 헤더의 메뉴 트리거 */
  menu: BiMenu,
  /** 뷰(레이아웃) 전환 — 터미널 콘솔(2b) · 기사형 에디토리얼(2a) */
  terminal: BiTerminal,
  article: BiNews,
} as const satisfies Record<string, IconType>;

/** 레지스트리에 있는 이름만 허용한다 — 새 아이콘은 위에 등록해야 쓸 수 있다. */
export type IconName = keyof typeof REGISTRY;

export interface IconProps {
  name: IconName;
  /** 핸드오프 스펙 12~17px. 기본 14. */
  size?: number;
  className?: string;
  /**
   * 접근성 이름. 생략하면 장식으로 간주해 aria-hidden 이 붙는다.
   * 옆에 텍스트 라벨이 있거나 감싼 버튼에 aria-label 이 있으면 생략이 맞다 —
   * 아이콘까지 이름을 가지면 스크린리더가 같은 말을 두 번 읽는다.
   */
  label?: string;
}

export function Icon({ name, size = 14, className, label }: IconProps) {
  const Glyph = REGISTRY[name];
  return (
    <Glyph
      size={size}
      className={className}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      focusable="false"
    />
  );
}
