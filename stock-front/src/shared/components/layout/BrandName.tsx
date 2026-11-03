/**
 * 제품 이름 **AI Of Tellers** 를 한 벌로 그린다.
 *
 * ## 왜 컴포넌트인가
 *
 * 이름이 그냥 문자열이 아니라 **AIOT 네 글자만 도드라지는 조판**이다. 그 규칙이
 * 두 군데(사주 제호 · 공용 워드마크)에 흩어지면 한쪽만 고쳐지는 날이 온다.
 *
 * ```
 * AI Of Tellers
 * ^^ ^  ^          ← A · I · O · T = AIOT
 * ```
 *
 * `Of` 의 O 를 대문자로 적는다. 소문자였을 때는 강조색이 붙어도 전치사의 일부로
 * 읽혀 약자가 눈에 들어오지 않았다.
 *
 * ## 왜 금색이 아니라 수(水) 색인가
 *
 * 처음에는 금빛 그라데이션을 글자 모양으로 잘라 넣었는데, **이미 금빛이 기본인
 * 팔레트 안에서는 강조가 배경에 묻혔다.** 사주 화면은 크림 바탕에 금색 글자이고,
 * 거기에 금색을 한 겹 더 얹는 일이었다.
 *
 * 그래서 오행 중 수(水)를 쓴다. 금빛과 가장 멀리 있는 색이라 네 글자가 또렷하게
 * 떠오르고, **팔레트 밖에서 새 색을 들여오지 않는다** — 사주 리포트가 이미 오행
 * 다섯 색을 쓰고 있어 라이트·다크 값이 둘 다 정의돼 있다(globals.css). 덕분에
 * 테마가 바뀌어도 이 파일은 아무것도 하지 않는다.
 *
 * 색만으로 의미를 전달하지는 않는다 — 강조가 보이지 않아도 읽히는 것은 똑같이
 * "AI Of Tellers" 다. 스크린리더에 조각나지 않도록 `aria-label` 은 부모 링크가 든다.
 */

const ACCENT = "font-bold text-wuxing-water";

export function BrandName({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className={ACCENT}>AI</span>
      <span className="text-muted-2"> </span>
      <span className={ACCENT}>O</span>
      <span className="text-muted-2">f </span>
      <span className={ACCENT}>T</span>
      <span className="text-muted-2">ellers</span>
    </span>
  );
}
