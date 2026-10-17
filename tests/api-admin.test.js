// ============================================================================
// Stage 3 — API and data-integrity behaviour.
// Covers B1, B3, B5, B7, B8, C1, C2, C6, C9, C10, C12 and the XSS write path.
// ============================================================================
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createFakePrisma } = require('./helpers/fake-prisma');
const { loadModule, mockReq, callHandler, cookieFrom } = require('./helpers/harness');

const ADMIN_EMAIL = 'admin@portfolio.test';
const ADMIN_PASSWORD = 'password-1234';

// Boots a fresh app instance (fake DB + authenticated session cookie).
async function bootstrap() {
  const prisma = createFakePrisma();
  const { hashPassword } = loadModule('lib/auth.js', prisma);
  await prisma.adminUser.create({
    data: { email: ADMIN_EMAIL, passwordHash: await hashPassword(ADMIN_PASSWORD), name: 'Admin', sessionVersion: 1 },
  });
  const auth = loadModule('api/auth/[...route].js', prisma);
  const res = await callHandler(
    auth,
    mockReq({ method: 'POST', url: '/api/auth/login', query: { route: 'login' }, body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } })
  );
  assert.equal(res.statusCode, 200);
  return { prisma, cookie: cookieFrom(res) };
}

async function call(relative, prisma, options) {
  const handler = loadModule(relative, prisma);
  return callHandler(handler, mockReq(options));
}

const COLLECTION = 'api/admin/[resource]/index.js';
const ITEM = 'api/admin/[resource]/[id].js';
const SINGLETON = 'api/admin/singleton/[type].js';

async function createSkill(prisma, cookie, name) {
  return call(COLLECTION, prisma, {
    method: 'POST',
    query: { resource: 'skills' },
    body: { name, category: 'Programming Languages' },
    cookie,
  });
}

// ---------------------------------------------------------------------------
// B1 — prototype keys
// ---------------------------------------------------------------------------

test('B1: prototype-key resource names are rejected with a controlled error', async () => {
  const { prisma, cookie } = await bootstrap();

  for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'nope']) {
    const res = await call(COLLECTION, prisma, { method: 'GET', query: { resource: name }, cookie });
    assert.equal(res.statusCode, 404, `collection ${name}`);
    assert.equal(res.body.code, 'UNKNOWN_RESOURCE');
  }

  for (const type of ['__proto__', 'constructor', 'toString', 'nope']) {
    const res = await call(SINGLETON, prisma, { method: 'GET', query: { type }, cookie });
    assert.equal(res.statusCode, 404, `singleton ${type}`);
    assert.equal(res.body.code, 'UNKNOWN_SETTINGS_TYPE');
  }

  for (const name of ['__proto__', 'constructor', 'toString']) {
    const res = await call('api/admin/reorder.js', prisma, {
      method: 'POST',
      body: { resource: name, orderedIds: ['x'] },
      cookie,
    });
    assert.equal(res.statusCode, 404, `reorder ${name}`);
    assert.equal(res.body.code, 'UNKNOWN_RESOURCE');
  }
});

// ---------------------------------------------------------------------------
// C1 — malformed JSON
// ---------------------------------------------------------------------------

