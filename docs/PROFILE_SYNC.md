# Profile synchronisation (GitHub)

Automatically keeps the portfolio's GitHub profile and featured projects up to
date from the official GitHub REST API, without ever overwriting something you
wrote by hand.

---

## 1. What it does — and what it deliberately does not

**GitHub (implemented)**

| Field | Source | Write policy |
|---|---|---|
| `GithubSection.username` | `login` | overwrite |
| `GithubSection.profileUrl` | `html_url` | overwrite |
| `GithubSection.bio` | `bio` | **fill-only** |
| `GithubSection.location` | `location` | **fill-only** |
| `Profile.fullName` | `name` | overwrite |
| `Profile.profileImage` | `avatar_url` | overwrite, **only if "Use my GitHub avatar" is on** |
| `Project.shortDesc` | repo `description` | **fill-only** |
| `Project.technologies` | repo `language` + `topics` | **fill-only** |
| `Project.githubUrl` | repo `html_url` | overwrite |
| `Project.repoUpdatedAt` | repo `updated_at` | overwrite (internal metadata, never published) |

"fill-only" means *write only while the field is empty*. A description you wrote
yourself is never replaced by a one-line repository blurb.

**LinkedIn (not enabled)**

LinkedIn's official self-serve API ("Sign In with LinkedIn using OpenID
Connect") only returns:

```
sub, name, given_name, family_name, picture, locale, email, email_verified
```

There is **no official API** for headline, About, work experience, education or
skills — those were withdrawn from third-party apps in 2015 and are now
partner-only. Member tokens also expire after 60 days, and refresh tokens are
restricted to approved partners.

So any future LinkedIn integration can only ever sync **name, photo and
identity**. Everything else stays manually editable (that is Phase 2 of the
brief: manual overrides for fields the API cannot provide). No scraping, no
password collection, no access-control bypass is implemented anywhere.

---

## 2. How it works

```
api/sync/*            HTTP surface (session + CSRF protected)
api/cron/sync.js      scheduled entry point (CRON_SECRET protected)
        │
lib/sync/service.js   orchestration: connect, run, disconnect, status
        │
lib/sync/github.js    pure fetch + mapping (no database access)
        │
lib/sync/engine.js    the ONLY writer; enforces the safety rules
        │
lib/sync/crypto.js    AES-256-GCM sealing of credentials
```

### The rules the engine enforces

1. A sync is only applied after the provider call fully succeeded.
2. `null`, empty or whitespace values **never** overwrite existing content.
3. A **locked** field is never written — manual override always wins.
4. `fill-only` fields are written only while empty.
5. Identical values are skipped, so repeat syncs are no-ops.
6. All writes in a run happen in **one transaction**: a failure applies nothing.
7. Every attempt is logged in `SyncRun` with counts, never with values or tokens.
8. Private repositories are dropped by the provider, even when the token could
   read them.

---

## 3. Security model

- **Tokens at rest:** sealed with AES-256-GCM (`SYNC_ENCRYPTION_KEY`), bound to
  the provider name as additional authenticated data, so a ciphertext cannot be
  replayed into another integration.
- **Fail closed:** without `SYNC_ENCRYPTION_KEY` (≥ 32 chars) every seal/open
  throws. There is no fallback key.
- **Never exposed:** no API response, log line or error message contains a
  token. `Integration` rows are projected through an explicit allow-list, and
  run messages are scrubbed of `ghp_…` / `github_pat_…` / `Bearer …` patterns.
- **Server-side authorisation:** every `/api/sync/*` route goes through the
  existing `requireAuth` (session + CSRF). Nothing relies on hiding buttons.
- **Token format validated** before any network call, then verified against
  GitHub before it is stored.
- **SSRF guard:** pagination only follows `Link` URLs on `https://api.github.com`,
  so a forged header cannot redirect the Authorization header elsewhere.
- **Scheduler:** `/api/cron/sync` refuses to run at all unless `CRON_SECRET` is
  configured, and compares it in constant time.

---

## 4. Setup

### 4.1 Environment variables

```bash
SYNC_ENCRYPTION_KEY=   # openssl rand -base64 48   (≥ 32 chars)
CRON_SECRET=           # openssl rand -base64 32   (≥ 16 chars)
```

Add these in Vercel → Project → Settings → Environment Variables (Production and
Preview). `BLOB_READ_WRITE_TOKEN` is unrelated to sync but still required for
image uploads.

