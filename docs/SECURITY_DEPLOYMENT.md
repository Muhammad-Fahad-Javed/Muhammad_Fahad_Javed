# Security deployment runbook

This document is the **reviewed, manual** procedure for shipping the CMS
security hardening. Nothing here has been run against production.

> Scope: the hardened `security/cms-hardening` branch. Do **not** merge,
> deploy, or run any migration until every step below has been reviewed.

---

## 1. What changed and why it is safe

| Area | Change | Risk if skipped |
| --- | --- | --- |
| JWT secret | Missing/short `JWT_SECRET` is now a hard error in production (no fixed fallback). | An attacker who knows the old fallback could forge admin tokens. |
| Sessions | Sessions are stored in a new `Session` table; logout/password-change revoke server-side. | A stolen cookie stays valid forever. |
| Login throttle | Failures are counted per IP **and** per account, using a trusted-hop-aware client IP. | Spoofed `X-Forwarded-For` bypasses brute-force protection. |
| CSRF | Same-origin `Origin`/`Referer` check added on top of the custom header. | Cross-site form posts could perform admin writes. |
| HTML | `sanitize-html` (parser based) replaces the regex sanitizer, applied on **every** write path including bulk import. | Stored XSS via crafted rich text. |
| URLs | `javascript:`, `data:`, `vbscript:` and protocol-relative URLs are rejected per field purpose. | XSS through `href`/`src` attributes. |
| Uploads | Real content is verified by magic bytes; SVG is rejected; extensions come from the detected type. | An "image" that is actually HTML/JS is served from our own origin. |
| Media | Files are deleted only when nothing else references them. | Deleting one item silently breaks images elsewhere. |
| Import | Validated up-front and applied in a single transaction. | A failed import leaves half-updated content. |
| Registry | Prototype keys (`__proto__`, `constructor`, …) cannot resolve to a resource. | 500s / unexpected Prisma targets. |
| Serialization | Responses use a field allow-list. | New internal columns leak to the public site. |
| Build | `prisma db push --accept-data-loss`, admin password reset and seeding removed from `build`. | A routine deploy can destroy the schema or reset credentials. |
| Audit | Admin mutations are recorded in `AuditLog` (no payload bodies). | No forensic trail. |

---

## 2. Pre-flight checklist (before any deploy)

1. **Back up the database.**
   ```bash
   # Neon: create a branch/restore point, or
   pg_dump "$DATABASE_URL" > backup-$(date +%Y%m%d%H%M%S).sql
   ```
2. **Confirm the environment variables** in Vercel (Project → Settings → Environment Variables), for **Production**:
   - `JWT_SECRET` — random, **at least 32 characters**. Generate with
     `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
     Requests will fail closed (HTTP 500) until this is set.
   - `DATABASE_URL` — unchanged.
   - `BLOB_READ_WRITE_TOKEN` — unchanged (required for uploads in production).
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` — **remove** from the build path; they are
     only read by the explicit provisioning command (step 5).
   - Optional: `TRUSTED_PROXY_HOPS` (default `1` = trust the last
     `X-Forwarded-For` entry added by the platform edge). Leave unset on Vercel.
   - `SYNC_ENCRYPTION_KEY` — **only if profile sync is used**. Random, at least
     32 characters (`openssl rand -base64 48`). Without it, connecting a GitHub
     integration fails closed; the public site is unaffected. Rotating this key
     invalidates stored integration credentials (reconnect afterwards).
   - `CRON_SECRET` — **only if the scheduled sync is used**, at least 16
     characters. `/api/cron/sync` returns 503 rather than running unprotected
     when it is missing. Vercel forwards it automatically as
     `Authorization: Bearer <CRON_SECRET>`.
   - `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` — not used yet; LinkedIn
     sync is not enabled (see `docs/PROFILE_SYNC.md`).
3. **Verify the build is clean.**
   ```bash
   npm ci
   npm test          # unit + integration suites (no database needed)
   npm run test:registry
   ```
4. **Validate the schema locally** (no database access):
   ```bash
   npx prisma validate
   ```

---

## 3. One-time migration baseline

The project previously used `prisma db push`, so the production database may
**not** have a `_prisma_migrations` table. Adopting `prisma migrate deploy`
requires a one-time baseline:

```bash
# 1. Inspect what the database currently looks like vs. the previous schema.
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script
```

- If the output is **only** the additive statements from
  `prisma/migrations/20261017000000_security_hardening_sessions/migration.sql`,
  the database is already at the old schema. Continue with option A.
- If the database already contains those columns/tables, use option B.

**Option A — apply the migration normally**
```bash
npx prisma migrate deploy     # applies 20261017000000_security_hardening_sessions
npx prisma migrate status     # should report "Database schema is up to date"
```

