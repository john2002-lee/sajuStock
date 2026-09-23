import Link from "next/link";
import { daysUntilExpiry } from "../model/share";
import type { SharedReport } from "../model/types";
import { SharedFollowUpLog } from "./SharedFollowUpLog";
import { WebtoonReport } from "./WebtoonReport";

/**
 * 공유된 유료 리포트 — 링크(`/saju/r/{id}`)를 받은 사람이 보는 화면.
 *
 * ## 읽기 전용이라는 것은 슬롯이 무엇을 받는지로 표현된다
 *
 * `WebtoonReport` 를 그대로 쓰되 `share` 는 **넘기지 않고**, `followUp` 자리에는
 * 입력창 없는 대화 기록(`SharedFollowUpLog`)을 넣는다. 본문·계산 패널·주고받은
 * 이야기는 구매자가 보는 것과 같고, 질문 입력창과 공유 버튼만 없다.
 *
 * 읽기 전용 사본을 따로 만들지 않은 이유가 그것이다 — 두 벌이 되면 리포트의 생김새를
 * 고칠 때 한쪽만 고쳐지는 날이 온다.
 *
 * ## 다시 공유하는 버튼을 두지 않는다
 *
 * 받은 사람이 남의 리포트를 또 퍼뜨리는 것은 보낸 사람이 동의한 적 없는 일이다.
 * 주소를 복사해 넘기는 것까지 막을 수는 없지만, **우리가 버튼으로 권하지는 않는다.**
 *
 * ## 화면이 감추는 것은 없다
 *
 * 여기서 안 그리는 값은 애초에 **오지도 않는다.** 서버가 `SajuSharedReport` 로
 * 좁혀 내리므로 생년월일·진태양시 보정 분값·접근 토큰이 응답에 없고, 타입
 * (`SharedReport.chart` 는 `ReportChart`)이 그 사실을 붙들고 있다. 화면에서만
 * 숨기는 방식이었다면 개발자도구를 열어 본 사람에게는 아무것도 감춰지지 않는다.
 *
 * **받은 사람이 새 질문을 할 수 없는 근거도 거기 있다.** 입력창을 안 그려서가
 * 아니라, 질문을 받는 경로가 접근 토큰을 요구하고 이 응답에 토큰이 없어서다.
 * 아직 답이 오는 중인 턴(`pending`)도 서버가 걸러 내므로 여기 오지 않는다.
 *
 * ## 만료를 미리 말한다
 *
 * 링크는 주문과 함께 죽는다. 죽은 뒤에 404 를 만난 사람은 이유를 알 방법이 없으므로
 * **살아 있는 동안** 기한을 적어 둔다 — `SharedReadingView` 와 같은 판단이고, 계산도
 * 같은 함수를 쓴다.
 */
export function SharedReportView({ report }: { report: SharedReport }) {
  const left = daysUntilExpiry(report.createdAt, report.retentionDays);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <p className="mb-1 font-mono-kr text-xs tracking-[0.2em] text-gold-text">SHARED REPORT</p>
        <h1 className="font-display text-2xl text-ink">친구가 보내 준 사주 리포트</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-2">
          이 풀이는 링크를 보낸 분의 것입니다.
        </p>
      </div>

      <WebtoonReport
        markdown={report.markdown}
        chart={report.chart}
        luck={report.luck}
        strengthVerdict={report.strengthVerdict}
        source={report.source}
        /* 입력창 없는 대화 기록. 대화가 없으면 이 컴포넌트가 `null` 을 내므로
           빈 패널이 남지 않는다. `share` 는 넘기지 않는다 — 받은 사람에게
           재공유를 권하지 않는다(위 주석). */
        followUp={<SharedFollowUpLog turns={report.followUps} />}
      />

      {/* 이 화면의 목적이다. 남의 풀이를 읽고 끝나면 아무 일도 일어나지 않는다. */}
      <div className="bg-surface-raise rounded-card p-6 text-center shadow-mockup sm:p-8">
        <h2 className="mb-3 font-display text-xl text-ink">내 사주도 볼까요?</h2>
        <p className="mb-6 text-[13.5px] leading-relaxed text-ink-body">
          태어난 시각을 진태양시로 바로잡아 계산합니다. 회원가입 없이 여덟 글자까지 무료입니다.
        </p>
        <Link
          href="/"
          className="inline-block rounded-pill bg-button-gradient px-8 py-3.5 text-[15px] font-bold text-on-primary shadow-cta"
        >
          내 사주 보기
        </Link>
      </div>

      <p className="text-center text-[11.5px] leading-relaxed text-muted-2">
        {left === null
          ? "이 링크는 일정 기간이 지나면 만료됩니다."
          : left === 0
            ? "이 링크는 오늘 만료됩니다."
            : `이 링크는 ${left}일 후 만료됩니다.`}
        <br />
        보낸 분의 생년월일은 담기지 않으며, 이 링크로는 새 질문을 하실 수 없습니다.
      </p>
    </div>
  );
}
