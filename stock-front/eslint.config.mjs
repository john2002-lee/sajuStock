import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 얼려 둔 코드. tsconfig 도 같은 경로를 뺀다 — 이유는 그쪽 주석과
    // `src/features/saju/_parked/README.md` 참고.
    "src/features/**/_parked/**",
  ]),
]);

export default eslintConfig;
