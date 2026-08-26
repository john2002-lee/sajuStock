import Image from "next/image";

/**
 * 사주 서비스의 무당 캐릭터.
 *
 * 작가가 그린 캐릭터 시트에서 잘라낸 일곱 컷을 쓴다. 컷 하나가 22KB WebP 이고
 * 일곱 장 합쳐 154KB 라, 리포트 한 편에 수십 번 등장해도 "뷰당 메가바이트" 가
 * 되지 않는다.
 *
 * 표정은 시트에 실제로 있는 일곱 포즈와 **1:1** 이다. 그림 없는 표정을 가리키는
 * 타입은 호출부를 조용히 어긋나게 만들므로 추가하지 않는다.
 *
 * 춤은 여기 없다. 여덟 프레임 스프라이트가 필요해 `ShamanDance` 로 나갔다 —
 * 정지 컷 하나를 기울이는 것으로는 점프도 회전도 만들 수 없다.
 *
 * 배경은 시트의 베이지를 그대로 둔다. 투명하게 따내면 그라데이션과 반짝이 때문에
 * 가장자리가 지저분해지고, 무엇보다 이 화면은 웹툰이라 컷마다 배경이 있는 편이
 * 형식에 맞는다.
 */

export type ShamanExpression =
  /** 미소 + 손바닥을 펴서 안내. 인사, 섹션 열기, 마무리 조언. */
  | "welcome"
  /** 눈을 감고 눈물. 어렵고 아픈 대목. */
  | "sad"
  /** 가슴에 손, 걱정스러운 눈썹. 단서를 달거나 망설일 때. */
  | "concern"
  /** 눈을 감고 크게 웃음. 좋은 흐름. */
  | "joy"
  /** 팔짱 + 관자놀이의 화 표시. 경고. */
  | "stern"
  /** 손을 들고 말하는 중. 기본값이자 강조. */
  | "speak"
  /** 검지를 세움. 사주의 사실을 짚어 설명할 때. */
  | "point";

/**
 * 스크린리더용 설명.
 *
 * 표정마다 다르게 읽는 이유: 이 화면에서 표정은 장식이 아니라 글의 정서와 연동돼
 * 있다. 전부 "무당 그림" 이라고만 읽어 주면 눈으로 보는 사람이 받는 정보의 절반이
 * 사라진다.
 */
const ALT: Record<ShamanExpression, string> = {
  welcome: "무당이 손을 펴 반기며 웃고 있다",
  sad: "무당이 눈을 감고 안타까워하고 있다",
  concern: "무당이 가슴에 손을 얹고 걱정스러운 표정을 짓고 있다",
  joy: "무당이 환하게 웃고 있다",
  stern: "무당이 팔짱을 끼고 엄한 표정을 짓고 있다",
  speak: "무당이 손을 들고 말하고 있다",
  point: "무당이 검지를 세워 짚어 설명하고 있다",
};

/**
 * 잘라낸 컷의 원본 픽셀 크기. 일곱 장 모두 같은 캔버스라 서로 바꿔 끼워도
 * 레이아웃이 흔들리지 않는다. `next/image` 에 그대로 넘겨 CLS 를 막는다.
 */
const NATURAL_WIDTH = 470;
const NATURAL_HEIGHT = 460;

export interface ShamanProps {
  expression?: ShamanExpression;
  className?: string;
  /** 한 섹션 안에서 이어지는 컷에 설정한다. 스크린리더가 그녀를 한 번만 만나도록. */
  decorative?: boolean;
  /**
   * 첫 화면에 보이는 컷에만 설정한다.
   *
   * 기본값이 lazy 인 이유는 리포트 한 편에 컷이 수십 개 붙기 때문인데, 페이지 맨
   * 위의 인사 컷까지 lazy 로 두면 정작 사람이 제일 먼저 보는 그림이 제일 늦게 뜬다.
   */
  eager?: boolean;
}

export function Shaman({
  expression = "speak",
  className,
  decorative = false,
  eager = false,
}: ShamanProps) {
  return (
    <Image
      src={`/shaman/${expression}.webp`}
      width={NATURAL_WIDTH}
      height={NATURAL_HEIGHT}
      // 장식용 반복 컷은 빈 alt 로 접근성 트리에서 빠진다. `aria-hidden` 을 함께
      // 주지 않는 이유는 빈 alt 만으로 충분하기 때문이다.
      alt={decorative ? "" : ALT[expression]}
      className={className}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      draggable={false}
      // 시트를 자를 때 이미 최종 크기의 WebP 로 뽑아 뒀다. 다시 최적화를 돌리면
      // 이미지 변환 횟수만 쓰고 얻는 것이 없다.
      unoptimized
    />
  );
}
