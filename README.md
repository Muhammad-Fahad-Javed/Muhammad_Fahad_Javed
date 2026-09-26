# Muhammad Fahad Javed — Portfolio + Admin CMS

A static, hand-built portfolio site with a real Admin Dashboard / CMS bolted
on top of it — without touching the original design, animations, or SEO.

```
.
├── frontend/                 → the public site (Vercel outputDirectory), unchanged design
│   ├── index.html
│   ├── admin/                 → Admin Dashboard (index.html = login, dashboard.html = the app)
│   ├── js/{config,main,content-loader}.js
│   ├── css/style.css
│   └── uploads/               → local-dev-only image storage fallback
├── api/                       → Vercel Serverless Functions (the backend)
│   ├── auth/                  → login, logout, me, change-password
│   ├── admin/                 → protected CRUD for every content type + media + stats + export/import
│   └── public/content.js      → public read-only aggregated content (no auth)
├── lib/                       → shared server code (db, auth, storage, resource registry, sanitizer)
├── prisma/                    → database schema + migration seed (copies your old hardcoded content in)
├── scripts/create-admin.js    → create/reset the admin login
└── vercel.json
```

## 1. How it works (architecture)

The original site was 100% static HTML/CSS/JS with all content hand-written
into `index.html` — no backend, no database. To add a real CMS **without**
rewriting the frontend into a framework, this adds:

- **Vercel Serverless Functions** in `/api` — plain Node.js functions,
  zero-config, deployed automatically by Vercel alongside your static site.
  No framework migration was needed.
- **PostgreSQL via Prisma ORM** for persistent storage. Vercel's serverless
  filesystem is read-only/ephemeral, so this uses a real hosted Postgres
  (free tier via Neon at neon.tech, or Vercel Postgres, both work) rather
  than SQLite.
- **JWT + bcrypt authentication** — a real login, not a hardcoded frontend
  password. Sessions are httpOnly, signed cookies; every admin API route
  verifies the token server-side.
- **Vercel Blob** for uploaded images/PDFs (falls back to writing into
  `frontend/uploads/` for local development only).
- **`js/content-loader.js`** — loaded right before `js/main.js`, it fetches
  `/api/public/content` and rewrites the CMS-managed sections of the DOM
  *before* `main.js`'s animations/observers run, so nothing about the visual
  design, scroll reveals, or cursor effects changes. If the API is ever
  unreachable, the static HTML (already seeded to match) is shown as-is —
  the page never breaks or renders empty.
- **A central resource registry** (`lib/resources.js`, mirrored for the
  browser in `frontend/admin/js/resources.js`) drives one generic CRUD API
  and one generic admin list/form UI for every content type. Adding a new
  manageable field or content type means editing this registry + the Prisma
  schema — not writing a new page from scratch.

**Trade-off worth knowing:** the original markup used `<picture>` with
AVIF/WebP variants for each hand-placed image. Images added or edited
through the CMS render as a single `<img>` (still lazy-loaded, with proper
`alt` text and dimensions) since the CMS stores one canonical image URL per
item. You keep full SEO/accessibility value; you lose the extra AVIF/WebP
variants specifically on items you edit through the dashboard.

## 2. What you can manage from `/admin`

Profile, Hero, About, Skills, Projects, Certificates, Experience, Education,
Services, Achievements, Testimonials, Social Links, Contact Information,
SEO, Media Library, Site Settings. Every collection (Skills, Projects,
Certificates, Experience, Education, Services, Achievements, Testimonials,
Social Links) supports create/edit/delete, drag-to-reorder, and a
publish/hide toggle; Projects/Certificates/Skills/Achievements also support
"Featured".

## 3. Local development

### Install
```bash
npm install
```

### Database
Easiest: create a free branch at neon.tech (takes ~1 minute, no credit
card) and copy its connection string. Alternatively run Postgres in Docker:
```bash
docker run --name portfolio-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
```

### Configure environment
```bash
cp .env.example .env
# fill in DATABASE_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
```

### Create tables + migrate your existing content in
```bash
npx prisma migrate dev --name init
npm run seed
```
`npm run seed` transcribes the content that used to be hardcoded in
`index.html` into the database, so the public site looks identical to
before. It's safe to re-run — it upserts by name/title, it will not create
duplicates or touch content you've already edited in the dashboard.

### Run
```bash
npm i -g vercel   # once
vercel dev
```
Visit `http://localhost:3000` for the site and `http://localhost:3000/admin`
to log in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set above.

## 4. Creating/resetting the admin login later
```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=newStrongPassword npm run create-admin
```
Or just log in and use **My Account → Change Password** in the dashboard.

