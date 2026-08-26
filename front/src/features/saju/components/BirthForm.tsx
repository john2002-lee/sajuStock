"use client";

import { useState, type FormEvent } from "react";
import type { BirthPlace, Gender } from "../model/types";
import { PillToggle } from "./PillToggle";

/**
 * 생년월일시 입력 카드.
 *
 * 양력/음력 pill, 년·월·일 3열 + 시·분 2열(밑줄 입력), "태어난 시간을 몰라요"
 * 체크박스 + 힌트, 성별 pill, 출생지 select, CTA.
 *
 * 라벨은 보이는 글자이면서 동시에 **접근성 이름**이다(`<label htmlFor>`), 그래서
 * 영문 캡션(YEAR/MONTH/DAY)이 아니라 한국어 짧은 형태를 쓴다.
 *
 * 검증은 **백엔드에 있다.** 여기서 다시 구현하지 않는 이유: 규칙이 사주 엔진이
 * 보증하는 범위(1920년 이후, 존재하는 날짜, 실재하는 윤달…)와 정확히 맞아야 하는데
 * 두 벌이 되면 한쪽만 고치는 순간 화면과 서버가 어긋난다. 여기서는 **입력 자체를
 * 불가능하게** 만드는 것(min/max, select)만 하고 나머지는 서버 문장을 그대로 띄운다.
 */

/** 제품이 받는 가장 이른 해. 백엔드 `EARLIEST_ACCEPTED` 와 같은 값이다. */
const EARLIEST_YEAR = 1920;

export interface BirthFormValues {
  year: number;
  month: number;
  day: number;
  hour: number | null;
  minute: number | null;
  isLunar: boolean;
  isLeapMonth: boolean;
  gender: Gender;
  birthPlaceCode: string;
}

export interface BirthFormProps {
  places: BirthPlace[];
  pending: boolean;
  /** 서버가 준 실패 문장. 그대로 띄운다. */
  error: string | null;
  onSubmit: (values: BirthFormValues) => void;
}

const FIELD_LABEL_CLASS =
  "mb-0.5 block font-mono-kr text-[10.5px] tracking-[0.12em] text-gold-text";

/**
 * 밑줄 입력.
 *
 * `min-h-[var(--tap)]` 은 터치 히트 영역 44px 최소치다(WCAG 2.5.5). 예전 `py-2` 는
 * 글자 높이를 더해도 40px 언저리라 모자랐고, 좁은 칸 셋이 나란히 선 자리라 특히
 * 빗나가기 쉬웠다.
 *
 * 스피너는 `globals.css` 의 사주 스코프에서 감춘다(그쪽 주석에 이유가 있다).
 */
const FIELD_INPUT_CLASS =
  "field-underline w-full min-h-[var(--tap)] bg-transparent py-2 text-[17px] text-ink outline-none " +
  "transition-colors focus:border-gold-accent disabled:text-muted-3 disabled:opacity-60";

const CHECKBOX_CLASS = "h-4 w-4 flex-none accent-gold-accent";

/**
 * 휠 스크롤이 값을 바꾸지 못하게 한다.
 *
 * `type="number"` 는 포커스된 상태에서 휠을 받으면 값을 올리고 내린다. 스피너를
 * 감춰도 이 동작은 남아서, **연도 칸에 커서를 둔 채 페이지를 스크롤하면 생년이
 * 조용히 달라진다.** 그러고도 화면은 정상으로 보이므로 사용자는 잘못 계산된 사주를
 * 받고 이유를 모른다.
 *
 * 포커스를 떼는 방식이라 값을 바꾸는 정상 경로(타이핑·화살표)는 그대로다.
 */
function blurOnWheel(event: React.WheelEvent<HTMLInputElement>) {
  event.currentTarget.blur();
}

