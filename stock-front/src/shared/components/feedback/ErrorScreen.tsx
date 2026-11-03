"use client";

import { button } from "@/shared/ui";
/**
 * 세그먼트 에러 경계의 공통 몸통. 원인을 밝히고 되돌릴 길을 준다
 * — README "문구 원칙": 지연·실패 상태는 원인을 밝힌다.
 */
export function ErrorScreen({
  scope,
  title,
  description,
  digest,
  onRetry,
  note,
}: {
  /** stock detail · market home 처럼 어느 화면인지 */
  scope: string;
  title: string;
  description: string;
  digest?: string;
  onRetry: () => void;
  /** 대응 백엔드 메서드 (개발 참고용) */
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-4 border-t border-line-20 pt-5">
      <p
        className="font-mono uppercase tracking-label text-muted-60 text-11"
      >
        {scope} · error
      </p>
      <h1
        className="font-display font-bold leading-none text-34"
      >
        {title}
      </h1>
      <p className="text-pretty text-muted-70 text-14">
        {description}
        {digest ? (
          <span className="num ml-2 text-muted-45">({digest})</span>
        ) : null}
      </p>
      <div>
        <button
          type="button"
          onClick={onRetry}
          className={button({ tap: false })}
        >
          다시 시도
        </button>
      </div>
      {note ? (
        <p
          className="num border-t border-line-20 pt-[9px] text-muted-45 text-10 leading-[1.6]"
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}
