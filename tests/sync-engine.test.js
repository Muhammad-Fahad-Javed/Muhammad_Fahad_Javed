// ============================================================================
// Profile sync — pure units: credential encryption, outbound HTTP policy,
// GitHub mapping and the write engine's safety rules.
//
// Nothing here touches the network or a real database.
// ============================================================================
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createFakePrisma } = require('./helpers/fake-prisma');
const { withEnv } = require('./helpers/harness');

const KEY = 'test-sync-encryption-key-0123456789abcdef';

// ---------------------------------------------------------------------------
// Credential encryption
// ---------------------------------------------------------------------------

test('sync crypto: seals and opens a token, and never stores it in clear', async () => {
  const { seal, open } = require('../lib/sync/crypto');

  await withEnv({ SYNC_ENCRYPTION_KEY: KEY }, () => {
    const sealed = seal('github_pat_abcdefghijklmnopqrstuvwxyz', 'integration:github');
    assert.notEqual(sealed, 'github_pat_abcdefghijklmnopqrstuvwxyz');
    assert.ok(!sealed.includes('abcdefghijklmnop'));
    assert.equal(open(sealed, 'integration:github'), 'github_pat_abcdefghijklmnopqrstuvwxyz');
  });
});

test('sync crypto: fails closed when the key is missing or too short', async () => {
  const { seal } = require('../lib/sync/crypto');

  await withEnv({ SYNC_ENCRYPTION_KEY: undefined }, () => {
    assert.throws(() => seal('x', 'a'), (err) => err.code === 'CONFIG_SYNC_KEY');
  });

  await withEnv({ SYNC_ENCRYPTION_KEY: 'too-short' }, () => {
    assert.throws(() => seal('x', 'a'), (err) => err.code === 'CONFIG_SYNC_KEY');
  });
});

test('sync crypto: a tampered ciphertext or wrong provider cannot be opened', async () => {
  const { sealForProvider, openForProvider } = require('../lib/sync/crypto');

  await withEnv({ SYNC_ENCRYPTION_KEY: KEY }, () => {
    const sealed = sealForProvider('token-value', 'github');

    // Wrong provider = different additional authenticated data.
    assert.throws(() => openForProvider(sealed, 'linkedin'));

    // Flip one byte of the payload.
    const parts = sealed.split('.');
    const payload = Buffer.from(parts[3], 'base64url');
    payload[0] = payload[0] ^ 0xff;
    parts[3] = payload.toString('base64url');

    assert.throws(() => openForProvider(parts.join('.'), 'github'));
  });
});

// ---------------------------------------------------------------------------
// Outbound HTTP policy
// ---------------------------------------------------------------------------

const { createHttp, SyncHttpError } = require('../lib/sync/http');

function jsonResponse(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ 'content-type': 'application/json' }, headers || {}),
  });
}

test('sync http: retries a transient failure and then succeeds', async () => {
  const sleeps = [];
  let calls = 0;

  const http = createHttp({
    fetchImpl: async () => {
      calls += 1;
      if (calls < 3) return jsonResponse({ error: 'nope' }, 503);
      return jsonResponse({ ok: true });
    },
    sleep: async (ms) => sleeps.push(ms),
  });

  const res = await http.request('https://api.example.test/x', { attempts: 3 });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(calls, 3);
  assert.equal(sleeps.length, 2);
});

test('sync http: does not retry an authentication failure', async () => {
  let calls = 0;

  const http = createHttp({
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ message: 'Bad credentials' }, 401);
    },
    sleep: async () => {},
  });

  await assert.rejects(
    () => http.request('https://api.example.test/x', { attempts: 3 }),
    (err) => err instanceof SyncHttpError && err.code === 'SYNC_UNAUTHORIZED'
  );
  assert.equal(calls, 1, 'a 401 is an answer, not an accident');
});

test('sync http: honours Retry-After instead of hammering', async () => {
  const sleeps = [];
  let calls = 0;

  const http = createHttp({
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return jsonResponse({}, 429, { 'retry-after': '2' });
      return jsonResponse({ ok: true });
    },
    sleep: async (ms) => sleeps.push(ms),
  });

  await http.request('https://api.example.test/x', { attempts: 2 });
  assert.ok(sleeps[0] >= 2000, 'waited for the advertised delay, got ' + sleeps[0]);
});

test('sync http: reports an exhausted GitHub quota as rate limited, without retrying', async () => {
  let calls = 0;

  const http = createHttp({
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ message: 'API rate limit exceeded' }, 403, {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 60),
      });
    },
    sleep: async () => {},
  });

  await assert.rejects(
    () => http.request('https://api.example.test/x', { attempts: 3 }),
    (err) => err instanceof SyncHttpError && err.code === 'SYNC_RATE_LIMITED' && !!err.rateLimitReset
  );
  assert.equal(calls, 1);
});

