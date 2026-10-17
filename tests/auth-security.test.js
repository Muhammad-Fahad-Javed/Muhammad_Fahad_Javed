// ============================================================================
// Stage 1 — authentication, session and CSRF security.
// Covers audit findings A1, A6, A7, A8, A9, A11 and C8.
// ============================================================================
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const { createFakePrisma } = require('./helpers/fake-prisma');
const { loadModule, mockReq, mockRes, callHandler, withEnv, cookieFrom } = require('./helpers/harness');

const ADMIN_EMAIL = 'admin@portfolio.test';
const ADMIN_PASSWORD = 'correct-horse-battery';

async function seedAdmin(prisma, password = ADMIN_PASSWORD) {
  const { hashPassword } = loadModule('lib/auth.js', prisma);
  return prisma.adminUser.create({
    data: {
      email: ADMIN_EMAIL,
      passwordHash: await hashPassword(password),
      name: 'Admin',
      sessionVersion: 1,
    },
  });
}

function authHandler(prisma) {
  return loadModule('api/auth/[...route].js', prisma);
}

function loginReq(body, headers) {
  return mockReq({
    method: 'POST',
    url: '/api/auth/login',
    query: { route: 'login' },
    body,
    headers,
  });
}

async function login(prisma, email, password, headers) {
  const handler = authHandler(prisma);
  return callHandler(handler, loginReq({ email, password }, headers));
}

// ---------------------------------------------------------------------------
// A1 — JWT secret must fail closed in production
// ---------------------------------------------------------------------------

test('A1: a missing or weak JWT_SECRET is a hard error in production', async () => {
  await withEnv({ NODE_ENV: 'production', JWT_SECRET: undefined }, async () => {
    const config = loadModule('lib/config.js', createFakePrisma());
    assert.equal(config.isProduction(), true);
    assert.equal(config.hasStrongJwtSecret(), false);
    assert.throws(() => config.getJwtSecret(), /JWT_SECRET/);
  });

  await withEnv({ NODE_ENV: 'production', JWT_SECRET: 'too-short' }, async () => {
    const config = loadModule('lib/config.js', createFakePrisma());
    assert.equal(config.hasStrongJwtSecret(), false);
    assert.throws(() => config.getJwtSecret(), /JWT_SECRET/);
  });

  await withEnv({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(48) }, async () => {
    const config = loadModule('lib/config.js', createFakePrisma());
    assert.equal(config.hasStrongJwtSecret(), true);
    assert.equal(config.getJwtSecret(), 'x'.repeat(48));
  });
});

test('A1: development still works without an explicit secret (ephemeral, not a fixed fallback)', async () => {
  await withEnv({ NODE_ENV: 'development', JWT_SECRET: undefined }, async () => {
    const config = loadModule('lib/config.js', createFakePrisma());
    const secret = config.getJwtSecret();
    assert.ok(typeof secret === 'string' && secret.length >= 32);
    // Must not be the historical hard-coded fallback value.
    assert.ok(!secret.includes('muhammad-fahad-javed-portfolio-cms'));
  });
});

test('A1: login fails closed with a generic error when the secret is unavailable', async () => {
  const prisma = createFakePrisma();
  await seedAdmin(prisma);

  await withEnv({ NODE_ENV: 'production', JWT_SECRET: undefined }, async () => {
    const res = await login(prisma, ADMIN_EMAIL, ADMIN_PASSWORD);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, 'Server error.');
    assert.equal(res.body.code, 'INTERNAL_ERROR');
    // No session cookie and no secret material in the response.
    assert.equal(res.headers['set-cookie'], undefined);
    assert.ok(!JSON.stringify(res.body).match(/secret|jwt/i));
    // The failure must not leave a dangling session behind.
    assert.equal(await prisma.session.count(), 0);
  });
});

// ---------------------------------------------------------------------------
// A6 / A7 — no anonymous bootstrap, no environment-credential bypass
// ---------------------------------------------------------------------------

