// ============================================================================
// Preloaded with `node --require preload.js ...` before the real application
// code runs.
//
// Installs a SQLite-backed Prisma client as the global that lib/db.js reuses,
// so the unmodified route handlers and prisma/seed.js run against a local file
// database instead of Postgres.
//
// SAFETY: DATABASE_URL is unconditionally repointed at the local SQLite file,
// so no code path — not even one that builds its own client from DATABASE_URL —
// can reach the production database by accident.
// ============================================================================
'use strict';

const path = require('path');

const { REPO_ROOT, DB_URL, CLIENT_DIR } = require('./paths');

// Read the repository .env first (for ADMIN_EMAIL and friends), then override
// the database target. dotenv never overwrites an already-set variable, so the
// order matters and the override below always wins.
require(path.join(REPO_ROOT, 'node_modules', 'dotenv')).config({
  path: path.join(REPO_ROOT, '.env'),
});

process.env.LOCAL_DATABASE_URL = DB_URL;
process.env.DATABASE_URL = DB_URL; // hard safety: never production
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// The local admin always gets a predictable password, so a production
// ADMIN_PASSWORD in .env is never reused on the local machine.
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'local-dev-password';

// Local-only integration credentials. These are throwaway values so the sync
// endpoints can be exercised offline; they never leave this machine and a real
// production key in .env is deliberately NOT used here.
process.env.SYNC_ENCRYPTION_KEY =
  process.env.LOCAL_SYNC_ENCRYPTION_KEY || 'local-dev-only-sync-key-0123456789abcdef';
process.env.CRON_SECRET = process.env.LOCAL_CRON_SECRET || 'local-dev-cron-secret';

let PrismaClient;
try {
  ({ PrismaClient } = require(CLIENT_DIR));
} catch {
  throw new Error(
    'Local Prisma client not found in ' + CLIENT_DIR + '.\n' +
    'Run `npm run dev:local:setup` (or `npm run dev:local`) to create it.'
  );
}

global.__PORTFOLIO_PRISMA__ = new PrismaClient();

module.exports = global.__PORTFOLIO_PRISMA__;
