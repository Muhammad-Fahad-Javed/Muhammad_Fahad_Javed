// ============================================================================
// Build preparation.
//
// SAFETY: this step must never modify the database.
//
// It previously ran `prisma db push --accept-data-loss`, which meant a routine
// deployment could silently rewrite (and destroy) the production schema. Schema
// changes are now applied only by an explicit, reviewed migration step:
//
//   npm run db:status   # show what is pending
//   npm run db:deploy   # apply reviewed migrations
//
// See docs/SECURITY_DEPLOYMENT.md.
// ============================================================================
'use strict';

require('dotenv').config();
const { execSync } = require('child_process');

function main() {
  try {
    console.log('Validating Prisma schema (no database changes are made)...');
    execSync('npx prisma validate', { stdio: 'inherit' });
  } catch {
    console.error('Prisma schema validation failed. Aborting the build.');
    process.exit(1);
  }
  console.log('Build preparation complete. The database was not modified.');
}

main();