test('A6: an anonymous visitor cannot create the first administrator', async () => {
  const prisma = createFakePrisma();
  await withEnv({ ADMIN_EMAIL: 'attacker@evil.test', ADMIN_PASSWORD: 'attacker-password' }, async () => {
    const res = await login(prisma, 'attacker@evil.test', 'attacker-password');
    assert.equal(res.statusCode, 401);
    assert.equal(await prisma.adminUser.count(), 0);
  });
});

test('A6: no auth route exposes a bootstrap endpoint', async () => {
  const prisma = createFakePrisma();
  const handler = authHandler(prisma);
  for (const route of ['bootstrap', 'setup', 'register', 'init']) {
    const res = await callHandler(
      handler,
      mockReq({ method: 'POST', url: `/api/auth/${route}`, query: { route }, body: { email: 'x@y.z', password: 'password1' } })
    );
    assert.equal(res.statusCode, 404, `route ${route} should not exist`);
    assert.equal(await prisma.adminUser.count(), 0);
  }
});

test('A7: environment credentials cannot silently reset an existing admin password', async () => {
  const prisma = createFakePrisma();
  const admin = await seedAdmin(prisma);
  const hashBefore = admin.passwordHash;

  await withEnv({ ADMIN_EMAIL: ADMIN_EMAIL, ADMIN_PASSWORD: 'attacker-chosen-password' }, async () => {
    const attacker = await login(prisma, ADMIN_EMAIL, 'attacker-chosen-password');
    assert.equal(attacker.statusCode, 401);

    const stored = await prisma.adminUser.findUnique({ where: { id: admin.id } });
    assert.equal(stored.passwordHash, hashBefore);

    const legit = await login(prisma, ADMIN_EMAIL, ADMIN_PASSWORD);
    assert.equal(legit.statusCode, 200);
  });
});

// ---------------------------------------------------------------------------
// A8 — revocable sessions
// ---------------------------------------------------------------------------

test('A8: valid, forged, tampered, expired and revoked tokens', async () => {
  const prisma = createFakePrisma();
  const admin = await seedAdmin(prisma);
  const sessions = loadModule('lib/sessions.js', prisma);

  const { token, session } = await sessions.createSession(admin);
  const good = await sessions.resolveSession(token);
  assert.ok(good && good.user.id === admin.id);

  // Forged with a different secret.
  const forged = jwt.sign({ sub: admin.id, sid: session.id, sv: 1 }, 'a-different-secret');
  assert.equal(await sessions.resolveSession(forged), null);

  // Tampered payload/signature.
  assert.equal(await sessions.resolveSession(`${token}x`), null);
  assert.equal(await sessions.resolveSession('not-a-token'), null);

  // Expired.
  const expired = jwt.sign({ sub: admin.id, sid: session.id, sv: 1 }, process.env.JWT_SECRET, { expiresIn: '-1s' });
  assert.equal(await sessions.resolveSession(expired), null);

  // Revoked (session row removed).
  const { token: second, session: secondSession } = await sessions.createSession(admin);
  await sessions.revokeSession(secondSession.id);
  assert.equal(await sessions.resolveSession(second), null);

  // Session version bumped -> every existing token invalid.
  await prisma.adminUser.update({ where: { id: admin.id }, data: { sessionVersion: 2 } });
  assert.equal(await sessions.resolveSession(token), null);
});

test('A8: logout revokes the server-side session, not just the cookie', async () => {
  const prisma = createFakePrisma();
  await seedAdmin(prisma);
  const handler = authHandler(prisma);

  const loginRes = await login(prisma, ADMIN_EMAIL, ADMIN_PASSWORD);
  assert.equal(loginRes.statusCode, 200);
  const cookie = cookieFrom(loginRes);
  assert.ok(cookie.startsWith('admin_session='));

  const me = await callHandler(handler, mockReq({ method: 'GET', url: '/api/auth/me', query: { route: 'me' }, cookie }));
  assert.equal(me.statusCode, 200);

  const logout = await callHandler(
    handler,
    mockReq({ method: 'POST', url: '/api/auth/logout', query: { route: 'logout' }, cookie })
  );
  assert.equal(logout.statusCode, 200);
  assert.equal(await prisma.session.count(), 0);

  const reused = await callHandler(handler, mockReq({ method: 'GET', url: '/api/auth/me', query: { route: 'me' }, cookie }));
  assert.equal(reused.statusCode, 401);
});

