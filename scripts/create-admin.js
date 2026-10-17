// ============================================================================
// Explicit administrator provisioning / recovery.
//
// This script is deliberately NOT part of the build. Nothing here runs
// automatically, and no HTTP endpoint can create the first administrator.
//
// Usage:
//   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-strong-password' \
//     node scripts/create-admin.js --create
//       Creates the account when it does not exist. If it already exists the
//       password is left untouched (safe to run repeatedly).
//
//   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-new-password' \
//     node scripts/create-admin.js --reset-password
//       Sets a new password for an existing account and revokes every session.
//       This is the documented account-recovery path.
//
// Without one of those flags the script refuses to do anything, so it cannot
// accidentally be picked up by a build or deploy pipeline.
// ============================================================================
'use strict';

require('dotenv').config();
const prisma = require('../lib/db');
const { hashPassword } = require('../lib/auth');
const { revokeAllSessions } = require('../lib/sessions');

const MODE_CREATE = '--create';
const MODE_RESET = '--reset-password';

function usage() {
  console.log(
    [
      'Usage:',
      '  node scripts/create-admin.js --create           Create the admin account if missing (never overwrites a password).',
      '  node scripts/create-admin.js --reset-password   Set a new password and revoke all sessions.',
      '',
      'Requires ADMIN_EMAIL and ADMIN_PASSWORD environment variables.',
    ].join('\n')
  );
}

async function main() {
  const mode = process.argv[2];
  const email = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || '';

  if (mode !== MODE_CREATE && mode !== MODE_RESET) {
    usage();
    process.exit(1);
  }

  if (!email || !password) {
    console.error('ADMIN_EMAIL and ADMIN_PASSWORD must both be set.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('ADMIN_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } });

  if (mode === MODE_CREATE) {
    if (existing) {
      console.log(`Admin "${email}" already exists. Password left unchanged. Use --reset-password to change it.`);
      return;
    }
    try {
      await prisma.adminUser.create({
        data: { email, passwordHash: await hashPassword(password), name: 'Admin' },
      });
    } catch (err) {
      // Unique-constraint race: another process created it first.
      if (err && err.code === 'P2002') {
        console.log(`Admin "${email}" was created concurrently. Nothing to do.`);
        return;
      }
      throw err;
    }
    console.log(`Admin "${email}" created.`);
    return;
  }

  // --reset-password
  const passwordHash = await hashPassword(password);
  if (!existing) {
    await prisma.adminUser.create({ data: { email, passwordHash, name: 'Admin' } });
    console.log(`Admin "${email}" did not exist and was created.`);
    return;
  }

  await prisma.adminUser.update({ where: { id: existing.id }, data: { passwordHash } });
  await revokeAllSessions(existing.id);
  console.log(`Password updated for "${email}" and all existing sessions were revoked.`);
}

main()
  .catch((err) => {
    console.error('Admin provisioning failed:', err && err.message ? err.message : err);
    process.exit(1);
  })
  .finally(() => {
    if (typeof prisma.$disconnect === 'function') prisma.$disconnect().catch(() => {});
  });
