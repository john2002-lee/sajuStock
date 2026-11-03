# stock-front-split — Plan

## Goal
Split the stock service out of `front/` (route group `src/app/(stock)`) into a new,
independently deployable Next.js project `stock-front/`, keeping backend wiring
(BFF routes, env vars, auth DB) unchanged.

## Decisions (user, 2026-11-03)
- Location: `SajuStock/stock-front` (same repo, sibling of `front`/`back`).
- Admin (`/admin`) is copied into both projects.
- Login/signup/verify, legal pages, `/verdict` share page come along (stock needs them).
- What happens to stock files in `front/` is decided by the user AFTER the copy.

## Approach
1. Scaffold `stock-front/` with the same toolchain as `front/` (Next 16.2.12, React 19.2.4,
   Tailwind 4, same tsconfig/eslint/postcss, same `node --test` runner).
2. Copy the transitive import closure (computed by script) of:
   `(stock)`, `(account)`, `(legal)`, `admin`, `verdict`, `_data`,
   `api/{stocks,watchlist,advice,auth,visit}`, root layout/error/loading/not-found/OG/robots,
   `proxy.ts`, `auth.ts` — plus the tests whose subjects were copied. Paths are preserved,
   so `@/` imports keep working.
3. Minimal adaptations for standalone operation:
   - `/` → `/stock` (legacy-paths MOVED, proxy 307 — same pattern as before).
   - Links into saju (`SajuBand`, footer/legal "/saju/intro", 404) → absolute saju site URL
     (`NEXT_PUBLIC_SAJU_SITE_URL`, default `https://www.aiot21.com`).
   - Root metadata / OG image / robots / 404 / login copy: stock instead of saju.
   - `package.json`: drop deps not reached by the closure.
4. Verify: `tsc`, `eslint`, `npm test`, `next build`, run dev server and render pages.
5. Ask user what to do with stock files left in `front/`.

## Phase 2 — remove stock from front (user, 2026-11-03: "delete + redirect", domain via env only)
- Delete: app/(stock), features/stock, api/{stocks,watchlist,advice}, app/verdict,
  _data/{advice,watchlist}, lib/watchlist/claim.ts, then any file orphaned by that.
- Keep: _data/owner, lib/watchlist/{owner,anon-cookie} and proxy owner-cookie issuance —
  saju shares / visit / profile use the anonymous owner key.
- proxy: stock paths (/stock, /stocks, /dashboard, /watchlist, /verdict + subpaths) → 307 to
  `STOCK_SITE_URL` + same path/query; unset → no redirect (route is gone → 404).
  Decision lives in pure `lib/routing/stock-paths.ts` with tests (legacy-paths pattern).
- Root layout drops SearchProvider. No commit/push (front auto-deploys from main).