test('A8/C8: password change revokes other sessions and issues a fresh working session', async () => {
  const prisma = createFakePrisma();
  const admin = await seedAdmin(prisma);
  const handler = authHandler(prisma);

  const first = cookieFrom(await login(prisma, ADMIN_EMAIL, ADMIN_PASSWORD));
  const second = cookieFrom(await login(prisma, ADMIN_EMAIL, ADMIN_PASSWORD));
  assert.equal(await prisma.session.count(), 2);

  const change = await callHandler(
    handler,
    mockReq({
      method: 'POST',
      url: '/api/auth/change-password',
      query: { route: 'change-password' },
      body: { currentPassword: ADMIN_PASSWORD, newPassword: 'brand-new-password-99' },
      cookie: first,
    })
  );
  assert.equal(change.statusCode, 200);
  const newCookie = cookieFrom(change);
  assert.ok(newCookie.startsWith('admin_session='));

  // Old cookies are now dead; the freshly issued one works.
  const oldFirst = await callHandler(handler, mockReq({ method: 'GET', url: '/api/auth/me', query: { route: 'me' }, cookie: first }));
  assert.equal(oldFirst.statusCode, 401);
  const oldSecond = await callHandler(handler, mockReq({ method: 'GET', url: '/api/auth/me', query: { route: 'me' }, cookie: second }));
  assert.equal(oldSecond.statusCode, 401);
  const fresh = await callHandler(handler, mockReq({ method: 'GET', url: '/api/auth/me', query: { route: 'me' }, cookie: newCookie }));
  assert.equal(fresh.statusCode, 200);

  // Old password rejected, new password accepted.
  assert.equal((await login(prisma, ADMIN_EMAIL, ADMIN_PASSWORD)).statusCode, 401);
  assert.equal((await login(prisma, ADMIN_EMAIL, 'brand-new-password-99')).statusCode, 200);

  // Stored credential is a bcrypt hash, never the plaintext.
  const stored = await prisma.adminUser.findUnique({ where: { id: admin.id } });
  assert.match(stored.passwordHash, /^\$2[aby]\$/);
  assert.ok(!stored.passwordHash.includes('brand-new-password-99'));
});

test('C8: password policy rejects too-short and oversized passwords', async () => {
  const prisma = createFakePrisma();
  await seedAdmin(prisma);
  const handler = authHandler(prisma);
  const cookie = cookieFrom(await login(prisma, ADMIN_EMAIL, ADMIN_PASSWORD));

  for (const bad of ['short', 'x'.repeat(80)]) {
    const res = await callHandler(
      handler,
      mockReq({
        method: 'POST',
        url: '/api/auth/change-password',
        query: { route: 'change-password' },
        body: { currentPassword: ADMIN_PASSWORD, newPassword: bad },
        cookie,
      })
    );
    assert.equal(res.statusCode, 400, `password ${bad.length} chars should be rejected`);
  }
});

// ---------------------------------------------------------------------------
// A9 — rate limiting must not be bypassable by spoofed forwarding headers
// ---------------------------------------------------------------------------

test('A9: repeated failures are throttled even when X-Forwarded-For is rotated', async () => {
  const prisma = createFakePrisma();
  await seedAdmin(prisma);

  let throttled = null;
  for (let i = 0; i < 12; i += 1) {
    // A different spoofed client IP on every attempt.
    const res = await login(prisma, ADMIN_EMAIL, 'wrong-password', {
      'x-forwarded-for': `10.0.0.${i}, 198.51.100.7`,
    });
    if (res.statusCode === 429) { throttled = res; break; }
    assert.equal(res.statusCode, 401);
  }

  assert.ok(throttled, 'expected the account to be throttled');
  assert.equal(throttled.body.code, 'RATE_LIMITED');

  // A correct password is also blocked while the account is throttled.
  const good = await login(prisma, ADMIN_EMAIL, ADMIN_PASSWORD);
  assert.equal(good.statusCode, 429);
});

