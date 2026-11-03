# stock-front-split — Tasks
- [x] Scaffold stock-front config files
- [x] Copy file closure + tests
- [x] Adapt root route, saju links, metadata, robots, 404, login copy
- [x] npm install, tsc, lint, test, build
- [x] Run dev server, render key pages
- [x] Code review (no blockers; footers switched to service="stock")
- [ ] Ask user about stock files in front/
- [x] Ask user about stock files in front/ → delete + redirect via STOCK_SITE_URL
## Phase 2
- [x] stock-paths.ts + tests (RED → GREEN)
- [x] proxy wiring, remove dashboard/watchlist redirects
- [x] delete stock files + orphans, drop SearchProvider
- [x] tsc, lint, test, build, run & check redirects / saju pages
- [x] code review (fixed: signup /dashboard redirect, homePathFor viewer → /, AdminShell <a> via STOCK_SITE_URL, footers both→saju)
- [ ] (user) deploy stock-front as new Vercel project, set STOCK_SITE_URL in front, then commit/push
- [ ] (optional) dead stock-only leftovers in front: marketHours unused exports, env USE_MOCK/AI_TIMEOUT_MS, loginHref, Delta, NotFoundScreen suggestions, Footer stock branch, robots stock disallows, stale comments
