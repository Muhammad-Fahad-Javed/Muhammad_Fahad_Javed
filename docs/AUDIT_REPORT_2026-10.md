# Audit report — October 2026

Scope: the whole repository (Vercel serverless API, Prisma/Postgres, static
frontend, admin CMS). Stack was inspected first; fixes are limited to real
problems found. Previous hardening (revocable DB sessions, CSRF, sanitize-html,
upload magic-byte checks, transactional import, audit log) was reviewed and
left intact.

## Executive summary

The codebase was already in good security shape. No P0 issues (no hard-coded
secrets, no auth bypass, no unauthenticated admin endpoint, no SQL injection
surface — all queries go through Prisma) were found. The audit found one P1
weakness, several P2 gaps and a few P3 items, all fixed below.

## Issues

| # | Sev | Where | Root cause | Fix | Verified |
|---|-----|-------|-----------|-----|----------|
| 1 | P1 | `api/auth/[...route].js` change-password | Throttle was checked only *after* a wrong guess, so a stolen session could keep guessing the current password; the correct guess still succeeded while "throttled". | Throttle checked before the comparison; non-string inputs rejected. | Automated (R2), mutation-checked |
| 2 | P2 | `lib/sessions.js` | JWT algorithm not pinned. | `HS256` pinned on sign and verify. | Automated (R1: HS512 and `alg:none` rejected), mutation-checked |
| 3 | P2 | `api/admin/import.js`, `admin/js/app.js` | Imported row ids were any string and were interpolated unescaped into admin HTML/URLs — a malicious "backup" file could run script in the admin UI. | Server accepts only `[A-Za-z0-9_-]{1,64}`; client encodes/escapes ids. | Automated (R3) + browser test with a hostile id (no script ran) |
| 4 | P2 | `/admin` headers | No CSP on the admin app; inline script and inline `onerror` handler prevented one. | Inline login script moved to `js/login.js`, `onerror` replaced with DOM API; strict CSP (`script-src 'self'`, `frame-ancestors 'none'`) added for `/admin` and `/admin/*`; CSP on `/api/*`. | Browser test: login + dashboard + list + form work with no CSP violations; Automated (R6) guards against regressions |
| 5 | P2 | `lib/resources.js` | `color` fields had no validation; values go into CSS custom properties on the public site. | Hex-only (`#rgb`/`#rrggbb`). | Automated (R4), mutation-checked |
| 6 | P2 | `package.json` | `cookie` < 0.7 advisory. | Upgraded to `^0.7.2` (non-breaking). | Test suite |
| 7 | P3 | `lib/storage.js` | Local-dev delete accepted keys `.`/`..`. | Rejected; only regular files directly in the upload dir are removed. | Automated (R5) |
| 8 | P3 | `admin/js/app.js` | Route segments from `location.hash` resolved with `registry[key]` (`__proto__` crashed the page). | Own-property lookup. | Browser test |
| 9 | P3 | `frontend/index.html` | LinkedIn avatar `onerror` pointed to non-existent `logo.png` (retry loop). | `onerror=null` + existing `apple-touch-icon.png`. | Static |
| 10 | P3 | contact form | No spam control. | Hidden honeypot (`botcheck`); bots get a fake success and nothing is sent. | Page loads, trap is off-screen/untabbable; not tested against live Web3Forms |
| 11 | P3 | `frontend/js/main.js` | Marketing `console.log` banner in production. | Removed. | Syntax + page smoke test |
| 12 | P3 | repo root | Stray file ` -TotalCount 20` (a `less` help dump from a PowerShell command). | Deleted. | — |

## Admin panel checks performed

- **Authentication:** every admin handler is wrapped in `requireAuth` (session row, expiry, user version checked server-side); logout and password change revoke sessions; cookie is HttpOnly, SameSite=Lax, Secure in production; login timing is equalised for unknown accounts (measured 328 ms vs 284 ms); no bootstrap or reset endpoint.
- **Authorization:** the app has a single admin role (none added); no role value is read from the client.
- **CSRF:** custom header + Origin/Referer check on all mutating calls (existing tests).
- **XSS:** all `innerHTML` sinks in the admin UI and public loader reviewed. Remaining HTML injection points receive server-sanitised content (`sanitize-html` allow-list) or `esc()`-escaped values. Hostile row id tested in a real browser.
- **Data integrity:** server-side validation on every write path, transactional import/reorder, optimistic-concurrency on update, max-length and list-size limits, bounded pagination.
- **Uploads:** magic-byte verification, SVG rejected, random stored names.

## Test results

| Command | Result |
|---|---|
| `npm test` | 90 pass / 1 fail (91). 7 new tests in `tests/audit-regressions.test.js`. |
| `npm run test:registry` | pass |
| `npm audit` | 3 remaining (see below) |
| Browser tests (Playwright/Chromium, mocked API) | admin login, dashboard, list, image-preview fallback, hostile-id row, `__proto__` route: pass. Public page: no JS errors, no horizontal overflow at 375 px and 1280 px (external fonts/CDNs blocked in the sandbox). |

The single failing test (`E2: create-admin refuses to run without an explicit mode`)
fails only because `prisma generate` cannot download its engine inside this
sandbox (403 from binaries.prisma.sh). It failed identically before any change.
Run `npm ci && npm test` on your machine or Vercel to confirm it passes there.

## Not done / needs you

1. **`@vercel/blob` upgrade (npm audit: undici / @fastify/busboy DoS).** Only the
   server-side `put`/`del` calls are used, so the advisory is not reachable, but
   upgrading needs a real Blob token to test. Do it on a preview deploy:
   `npm i @vercel/blob@latest`, then upload and delete one image.
2. **Public-site CSP still allows `'unsafe-inline'` scripts** (inline gtag snippet and
   `onload`/`onerror` attributes in `index.html`). Removing it means moving those
   inline pieces to files or hashing them — a larger front-end change I did not make
   blind. It is delivered as a `<meta>` tag, so `frame-ancestors` is covered by
   `X-Frame-Options: DENY` instead.
3. **Login lockout is per account *and* per IP**, so anyone who knows your admin email
   can lock you out for 15 minutes with 10 bad attempts. This is a deliberate
   trade-off in the existing design; keep it, or switch to progressive delays.
4. **Content to verify yourself (I did not change it):** the LinkedIn card in
   `index.html` hotlinks an expiring `media.licdn.com` image URL (it will fall back
   to the icon) and shows "Verified", "500+ connections", "3 recommendations",
   "12 posts" and a "C++ Systems Developer & AI Engineer" headline. Make sure these
   match your real profile. `leetcode-logo.*` and `hackerrank-logo.*` images are not
   in the repo (the placeholder fallback shows). `manifest.json` has only a 32 px
   icon, so the site is not installable as a PWA until 192/512 px icons are added.
5. **Manual runtime checks** I could not do here: real Postgres migrations, Vercel
   Blob uploads, Web3Forms delivery, and the deployed response headers.

## Deployment

No schema change and no new environment variables.

```bash
npm ci
npm test
git push        # Vercel builds as before
```

After deploying, confirm `curl -sI https://<your-site>/admin | grep -i content-security` shows the new header and that you can log in. Existing admin sessions stay valid until they expire. Rollback: redeploy the previous Vercel deployment.
