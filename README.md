# Muhammad Fahad Javed — Portfolio (Frontend + Backend)

This package splits your original single-file portfolio into a proper
frontend/backend project, and adds a real backend + database + admin
dashboard so you can manage projects and contact messages without touching code.

```
portfolio/
├── frontend/              → your existing site, now split into files
│   ├── index.html
│   ├── 404.html
│   ├── sitemap.xml
│   ├── robots.txt
│   ├── css/style.css
│   └── js/
│       ├── config.js       → API base URL (edit this after deploying the backend)
│       └── main.js
│
└── backend/                → new Node.js + Express + MongoDB API
    ├── server.js
    ├── package.json
    ├── .env.example         → copy to .env and fill in
    ├── config/
    │   ├── db.js
    │   └── seed.js          → creates your first admin login
    ├── models/               (Admin, Message, Project)
    ├── routes/                (auth, contact, projects, github)
    ├── middleware/auth.js
    └── admin/index.html      → the admin dashboard (served at /admin)
```

## What changed from your original file

- The 6,900-line `index.html` has been split into `index.html` + `css/style.css`
  + `js/main.js` + `js/config.js`. Behavior is unchanged — same design, same animations.
- The contact form now posts to **your own backend** (`/api/contact`) instead of
  Web3Forms directly, so submissions are stored in a database and you get an
  email notification.
- Everything else (GitHub stats widget, animations, SEO tags, CSP) is untouched.

---

## 1. Database: use MongoDB Atlas

For a portfolio (contact messages + a projects list), you don't need a heavy
relational database — MongoDB Atlas is the right pick because:
- **Free tier (M0)** is generous and permanent, not a trial.
- Comes with a **built-in web dashboard** (Atlas UI) where you can browse,
  edit, and export collections without writing queries — handy alongside the
  custom admin dashboard included here.
- Works natively with Mongoose (already wired up in `backend/models/`).

Setup:
1. Create a free account at mongodb.com/cloud/atlas
2. Create a free M0 cluster
3. Create a database user (username + password)
4. Network Access → allow access from anywhere (`0.0.0.0/0`) for now, tighten later
5. Get your connection string (Connect → Drivers → Node.js) and paste it into
   `backend/.env` as `MONGODB_URI`

If you outgrow MongoDB later (e.g. need complex relational reporting),
PostgreSQL (via Supabase, which also gives you a free dashboard) is the natural
next step — but for this project's shape, Mongo is simpler and faster to ship.

## 2. Backend setup (local)

```bash
cd backend
cp .env.example .env
# edit .env: MONGODB_URI, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, SMTP_* 
npm install
npm run seed      # creates your first admin login from .env
npm run dev        # starts on http://localhost:5000
```

Visit `http://localhost:5000/admin` and log in with the ADMIN_EMAIL /
ADMIN_PASSWORD you set in `.env`.

## 3. Frontend setup (local)

The frontend is static — no build step. Just open `frontend/index.html`
in a browser, or serve it:

```bash
cd frontend
npx serve .
```

Edit `frontend/js/config.js` and confirm the `API_BASE_URL` matches wherever
your backend is running.

## 4. Admin dashboard

Served automatically at `YOUR_BACKEND_URL/admin`. It lets you:
- View, mark-as-read, and delete contact form messages
- Add / delete portfolio projects (title, description, tags, links)

No separate hosting needed — it's static files served by the same Express app.

## 5. Deployment

**Frontend** → keep it on Vercel (as you already have it). Push the
`frontend/` folder contents as the deploy root.

**Backend** → deploy to Render or Railway (both have free tiers, unlike
Vercel which isn't built for long-running Node servers):
1. Push `backend/` to a GitHub repo
2. On Render: New → Web Service → connect the repo → build command `npm install`,
   start command `npm start`
3. Add all the `.env` variables in Render's dashboard (Environment tab)
4. After it deploys, copy the live URL (e.g. `https://fahad-api.onrender.com`)
   into `frontend/js/config.js` as the production `API_BASE_URL`
5. Redeploy the frontend

---

## Roadmap: what to do after unzipping

1. **Get it running locally** — backend `.env` filled in, `npm run seed`,
   `npm run dev`, confirm `/admin` login works and `/api/contact` accepts a
   test submission.
2. **Set up MongoDB Atlas** (see above) and confirm the backend connects
   (you'll see `✅ MongoDB connected` in the terminal).
3. **Deploy the backend** to Render or Railway. Confirm `https://your-api/`
   returns `{"status":"ok"}`.
4. **Point the frontend at the live backend** — edit `config.js`, redeploy
   to Vercel.
5. **Test end-to-end**: submit the contact form on the live site → check it
   shows up in `/admin` → check you got the email notification.
6. **Migrate your hardcoded project cards** into the database via `/admin`,
   then update the frontend to fetch `/api/projects` and render them
   dynamically instead of hardcoded HTML (this is the one piece of frontend
   JS you'd still need to write — a `renderProjects()` function that loops
   over the API response; happy to write that with you once you confirm the
   backend is live, since it depends on your exact card markup).
7. **Lock down security**: change the default JWT_SECRET, restrict MongoDB
   Atlas network access to your backend's IP once deployed, set a strong
   admin password.
8. **Polish for top 1%** (see rating notes below): add automated tests,
   a Lighthouse CI check, real case-study write-ups for 2–3 projects instead
   of just cards, and a blog or "notes" section if you want to demonstrate
   writing/communication skill too.
9. **Custom domain** — point a real domain (yourname.dev or similar) at the
   Vercel deployment instead of the `.vercel.app` subdomain.
10. **Monitor** — add UptimeRobot (free) pinging your backend, since Render's
    free tier sleeps after inactivity; the ping keeps it warm.
