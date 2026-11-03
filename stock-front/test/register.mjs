import { register } from "node:module";

// 훅은 별도 모듈이어야 한다 — register 를 부르는 파일 자신은 훅이 될 수 없다.
register("./alias-hooks.mjs", import.meta.url);