export function BirthForm({ places, pending, error, onSubmit }: BirthFormProps) {
  const [isLunar, setIsLunar] = useState(false);
  const [isLeapMonth, setIsLeapMonth] = useState(false);
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [hour, setHour] = useState("");
  const [minute, setMinute] = useState("");
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [gender, setGender] = useState<Gender>("M");
  const [birthPlaceCode, setBirthPlaceCode] = useState(places[0]?.code ?? "SEOUL");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      year: Number(year),
      month: Number(month),
      day: Number(day),
      // 시와 분은 **둘 다 있거나 둘 다 없다.** 한쪽만 보내면 서버가 422 로 막는데,
      // 그 이유는 엔진이 나머지를 임의 기본값으로 채워 그럴듯하지만 틀린 시주를
      // 만들기 때문이다.
      hour: timeUnknown || hour === "" ? null : Number(hour),
      minute: timeUnknown || minute === "" ? null : Number(minute),
      isLunar,
      // 양력이면 윤달은 의미가 없다. 체크가 남아 있으면 서버가 거부한다.
      isLeapMonth: isLunar && isLeapMonth,
      gender,
      birthPlaceCode,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      // `lg:sticky` — 데스크톱에서 왼쪽 단이 길어져도 폼이 화면에 남는다.
      className="w-full rounded-card bg-surface p-5 shadow-card sm:p-7 lg:sticky lg:top-8"
    >
      <h2 className="font-display text-[21px] font-normal text-ink sm:text-[22px]">
        생년월일시를 입력해 주세요
      </h2>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-2">
        네 가지만 있으면 됩니다. 시각을 모르면 비워 두셔도 좋습니다.
      </p>

      <div className="mt-6">
        <PillToggle
          groupLabel="달력 종류"
          value={isLunar ? "lunar" : "solar"}
          onChange={(v) => setIsLunar(v === "lunar")}
          options={[
            { value: "solar", label: "양력" },
            { value: "lunar", label: "음력" },
          ]}
        />
      </div>

      {/* 좁은 화면에서 3열 사이 간격을 줄인다. 320px 기기에서 `gap-4` 는 칸 하나를
          70px 아래로 밀어 네 자리 연도가 잘린다. */}
      <div className="mt-5 grid grid-cols-3 gap-2.5 sm:gap-4">
        <div>
          <label htmlFor="birth-year" className={FIELD_LABEL_CLASS}>
            년
          </label>
          <input
            id="birth-year"
            type="number"
            inputMode="numeric"
            // 다른 필드는 모두 범위를 갖고 있다. 이것만 없으면 범위 밖 연도가
            // 왕복 한 번을 돈 뒤에야 400 으로 드러난다.
            min={EARLIEST_YEAR}
            placeholder="1990"
            required
            value={year}
            onChange={(e) => setYear(e.target.value)}
            onWheel={blurOnWheel}
            className={FIELD_INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="birth-month" className={FIELD_LABEL_CLASS}>
            월
          </label>
          <input
            id="birth-month"
            type="number"
            inputMode="numeric"
            min={1}
            max={12}
            placeholder="5"
            required
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            onWheel={blurOnWheel}
            className={FIELD_INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="birth-day" className={FIELD_LABEL_CLASS}>
            일
          </label>
          <input
            id="birth-day"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            placeholder="15"
            required
            value={day}
            onChange={(e) => setDay(e.target.value)}
            onWheel={blurOnWheel}
            className={FIELD_INPUT_CLASS}
          />
        </div>
      </div>

      {/* 윤달은 음력일 때만 뜬다 — 양력에 붙으면 서버가 거부하는 조합이 화면에
          존재하게 된다. */}
      {isLunar && (
        <label
          htmlFor="leap-month"
          className="mt-3 flex min-h-[var(--tap)] cursor-pointer items-center gap-2.5 text-[13.5px] text-ink-body"
        >
          <input
            id="leap-month"
            type="checkbox"
            checked={isLeapMonth}
            onChange={(e) => setIsLeapMonth(e.target.checked)}
            className={CHECKBOX_CLASS}
          />
          윤달
        </label>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-4">
        <div>
          <label htmlFor="birth-hour" className={FIELD_LABEL_CLASS}>
            시
          </label>
          <input
            id="birth-hour"
            type="number"
            inputMode="numeric"
            min={0}
            max={23}
            placeholder="9"
            disabled={timeUnknown}
            value={hour}
            onChange={(e) => setHour(e.target.value)}
            onWheel={blurOnWheel}
            className={FIELD_INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="birth-minute" className={FIELD_LABEL_CLASS}>
            분
          </label>
          <input
            id="birth-minute"
            type="number"
            inputMode="numeric"
            min={0}
            max={59}
            placeholder="30"
            disabled={timeUnknown}
            value={minute}
            onChange={(e) => setMinute(e.target.value)}
            onWheel={blurOnWheel}
            className={FIELD_INPUT_CLASS}
          />
        </div>
      </div>

      {/* 라벨 전체가 히트 영역이다 — 체크박스 16px 만 누를 수 있으면 모바일에서
          매번 빗나간다. */}
      <label
        htmlFor="time-unknown"
        className="mt-1 flex min-h-[var(--tap)] cursor-pointer items-center gap-2.5 text-[13.5px] text-ink-body"
      >
        <input
          id="time-unknown"
          type="checkbox"
          checked={timeUnknown}
          onChange={(e) => setTimeUnknown(e.target.checked)}
          className={CHECKBOX_CLASS}
        />
        태어난 시간을 몰라요
      </label>
      {/* 체크했을 때 무슨 일이 일어나는지 **그 자리에서** 말한다. 결과 화면에서
          처음 알게 되면 "왜 여섯 글자지?" 가 된다. */}
      <p className="pl-[26px] text-[12px] leading-relaxed text-muted-2">
        {timeUnknown
          ? "시주(時柱)를 뺀 여섯 글자로 계산합니다."
          : "시간을 모르면 시주를 제외하고 분석합니다."}
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="birth-place" className={FIELD_LABEL_CLASS}>
            출생지
          </label>
          <select
            id="birth-place"
            required
            value={birthPlaceCode}
            onChange={(e) => setBirthPlaceCode(e.target.value)}
            className={`${FIELD_INPUT_CLASS} appearance-none`}
          >
            {places.map((place) => (
              <option key={place.code} value={place.code}>
                {place.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={FIELD_LABEL_CLASS}>성별</span>
          <PillToggle
            groupLabel="성별"
            value={gender}
            onChange={setGender}
            options={[
              { value: "M", label: "남성" },
              { value: "F", label: "여성" },
            ]}
          />
        </div>
      </div>

      {/* 왜 묻는지 밝힌다 — 둘 다 사주 계산에 실제로 쓰이는 값이지 인구통계
          수집이 아니다. */}
      <p className="mt-3 text-[12px] leading-relaxed text-muted-2">
        출생지는 경도 보정에, 성별은 대운의 진행 방향에 쓰입니다.
      </p>

      {error && (
        <p
          role="alert"
          className="mt-5 rounded-card-sm border border-hairline bg-surface-warm px-4 py-3 text-[13.5px] leading-relaxed text-wuxing-fire"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-pill bg-button-gradient px-6 py-3.5 text-[15px] font-bold text-on-primary shadow-cta transition-opacity disabled:opacity-60"
      >
        {pending ? "사주를 펼치는 중…" : "무료로 사주팔자 보기"}
      </button>
      <p className="mt-3 text-center text-[12px] text-muted-2">
        회원가입 없이 바로 확인할 수 있어요
      </p>
    </form>
  );
}
