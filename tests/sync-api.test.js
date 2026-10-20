// ============================================================================
// Profile sync — service and HTTP surface.
//
// Covers the Phase 8 checklist: unauthorised access, OAuth/token rejection,
// expired credentials, rate limiting, retries, manual overrides, unchanged
// data, GitHub repository synchronisation and protection against leaking
// private data or credentials.
//
// GitHub is simulated by replacing globalThis.fetch, which is the real seam
// the HTTP client uses. No test reaches the network.
// ============================================================================
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createFakePrisma } = require('./helpers/fake-prisma');
const { loadModule, mockReq, callHandler, cookieFrom, withEnv } = require('./helpers/harness');

const KEY = 'test-sync-encryption-key-0123456789abcdef';
const CRON_SECRET = 'cron-secret-0123456789';
const TOKEN = 'github_pat_11ABCDEFG0123456789abcdefghijklmnop';

const ADMIN_EMAIL = 'admin@portfolio.test';
const ADMIN_PASSWORD = 'password-1234';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ 'content-type': 'application/json' }, headers || {}),
  });
}

// Routes are matched in order; '/repos' must precede '/users/:login'.
function githubFetch(routes) {
  const calls = [];
  const fn = async (url, init) => {
    const target = String(url);
    calls.push({ url: target, headers: (init && init.headers) || {} });
    for (const [needle, handler] of routes) {
      if (target.includes(needle)) {
        const result = typeof handler === 'function' ? handler(target, init) : handler;
        return jsonResponse(result.body, result.status || 200, result.headers || {});
      }
    }
    return jsonResponse({ message: 'Not Found' }, 404);
  };
  fn.calls = calls;
  return fn;
}

async function withFetch(fake, fn) {
  const saved = globalThis.fetch;
  globalThis.fetch = fake;
  try {
    return await fn(fake);
  } finally {
    globalThis.fetch = saved;
  }
}

async function bootstrap(seedData) {
  const prisma = createFakePrisma(seedData);
  const { hashPassword } = loadModule('lib/auth.js', prisma);

  await prisma.adminUser.create({
    data: {
      email: ADMIN_EMAIL,
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      name: 'Admin',
      sessionVersion: 1,
    },
  });

  const auth = loadModule('api/auth/[...route].js', prisma);
  const res = await callHandler(
    auth,
    mockReq({
      method: 'POST',
      url: '/api/auth/login',
      query: { route: 'login' },
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    })
  );
  assert.equal(res.statusCode, 200, 'bootstrap login failed');

  return { prisma, cookie: cookieFrom(res) };
}

function call(relative, prisma, options) {
  const handler = loadModule(relative, prisma);
  return callHandler(handler, mockReq(options));
}

const PROFILE_SEED = {
  profile: [{ id: 'singleton', fullName: 'Muhammad Fahad Javed', profileImage: '/images/hero.jpg' }],
  githubSection: [
    {
      id: 'singleton',
      username: 'muhammad-fahad-javed',
      profileUrl: 'https://github.com/muhammad-fahad-javed',
      bio: 'C++ Systems Developer & AI Engineer',
      location: 'Multan, Pakistan',
      syncAvatar: false,
    },
  ],
  project: [
    {
      id: 'p1',
      title: 'Student Management System',
      shortDesc: 'A hand-written description worth keeping.',
      technologies: '["C++","OOP"]',
      githubUrl: 'https://github.com/Muhammad-Fahad-Javed/student-management-system',
      githubRepo: 'Muhammad-Fahad-Javed/student-management-system',
      published: true,
      featured: true,
      order: 0,
    },
    {
      id: 'p2',
      title: 'Bank Account System',
      shortDesc: '',
      technologies: '[]',
      githubUrl: 'https://github.com/Muhammad-Fahad-Javed/Bank-Account-System-',
      githubRepo: 'Muhammad-Fahad-Javed/Bank-Account-System-',
      published: true,
      featured: true,
      order: 1,
    },
  ],
};

const GITHUB_USER = {
  login: 'Muhammad-Fahad-Javed',
  id: 254530520,
  name: 'Muhammad Fahad Javed',
  html_url: 'https://github.com/Muhammad-Fahad-Javed',
  bio: null,
  location: null,
  avatar_url: 'https://avatars.githubusercontent.com/u/254530520?v=4',
  public_repos: 20,
};

