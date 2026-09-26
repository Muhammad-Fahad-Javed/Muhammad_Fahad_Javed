// Creates the admin account (or resets its password) from ADMIN_EMAIL /
// ADMIN_PASSWORD environment variables. Safe to run more than once.
require('dotenv').config();
const prisma = require('../lib/db');
const { hashPassword } = require('../lib/auth');

async function main() {
  const email = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || '';

  if (!email || !password) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in your environment (or .env) before running this script.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('ADMIN_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.adminUser.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash, name: 'Admin' },
  });

  console.log(`✅ Admin user ready: ${user.email}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
