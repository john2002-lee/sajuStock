import { ApiError } from "@/lib/api";
import { Icon } from "@/shared/ui";

export interface AdminUnavailableProps {
  error: ApiError | null;
}

/**
 * 관리자 API 를 못 부를 때의 안내.
 *
 * **여기서만큼은 원인을 구체적으로 말한다.** 다른 화면은 "잠시 후 다시" 로 끝내도
 * 되지만, 이 화면을 보는 사람은 서버를 고칠 수 있는 사람이다. 상태 코드마다 조치가
 * 다르고 그 조치를 아는 것이 사용자의 일이다.
 *
 *   503  키 미설정이거나 users 를 못 읽는다 — 설정·DB 문제
 *   401  키가 틀리다 — 백엔드와 프런트의 값이 다르다
 *   그 외 백엔드가 꺼져 있거나 주소가 틀리다
 */
export function AdminUnavailable({ error }: AdminUnavailableProps) {
  const status = error?.status;

  return (
    <section
      role="alert"
      className="flex flex-col gap-2 border border-line-35 px-4 py-4"
      style={{ lineHeight: 1.65 }}
    >
      <span className="flex items-center gap-2 font-medium" style={{ fontSize: 13.5 }}>
        <Icon name="bell" size={15} className="flex-none text-muted-45" />
        관리자 API 를 부르지 못했습니다
      </span>

      <p className="text-muted-70" style={{ fontSize: 12.5 }}>
        {describe(status)}
      </p>

      {error?.message ? (
        <p className="num text-muted-45" style={{ fontSize: 11 }}>
          {status ? `${status} · ` : ""}
          {error.message}
        </p>
      ) : null}
    </section>
  );
}

function describe(status?: number): string {
  if (status === 503) {
    return (
      "백엔드의 ADMIN_API_KEY 가 비어 있거나, users 테이블을 읽지 못하고 있습니다. " +
      "백엔드 .env 의 ADMIN_API_KEY 를 채우고, DATABASE_URL 이 프런트의 " +
      "AUTH_DATABASE_URL 과 같은 Supabase 인지 확인하세요."
    );
  }
  if (status === 401) {
    return (
      "관리자 키가 일치하지 않습니다. 백엔드 .env 의 ADMIN_API_KEY 와 " +
      "front/.env.local 의 ADMIN_API_KEY 를 같은 값으로 맞추세요."
    );
  }
  return "백엔드에 닿지 못했습니다. FastAPI 가 떠 있는지, STOCK_API_BASE_URL 이 맞는지 확인하세요.";
}