const GITHUB_REPOS = [
  {
    name: 'student-management-system',
    full_name: 'Muhammad-Fahad-Javed/student-management-system',
    description: 'A C++ console app',
    html_url: 'https://github.com/Muhammad-Fahad-Javed/student-management-system',
    language: 'C++',
    topics: ['oop'],
    updated_at: '2026-10-02T00:00:00Z',
    private: false,
    stargazers_count: 3,
  },
  {
    name: 'Bank-Account-System-',
    full_name: 'Muhammad-Fahad-Javed/Bank-Account-System-',
    description: 'Banking simulation in C++',
    html_url: 'https://github.com/Muhammad-Fahad-Javed/Bank-Account-System-',
    language: 'C++',
    topics: [],
    updated_at: '2026-09-01T00:00:00Z',
    private: false,
    stargazers_count: 1,
  },
  {
    name: 'private-notes',
    full_name: 'Muhammad-Fahad-Javed/private-notes',
    description: 'Secret notes',
    html_url: 'https://github.com/Muhammad-Fahad-Javed/private-notes',
    language: 'Markdown',
    topics: [],
    updated_at: '2026-10-03T00:00:00Z',
    private: true,
  },
];

function healthyGithub() {
  return githubFetch([
    ['/repos', { body: GITHUB_REPOS }],
    ['/users/', { body: GITHUB_USER, headers: { 'x-ratelimit-remaining': '4999' } }],
    ['/user', { body: GITHUB_USER }],
  ]);
}

// ---------------------------------------------------------------------------
// Authorisation
// ---------------------------------------------------------------------------

test('sync api: every sync endpoint refuses an unauthenticated caller', async () => {
  const { prisma } = await bootstrap(PROFILE_SEED);

  const calls = [
    ['api/sync/status.js', { method: 'GET' }],
    ['api/sync/repos.js', { method: 'GET' }],
    ['api/sync/github.js', { method: 'POST', body: { token: TOKEN } }],
    ['api/sync/run.js', { method: 'POST', body: { provider: 'github' } }],
  ];

  for (const [file, options] of calls) {
    const res = await call(file, prisma, options);
    assert.equal(res.statusCode, 401, file + ' must require a session');
  }
});

test('sync api: a mutation without the CSRF header is rejected even with a session', async () => {
  const { prisma, cookie } = await bootstrap(PROFILE_SEED);

  const res = await call('api/sync/run.js', prisma, {
    method: 'POST',
    cookie,
    body: { provider: 'github' },
    headers: { 'x-requested-with': '' },
  });

  assert.equal(res.statusCode, 403);
});

// ---------------------------------------------------------------------------
// Connecting GitHub
// ---------------------------------------------------------------------------

