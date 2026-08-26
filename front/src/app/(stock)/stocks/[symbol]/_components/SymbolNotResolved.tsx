import Link from "next/link";
import { resolveCandidates } from "@/features/stock/search/server";
import { Chip } from "@/shared/ui";

/**
 * 종목 코드 정규화 실패 (와이어프레임 1d 네 번째 패널).
 *
 * notFound() 로 보내지 않는 이유: 사용자가 입력한 문자열을 화면에 남겨야
 * "이걸 못 찾았고 대신 이런 후보가 있다"를 말할 수 있는데, not-found.tsx 는
 * 그 값을 받지 못한다.
 *
 * 후보 조회는 features/search 소유라 app 계층인 여기서 두 도메인을 조합한다.
 *
 * ## 시세 칸을 지웠다
 *
 * 후보 행 오른쪽에 원화 가격과 등락률을 그리는 칸이 있었다. 그 값은 백엔드
 * 자동완성 응답에 없고 **목 데이터에만** 있어서, 실 모드에서는 늘 빈 칸이었고 목
 * 모드에서는 꾸며낸 숫자가 실서식(원화 · 등락색)으로 나갔다. 못 찾은 종목을 되묻는
 * 화면에서 가장 하면 안 되는 일이 진짜처럼 보이는 숫자를 얹는 것이다.
 *
 * `SampleFrame` 으로 '예시' 라고 밝히는 선택지도 있었지만 여기서는 틀렸다. 그 틀은
 * **언젠가 실데이터가 될 자리**에 씌우는 것이고(홈의 등락 상위가 그렇다), 이 칸은
 * 애초에 실데이터가 올 수 없는 자리다 — 자동완성 한 번에 N종목 시세를 얻으려면
 * 종목마다 상류를 불러야 한다. 그래서 표시를 고치는 대신 칸째로 지웠다.
 * 근거는 `features/search/model/types.ts` 의 `Suggestion` 주석에 있다.
 *
 * ## 후보 0건을 따로 그린다
 *
 * 예전에는 후보가 없어도 "아래 후보 중에서 골라 주세요" 를 띄우고 **빈 목록**을
 * 그렸다 — 고를 것이 없는데 고르라고 하는 화면이다. 시세와 함께 목 모드의
 * '아무거나 얹기' 폴백도 사라졌으므로(그쪽도 같은 종류의 거짓이다) 이 상태는
 * 실제로 온다.
 */
export async function SymbolNotResolved({ query }: { query: string }) {
  // 후보는 실제 종목이다 — 백엔드 자동완성을 거친다(`resolveCandidates`).
  // 서버 컴포넌트라 그대로 await 한다.
  const candidates = await resolveCandidates(query);

  return (
    <section className="flex flex-col gap-4 border-t border-line-20 pt-5">
      <p
        className="font-mono uppercase tracking-label text-muted-60 text-11"
      >
        normalize_stock_code · 실패
      </p>

      <h1
        className="font-display font-bold leading-none text-34"
      >
        <span className="num">{query}</span>
      </h1>

      <p className="text-pretty text-muted-70 text-14">
        {candidates.length > 0
          ? "6자리 코드를 찾지 못했습니다. 아래 후보 중에서 골라 주세요."
          : "6자리 코드를 찾지 못했고, 이름이 비슷한 종목도 없습니다. 종목명이나 6자리 코드로 다시 찾아 주세요."}
      </p>

      {candidates.length > 0 ? (
        <ul className="flex flex-col">
          {candidates.map((item) => (
            <li key={item.symbol}>
              <Link
                href={`/stocks/${item.code}`}
                className="flex items-center gap-3.5 border-b border-dotted border-line-22 py-3 hover:bg-surface-hover"
              >
                <span className="flex flex-1 flex-col gap-[3px]">
                  <span
                    className="font-display font-medium text-16"
                  >
                    {item.name}
                  </span>
                  <span
                    className="font-mono text-muted-50 text-11"
                  >
                    {item.nameEn ?? item.symbol}
                  </span>
                </span>
                <Chip size={10}>{item.market}</Chip>
                <span
                  className="num w-[82px] text-right font-medium text-muted-75 text-11"
                >
                  {item.symbol}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        // 상단 제호에 ⌘K 트리거가 이미 있다. 여기서는 "뜻이 있는 목록" 한 곳으로만
        // 내보낸다 — `app/not-found.tsx` 가 시가총액 상위를 쓰는 것과 같은 판단이다.
        <Link
          href="/stocks"
          className="flex items-center justify-between gap-3 border border-line-25 px-4 py-3 hover:bg-surface-hover"
        >
          <span className="font-medium text-13">
            종목 탐색으로 이동
          </span>
          <span
            className="font-mono text-muted-50 text-11"
          >
            시가총액 · 등락률 순위
          </span>
        </Link>
      )}

      <p
        className="num border-t border-line-20 pt-[9px] text-muted-45 text-10 leading-[1.6]"
      >
        normalize_stock_code · krx_symbol_to_yfinance (.KS/.KQ)
      </p>
    </section>
  );
}