test('sync http: aborts a request that hangs past the timeout', async () => {
  const http = createHttp({
    fetchImpl: (url, init) =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }),
    sleep: async () => {},
  });

  await assert.rejects(
    () => http.request('https://api.example.test/x', { attempts: 1, timeoutMs: 25 }),
    (err) => err instanceof SyncHttpError && err.code === 'SYNC_TIMEOUT'
  );
});

// ---------------------------------------------------------------------------
// GitHub mapping
// ---------------------------------------------------------------------------

const {
  sanitiseRepo,
  nextPageUrl,
  isApiUrl,
  technologiesFor,
  mapGithubUpdates,
} = require('../lib/sync/github');

test('github: private repositories and empty names are dropped', () => {
  assert.equal(sanitiseRepo({ name: 'secret', private: true }), null);
  assert.equal(sanitiseRepo({ name: '   ' }), null);
  assert.equal(sanitiseRepo(null), null);

  const repo = sanitiseRepo({
    name: 'Ludo-game',
    full_name: 'Muhammad-Fahad-Javed/Ludo-game',
    description: 'A Ludo game in C++',
    html_url: 'https://github.com/Muhammad-Fahad-Javed/Ludo-game',
    language: 'C++',
    topics: ['game'],
    updated_at: '2026-10-01T10:00:00Z',
    private: false,
  });

  assert.equal(repo.fullName, 'Muhammad-Fahad-Javed/Ludo-game');
  assert.deepEqual(repo.topics, ['game']);
  assert.equal(repo.updatedAt.toISOString(), '2026-10-01T10:00:00.000Z');
});

test('github: pagination only follows the GitHub API origin', () => {
  assert.equal(
    nextPageUrl('<https://api.github.com/users/x/repos?page=2>; rel="next", <https://api.github.com/users/x/repos?page=5>; rel="last"'),
    'https://api.github.com/users/x/repos?page=2'
  );
  assert.equal(nextPageUrl(null), null);
  assert.equal(nextPageUrl('<https://api.github.com/x>; rel="last"'), null);

  assert.equal(isApiUrl('https://api.github.com/users/x'), true);
  assert.equal(isApiUrl('https://evil.example.com/steal'), false);
  assert.equal(isApiUrl('http://api.github.com/users/x'), false);
});

test('github: technologies come from language plus topics, deduplicated', () => {
  assert.deepEqual(technologiesFor({ language: 'C++', topics: ['c++', 'SFML'] }), ['C++', 'SFML']);
  assert.deepEqual(technologiesFor({ language: '', topics: [] }), []);
});

test('github: a null bio or location becomes an empty fill-only update, never prose', () => {
  const updates = mapGithubUpdates({
    profile: {
      login: 'Muhammad-Fahad-Javed',
      html_url: 'https://github.com/Muhammad-Fahad-Javed',
      name: 'Muhammad Fahad Javed',
      bio: null,
      location: null,
      avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4',
    },
    repos: [],
    projects: [],
    syncAvatar: false,
  });

  const bio = updates.find((u) => u.field === 'bio');
  const location = updates.find((u) => u.field === 'location');

  assert.equal(bio.value, '');
  assert.equal(bio.policy, 'fill-only');
  assert.equal(location.value, '');
  assert.equal(location.policy, 'fill-only');

  // The avatar must not be pushed unless explicitly opted in.
  assert.equal(updates.some((u) => u.field === 'profileImage'), false);
});

test('github: only allowlisted projects receive repository data', () => {
  const repo = {
    name: 'student-management-system',
    fullName: 'Muhammad-Fahad-Javed/student-management-system',
    description: 'C++ console app',
    htmlUrl: 'https://github.com/Muhammad-Fahad-Javed/student-management-system',
    language: 'C++',
    topics: ['oop'],
    updatedAt: new Date('2026-10-02T00:00:00Z'),
  };

  const updates = mapGithubUpdates({
    profile: { login: 'x', html_url: 'https://github.com/x', name: 'X', bio: 'b', location: 'l' },
    repos: [repo],
    projects: [
      { id: 'p1', githubRepo: 'Muhammad-Fahad-Javed/student-management-system' },
      { id: 'p2', githubRepo: 'Muhammad-Fahad-Javed/not-in-list' },
    ],
  });

  const forP1 = updates.filter((u) => u.entityId === 'p1');
  const forP2 = updates.filter((u) => u.entityId === 'p2');

  assert.equal(forP2.length, 0, 'a project naming a repo that was not returned is untouched');
  assert.equal(forP1.find((u) => u.field === 'shortDesc').policy, 'fill-only');
  assert.deepEqual(forP1.find((u) => u.field === 'technologies').value, ['C++', 'oop']);
});