test('sync api: a malformed token is rejected before any network call', async () => {
  const { prisma, cookie } = await bootstrap(PROFILE_SEED);

  const fake = healthyGithub();
  await withFetch(fake, async () => {
    const res = await call('api/sync/github.js', prisma, {
      method: 'POST',
      cookie,
      body: { token: 'not-a-token' },
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'TOKEN_INVALID_FORMAT');
    assert.equal(fake.calls.length, 0, 'no request should be made for an invalid token');
  });

  const rows = await prisma.integration.findMany({});
  assert.equal(rows.length, 0);
});

test('sync api: connecting verifies the token and stores only ciphertext', async () => {
  const { prisma, cookie } = await bootstrap(PROFILE_SEED);

  await withEnv({ SYNC_ENCRYPTION_KEY: KEY }, async () => {
    const fake = healthyGithub();
    await withFetch(fake, async () => {
      const res = await call('api/sync/github.js', prisma, {
        method: 'POST',
        cookie,
        body: { token: TOKEN },
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.connected, true);
      assert.equal(res.body.accountLabel, 'Muhammad-Fahad-Javed');
      assert.ok(!JSON.stringify(res.body).includes(TOKEN), 'the token must never be echoed back');
    });
  });

  const [row] = await prisma.integration.findMany({});
  assert.equal(row.status, 'connected');
  assert.ok(row.accessTokenEnc && row.accessTokenEnc.startsWith('v1.'), 'credential must be sealed');
  assert.ok(!row.accessTokenEnc.includes(TOKEN));

  // The status endpoint must not project the ciphertext either.
  const status = await call('api/sync/status.js', prisma, { method: 'GET', cookie });
  assert.equal(status.statusCode, 200);
  assert.equal(status.body.github.connected, true);
  assert.ok(!('accessTokenEnc' in status.body.github));
  assert.ok(!JSON.stringify(status.body).includes(row.accessTokenEnc));
});

test('sync api: a token GitHub rejects is reported as invalid, not stored', async () => {
  const { prisma, cookie } = await bootstrap(PROFILE_SEED);

  await withEnv({ SYNC_ENCRYPTION_KEY: KEY }, async () => {
    const fake = githubFetch([['/user', { body: { message: 'Bad credentials' }, status: 401 }]]);
    await withFetch(fake, async () => {
      const res = await call('api/sync/github.js', prisma, {
        method: 'POST',
        cookie,
        body: { token: TOKEN },
      });

      assert.equal(res.statusCode, 400);
      assert.equal(res.body.code, 'TOKEN_REJECTED');
    });
  });

  const rows = await prisma.integration.findMany({});
  assert.equal(rows.length, 0);
});

// ---------------------------------------------------------------------------
// Running a sync
// ---------------------------------------------------------------------------

test('sync api: running without a connection is a clear 409', async () => {
  const { prisma, cookie } = await bootstrap(PROFILE_SEED);

  const res = await call('api/sync/run.js', prisma, {
    method: 'POST',
    cookie,
    body: { provider: 'github' },
  });

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'INTEGRATION_NOT_CONNECTED');
});

test('sync api: a manual sync fills empty project copy and preserves written copy', async () => {
  const { prisma, cookie } = await bootstrap(PROFILE_SEED);

  await withEnv({ SYNC_ENCRYPTION_KEY: KEY }, async () => {
    const fake = healthyGithub();
    await withFetch(fake, async () => {
      const connect = await call('api/sync/github.js', prisma, {
        method: 'POST',
        cookie,
        body: { token: TOKEN },
      });
      assert.equal(connect.statusCode, 200);

      const res = await call('api/sync/run.js', prisma, {
        method: 'POST',
        cookie,
        body: { provider: 'github' },
      });

      assert.equal(res.statusCode, 200, JSON.stringify(res.body));
      assert.equal(res.body.status, 'success');
      assert.ok(res.body.changed > 0);
      assert.equal(res.body.repositories, 2, 'the private repo is filtered out');

      // The token travels only in the outbound header and is never returned.
      assert.ok(!JSON.stringify(res.body).includes(TOKEN));
      assert.ok(
        fake.calls.filter((c) => c.url.includes('/users/')).every((c) => c.headers.authorization === 'Bearer ' + TOKEN)
      );
    });
  });

  const project1 = await prisma.project.findUnique({ where: { id: 'p1' } });
  const project2 = await prisma.project.findUnique({ where: { id: 'p2' } });

  // Hand-written copy survives; empty copy is filled from the repo.
  assert.equal(project1.shortDesc, 'A hand-written description worth keeping.');
  assert.equal(project1.technologies, '["C++","OOP"]');
  assert.equal(project2.shortDesc, 'Banking simulation in C++');
  assert.deepEqual(JSON.parse(project2.technologies), ['C++']);

  // Null bio/location from GitHub must not erase the section copy.
  const section = await prisma.githubSection.findUnique({ where: { id: 'singleton' } });
  assert.equal(section.bio, 'C++ Systems Developer & AI Engineer');
  assert.equal(section.location, 'Multan, Pakistan');
  assert.equal(section.username, 'Muhammad-Fahad-Javed');

  // Provenance and run history.
  const states = await prisma.fieldState.findMany({});
  assert.ok(states.some((s) => s.entity === 'project' && s.entityId === 'p2' && s.source === 'github'));

  const runs = await prisma.syncRun.findMany({});
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, 'success');
  assert.equal(runs[0].trigger, 'manual');
  assert.ok(!runs[0].message.includes('Banking simulation'), 'run messages carry counts, not content');

  const [integration] = await prisma.integration.findMany({});
  assert.equal(integration.lastSyncStatus, 'success');
});

test('sync api: a second identical run changes nothing', async () => {
  const { prisma, cookie } = await bootstrap(PROFILE_SEED);

  await withEnv({ SYNC_ENCRYPTION_KEY: KEY }, async () => {
    const fake = healthyGithub();
    await withFetch(fake, async () => {
      await call('api/sync/github.js', prisma, { method: 'POST', cookie, body: { token: TOKEN } });

      const first = await call('api/sync/run.js', prisma, { method: 'POST', cookie, body: { provider: 'github' } });
      assert.equal(first.statusCode, 200);
      assert.ok(first.body.changed > 0);

      const second = await call('api/sync/run.js', prisma, { method: 'POST', cookie, body: { provider: 'github' } });
      assert.equal(second.statusCode, 200);
      assert.equal(second.body.changed, 0, 'a repeated sync must be a no-op');
      assert.ok(second.body.counts.unchanged > 0 || second.body.counts.kept > 0);
    });
  });
});