## 5. Adding a certificate (example workflow)
1. Go to `/admin` → log in.
2. **Certificates → Add Certificate.**
3. Fill in name, organization, issue date, upload the image, save.
4. It's published immediately — refresh the public site and it's there.
5. Edit or delete it any time the same way. No code changes, no redeploy.

The same pattern (Add → Save → it appears on the public site) works for
every content type in the sidebar.

## 6. SEO
Editing **SEO** in the dashboard updates the page `<title>`, meta
description, Open Graph/Twitter tags, and canonical URL for every visitor's
browser as the page loads (via `content-loader.js`). `sitemap.xml`,
`robots.txt`, and structured metadata files are untouched and still served
exactly as before. Note: because this stayed a static site (by design, to
avoid a framework rewrite), social-media link previews and crawlers that
*don't* execute JavaScript will see the meta tags as of the last time you
ran `npm run seed` / redeployed, not your latest unsaved dashboard edit.
Redeploying after a significant SEO change keeps those in sync too.

## 7. Backup / export / import
- **Export:** dashboard → Dashboard → "Export Backup" downloads a full JSON
  snapshot of every collection and setting.
- **Import:** `POST` that JSON file to `/api/admin/import` (with your admin
  session cookie). Import is **additive/upsert-only** — it updates rows that
  already exist (matched by id) and creates new ones; it never deletes
  anything, so it's safe to use for merging content between environments.

## 8. Deployment (Vercel)

1. Push this repo to GitHub (see below).
2. Import the repo in Vercel. Framework preset: **Other** (already configured
   in `vercel.json` — don't change it, and don't remove `outputDirectory`).
3. In the Vercel project's **Storage** tab, create a **Postgres** database
   (or connect a Neon one) — this sets `DATABASE_URL` automatically — and a
   **Blob** store — this sets `BLOB_READ_WRITE_TOKEN` automatically.
4. In **Settings → Environment Variables**, add `JWT_SECRET` (a long random
   string), `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.
5. Deploy.
6. Run the one-time migration + seed against the production database from
   your machine (with `DATABASE_URL` in your local `.env` pointed at the
   production database):
   ```bash
   npx prisma migrate deploy
   npm run seed
   ```
7. Log in at `https://yourdomain.com/admin`.

No changes to your custom domain, DNS, or the rest of the Vercel project are
required.

## 9. Security notes
- Passwords are hashed with bcrypt; sessions are signed JWTs in httpOnly,
  `SameSite=Lax` cookies (not accessible to JavaScript, not sent cross-site).
- Every mutating admin API request must include a custom header the browser
  only sends for same-origin JavaScript requests, which blocks classic CSRF
  form/script attacks.
- Login attempts are rate-limited per IP (10 failed attempts / 15 minutes)
  at the database level.
- Uploaded file type and size are validated server-side, not just in the UI.
- Rich text fields are sanitized server-side to a small safe tag allow-list.
- No secrets are hardcoded anywhere in the repository; everything sensitive
  comes from environment variables, which are `.gitignore`d locally.

## 10. Pushing to GitHub
```bash
git init
git add .
git commit -m "Add Admin Dashboard / CMS on top of the existing portfolio"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```
(If this folder is already a git repo, skip `git init` and just commit/push.)

## 11. Testing checklist
Manually verified during development: JS syntax-checked across every file,
`npm install` resolves cleanly, JSON config files validated. Admin
login/logout, unauthorized access rejection (401) on every `/api/admin/*`
route, create/edit/delete for every collection, image upload, drag-reorder,
publish/hide toggle, Profile/Hero/About/SEO/Site Settings edits, and
export/import were all built and code-reviewed end-to-end. This sandbox has
no outbound access to a real Postgres instance or Prisma's binary CDN, so
the full request/response cycle against a live database could not be
executed here — run through this checklist yourself once you have a real
`DATABASE_URL` connected (section 3), before considering the migration
final. In particular: add a certificate from `/admin`, confirm it appears on
the public site, edit it, confirm the change appears, delete it, confirm it
disappears — all without touching source code.

## 12. Known limitations / possible follow-ups
- Dynamic per-request SEO for non-JS crawlers would need server-side
  rendering of `index.html`, which means introducing a framework — out of
  scope here to honor "don't redesign / don't rewrite unless necessary."
- The lightweight rich-text editor supports bold/italic/lists/headings/links
  only, by design, as requested.
- Local dev without a Blob token stores uploads on local disk — fine for
  testing, but connect Vercel Blob before you rely on uploads in production.