**Option B — baseline, then apply nothing (already applied)**
```bash
# Record the old schema as the baseline so migrate deploy does not replay it.
npx prisma migrate resolve --applied 0_init_baseline    # only if such a folder exists
# Otherwise create the baseline from the live database:
mkdir -p prisma/migrations/0_init_baseline
npx prisma migrate diff --from-empty --to-url "$DATABASE_URL" --script \
  > prisma/migrations/0_init_baseline/migration.sql
npx prisma migrate resolve --applied 0_init_baseline
npx prisma migrate status
```

The branch carries two migrations, both **additive only**: they do not drop,
rename or retype anything, and they delete no rows.

1. `20261017000000_security_hardening_sessions` adds `AdminUser.sessionVersion`,
   `LoginAttempt.identifier`, and the `Session` and `AuditLog` tables plus indexes.
2. `20261018000000_cms_full_coverage` adds the tables behind the content types
   that used to be hard-coded in `frontend/index.html`: `WhyCard`, `ProcessStep`,
   `Faq`, `JourneyItem`, `BlogPost`, `CommunityItem`, `BeyondCard`,
   `CodingProfile`, `ClothericCard`, `SectionToggle`, `SiteText`,
   `LinkedInProfile`, `ResumeSection` and `GithubSection`.
   `SectionToggle` powers the admin **Page Sections** switches, which take a whole
   section (and its navigation links) off the site and put it back.

After the schema is in place, run the seed once with `npm run seed`. It only
creates rows that do not exist yet, so it is safe to re-run and never overwrites
content that has been edited in the admin. Skipping it is not harmful — the
public page keeps its built-in markup and every section stays visible — but the
new collections start out empty.

---

## 4. Deploy

1. Merge `security/cms-hardening` after review and a green `npm test`.
2. Vercel runs `npm run build` → `prisma generate && node scripts/prepare-build.js`
   → schema validation only, **no database writes**.
3. Watch the function logs for `[config] Startup configuration problems:`.
   Any such line means a required variable is missing and the API will fail
   closed until it is fixed.
4. Apply pending migrations **before** the new code serves traffic:
   ```bash
   npm run db:status     # shows what is pending
   npm run db:deploy     # additive only: never drops or rewrites a column
   ```
   `20261020000000_profile_sync` adds three tables (`Integration`,
   `FieldState`, `SyncRun`) and three defaulted columns. See
   `docs/PROFILE_SYNC.md`.

---

## 5. Provision / recover the administrator account

```bash
# Create (never overwrites an existing password; safe to re-run)
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-strong-password' \
  npm run admin:create

# Recover: set a new password and revoke every existing session
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-new-strong-password' \
  npm run admin:reset-password
```

Run these against the target `DATABASE_URL` (e.g. from a trusted shell with the
production value temporarily exported). They are **not** part of any build.

---

## 6. Post-deploy verification

1. `GET /api/public/content` returns JSON (HTTP 200) and contains **no**
   `passwordHash`, `sessionVersion` or other internal columns.
2. `POST /api/auth/login` with wrong credentials repeatedly returns 401, then
   429. Include a forged `X-Forwarded-For` — the account must still be throttled.
3. `POST /api/auth/login` with a correct password returns 200 and an
   `HttpOnly; SameSite=Lax` cookie.
4. A request to any `/api/admin/*` endpoint **without** the
   `X-Requested-With: portfolio-admin` header, or from a foreign `Origin`,
   returns 403 `CSRF_*`.
5. Log out, then replay the old cookie: it must return 401 (server-side revoked).
6. Upload a PNG (accepted), an SVG (rejected), and a `.png` that is really HTML
   (rejected).
7. Trigger an import with one invalid row: the response is 400 and **nothing**
   changed.
8. Check `AuditLog` has rows for the actions above.

---

## 7. Rollback

- **Application:** redeploy the previous Vercel deployment. The migration is
  additive, so older code that ignores the new columns still works.
- **Schema:** the additive migration does not need to be reversed for a
  code rollback. If you must remove it, drop `Session`, `AuditLog`,
  `AdminUser.sessionVersion` and `LoginAttempt.identifier` **after** restoring
  from the backup taken in step 1.

---

## 8. Known residual risks (accepted, documented)

- **Transitive dependency advisories.** `npm audit` reports issues in
  transitive packages of `@vercel/blob` (`undici`, `@fastify/busboy`) and
  `cookie`. They are not reachable from user input in this application; a forced
  upgrade would be a breaking change and is deferred to a separate, tested
  change.
- **`cookie@0.6.x`** is used only for parsing our own `Set-Cookie` headers.
- **Audit log growth.** `AuditLog` is append-only and never pruned
  automatically. Consider a retention job if the table grows.
