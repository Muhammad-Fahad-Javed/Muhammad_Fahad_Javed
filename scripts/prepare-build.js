require('dotenv').config();
const { execSync } = require('child_process');

function shouldSkipDbPush() {
  const dbUrl = (process.env.DATABASE_URL || '').trim();
  if (!dbUrl) {
    console.warn('⚠️ DATABASE_URL not set. Skipping Prisma db push for build.');
    return true;
  }

  if (/localhost|127\.0\.0\.1/.test(dbUrl)) {
    console.warn('⚠️ DATABASE_URL points to a local development database. Skipping Prisma db push for build.');
    return true;
  }

  return false;
}

function main() {
  if (shouldSkipDbPush()) {
    return;
  }

  try {
    console.log('Syncing Prisma schema to the configured database...');
    execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
  } catch (err) {
    console.warn('⚠️ Prisma db push failed during build. Continuing without a database sync.');
  }
}

main();