test('C1: malformed JSON is a 400, not a silent empty write', async () => {
  const { prisma, cookie } = await bootstrap();
  const res = await call(COLLECTION, prisma, {
    method: 'POST',
    query: { resource: 'skills' },
    body: '{ this is not json',
    cookie,
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'MALFORMED_JSON');
  assert.equal(await prisma.skill.count(), 0);
});

// ---------------------------------------------------------------------------
// A2 — the XSS write path
// ---------------------------------------------------------------------------

test('A2: rich text is sanitised on create', async () => {
  const { prisma, cookie } = await bootstrap();
  const res = await call(COLLECTION, prisma, {
    method: 'POST',
    query: { resource: 'projects' },
    body: { title: 'T', fullDesc: '<p>ok</p><script>alert(1)</script><img src=x onerror=alert(1)>' },
    cookie,
  });
  assert.equal(res.statusCode, 201);
  assert.ok(!/script/i.test(res.body.fullDesc));
  assert.ok(!/onerror/i.test(res.body.fullDesc));
  assert.match(res.body.fullDesc, /<p>ok<\/p>/);
});

// ---------------------------------------------------------------------------
// C2 — concurrency-safe ordering
// ---------------------------------------------------------------------------

test('C2: new items append after the maximum order (no duplicates after a delete)', async () => {
  const { prisma, cookie } = await bootstrap();

  const a = await createSkill(prisma, cookie, 'A');
  const b = await createSkill(prisma, cookie, 'B');
  const c = await createSkill(prisma, cookie, 'C');
  assert.deepEqual([a.body.order, b.body.order, c.body.order], [0, 1, 2]);

  await call(ITEM, prisma, { method: 'DELETE', query: { resource: 'skills', id: b.body.id }, cookie });
  const d = await createSkill(prisma, cookie, 'D');
  assert.equal(d.body.order, 3);

  const rows = await prisma.skill.findMany({});
  assert.equal(new Set(rows.map((row) => row.order)).size, rows.length, 'order values must stay unique');
});

// ---------------------------------------------------------------------------
// B3 / C12 — reorder validation
// ---------------------------------------------------------------------------

test('B3/C12: reorder rejects duplicates, unknown ids and empty lists', async () => {
  const { prisma, cookie } = await bootstrap();
  const a = await createSkill(prisma, cookie, 'A');
  const b = await createSkill(prisma, cookie, 'B');
  const reorder = (orderedIds) => call('api/admin/reorder.js', prisma, { method: 'POST', body: { resource: 'skills', orderedIds }, cookie });

  assert.equal((await reorder([a.body.id, a.body.id])).statusCode, 400);
  assert.equal((await reorder([a.body.id, 'ghost'])).statusCode, 400);
  assert.equal((await reorder([])).statusCode, 400);
  assert.equal((await reorder([1, 2])).statusCode, 400);

  const ok = await reorder([b.body.id, a.body.id]);
  assert.equal(ok.statusCode, 200);
  const after = await prisma.skill.findMany({ orderBy: { order: 'asc' } });
  assert.deepEqual(after.map((row) => row.name), ['B', 'A']);
  assert.deepEqual(after.map((row) => row.order), [0, 1]);
});

// ---------------------------------------------------------------------------
// B7 — partial updates
// ---------------------------------------------------------------------------

test('B7: PATCH does not erase fields the form did not send; PUT still validates', async () => {
  const { prisma, cookie } = await bootstrap();
  const created = await call(COLLECTION, prisma, {
    method: 'POST',
    query: { resource: 'projects' },
    body: { title: 'Keep title', shortDesc: 'keep me' },
    cookie,
  });
  assert.equal(created.statusCode, 201);
  const id = created.body.id;

  const patched = await call(ITEM, prisma, {
    method: 'PATCH',
    query: { resource: 'projects', id },
    body: { featured: true },
    cookie,
  });
  assert.equal(patched.statusCode, 200);
  assert.equal(patched.body.shortDesc, 'keep me');
  assert.equal(patched.body.title, 'Keep title');
  assert.equal(patched.body.featured, true);

  const badPut = await call(ITEM, prisma, {
    method: 'PUT',
    query: { resource: 'projects', id },
    body: { shortDesc: 'no title' },
    cookie,
  });
  assert.equal(badPut.statusCode, 400);
  assert.equal(badPut.body.code, 'VALIDATION_ERROR');
});

// ---------------------------------------------------------------------------
// C9 — optimistic concurrency
// ---------------------------------------------------------------------------

test('C9: a stale updatedAt produces a 409 conflict instead of a silent overwrite', async () => {
  const { prisma, cookie } = await bootstrap();
  const created = await call(COLLECTION, prisma, {
    method: 'POST',
    query: { resource: 'projects' },
    body: { title: 'Original' },
    cookie,
  });
  const id = created.body.id;
  const loaded = await call(ITEM, prisma, { method: 'GET', query: { resource: 'projects', id }, cookie });
  const staleToken = loaded.body.updatedAt;

  const first = await call(ITEM, prisma, {
    method: 'PUT',
    query: { resource: 'projects', id },
    body: { title: 'Editor one', updatedAt: staleToken },
    cookie,
  });
  assert.equal(first.statusCode, 200);

  const second = await call(ITEM, prisma, {
    method: 'PUT',
    query: { resource: 'projects', id },
    body: { title: 'Editor two', updatedAt: staleToken },
    cookie,
  });
  assert.equal(second.statusCode, 409);
  assert.equal(second.body.code, 'CONFLICT');

  const stored = await prisma.project.findUnique({ where: { id } });
  assert.equal(stored.title, 'Editor one');
});

// ---------------------------------------------------------------------------
// C10 — bounded pagination
// ---------------------------------------------------------------------------

test('C10: list endpoints honour and cap pagination', async () => {
  const { prisma, cookie } = await bootstrap();
  for (const name of ['A', 'B', 'C']) await createSkill(prisma, cookie, name);

  const one = await call(COLLECTION, prisma, { method: 'GET', query: { resource: 'skills', limit: '1' }, cookie });
  assert.equal(one.body.length, 1);

  const offset = await call(COLLECTION, prisma, { method: 'GET', query: { resource: 'skills', limit: '1', offset: '1' }, cookie });
  assert.equal(offset.body.length, 1);
  assert.notEqual(one.body[0].id, offset.body[0].id);

  // An absurd limit is clamped, not honoured.
  const huge = await call(COLLECTION, prisma, { method: 'GET', query: { resource: 'skills', limit: '999999' }, cookie });
  assert.equal(huge.body.length, 3);
});

// ---------------------------------------------------------------------------
// C6 / B5 — singletons
// ---------------------------------------------------------------------------

test('C6: a singleton GET returns defaults without writing to the database', async () => {
  const { prisma, cookie } = await bootstrap();
  const res = await call(SINGLETON, prisma, { method: 'GET', query: { type: 'profile' }, cookie });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.fullName, '');
  assert.equal(await prisma.profile.count(), 0, 'GET must not create a row');
});

