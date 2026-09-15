"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ApiError, bff } from "@/lib/http/browser";
import { SAJU_EVENT } from "@/shared/analytics/events";
import { identifyUser } from "@/shared/analytics/track";
import type { BirthPlace } from "../model/types";
import { loadReading, saveReading } from "../model/storage";
import { trackSaju } from "../model/analytics";
import {
  markTime,
  setChartContext,
  secondsSince,
  setRootPathOnce,
  setTimeUnknown,
} from "../model/analytics-context";
import {
  kstDate,
  rootPathFromReferrer,
  toDayMaster,
  toDominantElement,
} from "../model/analytics-values";
import { fromBirthInput, toReading, type WireReading } from "../services/wire";
import { BirthForm, type BirthFormValues } from "./BirthForm";

/**
 * 입력 화면 — 사주 서비스의 첫 화면.
 *
 * ## 레이아웃: 모바일 한 줄 · 데스크톱 두 단
 *
 * 원본 SajuService 는 폭 448px 한 단이었다. 모바일에서는 옳지만 넓은 화면에서는
 * 화면의 3분의 2가 비고 **폼이 접힘 아래로 밀린다** — 이 화면에서 사람이 하러 온
 * 일이 폼 하나인데 그것이 안 보이는 상태로 시작한다.
 *
 * `lg` 부터 두 단으로 나눈다. 왼쪽은 무엇을 하는 곳인지, 오른쪽은 그 일. 소스
 * 순서는 **제목 → 폼 → 신뢰 항목**이라, 한 단으로 접히는 모바일에서 폼이 곧바로
 * 이어진다(신뢰 항목이 폼 앞을 막지 않는다).
 *
 * ## 제목의 줄바꿈을 브라우저에 맡기지 않는다
 *
 * "당신의 사주팔자, 정확하게 읽습니다" 는 폭에 따라 갈라지는 자리가 달라진다.
 * `word-break: keep-all`(globals.css 의 사주 스코프)이 어절 중간에서 끊는 것은
 * 막지만, 그래도 "당신의 사주팔자, 정확하게 / 읽습니다" 처럼 쉼표를 무시한 자리에서
 * 갈릴 수 있다. 히어로 문구는 **의도한 자리에서만** 끊겨야 하므로 두 줄을 각각
 * 블록으로 둔다 — 어느 폭에서도 같은 모양이다.
 */

/**
 * 영문 라벨은 장식용 키커다. **길이를 셋이 비슷하게 맞춘다** — 모바일에서 3열로
 * 서는데, 하나만 길면(예전의 "TRUE SOLAR TIME") 그 칸에서만 두 줄로 접혀 아래
 * 제목들의 기준선이 어긋난다.
 */
const TRUST_ITEMS = [
  { label: "SOLAR TIME", title: "진태양시 보정", detail: "경도·균시차·서머타임까지" },
  { label: "NO SIGN-UP", title: "회원가입 불필요", detail: "무료로 보는 동안은 저장하지 않습니다" },
  { label: "INSTANT", title: "바로 확인", detail: "여덟 글자는 계산 즉시" },
];

