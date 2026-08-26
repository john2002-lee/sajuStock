/**
 * 무당춤 — 추가 질문의 답을 기다리는 동안만 재생한다.
 *
 * 이것만 `Shaman` 과 다른 자산을 쓴다. `Shaman` 은 정지 컷 일곱 장 중 하나를
 * `<Image>` 로 그리지만, 춤은 여덟 프레임을 이어 붙인 스프라이트 스트립을
 * `background-position` 으로 넘긴다. 그래서 `<img>` 가 아니라 배경을 가진 `<div>` 다.
 *
 * 처음에는 정지 컷 하나를 CSS 로 좌우로 기울이는 방식이었다. 그건 흔들릴 뿐 춤이
 * 아니었다 — 점프도 회전도 그림 안에 없으니 만들어 낼 수가 없었다.
 *
 * 프레임 정렬의 핵심 두 가지:
 *  - 모든 프레임을 **같은 바닥선**에 맞춰 잘랐다. 그래야 점프가 진짜 도약으로
 *    읽힌다. 잉크 경계로 맞췄다면 매 프레임 상하로 떨려 점프가 잡음에 묻힌다.
 *  - 가로는 **갓 중심** 기준이다. 부채가 뻗은 프레임에서 바운딩 박스로 맞추면
 *    몸통이 옆으로 밀린다.
 */

/** 스트립의 프레임 수. `steps()` 와 `background-size` 가 이 값에 함께 묶여 있다. */
const FRAMES = 8;
/** 잘라낸 프레임 하나의 원본 픽셀 크기. */
const FRAME_W = 279;
const FRAME_H = 508;

export interface ShamanDanceProps {
  /** 표시 폭(px). 높이는 원본 비율로 따라간다. */
  width?: number;
  className?: string;
}

export function ShamanDance({ width = 92, className }: ShamanDanceProps) {
  const height = Math.round((width * FRAME_H) / FRAME_W);
  return (
    <div
      className={["animate-mudang", className].filter(Boolean).join(" ")}
      style={{
        width,
        height,
        // 스트립 전체를 프레임 수만큼 늘려 놓고 한 칸씩 밀어 낸다.
        backgroundImage: "url(/shaman/dance-strip.webp)",
        backgroundSize: `${width * FRAMES}px ${height}px`,
        backgroundRepeat: "no-repeat",
        // 스텝 폭을 **픽셀로** 넘긴다. `background-position` 의 퍼센트는 요소 너비가
        // 아니라 (요소 너비 - 배경 너비) 기준이라, 여기서 `-100%` 는 프레임 하나가
        // 아니라 반대 방향으로 한참 어긋난다.
        ["--dance-strip-w" as string]: `${width * FRAMES}px`,
      }}
      // 장식이 아니다: 이 그림이 "기다리는 중" 이라는 상태를 전한다. 다만 옆의
      // "점 치는 중…" 문구가 같은 것을 말하므로, 스크린리더에는 그쪽만 읽히도록
      // 여기서는 빼 둔다 — 둘 다 읽으면 같은 말을 두 번 듣는다.
      aria-hidden
    />
  );
}