// ---------------------------------------------------------------------------
// Engine safety rules
// ---------------------------------------------------------------------------

const { applySync, decideUpdate, scrub, hashValue } = require('../lib/sync/engine');

function seed() {
  return createFakePrisma({
    profile: [
      {
        id: 'singleton',
        fullName: 'Muhammad Fahad Javed',
        displayName: 'Fahad',
        title: 'C++ Systems Developer',
        email: 'me@example.test',
        location: 'Multan, Pakistan',
        profileImage: '/images/hero.jpg',
      },
    ],
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
    ],
  });
}

const clock = () => new Date('2026-10-20T12:00:00Z');

test('engine: fill-only never replaces existing prose', async () => {
  const prisma = seed();

  const result = await applySync({
    prisma,
    provider: 'github',
    trigger: 'manual',
    clock,
    updates: [
      { entity: 'github', field: 'bio', value: 'A different bio from GitHub', policy: 'fill-only' },
      { entity: 'project', entityId: 'p1', field: 'shortDesc', value: 'Repo blurb', policy: 'fill-only' },
      { entity: 'project', entityId: 'p1', field: 'technologies', value: ['C++'], policy: 'fill-only' },
    ],
  });

  const section = await prisma.githubSection.findUnique({ where: { id: 'singleton' } });
  const projects = await prisma.project.findMany({});

  assert.equal(section.bio, 'C++ Systems Developer & AI Engineer');
  assert.equal(projects[0].shortDesc, 'A hand-written description worth keeping.');
  assert.equal(projects[0].technologies, '["C++","OOP"]');
  assert.equal(result.changed, 0);
  assert.equal(result.counts.kept, 3);
});

test('engine: overwrite applies, records provenance and stores JSON arrays correctly', async () => {
  const prisma = seed();
  await prisma.project.update({ where: { id: 'p1' }, data: { shortDesc: '' } });

  const result = await applySync({
    prisma,
    provider: 'github',
    trigger: 'manual',
    clock,
    updates: [
      { entity: 'github', field: 'username', value: 'Muhammad-Fahad-Javed', policy: 'overwrite' },
      { entity: 'project', entityId: 'p1', field: 'shortDesc', value: 'Now filled from GitHub', policy: 'fill-only' },
      { entity: 'project', entityId: 'p1', field: 'technologies', value: ['C++', 'SFML'], policy: 'overwrite' },
    ],
  });

  const section = await prisma.githubSection.findUnique({ where: { id: 'singleton' } });
  const project = await prisma.project.findUnique({ where: { id: 'p1' } });
  const states = await prisma.fieldState.findMany({});

  assert.equal(section.username, 'Muhammad-Fahad-Javed');
  assert.equal(project.shortDesc, 'Now filled from GitHub');
  assert.equal(project.technologies, '["C++","SFML"]');
  assert.equal(result.changed, 3);

  const usernameState = states.find((s) => s.entity === 'github' && s.field === 'username');
  assert.equal(usernameState.source, 'github');
  assert.equal(usernameState.locked, false);
  assert.ok(usernameState.syncedAt);
});

test('engine: empty provider values never blank existing content', async () => {
  const prisma = seed();

  const result = await applySync({
    prisma,
    provider: 'github',
    trigger: 'manual',
    clock,
    updates: [
      { entity: 'github', field: 'bio', value: '', policy: 'overwrite' },
      { entity: 'github', field: 'location', value: '   ', policy: 'overwrite' },
      { entity: 'project', entityId: 'p1', field: 'shortDesc', value: null, policy: 'overwrite' },
    ],
  });

  const section = await prisma.githubSection.findUnique({ where: { id: 'singleton' } });
  const project = await prisma.project.findUnique({ where: { id: 'p1' } });

  assert.equal(section.bio, 'C++ Systems Developer & AI Engineer');
  assert.equal(section.location, 'Multan, Pakistan');
  assert.equal(project.shortDesc, 'A hand-written description worth keeping.');
  assert.equal(result.changed, 0);
  assert.equal(result.counts.empty, 3);
});

test('engine: a locked field is never written', async () => {
  const prisma = seed();
  await prisma.fieldState.create({
    data: { entity: 'profile', entityId: '', field: 'fullName', locked: true, source: 'manual' },
  });

  const result = await applySync({
    prisma,
    provider: 'github',
    trigger: 'manual',
    clock,
    updates: [{ entity: 'profile', field: 'fullName', value: 'Some Other Name', policy: 'overwrite' }],
  });

  const profile = await prisma.profile.findUnique({ where: { id: 'singleton' } });
  assert.equal(profile.fullName, 'Muhammad Fahad Javed');
  assert.equal(result.counts.locked, 1);
});

