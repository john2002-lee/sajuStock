import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 개발 서버 로그에 fetch 별 캐시 적중/미스와 그 사유를 찍는다.
  // Data Cache 가 실제로 동작하는지 추측이 아니라 관측으로 확인하기 위한 설정이다.
  // 프로덕션에서는 끈다 — `fullUrl` 이 검색어 등 쿼리스트링까지 서버 로그에 남긴다.
  logging:
    process.env.NODE_ENV === "production"
      ? undefined
      : {
          fetches: { fullUrl: true },
        },
};

export default nextConfig;
