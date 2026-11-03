import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * `@/…` 경로 별칭을 Node 의 ESM 리졸버에 알려준다.
 *
 * tsconfig 의 paths 는 번들러(Turbopack)와 tsc 만 안다. `node --test` 는 소스를
 * 타입 스트리핑만 해서 그대로 실행하므로 별칭을 못 찾는다. 여기서 tsconfig 와
 * 같은 규칙(@/ → src/)으로 한 번만 풀어준다.
 */
const SRC = path.resolve(import.meta.dirname, "..", "src");
const EXTENSIONS = [".ts", ".tsx", ".mts", ".js"];

function locate(base) {
  if (existsSync(base) && !existsSync(path.join(base, "package.json"))) {
    // 확장자까지 적힌 파일 경로
    if (path.extname(base)) return base;
  }
  for (const ext of EXTENSIONS) {
    const file = `${base}${ext}`;
    if (existsSync(file)) return file;
  }
  for (const ext of EXTENSIONS) {
    const file = path.join(base, `index${ext}`);
    if (existsSync(file)) return file;
  }
  return null;
}

export function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const resolved = locate(path.join(SRC, specifier.slice(2)));
    if (resolved) return next(pathToFileURL(resolved).href, context);
  }

  // 소스끼리는 확장자 없이 서로를 import 한다 (번들러 규칙). Node 는 완전한
  // specifier 만 받으므로 여기서도 같은 후보 순서로 풀어준다.
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const base = path.resolve(
      path.dirname(fileURLToPath(context.parentURL)),
      specifier,
    );
    const resolved = locate(base);
    if (resolved) return next(pathToFileURL(resolved).href, context);
  }

  return next(specifier, context);
}
