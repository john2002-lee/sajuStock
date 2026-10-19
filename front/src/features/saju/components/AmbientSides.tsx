/**
 * 첫 화면 좌우의 분위기 그림 — 반투명하고 흐릿하게, 본문 **뒤에** 깔린다.
 *
 * ## 왜 이렇게 만들었나
 *
 * - **넓은 화면에서만** 보인다(`xl` 이상, globals.css `.saju-ambient`). 본문 폭이
 *   `max-w-5xl` 라 그보다 좁은 화면에는 좌우 여백이 없고, 그림이 글자 밑으로 들어가면
 *   읽기만 어렵다.
 * - 흐림은 **파일에 구워 넣었다**(`public/ambient/*.webp`). CSS `filter: blur()` 를
 *   화면 크기 고정 요소에 걸면 스크롤마다 다시 그려 저사양 기기가 버벅인다.
 * - 가장자리는 마스크로 녹인다 — 안쪽(본문 쪽)과 위아래로 투명해져 경계가 없다.
 * - 장식이라 `aria-hidden`, 클릭을 막지 않게 `pointer-events: none`.
 *
 * 레이아웃 래퍼가 `isolate` 여야 이 층이 래퍼 배경 **위**, 본문 **아래** 에 놓인다
 * (`app/(saju)/layout.tsx`).
 */
export function AmbientSides() {
  return (
    <>
      <div aria-hidden className="saju-ambient saju-ambient--left" />
      <div aria-hidden className="saju-ambient saju-ambient--right" />
    </>
  );
}
