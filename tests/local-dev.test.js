// ============================================================================
// Guards for the local development harness.
//
// Two things must not go wrong here: the harness must never be able to reach
// the production database, and it must stay in step with the real schema and
// the API surface as both grow.
// ============================================================================
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { buildLocalSchema, SOURCE_SCHEMA } = require('../scripts/local-dev/schema');
const { ROUTES } = require('../scripts/local-dev/routes');
const { resolveStaticPath } = require('../scripts/local-dev/static');
const { DB_URL, DB_FILE, CLIENT_DIR, REPO_ROOT } = require('../scripts/local-dev/paths');

const source = fs.readFileSync(SOURCE_SCHEMA, 'utf8');
const generated = buildLocalSchema(source, CLIENT_DIR);
const sourceModels = (source.match(/^model \w+/gm) || []).map((m) => m.replace('model ', ''));
const models = sourceModels.map((name) => name + ' ');

test('local-dev: the derived schema is SQLite and can never read the production URL', () => {
  assert.match(generated, /provider\s*=\s*"sqlite"/);
  assert.match(generated, /env\("LOCAL_DATABASE_URL"\)/);
  assert.ok(!/postgresql/.test(generated), 'the local schema still mentions postgresql');
  assert.ok(
    !/env\("DATABASE_URL"\)/.test(generated),
    'the local schema must read LOCAL_DATABASE_URL, never DATABASE_URL'
  );
});

test('local-dev: the local client is generated outside node_modules', () => {
  assert.equal(CLIENT_DIR, path.join(REPO_ROOT, '.local-dev', 'client'));
  assert.ok(
    generated.includes('output   = "' + CLIENT_DIR.split(path.sep).join('/') + '"'),
    'the generator output must point at .local-dev/client'
  );
  assert.ok(
    !/output\s*=\s*"[^"]*node_modules/.test(generated),
    'generating into node_modules would overwrite the Postgres client'
  );
});

test('local-dev: the local database is a file, never a network address', () => {
  assert.ok(DB_URL.startsWith('file:'), 'expected a file: URL, got ' + DB_URL);
  assert.ok(!/^postgres/.test(DB_URL));
  assert.ok(DB_URL.includes('.local-dev/'));
  assert.equal(DB_FILE, path.join(REPO_ROOT, '.local-dev', 'dev.db'));
});

test('local-dev: every model in the real schema survives the conversion', () => {
  assert.ok(sourceModels.length > 25, 'expected the full schema, saw ' + sourceModels.length + ' models');
  for (const model of models) {
    assert.ok(generated.includes('model ' + model), 'the conversion dropped ' + model.trim());
  }
  assert.equal((generated.match(/^model /gm) || []).length, sourceModels.length);
});

test('local-dev: every api handler is reachable through the dev server router', () => {
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.name.endsWith('.js') ? [full] : [];
    });

  const onDisk = walk(path.join(REPO_ROOT, 'api'))
    .map((file) => path.relative(REPO_ROOT, file).split(path.sep).join('/'))
    .sort();

  const routed = [...new Set(ROUTES.map((route) => route.file))].sort();

  assert.deepEqual(routed, onDisk, 'the dev server router is out of step with api/');
  for (const file of routed) {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, file)), 'route points at a missing file: ' + file);
  }
});

test('local-dev: the static server refuses to serve outside frontend/', () => {
  const frontend = path.join(REPO_ROOT, 'frontend');

  assert.equal(resolveStaticPath(frontend, '/'), path.join(frontend, 'index.html'));
  assert.equal(resolveStaticPath(frontend, '/css/style.css'), path.join(frontend, 'css', 'style.css'));
  assert.equal(resolveStaticPath(frontend, '/admin'), path.join(frontend, 'admin', 'index.html'));
  assert.equal(resolveStaticPath(frontend, '/admin/'), path.join(frontend, 'admin', 'index.html'));

  for (const attack of [
    '/../../.env',
    '/../.env',
    '/js/../../../.env',
    '/..%2f..%2f.env',
    '/%2e%2e/%2e%2e/.env',
    '/a/../../../../../../etc/passwd',
    '/index.html\0.png',
  ]) {
    assert.equal(resolveStaticPath(frontend, attack), null, 'traversal not blocked: ' + attack);
  }
});
