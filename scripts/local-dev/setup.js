// ============================================================================
// Creates (or refreshes) the local development database.
//
//   1. derives a SQLite schema from prisma/schema.prisma
//   2. pushes it into .local-dev/dev.db
//   3. generates an isolated Prisma client into .local-dev/client
//   4. seeds the database with the bundled content + a local admin user
//
// Run with:  npm run dev:local:setup
//            npm run dev:local:reset      (start from an empty database)
//
// Note: this deliberately does NOT force destructive schema changes through.
// An additive schema change just works; if a change would discard data, Prisma
// stops and this script explains how to start the disposable database over.
// ============================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { REPO_ROOT, DEV_DIR, DB_FILE, SCHEMA_FILE, DB_URL } = require('./paths');
const { generate } = require('./schema');

const args = process.argv.slice(2);
const RESET = args.includes('--reset');
const SKIP_SEED = args.includes('--skip-seed');

// Invoke the Prisma CLI through its JS entry point rather than the .bin shim,
// so this works the same on Windows and POSIX without a shell.
function prismaCli() {
  return require.resolve('prisma/build/index.js', { paths: [REPO_ROOT] });
}

function run(label, argv, env) {
  console.log('\n' + label);
  execFileSync(process.execPath, argv, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: Object.assign({}, process.env, env),
  });
}

function main() {
  fs.mkdirSync(DEV_DIR, { recursive: true });

  if (RESET && fs.existsSync(DB_FILE)) {
    fs.rmSync(DB_FILE);
    console.log('Removed the existing local database.');
  }

  const { schema, models } = generate();
  console.log(
    'Generated ' + path.relative(REPO_ROOT, schema) + ' from prisma/schema.prisma (' + models + ' models)'
  );

  const dbEnv = { LOCAL_DATABASE_URL: DB_URL, DATABASE_URL: DB_URL };

  try {
    run('Applying the schema to the local SQLite file...', [
      prismaCli(), 'db', 'push',
      '--schema', SCHEMA_FILE,
      '--skip-generate',
    ], dbEnv);
  } catch {
    console.error(
      '\nThe local database would not accept the current schema. See the message above.\n' +
      '- If Prisma stopped because the change would discard data, that is fine here:\n' +
      '  this database is disposable. Start it over with `npm run dev:local:reset`.\n' +
      '- Otherwise fix the schema and run this command again.\n' +
      '\nYour production database is never touched by any of these commands.'
    );
    process.exit(1);
  }

  run('Generating the local Prisma client...', [
    prismaCli(), 'generate',
    '--schema', SCHEMA_FILE,
  ], dbEnv);

  if (SKIP_SEED) {
    console.log('\nSkipping the seed (--skip-seed).');
  } else {
    run('Seeding the local database...', [
      '--require', path.join(__dirname, 'preload.js'),
      path.join(REPO_ROOT, 'prisma', 'seed.js'),
    ], Object.assign({ NODE_ENV: 'development' }, dbEnv));
  }

  console.log('\nLocal database ready: ' + DB_FILE);
  console.log('Start the site with: npm run dev:local');
}

main();
