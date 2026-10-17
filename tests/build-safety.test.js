// ============================================================================
// Stage 4/5 — deployment and build safety.
//
// These are deliberately *static* checks: they assert that no build or deploy
// path can silently mutate production data or credentials, and that the
// generated artefacts are in sync. Covers D8, E1, E2, E3 and the D4 headers.
// ============================================================================
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { ROOT } = require('./helpers/harness');

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function readJson(relative) {
  return JSON.parse(read(relative));
}

// Recursively lists source files, skipping dependencies and VCS metadata.
function walkSourceFiles(dir, out) {
  const results = out || [];
  const skip = new Set(['node_modules', '.git', '.vercel', 'dist', 'build', 'uploads']);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkSourceFiles(full, results);
    else results.push(full);
  }
  return results;
}

// ---------------------------------------------------------------------------
// E1 — the build must not touch the database
// ---------------------------------------------------------------------------

test('E1: the build script never pushes the schema or destroys data', () => {
  const pkg = readJson('package.json');
  const build = pkg.scripts.build;

  assert.ok(build, 'a build script must exist');
  assert.ok(!/db push/.test(build), 'build must not run `prisma db push`');
  assert.ok(!/accept-data-loss/.test(build), 'build must not pass --accept-data-loss');
  assert.ok(!/migrate/.test(build), 'build must not apply migrations automatically');
  assert.ok(!/create-admin/.test(build), 'build must not create/reset the admin account');
  assert.ok(!/seed/.test(build), 'build must not seed content');
  assert.match(build, /prisma generate/, 'build should still generate the client');
});

test('E1: `--accept-data-loss` appears nowhere in any executable configuration', () => {
  const allowedExtensions = new Set(['.js', '.json', '.prisma', '.toml', '.sql', '.yml', '.yaml']);
  const offenders = [];

  for (const file of walkSourceFiles(ROOT)) {
    if (!allowedExtensions.has(path.extname(file))) continue;
    if (/[\\/]tests[\\/]/.test(file)) continue; // this assertion lives there
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!line.includes('accept-data-loss')) return;
      const trimmed = line.trim();
      // Documentation/comments may describe the flag that was removed.
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#')) return;
      offenders.push(`${path.relative(ROOT, file)}:${index + 1}`);
    });
  }

  assert.deepEqual(offenders, [], `--accept-data-loss is still used at: ${offenders.join(', ')}`);
});

test('E1: prepare-build does not connect to, migrate or seed the database', () => {
  // Strip comment lines first: the file documents the flag it no longer uses.
  const code = read('scripts/prepare-build.js')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  assert.ok(!/db push/.test(code), 'prepare-build must not push the schema');
  assert.ok(!/migrate deploy/.test(code), 'prepare-build must not apply migrations');
  assert.ok(!/seed/.test(code), 'prepare-build must not seed content');
  assert.match(code, /prisma validate/);
});

// ---------------------------------------------------------------------------
// E2 — credentials are never reset automatically
// ---------------------------------------------------------------------------

test('E2: create-admin refuses to run without an explicit mode', () => {
  const result = spawnSync(process.execPath, ['scripts/create-admin.js'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60000,
    env: Object.assign({}, process.env, {
      // Point at an unreachable database: the script must refuse before any
      // query is attempted.
      DATABASE_URL: 'postgresql://nobody:nobody@127.0.0.1:1/none',
      ADMIN_EMAIL: 'admin@portfolio.test',
      ADMIN_PASSWORD: 'password-1234',
    }),
  });

  assert.notEqual(result.status, 0, 'must exit non-zero without a mode');
  assert.match(`${result.stdout}${result.stderr}`, /--create|--reset-password/);
});

test('E2: the seed only creates a missing admin and never overwrites a password', () => {
  const source = read('prisma/seed.js');
  assert.match(source, /existingAdmin/, 'seed must check for an existing admin');
  assert.ok(!/adminUser\.upsert/.test(source), 'seed must not upsert over an existing admin');
  assert.ok(!/passwordHash: await hashPassword/.test(source.split('existingAdmin')[1] || ''));
});

test('E3: provisioning and migration are explicit, documented commands', () => {
  const pkg = readJson('package.json');
  for (const script of ['db:deploy', 'db:status', 'admin:create', 'admin:reset-password', 'test', 'test:registry']) {
    assert.ok(pkg.scripts[script], `missing npm script: ${script}`);
  }
  assert.ok(fs.existsSync(path.join(ROOT, 'docs', 'SECURITY_DEPLOYMENT.md')), 'deployment runbook must exist');
});

// ---------------------------------------------------------------------------
// B6 — generated artefacts stay in sync
// ---------------------------------------------------------------------------

test('B6: the generated client registry is up to date', () => {
  const result = spawnSync(process.execPath, ['scripts/generate-client-registry.js', '--check'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60000,
  });
  assert.equal(result.status, 0, `registry out of date:\n${result.stdout}${result.stderr}`);
});

// ---------------------------------------------------------------------------
// D4 / D8 — headers and ignore rules
// ---------------------------------------------------------------------------

test('D4: admin and API responses are marked noindex and are not cached', () => {
  const config = readJson('vercel.json');
  const forSource = (source) => (config.headers.find((entry) => entry.source === source) || {}).headers || [];
  const keysOf = (source) => forSource(source).map((header) => header.key);

  assert.ok(keysOf('/admin/(.*)').includes('X-Robots-Tag'));
  assert.ok(keysOf('/api/(.*)').includes('X-Robots-Tag'));
  assert.ok(keysOf('/api/(.*)').includes('Cache-Control'));
  assert.ok(keysOf('/(.*)').includes('X-Content-Type-Options'));
  assert.ok(keysOf('/(.*)').includes('X-Frame-Options'));

  const noindex = (source) => forSource(source).find((header) => header.key === 'X-Robots-Tag').value;
  assert.match(noindex('/admin/(.*)'), /noindex/);
  assert.match(noindex('/api/(.*)'), /noindex/);
});

test('D8: sensitive paths are git-ignored exactly once', () => {
  const lines = read('.gitignore')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  for (const entry of ['.env', '.vercel', 'node_modules/', 'frontend/uploads/*']) {
    assert.ok(lines.includes(entry), `${entry} must be ignored`);
  }
  assert.equal(new Set(lines).size, lines.length, 'no duplicate ignore entries');
});
