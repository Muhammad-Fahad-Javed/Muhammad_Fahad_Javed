// ============================================================================
// Regression tests for the October 2026 audit findings.
//   R1  JWT algorithm is pinned (HS512 / alg:none tokens are rejected)
//   R2  change-password is throttled BEFORE the current password is checked
//   R3  bulk import rejects ids that could carry markup
//   R4  colour fields only accept hex values
//   R5  local upload deletion ignores "." and ".." keys
//   R6  admin UI stays free of inline scripts/handlers (strict CSP stays valid)
// ============================================================================
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const { createFakePrisma } = require('./helpers/fake-prisma');
const { loadModule, mockReq, callHandler, cookieFrom, ROOT } = require('./helpers/harness');

const EMAIL = 'admin@portfolio.test';
const PASSWORD = 'correct-horse-battery';

async function bootstrap() {
  const prisma = createFakePrisma();
  const { hashPassword } = loadModule('lib/auth.js', prisma);
  const admin = await prisma.adminUser.create({
    data: { email: EMAIL, passwordHash: await hashPassword(PASSWORD), name: 'Admin', sessionVersion: 1 },
  });
  const auth = loadModule('api/auth/[...route].js', prisma);
  const res = await callHandler(
    auth,
    mockReq({ method: 'POST', url: '/api/auth/login', query: { route: 'login' }, body: { email: EMAIL, password: PASSWORD } })
  );
  assert.equal(res.statusCode, 200);
  return { prisma, auth, admin, cookie: cookieFrom(res) };
}

const meReq = (cookie) => mockReq({ method: 'GET', url: '/api/auth/me', query: { route: 'me' }, cookie });

test('R1: tokens signed with another algorithm or alg:none are rejected', async () => {
  const { auth, admin, prisma, cookie } = await bootstrap();
  assert.equal((await callHandler(auth, meReq(cookie))).statusCode, 200);

  const session = (await prisma.session.findMany())[0];
  const payload = { sub: admin.id, sid: session.id, sv: 1 };
  const secret = process.env.JWT_SECRET;

  const hs512 = jwt.sign(payload, secret, { algorithm: 'HS512', expiresIn: '1h' });
  assert.equal((await callHandler(auth, meReq(`admin_session=${hs512}`))).statusCode, 401);

  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`;
  assert.equal((await callHandler(auth, meReq(`admin_session=${none}`))).statusCode, 401);

  const hs256 = jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: '1h' });
  assert.equal((await callHandler(auth, meReq(`admin_session=${hs256}`))).statusCode, 200);
});

test('R2: a throttled account cannot keep guessing the current password', async () => {
  const { prisma, auth, admin, cookie } = await bootstrap();
  for (let i = 0; i < 10; i += 1) {
    await prisma.loginAttempt.create({ data: { ip: '198.51.100.7', identifier: EMAIL, success: false } });
  }
  const res = await callHandler(
    auth,
    mockReq({
      method: 'POST',
      url: '/api/auth/change-password',
      query: { route: 'change-password' },
      body: { currentPassword: PASSWORD, newPassword: 'another-strong-password-1' },
      cookie,
    })
  );
  // Even the CORRECT current password must not be honoured while throttled.
  assert.equal(res.statusCode, 429);
  const stored = await prisma.adminUser.findUnique({ where: { id: admin.id } });
  const { comparePassword } = loadModule('lib/auth.js', prisma);
  assert.equal(await comparePassword(PASSWORD, stored.passwordHash), true);
});

test('R2: change-password rejects non-string passwords', async () => {
  const { auth, cookie } = await bootstrap();
  const res = await callHandler(
    auth,
    mockReq({
      method: 'POST',
      url: '/api/auth/change-password',
      query: { route: 'change-password' },
      body: { currentPassword: { $ne: '' }, newPassword: ['x'] },
      cookie,
    })
  );
  assert.equal(res.statusCode, 400);
});

test('R3: import rejects ids that contain markup, quotes or excessive length', async () => {
  const { prisma, cookie } = await bootstrap();
  const handler = loadModule('api/admin/import.js', prisma);
  const bad = ['"><img src=x onerror=alert(1)>', 'a b', '../x', 'x'.repeat(65)];
  for (const id of bad) {
    const res = await callHandler(
      handler,
      mockReq({
        method: 'POST',
        url: '/api/admin/import',
        body: { collections: { skills: [{ id, name: 'X', category: 'Y' }] } },
        cookie,
      })
    );
    assert.equal(res.statusCode, 400, `id ${JSON.stringify(id)} should be rejected`);
    assert.equal(res.body.code, 'IMPORT_VALIDATION');
    assert.ok(!JSON.stringify(res.body).includes('onerror'), 'error text must not echo the payload');
  }
  assert.equal(await prisma.skill.count(), 0);

  const ok = await callHandler(
    handler,
    mockReq({
      method: 'POST',
      url: '/api/admin/import',
      body: { collections: { skills: [{ id: 'skill_01-A', name: 'X', category: 'Y' }] } },
      cookie,
    })
  );
  assert.equal(ok.statusCode, 200);
});

test('R4: colour fields accept only hex values', () => {
  const { SINGLETONS, validatePayload } = loadModule('lib/resources.js', createFakePrisma());
  const def = SINGLETONS['site-settings'];
  const errorsFor = (themeColor) => validatePayload({ themeColor }, def, { partial: true });
  assert.deepEqual(errorsFor('#5A3B22'), []);
  assert.deepEqual(errorsFor('#abc'), []);
  assert.deepEqual(errorsFor(''), []);
  for (const bad of ['red', 'url(https://evil.test/x)', '#12', '#12345g', '#5A3B22;background:red', 'rgb(1,2,3)']) {
    assert.equal(errorsFor(bad).length, 1, `${bad} should be rejected`);
  }
});

test('R5: deleting "/uploads/." or "/uploads/.." never touches directories', async () => {
  const storage = loadModule('lib/storage.js', createFakePrisma());
  await storage.deleteFile('/uploads/..');
  await storage.deleteFile('/uploads/.');
  assert.ok(fs.existsSync(path.join(ROOT, 'frontend')), 'frontend directory must still exist');
  assert.ok(fs.existsSync(path.join(ROOT, 'package.json')));
});

test('R6: the admin UI has no inline scripts or event-handler attributes', () => {
  const adminDir = path.join(ROOT, 'frontend', 'admin');
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(html|js)$/.test(entry.name)) files.push(full);
    }
  })(adminDir);
  assert.ok(files.length > 5);

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    if (file.endsWith('.html')) {
      const inline = text.match(/<script(?![^>]*\bsrc=)[^>]*>/gi);
      assert.equal(inline, null, `${rel} contains an inline <script>`);
    }
    assert.equal(/\son(?:error|load|click|submit|change|input|focus|blur|mouse\w+|key\w+)\s*=\s*["']/i.test(text), false, `${rel} contains an inline event handler`);
    assert.equal(/javascript:/i.test(text), false, `${rel} contains a javascript: URL`);
  }

  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const adminRule = vercel.headers.find((h) => h.source.startsWith('/admin'));
  const csp = adminRule.headers.find((h) => h.key === 'Content-Security-Policy').value;
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
  assert.match(csp, /frame-ancestors 'none'/);
});
