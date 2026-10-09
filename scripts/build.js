// Vercel build: generate Prisma client, sync schema (never destructively),
// ensure admin + one-time seed exist, then inject CMS SEO into the HTML.
require('dotenv').config();
const { spawnSync } = require('child_process');
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  return r.status === 0;
};

if (!run('npx', ['prisma', 'generate'])) process.exit(1);

if (process.env.DATABASE_URL) {
  // No --accept-data-loss: Prisma refuses destructive changes instead of
  // silently dropping columns/data. A failure here fails the deploy loudly
  // rather than shipping a site whose CMS can't read/write the database.
  if (!run('npx', ['prisma', 'db', 'push', '--skip-generate'])) {
    console.error('prisma db push failed - refusing to deploy with a mismatched schema.');
    process.exit(1);
  }
  run('node', ['scripts/create-admin.js']);
  run('node', ['prisma/seed.js']);
} else {
  console.warn('DATABASE_URL not set: skipping DB sync/seed (static fallback content only).');
}
run('node', ['scripts/inject-seo.js']);
run('node', ['scripts/check-assets.js']);