export function SajuEntry({ places }: { places: BirthPlace[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 이 세션에서 몇 번째 제출인가. **컴포넌트 상태가 아니라 ref 다** — 이 값이
   * 바뀐다고 화면이 달라질 것이 없고, `setState` 로 두면 제출할 때마다 폼 전체가
   * 한 번 더 렌더된다.
   */
  const submitCount = useRef(0);

  // 진입 계측. 빈 의존성 배열이라 마운트당 한 번이고, StrictMode 의 두 번째
  // 실행에서는 `setRootPathOnce` 가 앞의 값을 지키므로 첫 진입 문이 흔들리지 않는다.
  useEffect(() => {
    const rootPath = rootPathFromReferrer(document.referrer, window.location.origin);
    setRootPathOnce(rootPath);
    markTime("entry_viewed");
    trackSaju(SAJU_EVENT.entryViewed, { is_returning: loadReading() !== null });

    // `setOnce` 라 두 번째 방문이 첫 값을 덮지 않는다. 코호트의 기준선이 흔들리면
    // 리텐션 차트 전체가 조용히 틀려진다.
    identifyUser({ setOnce: { first_seen_at: kstDate(), first_root_path: rootPath } });
  }, []);

  async function handleSubmit(values: BirthFormValues) {
    setPending(true);
    setError(null);

    const retryIndex = submitCount.current;
    submitCount.current += 1;

    // 시각 모름 여부는 **제출 이벤트보다 먼저** 컨텍스트에 넣는다. 그래야 이
    // 이벤트부터 퍼널 끝까지 같은 값이 실린다.
    setTimeUnknown(values.hour === null);
    markTime("birth_submitted");

    const calendarType = values.isLunar ? "lunar" : "solar";
    trackSaju(SAJU_EVENT.birthSubmitted, {
      calendar_type: calendarType,
      is_leap_month: values.isLeapMonth,
      gender: values.gender,
      // 출생지 **코드가 아니라 골랐는지 여부**만 보낸다. 진태양시 보정의 실사용도를
      // 재는 데는 이것으로 충분하고, 코드는 역산의 재료가 된다.
      has_birth_place: Boolean(values.birthPlaceCode),
      form_seconds: secondsSince("entry_viewed"),
      retry_index: retryIndex,
    });

    const startedAt = Date.now();
    try {
      const wire = await bff.post<WireReading>("/api/saju/chart", fromBirthInput(values));
      if (!wire) throw new Error("빈 응답");
      const reading = toReading(wire);

      // 일간·오행도 **계산 이벤트보다 먼저** 넣어야 이 이벤트에 실린다.
      const dayMaster = toDayMaster(reading.chart.dayMaster);
      const dominantElement = toDominantElement(reading.chart.visibleWuxing);
      if (dayMaster && dominantElement) {
        setChartContext({ day_master: dayMaster, dominant_element: dominantElement });
      }
      trackSaju(SAJU_EVENT.chartCalculated, { elapsed_ms: Date.now() - startedAt });
      // 한 기기로 몇 사람의 사주를 보는가. 이 값이 1보다 크다는 사실이 일간·성별을
      // 유저 프로퍼티로 두면 안 되는 이유의 근거다.
      identifyUser({ add: { saju_chart_count: 1 } });

      saveReading({ birth: values, reading });
      router.push("/saju/teaser");
    } catch (err) {
      trackSaju(SAJU_EVENT.chartFailed, {
        // 서버가 준 코드가 없으면 백엔드에 닿지도 못한 것이다. 그 둘은 고치는
        // 사람이 다르므로 값으로 갈라 둔다.
        error_code: err instanceof ApiError ? err.code : "network",
        http_status: err instanceof ApiError ? err.status : 0,
        elapsed_ms: Date.now() - startedAt,
        calendar_type: calendarType,
      });
      setError(
        err instanceof ApiError
          ? err.message
          : "사주를 계산하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
      // `pending` 해제는 실패했을 때만 한다. 성공하면 곧바로 이동하므로, 여기서
      // 풀어 주면 화면이 사라지기 직전에 버튼이 한 번 깜빡인다.
      setPending(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-6 sm:py-14 lg:py-20">
      {/* 두 단의 폭을 고정값(420px)으로 잡는다. `1fr 1fr` 로 두면 넓은 화면에서
          폼이 같이 늘어나 입력 칸 하나가 200px 을 넘는데, 두 자리 숫자를 받는
          칸으로는 우스운 폭이다. */}
      <div className="grid gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start lg:gap-x-16">
        <header className="text-center lg:col-start-1 lg:row-start-1 lg:pt-2 lg:text-left">
          <p className="font-mono-kr text-[10px] tracking-[0.22em] text-gold-text">SAJU</p>

          <h1 className="mt-3 font-display text-[30px] font-light leading-[1.25] text-ink sm:text-[38px] lg:text-[44px]">
            <span className="block">당신의 사주팔자,</span>
            <span className="block text-gold-text">정확하게 읽습니다</span>
          </h1>

          {/* `text-pretty` 는 마지막 줄에 한 단어만 남는 것을 줄인다. 한국어에서도
              어절 단위로 동작하므로 `keep-all` 과 함께 쓸 수 있다. */}
          <p className="mx-auto mt-5 max-w-[26rem] text-pretty text-[15px] leading-relaxed text-muted lg:mx-0">
            태어난 시각을 진태양시로 바로잡아 계산합니다. 시계와 해가 어긋난 만큼을
            되돌려야 시주가 제자리를 찾습니다.
          </p>

          <p className="mt-4 text-[13px] leading-relaxed text-muted-2">
            어떻게 계산하는지 궁금하시면{" "}
            <Link
              href="/saju/intro"
              className="text-gold-text underline underline-offset-2 hover:text-gold-text-strong"
            >
              서비스 소개
            </Link>
            를 먼저 보셔도 좋습니다.
          </p>
        </header>

        {/* 폼. `lg:row-span-2` 로 왼쪽 두 블록(제목·신뢰) 전체 높이를 마주 본다. */}
        <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <BirthForm places={places} pending={pending} error={error} onSubmit={handleSubmit} />
        </div>

        {/* 신뢰 항목. 모바일에서는 폼 **다음**이다 — 처음 온 사람이 읽어야 할 것은
            보증 문구가 아니라 입력 칸이고, 보증은 채우다 멈칫할 때 눈에 들어오면
            된다. 데스크톱에서는 왼쪽 단 아래에 세로로 선다. */}
        <ul className="grid grid-cols-3 gap-3 border-t border-hairline pt-8 lg:col-start-1 lg:row-start-2 lg:mt-2 lg:grid-cols-1 lg:gap-5 lg:border-t-0 lg:pt-0">
          {TRUST_ITEMS.map((item) => (
            <li
              key={item.label}
              className="flex flex-col items-center gap-2 text-center lg:flex-row lg:items-start lg:gap-3.5 lg:text-left"
            >
              <span
                aria-hidden
                className="flex h-9 w-9 flex-none items-center justify-center rounded-pill bg-surface-warm text-[15px] text-gold-text-strong shadow-card-sm"
              >
                ✓
              </span>
              <span className="min-w-0">
                <span className="block font-mono-kr text-[9.5px] tracking-[0.12em] text-muted-3 lg:text-[10px]">
                  {item.label}
                </span>
                <span className="mt-0.5 block text-[12px] text-ink-body lg:text-[13.5px]">
                  {item.title}
                </span>
                {/* 모바일 3열에서는 설명까지 넣으면 글자가 두세 줄로 접혀 칸이
                    무너진다. 세로로 서는 lg 에서만 보인다. */}
                <span className="mt-1 hidden text-[12px] leading-relaxed text-muted-2 lg:block">
                  {item.detail}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
