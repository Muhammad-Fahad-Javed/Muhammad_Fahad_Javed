// ============================================================================
// Paths for the local development harness.
//
// Everything the harness creates lives under a single git-ignored directory
// (.local-dev/), so running the site locally never writes into tracked files.
// ============================================================================
'use strict';

const path = require('path');

// scripts/local-dev/ -> repository root
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const DEV_DIR = path.join(REPO_ROOT, '.local-dev');
const DB_FILE = path.join(DEV_DIR, 'dev.db');
const SCHEMA_FILE = path.join(DEV_DIR, 'schema.prisma');
const CLIENT_DIR = path.join(DEV_DIR, 'client');

// Prisma expects forward slashes inside a file: URL, including on Windows.
function toPrismaUrl(file) {
  return 'file:' + file.split(path.sep).join('/');
}

const DB_URL = toPrismaUrl(DB_FILE);

module.exports = {
  REPO_ROOT,
  DEV_DIR,
  DB_FILE,
  SCHEMA_FILE,
  CLIENT_DIR,
  DB_URL,
  toPrismaUrl,
};