test('B5: profile and contact share one row without clobbering each other', async () => {
  const { prisma, cookie } = await bootstrap();

  await call(SINGLETON, prisma, { method: 'PATCH', query: { type: 'profile' }, body: { fullName: 'Fahad Javed' }, cookie });
  await call(SINGLETON, prisma, { method: 'PATCH', query: { type: 'contact' }, body: { email: 'fahad@example.com' }, cookie });

  const profile = await call(SINGLETON, prisma, { method: 'GET', query: { type: 'profile' }, cookie });
  assert.equal(profile.body.fullName, 'Fahad Javed');
  assert.equal(profile.body.email, 'fahad@example.com');
  assert.equal(await prisma.profile.count(), 1, 'both views must resolve to a single row');
});

// ---------------------------------------------------------------------------
// B8 — public data exposure
// ---------------------------------------------------------------------------

test('B8: newly added internal columns are never published', async () => {
  const { prisma, cookie } = await bootstrap();
  await prisma.profile.create({
    data: { id: 'singleton', fullName: 'Fahad', email: 'a@b.c', internalSecretToken: 'do-not-leak-12345' },
  });

  const publicRes = await call('api/public/content.js', prisma, { method: 'GET' });
  assert.equal(publicRes.statusCode, 200);
  assert.ok(!JSON.stringify(publicRes.body).includes('do-not-leak-12345'));

  const adminRes = await call(SINGLETON, prisma, { method: 'GET', query: { type: 'profile' }, cookie });
  assert.ok(!JSON.stringify(adminRes.body).includes('do-not-leak-12345'));

  const exportRes = await call('api/admin/export.js', prisma, { method: 'GET', cookie });
  const exportText = JSON.stringify(exportRes.body);
  assert.ok(!exportText.includes('do-not-leak-12345'));
  assert.ok(!exportText.includes('passwordHash'), 'backups must never contain credential material');
  assert.ok(!exportText.includes('sessionVersion'), 'backups must never contain session internals');
});

test('B8: the public endpoint only returns published rows', async () => {
  const prisma = createFakePrisma();
  await prisma.project.create({ data: { id: 'p1', title: 'Published', published: true, order: 0 } });
  await prisma.project.create({ data: { id: 'p2', title: 'Draft', published: false, order: 1 } });

  const res = await call('api/public/content.js', prisma, { method: 'GET' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.projects.length, 1);
  assert.equal(res.body.projects[0].title, 'Published');
  // Unauthenticated users get no admin-only data shape changes.
  assert.equal(res.body.profile, null);
});

test('A11: admin endpoints require authentication', async () => {
  const { prisma } = await bootstrap();
  for (const rel of [COLLECTION, ITEM, SINGLETON, 'api/admin/stats.js', 'api/admin/export.js']) {
    const res = await call(rel, prisma, { method: 'GET', query: { resource: 'skills', id: 'x', type: 'profile' } });
    assert.equal(res.statusCode, 401, rel);
  }
});
