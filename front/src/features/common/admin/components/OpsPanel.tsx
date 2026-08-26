import { count as fmtCount, stamp } from "@/lib/format";
import { Notice } from "@/shared/components/feedback";
import { batchLabel, type BatchStatus, type OpsSnapshot } from "../model/types";

export interface OpsPanelProps {
  ops: OpsSnapshot;
}

/**
 * 운영 현황 — 배치 진행률 · AI 캐시 · 자물쇠 상태.
 *
 * **여기 있는 숫자는 전부 지금까지 DB 를 직접 쳐야만 보이던 값들이다.** 스크리너를
 * 만들던 17회차 내내 스크립트로 확인하던 것이고, 그 사실 자체가 이 화면이 필요한
 * 이유였다.
 *
 * 서버 컴포넌트다 — 막대는 CSS 폭이고 상호작용이 없다.
 */
export function OpsPanel({ ops }: OpsPanelProps) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2.5">
        <SectionTitle>배치 적재율</SectionTitle>
        <Coverage label="오늘의 일정" done={ops.calendarCovered} total={ops.universeSize} />
        <Coverage
          label="스크리너 지표"
          done={ops.fundamentalsCovered}
          total={ops.universeSize}
        />
        <Coverage label="시가총액" done={ops.marketCapCovered} total={ops.universeSize} />
        <p className="num text-muted-45" style={{ fontSize: 10 }}>
          마지막 적재 · 일정 {when(ops.lastCalendarBatch)} · 지표{" "}
          {when(ops.lastFundamentalsBatch)}
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        <SectionTitle>배치 실행</SectionTitle>
        {/* 위 적재율과 **다른 질문**에 답한다. 적재율이 며칠째 같은 숫자일 때 그것이
            정상인지 배치가 죽은 것인지는 여기서만 알 수 있다. 지금까지 그 답은
            서버 로그에만 있었다. */}
        {ops.batches.length > 0 ? (
          ops.batches.map((batch) => <BatchRow key={batch.name} batch={batch} />)
        ) : (
          <p className="text-muted-45" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
            실행 기록이 없습니다. 배치가 한 번도 돌지 않았거나, 스키마가 아직
            적용되지 않았습니다 (<code>alembic upgrade head</code>).
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <SectionTitle>AI 판단</SectionTitle>
        {/* 이 프로젝트에서 돈이 나가는 유일한 경로다. 캐시가 실제로 일하고 있는지
            볼 방법이 지금까지 없었다. */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 md:grid-cols-3">
          <Stat label="캐시된 종목" value={`${ops.adviceCached} / ${ops.adviceCapacity}`} />
          <Stat
            label="분석 중"
            value={`${ops.adviceInFlight} / ${ops.adviceMaxConcurrent}`}
          />
          <Stat label="RAG" value={ops.ragEnabled ? "켜짐" : "꺼짐"} />
        </div>
        <p className="text-muted-45" style={{ fontSize: 10.5, lineHeight: 1.5 }}>
          캐시는 프로세스 메모리에 있습니다. <strong>누적 사용량이 아니라 현재
          상태</strong>이고, 서버를 재시작하면 0 이 됩니다.
        </p>
      </div>

      {/* 꺼져 있는 자물쇠는 **경고로** 보여야 한다. 조용히 열려 있는 것이 가장 나쁘다 */}
      {!ops.adviceLocked ? (
        <Notice tone="alert">
          AI 판단 엔드포인트가 잠겨 있지 않습니다. 외부에 노출된 서버라면{" "}
          <code>ADVICE_API_KEY</code> 를 백엔드와 프런트에 같은 값으로 넣으세요.
        </Notice>
      ) : null}
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="font-mono uppercase tracking-label-wide text-muted-50"
      style={{ fontSize: 10 }}
    >
      {children}
    </h2>
  );
}

/**
 * 진행률 한 줄. **분모가 0 일 때 NaN 을 그리지 않는다.**
 *
 * 상장사 수집 전에는 모집단이 0 이고, 그때 `done/total` 은 NaN 이다. 화면에 NaN 이
 * 뜨면 "값이 이상하다" 로 보이지만 실제로는 "아직 시작 안 했다" 다.
 */
function Coverage({ label, done, total }: { label: string; done: number; total: number }) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span style={{ fontSize: 12.5 }}>{label}</span>
        <span className="num text-muted-60" style={{ fontSize: 11.5 }}>
          {total > 0
            ? `${fmtCount(done)} / ${fmtCount(total)} · ${percent}%`
            : "모집단 없음"}
        </span>
      </div>
      <div
        className="h-[6px] w-full bg-surface"
        role="meter"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="h-full bg-ink" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span
        className="font-mono uppercase tracking-label text-muted-45"
        style={{ fontSize: 9.5 }}
      >
        {label}
      </span>
      <span className="num font-medium" style={{ fontSize: 14 }}>
        {value}
      </span>
    </span>
  );
}

