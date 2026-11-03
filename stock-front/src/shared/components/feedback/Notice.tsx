import { Icon, type IconName } from "@/shared/ui";

export type NoticeTone = "info" | "alert" | "success";

export interface NoticeProps {
  children: React.ReactNode;
  /**
   * `info` 안내(점선) · `alert` 사용자가 알아야 하는 실패(실선) · `success` 완료.
   *
   * **전용 '오류 색' 을 만들지 않는다.** 이 팔레트에서 빨강·파랑은 등락 방향이
   * 소유하고(`lib/format/direction`), 앰버는 AI 액션이다. 여기서 그 셋 중 하나를
   * 빌리면 화면 전체의 색 규약이 흐려진다 — 테두리 종류(실선/점선)와 글리프로
   * 충분히 구분된다.
   */
  tone?: NoticeTone;
  /** 기본 글리프를 바꾼다 */
  icon?: IconName;
}

const TONE: Record<NoticeTone, { border: string; icon: IconName; role: string }> = {
  info: { border: "border-dashed border-line-30", icon: "bell", role: "status" },
  alert: { border: "border-line-35", icon: "bell", role: "alert" },
  success: { border: "border-line-35", icon: "check", role: "status" },
};

/**
 * 한 줄짜리 안내·경고 상자.
 *
 * 로그인·가입·인증·관리자 화면이 **같은 마크업을 일곱 번 복사해** 갖고 있었다 —
 * `role`, 테두리, 글리프, `fontSize: 12.5`, `lineHeight: 1.6` 까지 글자 그대로.
 * 문구만 다른 것을 일곱 벌 두면 여백 하나를 고치는 데 일곱 곳을 고쳐야 하고,
 * 실제로 한 곳(`admin/users/[id]`)은 자기 파일 안에 `Notice` 를 따로 만들어
 * 쓰고 있었다.
 *
 * `role` 은 톤이 정한다 — 실패는 `alert`(즉시 읽어 준다), 안내는 `status`.
 * 이 구분을 호출부에 맡기면 어떤 화면은 오류를 조용히 지나친다.
 */
export function Notice({ children, tone = "info", icon }: NoticeProps) {
  const style = TONE[tone];

  return (
    <p
      role={style.role}
      className={`flex items-start gap-2 border ${style.border} px-3 py-3 text-muted-70 text-13 leading-[1.6]`}
    >
      <Icon
        name={icon ?? style.icon}
        size={15}
        className="mt-0.5 flex-none text-muted-45"
      />
      <span>{children}</span>
    </p>
  );
}
