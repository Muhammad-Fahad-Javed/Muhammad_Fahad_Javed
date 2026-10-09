// Creates the admin account (or resets its password) from ADMIN_EMAIL /
// ADMIN_PASSWORD environment variables. Safe to run more than once.
require('dotenv').config();
const prisma = require('../lib/db');
const { hashPassword } = require('../lib/auth');

async function main() {
  const email = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || '';

  if (!email || !password) {
    console.warn('⚠️ ADMIN_EMAIL or ADMIN_PASSWORD environment variable not set. Skipping automatic admin creation.');
    process.exit(0);
  }
  if (password.length < 8) {
    console.error('ADMIN_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  // By default this only CREATES the admin. Re-running on every deploy used
  // to overwrite a password changed from "My Account" with ADMIN_PASSWORD.
  // Pass --reset to deliberately reset the password.
  const reset = process.argv.includes('--reset');
  const user = await prisma.adminUser.upsert({
    where: { email },
    update: reset ? { passwordHash } : {},
    create: { email, passwordHash, name: 'Admin' },
  });

  console.log(reset ? `✅ Admin password reset: ${user.email}` : `✅ Admin user ready: ${user.email}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