test('A9: the trusted client IP ignores the client-supplied left-most XFF entry', async () => {
  const http = loadModule('lib/http.js', createFakePrisma());
  const ip = http.getClientIp(mockReq({ headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.55' } }));
  assert.equal(ip, '203.0.113.55');

  // hops = 0 -> never trust XFF at all.
  await withEnv({ TRUSTED_PROXY_HOPS: '0' }, async () => {
    const mod = loadModule('lib/http.js', createFakePrisma());
    assert.equal(mod.getClientIp(mockReq({ headers: { 'x-forwarded-for': '1.2.3.4' } })), '203.0.113.9');
  });
});

// ---------------------------------------------------------------------------
// A11 — CSRF
// ---------------------------------------------------------------------------

test('A11: login rejects missing header, missing origin and cross-origin origin', async () => {
  const prisma = createFakePrisma();
  await seedAdmin(prisma);

  const noHeader = await login(prisma, ADMIN_EMAIL, ADMIN_PASSWORD, { 'x-requested-with': '' });
  assert.equal(noHeader.statusCode, 403);
  assert.equal(noHeader.body.code, 'CSRF_HEADER');

  const noOrigin = await login(prisma, ADMIN_EMAIL, ADMIN_PASSWORD, { origin: '', referer: '' });
  assert.equal(noOrigin.statusCode, 403);
  assert.equal(noOrigin.body.code, 'CSRF_NO_ORIGIN');

  const crossOrigin = await login(prisma, ADMIN_EMAIL, ADMIN_PASSWORD, { origin: 'https://evil.example' });
  assert.equal(crossOrigin.statusCode, 403);
  assert.equal(crossOrigin.body.code, 'CSRF_ORIGIN');

  // Origin absent but same-origin Referer present is accepted.
  const refererOnly = await login(prisma, ADMIN_EMAIL, ADMIN_PASSWORD, {
    origin: '',
    referer: 'https://portfolio.test/admin/index.html',
  });
  assert.equal(refererOnly.statusCode, 200);
});

test('A11: state-changing admin requests require the CSRF header and same origin', async () => {
  const prisma = createFakePrisma();
  await seedAdmin(prisma);
  const cookie = cookieFrom(await login(prisma, ADMIN_EMAIL, ADMIN_PASSWORD));

  const collection = loadModule('api/admin/[resource]/index.js', prisma);

  const noHeader = await callHandler(
    collection,
    mockReq({ method: 'POST', query: { resource: 'skills' }, body: { name: 'X', category: 'Y' }, cookie, headers: { 'x-requested-with': '' } })
  );
  assert.equal(noHeader.statusCode, 403);
  assert.equal(noHeader.body.code, 'CSRF_HEADER');

  const crossOrigin = await callHandler(
    collection,
    mockReq({ method: 'POST', query: { resource: 'skills' }, body: { name: 'X', category: 'Y' }, cookie, headers: { origin: 'https://evil.example' } })
  );
  assert.equal(crossOrigin.statusCode, 403);
  assert.equal(crossOrigin.body.code, 'CSRF_ORIGIN');

  // No cookie at all -> unauthenticated.
  const anonymous = await callHandler(
    collection,
    mockReq({ method: 'POST', query: { resource: 'skills' }, body: { name: 'X', category: 'Y' } })
  );
  assert.equal(anonymous.statusCode, 401);
});

test('A8: session cookie is HttpOnly, SameSite=Lax and path-scoped', async () => {
  const prisma = createFakePrisma();
  await seedAdmin(prisma);
  const res = await login(prisma, ADMIN_EMAIL, ADMIN_PASSWORD);
  const raw = String(res.headers['set-cookie']);
  assert.match(raw, /HttpOnly/);
  assert.match(raw, /SameSite=Lax/i);
  assert.match(raw, /Path=\//);
  assert.ok(!/Secure/i.test(raw), 'Secure must be off outside production so local http dev works');
});
