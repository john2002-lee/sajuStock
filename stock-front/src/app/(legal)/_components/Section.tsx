/**
 * 법적 문서의 한 조(條). 제목 하나와 본문 문단들.
 *
 * 이용약관과 개인정보처리방침에 **똑같은 정의가 두 벌** 있었다. 환불정책과
 * 고객센터가 붙으면 네 벌이 된다 — 그 전에 뽑아낸다. 네 벌이 되면 한 벌만
 * 손보는 날이 오고, 그때부터 법적 문서들의 생김새가 서로 달라진다.
 */
export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 font-display text-[17px] text-ink">{title}</h2>
      <div className="space-y-2.5 text-[15px] leading-[1.75] text-muted-75">{children}</div>
    </section>
  );
}

/**
 * 문서 머리 — 제목과 시행일.
 *
 * 시행일이 **제목 바로 아래** 있어야 하는 이유: 법적 문서는 "언제부터의 약속인가"
 * 가 내용만큼 중요하다. 문서 끝에 적어 두면 스크롤하지 않은 사람에게는 없는 것과
 * 같다.
 */
export function DocHeading({ title, effectiveOn }: { title: string; effectiveOn: string }) {
  return (
    <>
      <h1 className="mb-2 font-display text-[26px] font-normal leading-tight text-ink">
        {title}
      </h1>
      <p className="mb-10 text-12 text-muted-60">시행일: {effectiveOn}</p>
    </>
  );
}