### 4.2 Database migration

```bash
npm run db:status     # confirm what is pending
npm run db:deploy     # applies 20261020000000_profile_sync
```

The migration is **additive only**: three new tables (`Integration`,
`FieldState`, `SyncRun`) and two nullable/defaulted columns on `Project` plus
one boolean on `GithubSection`. No existing column is dropped or rewritten, so
reverting the deployment is safe.

### 4.3 Create a GitHub token

Use a **fine-grained personal access token**:

- Repository access: *Public repositories (read-only)*
- Permissions: *Metadata: read-only* — that is enough for profile + public repos.

Classic tokens (`ghp_…`) with no scopes also work, since profile and public
repository data is public.

The token is pasted into the admin once and stored sealed. It is **not** an
environment variable, so it never appears in Vercel's configuration screens.

### 4.4 Schedule

`vercel.json` registers one daily cron:

```json
"crons": [{ "path": "/api/cron/sync", "schedule": "0 6 * * *" }]
```

Vercel sends `Authorization: Bearer $CRON_SECRET` automatically. On the Hobby
plan cron jobs run once per day, which matches this schedule.

---

## 5. API

All `/api/sync/*` routes require an admin session **and** the CSRF headers the
dashboard sends (`X-Requested-With: portfolio-admin` plus a same-origin Origin).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/sync/status` | Connection state, last run, per-field provenance. No credentials. |
| POST | `/api/sync/run` | `{ "provider": "github" }` — manual "Sync Now". |
| POST | `/api/sync/github` | `{ "token": "github_pat_…" }` — verify, seal, store. |
| DELETE | `/api/sync/github` | Disconnect and wipe the stored credential. |
| GET | `/api/sync/repos` | Public repositories, for the featured-projects allowlist. |
| GET | `/api/cron/sync` | Scheduled run. `CRON_SECRET` only. |

Failure semantics:

| Situation | Response |
|---|---|
| No credential stored | `409 INTEGRATION_NOT_CONNECTED` |
| Token rejected / revoked | `409 SYNC_RECONNECT_REQUIRED` |
| GitHub quota exhausted | `429` + `Retry-After` |
| GitHub unreachable / timed out | `504` |
| A sync already running | `409 SYNC_IN_PROGRESS` |

---

## 6. Operating it

### The featured-projects allowlist

A project is only ever synchronised when it names a repository in
**Projects → GitHub Repository (owner/name)**. Everything else stays manual.
This is what stops "every repository I own" from becoming a featured project.

### Locking a field

After a sync, `FieldState` records where each value came from. Setting
`locked = true` on a row means automation will never touch that field again —
useful when you prefer your own wording for a headline or a project blurb.

### Disconnecting

`DELETE /api/sync/github` wipes the ciphertext and resets the row. Existing
content is left exactly as it is: disconnecting never deletes portfolio data.

---

## 7. Known limitations

- **One sync at a time per provider.** A concurrent run is rejected with 409
  rather than queued.
- **Bounded work.** 3 pages × 100 repositories, 5 s per request, ~8 s total —
  sized for a 10 s serverless invocation.
- **Non-null but stale values still win.** If a repo *has* a description, a
  `fill-only` field that is already populated will not adopt it. Use
  `overwrite` (or clear the field) when you want GitHub to win.
- **No webhooks.** Repository events do not change the profile often enough to
  justify a publicly reachable unauthenticated endpoint.
- **`Profile.fullName` is overwritten** on every sync, so change it on GitHub or
  lock the field locally.
- **Admin UI not yet built.** Phase A ships the schema, engine, provider and
  API; the Integrations page (connect buttons, Sync Now, sync history, field
  badges) is the next phase. Until then use the endpoints above.

---

## 8. Tests

```bash
node --test tests/sync-engine.test.js tests/sync-api.test.js
```

38 tests, all offline (GitHub is simulated by replacing `globalThis.fetch`):
credential sealing/tamper detection, fail-closed configuration, retry and
back-off behaviour, `Retry-After` handling, quota detection, request timeouts,
private-repository filtering, pagination origin checks, mapping rules, every
engine decision branch, transaction rollback, unauthenticated access, CSRF,
invalid/revoked tokens, unchanged-data no-ops, disconnect, and the scheduled
endpoint's fail-closed behaviour.

Not covered: a real GitHub round-trip with a live token, and migration
execution against a fresh Postgres instance.
