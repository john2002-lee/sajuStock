# stock-front-split — Context
Last Updated: 2026-11-03

## Key files
- Source: `front/src/app/(stock)`, `front/src/features/stock`, `front/src/proxy.ts`, `front/src/auth.ts`
- New project: `stock-front/`
- Closure script: session scratchpad `closure.mjs` (resolves `@/` + relative imports)

## Notes
- Stock pages depend on no `features/saju` code. Only saju-coupled bits: `SajuBand` link,
  footer/legal `/saju/intro` link, root metadata/OG/404/robots copy, login copy.
- `globals.css` copied verbatim (contains saju palette/ambient classes, harmless).
- Env vars identical to `front/.env.local` (STOCK_API_BASE_URL, ADVICE_API_KEY, AUTH_*,
  ADMIN_*, NEXT_PUBLIC_*). Google OAuth redirect is registered for localhost:3000.
- Deploy: new Vercel project with Root Directory `stock-front` (not done here).

## Deploy notes (from review)
- Set `AUTH_URL` and `NEXT_PUBLIC_APP_ORIGIN` to the stock domain, not the saju one —
  signup verify links, OAuth callback, og:url are built from them.
- Register `<stock domain>/api/auth/callback/google` in Google OAuth.
- `NEXT_PUBLIC_SAJU_SITE_URL` optional (default https://www.aiot21.com).