/**
 * 배치 하나의 최근 상태.
 *
 * **세 상태를 구분해 말한다.** "한 번도 안 돌았다" 가 "실패했다" 보다 나쁜데, 둘을
 * 뭉개면 화면이 조용해서 정상으로 보인다.
 *
 *   기록 없음  → 배치가 아예 돌지 않았다 (가장 나쁘다)
 *   마지막 실패 → 지금 고장 나 있다
 *   마지막 성공 → 정상. 다만 **과거 실패는 그대로 보여준다** — 되풀이되는 실패는
 *                지금이 성공이어도 봐야 하는 사건이다
 */
function BatchRow({ batch }: { batch: BatchStatus }) {
  // 실패는 `text-down` 이다. 이 팔레트에서 빨강(`--up`)은 **상승**이라, 실패에 쓰면
  // 잘된 일처럼 읽힌다. 검색의 소스 단계 표시(`SourceFallbackBanner`)가 이미 실패를
  // 같은 색으로 그린다 — 새 규칙을 만드는 대신 그것을 따른다.
  const failing = batch.lastRunOk === false;

  return (
    <div className="flex flex-col gap-1 border-t border-dotted border-line-22 pt-2">
      <div className="flex items-baseline justify-between gap-3">
        <span style={{ fontSize: 12.5 }}>
          {batchLabel(batch.name)}
          {failing ? (
            <span className="ml-1.5 font-medium text-down">실패</span>
          ) : null}
        </span>
        <span className="num text-muted-60" style={{ fontSize: 11 }}>
          {when(batch.lastRunAt)}
          {batch.attempted > 0
            ? ` · ${batch.answered}/${batch.attempted} 응답 · ${batch.applied} 반영`
            : ""}
        </span>
      </div>

      {batch.detail ? (
        <p
          className={failing ? "text-down" : "text-muted-45"}
          style={{ fontSize: 10.5, lineHeight: 1.5 }}
        >
          {batch.detail}
        </p>
      ) : null}

      {/* 지금은 정상인데 과거에 실패한 경우만 따로 밝힌다 — 지금 실패 중이면 위
          문구가 이미 그 이유를 말하고 있어 두 번 쓰면 무엇이 최신인지 흐려진다. */}
      {!failing && batch.lastFailureAt ? (
        <p className="text-muted-45" style={{ fontSize: 10, lineHeight: 1.5 }}>
          마지막 실패 {when(batch.lastFailureAt)}
          {batch.lastFailureDetail ? ` · ${batch.lastFailureDetail}` : ""}
        </p>
      ) : null}
    </div>
  );
}

/**
 * ISO → `08.10 05:34`. 없으면 "없음".
 *
 * 포맷터를 이 파일에서 다시 구현하지 않는다. 예전에는 `new Date(...).getHours()` 로
 * 직접 만들었는데 그건 **서버 지역 시각**이라, UTC 컨테이너에서는 같은 화면의 다른
 * 캡션(KST)과 9시간 어긋났다. `lib/format` 의 `stamp` 는 KST 로 고정한다.
 */
function when(iso: string | null): string {
  return iso ? stamp(iso) : "없음";
}
