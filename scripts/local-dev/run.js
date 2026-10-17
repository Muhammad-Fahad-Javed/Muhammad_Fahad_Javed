// ============================================================================
// One command to run the site locally: prepares the local database if it is
// missing or its schema is out of date, then starts the server.
//
//   npm run dev:local            http://localhost:4180
//   PORT=5000 npm run dev:local  a different port
//
// Nothing here touches the production database — see preload.js.
// ============================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { REPO_ROOT, DB_FILE, SCHEMA_FILE, CLIENT_DIR } = require('./paths');

const SOURCE_SCHEMA = path.join(REPO_ROOT, 'prisma', 'schema.prisma');

function modifiedAt(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

const reasons = [];
if (!fs.existsSync(DB_FILE)) reasons.push('the database has not been created yet');
if (!fs.existsSync(path.join(CLIENT_DIR, 'index.js'))) reasons.push('the local Prisma client is missing');
if (fs.existsSync(SCHEMA_FILE) && modifiedAt(SOURCE_SCHEMA) > modifiedAt(SCHEMA_FILE)) {
  reasons.push('prisma/schema.prisma has changed since the local database was built');
}

if (reasons.length) {
  console.log('Preparing the local database first (' + reasons.join('; ') + ').\n');
  execFileSync(process.execPath, [path.join(__dirname, 'setup.js')], { stdio: 'inherit' });
  console.log('');
}

require('./server.js');