test('engine: an identical value is a no-op, not a rewrite', async () => {
  const prisma = seed();
  const before = await prisma.githubSection.findUnique({ where: { id: 'singleton' } });

  const result = await applySync({
    prisma,
    provider: 'github',
    trigger: 'manual',
    clock,
    updates: [
      {
        entity: 'github',
        field: 'bio',
        value: 'C++ Systems Developer & AI Engineer',
        policy: 'overwrite',
      },
    ],
  });

  const after = await prisma.githubSection.findUnique({ where: { id: 'singleton' } });
  assert.equal(result.counts.unchanged, 1);
  assert.deepEqual(after, before, 'the row must not be touched at all');
});

test('engine: a missing row is skipped rather than created', async () => {
  const prisma = seed();

  const result = await applySync({
    prisma,
    provider: 'github',
    trigger: 'manual',
    clock,
    updates: [{ entity: 'project', entityId: 'does-not-exist', field: 'shortDesc', value: 'x', policy: 'fill-only' }],
  });

  const projects = await prisma.project.findMany({});
  assert.equal(projects.length, 1);
  assert.equal(result.counts.missing, 1);
});

test('engine: a failure inside the run rolls back every write', async () => {
  const base = seed();

  // Wraps the client so the transaction's FieldState write throws after the
  // project row has already been updated.
  const prisma = {
    ...base,
    $transaction: (fn) =>
      base.$transaction(async (tx) => {
        const patched = { ...tx };
        patched.fieldState = {
          ...tx.fieldState,
          create: async () => {
            throw new Error('simulated failure');
          },
        };
        return fn(patched);
      }),
  };

  await assert.rejects(() =>
    applySync({
      prisma,
      provider: 'github',
      trigger: 'manual',
      clock,
      updates: [
        { entity: 'project', entityId: 'p1', field: 'shortDesc', value: 'written then rolled back', policy: 'overwrite' },
      ],
    })
  );

  const project = await base.project.findUnique({ where: { id: 'p1' } });
  assert.equal(project.shortDesc, 'A hand-written description worth keeping.');

  const states = await base.fieldState.findMany({});
  assert.equal(states.length, 0);

  const runs = await base.syncRun.findMany({});
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, 'error');
  assert.equal(runs[0].fieldsChanged, 0);
});

test('engine: records a success run with counts and no payload values', async () => {
  const prisma = seed();

  const result = await applySync({
    prisma,
    provider: 'github',
    trigger: 'cron',
    clock,
    updates: [
      { entity: 'github', field: 'location', value: 'Lahore, Pakistan', policy: 'overwrite' },
      { entity: 'github', field: 'bio', value: 'kept', policy: 'fill-only' },
    ],
  });

  const runs = await prisma.syncRun.findMany({});
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, 'success');
  assert.equal(runs[0].trigger, 'cron');
  assert.equal(runs[0].fieldsChanged, 1);
  assert.equal(runs[0].fieldsSkipped, 1);
  assert.ok(!runs[0].message.includes('Lahore'), 'messages must not echo values');
  assert.equal(result.status, 'success');
});

test('engine: credentials are scrubbed from persisted error messages', () => {
  const message = scrub(
    'Request failed with Authorization: Bearer ghp_abcdefghijklmnopqrstuvwxyz012345 and github_pat_11ABCDEFG0123456789'
  );
  assert.ok(!message.includes('ghp_abcdefghijklmnopqrstuvwxyz012345'));
  assert.ok(!message.includes('github_pat_11ABCDEFG0123456789'));
  assert.ok(message.includes('[redacted]'));
});

test('engine: decision table is explicit about precedence', () => {
  const state = { locked: true };

  assert.equal(decideUpdate({ entity: 'github', field: 'bio', value: 'x', policy: 'overwrite' }, '', state), 'locked');
  assert.equal(decideUpdate({ entity: 'github', field: 'bio', value: '', policy: 'overwrite' }, 'keep', null), 'empty');
  assert.equal(decideUpdate({ entity: 'github', field: 'bio', value: 'x', policy: 'fill-only' }, 'keep', null), 'kept');
  assert.equal(decideUpdate({ entity: 'github', field: 'bio', value: 'x', policy: 'overwrite' }, 'x', null), 'unchanged');
  assert.equal(decideUpdate({ entity: 'github', field: 'bio', value: 'x', policy: 'overwrite' }, 'y', null), 'write');
  assert.equal(decideUpdate({ entity: 'github', field: 'bio', value: 'x', policy: 'nonsense' }, 'y', null), 'invalid-policy');
});

test('engine: hashes are stable for arrays and distinguish number from string', () => {
  assert.equal(hashValue(['a', 'b']), hashValue(['a', 'b']));
  assert.notEqual(hashValue(['a', 'b']), hashValue(['b', 'a']));
  assert.notEqual(hashValue(42), hashValue('42'));
});
