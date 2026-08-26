/**
 * 리포트 마크다운을 `## 제목` 섹션으로 나눈다 — **표시용**.
 *
 * 백엔드의 검증 파서(`report_policy.parse_markdown_sections`)와 일부러 따로 둔다.
 * 그쪽은 금지 표현 검사와 한 몸이고 서버에서만 돈다. 정규식 하나를 재사용하려고
 * 그 모듈을 브라우저로 끌어오면 금지 표현 매처 전체가 클라이언트 번들에 실린다.
 *
 * 둘은 **텍스트를 어떻게 자르는지**에서만 갈릴 수 있고, 무엇이 허용되는지에서는
 * 갈릴 수 없다: 검증은 이 화면이 그려지기 전에 서버에서 이미 끝났고, 여기서
 * 최악의 경우는 섹션이 엉뚱한 패널에 들어가는 것뿐이다.
 */
export interface DisplaySection {
  heading: string;
  body: string;
}

export function splitSections(markdown: string): DisplaySection[] {
  const headingRe = /^##\s+(.+)$/gm;
  const matches = [...markdown.matchAll(headingRe)];
  return matches.map((m, i) => ({
    heading: m[1].trim(),
    body: markdown
      .slice(
        m.index! + m[0].length,
        i + 1 < matches.length ? matches[i + 1].index! : markdown.length,
      )
      .trim(),
  }));
}

/**
 * 모델이 첫 `## 제목` **앞에** 쓴 글.
 *
 * 무당 페르소나는 첫 섹션에 들어가기 전에 손님에게 인사하므로("어서 오시게…")
 * 흔하게 나온다. 렌더러가 조용히 먹어 버릴 마크업이 아니라 사용자가 봐야 할
 * 내용이다. 서버의 `validate_markdown` 이 머리말까지 정책 검사를 마친 뒤이므로
 * 그리는 것이 안전하다.
 *
 * 앞머리의 `# 제목` 줄은 버린다 — 페이지 제목과 중복이다.
 */
export function extractPreamble(markdown: string): string {
  const first = markdown.search(/^##\s+/m);
  const head = (first === -1 ? "" : markdown.slice(0, first)).trim();
  return head
    .split("\n")
    .filter((line) => !/^#\s/.test(line.trim()))
    .join("\n")
    .trim();
}
