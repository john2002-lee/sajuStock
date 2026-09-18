/**
 * 번호 여섯 개를 공으로 그린다.
 *
 * ## 왜 고정 크기가 아니라 6열 그리드인가
 *
 * 처음에는 `h-10 w-10` 짜리 공을 `flex-wrap` 으로 늘어놓았다. 375px 화면에서
 * 마지막 공이 다음 줄로 떨어졌다 — 필요한 폭이 280px 인데 카드 안에 남는 폭이
 * 277px 이었다. **3px 때문에 조합 하나가 두 줄로 쪼개진다.** 여섯 개가 한 줄에
 * 있어야 한 조합으로 읽히므로, 줄바꿈은 여기서 가장 큰 결함이다.
 *
 * 그래서 폭을 고정하지 않는다. `grid-cols-6` 이 남는 폭을 여섯으로 나누고
 * `aspect-square` 가 높이를 폭에 맞추므로, 어떤 화면에서도 **한 줄에 여섯 개** 이고
 * 공은 원형을 유지한다. 320px 화면에서는 지름이 35px 쯤으로 줄고 그 이상에서는
 * `max-w` 가 상한을 잡는다(넓은 화면에서 공이 비대해지지 않게).
 *
 * ## 왜 로또 고유의 번호대 색(노랑·파랑·빨강·회색·초록)을 쓰지 않나
 *
 * 그 다섯 색은 사주 팔레트에 없다. 억지로 넣으면 같은 화면 안에서 색 언어가 둘로
 * 갈리고, 로또 칸만 다른 사이트에서 오려 붙인 것처럼 보인다. `(saju)` 셸의
 * `data-service="saju"` 가 켜는 팔레트를 그대로 입는 편이 낫다 — 금빛 하나로
 * 통일하고, 구분이 필요한 것은 색이 아니라 자리(순서)다.
 *
 * 토큰만 쓰므로 라이트·다크가 저절로 따라온다. 사주 팔레트는
 * `[data-theme="terminal"] [data-service="saju"]` 에서 같은 이름으로 다시
 * 선언되기 때문이다(globals.css).
 *
 * ## 숫자에 등폭 글꼴
 *
 * 세로로 놓인 세 세트의 숫자가 자리마다 폭이 다르면 열이 어긋나 보인다. `1` 과
 * `44` 가 같은 칸을 차지해야 한다.
 */
export function NumberBalls({ numbers }: { numbers: readonly number[] }) {
  return (
    <ul className="grid w-full max-w-[19rem] grid-cols-6 gap-1.5 sm:gap-2">
      {numbers.map((number) => (
        <li
          key={number}
          className="flex aspect-square items-center justify-center rounded-pill bg-gold-gradient font-mono-kr text-[13px] font-bold text-on-primary shadow-daymaster sm:text-[15px]"
        >
          {number}
        </li>
      ))}
    </ul>
  );
}
