/**
 * 발급 직후 임시 비밀번호를 화면에 한 번 보여주기 위한 쿠키 이름.
 *
 * 예전에는 `?password=` 로 주소에 실었다 — 브라우저 기록·Referer·프록시 접근
 * 로그에 평문 비밀번호가 남는 구멍이었다. httpOnly 쿠키 + 짧은 수명으로 바꾼다.
 *
 * 별도 파일인 이유: `_actions.ts` 는 `"use server"` 라 async 함수만 export 할 수
 * 있다(Next 제약) — 상수 하나 때문에 그 규칙을 어길 수 없어 여기로 뺐다.
 *
 * 서버 컴포넌트(`users/page.tsx`)는 쿠키를 지울 수 없으므로(Next 제약) 명시적
 * 삭제 대신 60초 만료(`_actions.ts` 의 `maxAge`)에 기댄다 — 화면은 리다이렉트
 * 직후 바로 뜨므로 충분하고, 그 창을 넘기면 새로고침해도 다시 보이지 않는다.
 */
export const FLASH_PASSWORD_COOKIE = "admin_flash_pw";
