# 컨텍스트

Last Updated: 2026-09-17

## 핵심 파일

### 새로 만드는 것
| 파일 | 역할 |
|---|---|
| `front/src/features/lotto/model/random.ts` | cyrb53 문자열 해시 + mulberry32 결정적 PRNG |
| `front/src/features/lotto/model/combi.ts` | 이항계수 `C(n,r)` |
| `front/src/features/lotto/model/stats.ts` | 자리별 관측 빈도 · 순서통계량 이론 분포 |
| `front/src/features/lotto/model/generate.ts` | 순차 조건부 샘플링 · 3세트 생성 |
| `front/src/features/lotto/model/types.ts` | `Draw`, `PositionStats` |
| `front/src/features/lotto/_data/draws.json` | 1회~최신회 원본 (주간 갱신) |
| `front/src/features/lotto/components/*.tsx` | 화면 (테스트 불가 영역) |
| `front/src/app/(saju)/lotto/page.tsx` | `/lotto` — 사주 레이아웃·팔레트 공유 |

### 참고하는 기존 파일
| 파일 | 왜 |
|---|---|
| `front/src/features/saju/model/share.ts` | 주입 패턴 · 상단 설계 주석 스타일의 기준 |
| `front/src/features/saju/model/share.test.ts` | 테스트 작성 스타일의 기준 |
| `front/test/alias-hooks.mjs` | `@/` 별칭과 확장자 없는 import 해석 |
| `front/src/app/(saju)/page.tsx` | 사주 랜딩 — 하단에 로또 섹션을 붙일 자리 |

## 반드시 지킬 제약

- **라우트**: 사주가 이미 루트(`/`)다(`saju-as-main` 태스크). 로또는 `(saju)` 그룹
  **안에** 두어 `/lotto` 로 내보내고 사주 레이아웃·팔레트를 공유한다. 새 라우트
  그룹을 만들지 않는다.
- **테스트 러너 한계**: `node --test` + `src/**/*.test.ts` 글롭뿐이다. `.tsx`·DOM은
  못 돌린다. 따라서 `model/`은 **전부 순수 함수**, 환경 의존(`localStorage`,
  `Date`)은 컴포넌트에서 주입한다.
- **import 스타일**: 같은 폴더 안은 `from "./random.ts"` — 확장자를 명시한다
  (기존 테스트가 그렇게 쓴다).
- **파일 상단 주석**: 이 저장소는 "왜 이렇게 설계했는지"를 긴 한글 JSDoc으로 남긴다.
  `share.ts` 를 기준으로 맞춘다.
- **사주와 로직 결합 금지**: 로또 번호는 사주 입력값을 **일절 참조하지 않는다**.
  동선(CTA)으로만 연결한다.
- **`Math.random()` 금지**: 시드를 못 받아 결정성이 깨진다. `mulberry32` 를 쓴다.

## 의사결정 기록

- **왜 서버 생성인가** — 회차 원본이 89KB 다. 클라이언트가 조합을 만들려면 그 데이터나
  집계표를 브라우저로 보내야 하는데, 서버 컴포넌트로 두면 화면에 필요한 것은 이미 뽑힌
  번호 여섯 개뿐이다. 광고 게이트가 없으니 번호를 **숨길** 이유는 없지만, 데이터를
  **보낼** 이유도 없다. 부수 효과로 클라이언트 JS 가 0바이트다.
- **왜 시드에 방문 시각을 넣나** — "방문할 때마다 그 시각의 최신 통계로 새로" 라는 요구다.
  브라우저 식별자(localStorage·쿠키)는 쓰지 않는다 — 시각만으로 충족되고, 사주의
  "저장하지 않습니다" 약속을 건드릴 이유가 없다.
- **그래서 `revalidate = 0` 이 필수다** — 응답이 캐시되면 시각이 함께 굳어 모두가 같은
  번호를 본다. 요구가 조용히 무효가 되는 경로이므로 페이지에 명시했다. (`(saju)` 그룹은
  `AccountMenu` 의 `auth()` 때문에 어차피 동적이지만, 그 사정에 기대지 않는다.)
- **왜 3세트 중복 4개+ 를 리롤하나** — 세트끼리 비슷하면 3개를 주는 의미가 없다.
  두 조합이 4개 이상 겹칠 확률은 0.139% 라, 가드를 검증하려면 테스트가 수천 회차를
  훑어야 한다(40회차만 보면 가드를 지워도 통과한다 — 실측).

## 데이터 출처

- 엔드포인트: `GET https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do?srchDir=center&srchLtEpsd={회차}`
  (1회 호출당 10회차 반환). 구 `common.do` · `gameResult.do` 는 폐기됐다.
- **동시 요청하면 IP가 차단된다**(실측). 주 1회 신규 회차 1건만 호출한다.
- 헤더 필수: `User-Agent`(브라우저), `Referer: .../lt645/result`
- 원본 스냅샷: `C:\02.창업\07.lotto\로또_당첨번호_전체회차.xlsx` (1~1241회)
- 회차별 추첨기·볼세트 정보는 **어디에도 공개되지 않는다**.