test('sync api: an expired credential marks the integration as needing a reconnect', async () => {
  const { prisma, cookie } = await bootstrap(PROFILE_SEED);

  await withEnv({ SYNC_ENCRYPTION_KEY: KEY }, async () => {
    await withFetch(healthyGithub(), async () => {
      const connect = await call('api/sync/github.js', prisma, { method: 'POST', cookie, body: { token: TOKEN } });
      assert.equal(connect.statusCode, 200);
    });

    const expired = githubFetch([['/users/', { body: { message: 'Bad credentials' }, status: 401 }]]);
    await withFetch(expired, async () => {
      const res = await call('api/sync/run.js', prisma, { method: 'POST', cookie, body: { provider: 'github' } });
      assert.equal(res.statusCode, 409);
      assert.equal(res.body.code, 'SYNC_RECONNECT_REQUIRED');
    });
  });

  const [integration] = await prisma.integration.findMany({});
  assert.equal(integration.status, 'error');
  assert.equal(integration.lastSyncStatus, 'error');
  assert.ok(integration.lastError.length > 0);

  // Existing content is untouched by the failure.
  const project = await prisma.project.findUnique({ where: { id: 'p1' } });
  assert.equal(project.shortDesc, 'A hand-written description worth keeping.');
});

test('sync api: an exhausted provider quota returns 429 with Retry-After', async () => {
  const { prisma, cookie } = await bootstrap(PROFILE_SEED);

  await withEnv({ SYNC_ENCRYPTION_KEY: KEY }, async () => {
    await withFetch(healthyGithub(), async () => {
      await call('api/sync/github.js', prisma, { method: 'POST', cookie, body: { token: TOKEN } });
    });

    const reset = Math.floor(Date.now() / 1000) + 120;
    const limited = githubFetch([
      [
        '/users/',
        {
          body: { message: 'API rate limit exceeded' },
          status: 403,
          headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) },
        },
      ],
    ]);

    await withFetch(limited, async () => {
      const res = await call('api/sync/run.js', prisma, { method: 'POST', cookie, body: { provider: 'github' } });
      assert.equal(res.statusCode, 429);
      assert.ok(res.headers['retry-after'], 'the client should be told when to retry');
    });
  });
});

test('sync api: disconnecting wipes the stored credential', async () => {
  const { prisma, cookie } = await bootstrap(PROFILE_SEED);

  await withEnv({ SYNC_ENCRYPTION_KEY: KEY }, async () => {
    await withFetch(healthyGithub(), async () => {
      await call('api/sync/github.js', prisma, { method: 'POST', cookie, body: { token: TOKEN } });
    });

    const res = await call('api/sync/github.js', prisma, { method: 'DELETE', cookie });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.connected, false);
  });

  const [row] = await prisma.integration.findMany({});
  assert.equal(row.status, 'disconnected');
  assert.equal(row.accessTokenEnc, null);
  assert.equal(row.refreshTokenEnc, null);
});

// ---------------------------------------------------------------------------
// Scheduled entry point
// ---------------------------------------------------------------------------

test('cron: fails closed when no secret is configured', async () => {
  const { prisma } = await bootstrap(PROFILE_SEED);

  await withEnv({ CRON_SECRET: undefined }, async () => {
    const res = await call('api/cron/sync.js', prisma, { method: 'GET' });
    assert.equal(res.statusCode, 503);
  });
});

test('cron: rejects a wrong secret', async () => {
  const { prisma } = await bootstrap(PROFILE_SEED);

  await withEnv({ CRON_SECRET }, async () => {
    const res = await call('api/cron/sync.js', prisma, {
      method: 'GET',
      headers: { authorization: 'Bearer definitely-wrong' },
    });
    assert.equal(res.statusCode, 401);
  });
});

test('cron: runs connected providers and never exposes the credential', async () => {
  const { prisma, cookie } = await bootstrap(PROFILE_SEED);

  await withEnv({ SYNC_ENCRYPTION_KEY: KEY, CRON_SECRET }, async () => {
    await withFetch(healthyGithub(), async () => {
      await call('api/sync/github.js', prisma, { method: 'POST', cookie, body: { token: TOKEN } });

      const res = await call('api/cron/sync.js', prisma, {
        method: 'GET',
        headers: { authorization: 'Bearer ' + CRON_SECRET },
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.providers.length, 1);
      assert.equal(res.body.providers[0].provider, 'github');
      assert.equal(res.body.providers[0].status, 'success');
      assert.ok(!JSON.stringify(res.body).includes(TOKEN));
    });
  });

  const runs = await prisma.syncRun.findMany({});
  assert.equal(runs.length, 1);
  assert.equal(runs[0].trigger, 'cron');
  assert.ok(!runs[0].message.includes(TOKEN));
});
