// ============================================================================
// Integration service: the orchestration layer between HTTP handlers and the
// sync engine.
//
// Responsibilities:
//   - verify and seal credentials when a provider is connected
//   - run one provider end to end, recording the outcome
//   - expose integration state WITHOUT ever exposing a token
//
// Error mapping is deliberate: an expired or revoked credential becomes a
// "reconnect required" answer (409), a rate limit becomes 429 with the reset
// time, and an unreachable provider becomes 504. A sync is only reported as
// successful when the engine actually completed.
// ============================================================================
'use strict';

const { HttpError, badRequest, notFound } = require('../errors');
const { sealForProvider, openForProvider } = require('./crypto');
const { applySync, scrub } = require('./engine');
const { fetchGithubSnapshot, mapGithubUpdates } = require('./github');
const { SyncHttpError, createHttp } = require('./http');

const PROVIDERS = new Set(['github', 'linkedin']);
const RUNNING_WINDOW_MS = 120000;

// Fine-grained (github_pat_) and classic (ghp_) tokens, plus the OAuth
// variants GitHub documents. Anything else is rejected before a network call.
const GITHUB_TOKEN_PATTERN = /^(github_pat_[A-Za-z0-9_]{20,}|gh[opsu]_[A-Za-z0-9]{20,})$/;

function assertProvider(provider) {
  const name = String(provider || '').trim().toLowerCase();
  if (!PROVIDERS.has(name)) throw badRequest('Unknown integration provider.', 'UNKNOWN_PROVIDER');
  return name;
}

// Public projection: an explicit allow-list, so a new secret column can never
// leak into an API response just because it exists.
function publicIntegration(row, provider) {
  if (!row) {
    return {
      provider,
      connected: false,
      status: 'disconnected',
      accountLabel: '',
      scopes: '',
      tokenExpiresAt: null,
      lastSyncAt: null,
      lastSyncStatus: '',
      lastError: '',
    };
  }

  return {
    provider: row.provider,
    // A credential that exists but is failing is still "connected": the
    // dashboard needs to distinguish that from "never connected".
    connected: row.status !== 'disconnected' && Boolean(row.accessTokenEnc),
    status: row.status || 'disconnected',
    accountLabel: row.accountLabel || '',
    scopes: row.scopes || '',
    tokenExpiresAt: row.tokenExpiresAt || null,
    lastSyncAt: row.lastSyncAt || null,
    lastSyncStatus: row.lastSyncStatus || '',
    lastError: row.lastError || '',
  };
}

function publicRun(row) {
  return {
    id: row.id,
    provider: row.provider,
    trigger: row.trigger,
    status: row.status,
    startedAt: row.startedAt || null,
    finishedAt: row.finishedAt || null,
    fieldsChanged: row.fieldsChanged || 0,
    fieldsSkipped: row.fieldsSkipped || 0,
    message: row.message || '',
  };
}

function publicField(row) {
  return {
    entity: row.entity,
    entityId: row.entityId || '',
    field: row.field,
    source: row.source || 'manual',
    syncedAt: row.syncedAt || null,
    status: row.status || 'ok',
    locked: !!row.locked,
    visible: row.visible !== false,
    valueHash: row.valueHash || '',
  };
}

function toHttpError(err) {
  if (err instanceof HttpError) return err;
  if (err instanceof SyncHttpError) {
    const message = scrub(err.message);
    if (err.code === 'SYNC_UNAUTHORIZED' || err.code === 'SYNC_FORBIDDEN') {
      return new HttpError(409, 'The integration needs to be reconnected: ' + message, 'SYNC_RECONNECT_REQUIRED');
    }
    if (err.code === 'SYNC_RATE_LIMITED') {
      const error = new HttpError(
        429,
        'The provider rate limit is exhausted. Try again after the reset time.',
        'SYNC_RATE_LIMITED'
      );
      error.rateLimitReset = err.rateLimitReset || null;
      return error;
    }
    if (err.code === 'SYNC_NOT_FOUND') {
      return new HttpError(404, 'The provider account could not be found.', 'SYNC_ACCOUNT_NOT_FOUND');
    }
    return new HttpError(504, 'The provider could not be reached: ' + message, 'SYNC_UPSTREAM_UNAVAILABLE');
  }
  return new HttpError(502, scrub(err && err.message ? err.message : 'The sync failed.'), 'SYNC_FAILED');
}

async function findIntegration(prisma, provider) {
  return prisma.integration.findFirst({ where: { provider } });
}

async function saveIntegration(prisma, provider, data) {
  const existing = await findIntegration(prisma, provider);
  if (existing) {
    return prisma.integration.update({ where: { id: existing.id }, data });
  }
  return prisma.integration.create({ data: { provider, ...data } });
}

// ---------------------------------------------------------------------------
// Connecting / disconnecting
// ---------------------------------------------------------------------------

async function connectGithub(options) {
  const opts = options || {};
  const prisma = opts.prisma;
  const http = opts.http || createHttp();
  const clock = opts.clock || (() => new Date());
  const token = typeof opts.token === 'string' ? opts.token.trim() : '';

  if (!token) throw badRequest('A GitHub token is required.', 'TOKEN_REQUIRED');
  if (token.length > 255 || !GITHUB_TOKEN_PATTERN.test(token)) {
    throw badRequest(
      'That does not look like a GitHub token. Use a fine-grained personal access token (github_pat_…) with read-only public access.',
      'TOKEN_INVALID_FORMAT'
    );
  }

  // Verify before storing: a token that cannot read the account is useless and
  // reporting "connected" for it would be a lie.
  let account;
  try {
    const res = await http.request('https://api.github.com/user', {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'fahad-portfolio-sync',
        'x-github-api-version': '2022-11-28',
        authorization: 'Bearer ' + token,
      },
      timeoutMs: 5000,
      attempts: 2,
      budgetMs: 8000,
    });
    account = res.body;
  } catch (err) {
    if (err instanceof SyncHttpError && (err.code === 'SYNC_UNAUTHORIZED' || err.code === 'SYNC_FORBIDDEN')) {
      throw badRequest(
        'GitHub rejected that token. Check that it has not expired and still has read access.',
        'TOKEN_REJECTED'
      );
    }
    throw toHttpError(err);
  }

  const login = account && typeof account.login === 'string' ? account.login.trim() : '';
  if (!login) {
    throw badRequest('GitHub accepted the token but returned no account.', 'TOKEN_NO_ACCOUNT');
  }

  const now = clock();
  await saveIntegration(prisma, 'github', {
    status: 'connected',
    accountLabel: login,
    accountId: account.id ? String(account.id) : '',
    scopes: 'public-read',
    accessTokenEnc: sealForProvider(token, 'github'),
    refreshTokenEnc: null,
    tokenExpiresAt: null,
    lastSyncStatus: '',
    lastError: '',
    updatedAt: now,
  });

  return publicIntegration(await findIntegration(prisma, 'github'), 'github');
}

async function disconnectProvider(options) {
  const opts = options || {};
  const provider = assertProvider(opts.provider);

  const existing = await findIntegration(opts.prisma, provider);
  if (!existing) return publicIntegration(null, provider);

  // Wipe the ciphertext rather than merely flipping a flag: "disconnected"
  // must mean the credential is gone, not merely ignored.
  await opts.prisma.integration.update({
    where: { id: existing.id },
    data: {
      status: 'disconnected',
      accessTokenEnc: null,
      refreshTokenEnc: null,
      tokenExpiresAt: null,
      accountLabel: '',
      accountId: '',
      scopes: '',
      lastSyncStatus: '',
      lastError: '',
    },
  });

  return publicIntegration(await findIntegration(opts.prisma, provider), provider);
}

// ---------------------------------------------------------------------------
// Running a sync
// ---------------------------------------------------------------------------

async function assertNotAlreadyRunning(prisma, provider, clock) {
  const running = await prisma.syncRun.findMany({ where: { provider, status: 'running' } });
  const nowMs = clock().getTime();
  for (const run of running) {
    const started = run.startedAt instanceof Date ? run.startedAt.getTime() : new Date(run.startedAt).getTime();
    if (Number.isFinite(started) && nowMs - started < RUNNING_WINDOW_MS) {
      throw new HttpError(409, 'A sync is already running for this provider.', 'SYNC_IN_PROGRESS');
    }
  }
}

async function loadGithubToken(prisma, clock) {
  const integration = await findIntegration(prisma, 'github');
  // A previous failure leaves status 'error' with the credential still stored,
  // so a manual retry must remain possible; only a missing or wiped credential
  // counts as "not connected".
  if (!integration || integration.status === 'disconnected' || !integration.accessTokenEnc) {
    throw new HttpError(409, 'GitHub is not connected.', 'INTEGRATION_NOT_CONNECTED');
  }

  try {
    return { integration, token: openForProvider(integration.accessTokenEnc, 'github') };
  } catch (err) {
    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        status: 'error',
        lastSyncStatus: 'error',
        lastSyncAt: clock(),
        lastError: 'Stored credentials could not be decrypted. Reconnect the integration.',
      },
    });
    throw new HttpError(
      409,
      'Stored credentials could not be decrypted. Reconnect the integration.',
      'SYNC_TOKEN_UNREADABLE'
    );
  }
}

async function syncGithub(options) {
  const opts = options || {};
  const prisma = opts.prisma;
  const http = opts.http || createHttp();
  const clock = opts.clock || (() => new Date());
  const trigger = opts.trigger || 'manual';

  await assertNotAlreadyRunning(prisma, 'github', clock);

  const { integration, token } = await loadGithubToken(prisma, clock);
  const section = await prisma.githubSection.findUnique({ where: { id: 'singleton' } });
  const username = (section && section.username) || integration.accountLabel;

  try {
    if (!username) {
      throw new HttpError(
        409,
        'No GitHub username is configured. Set it in the GitHub section first.',
        'SYNC_NO_USERNAME'
      );
    }

    const snapshot = await fetchGithubSnapshot({ username, token, http });

    const allProjects = await prisma.project.findMany({});
    const allowlist = allProjects
      .filter((project) => project && typeof project.githubRepo === 'string' && project.githubRepo.trim())
      .map((project) => ({ id: project.id, githubRepo: project.githubRepo }));

    const updates = mapGithubUpdates({
      profile: snapshot.profile,
      repos: snapshot.repos,
      projects: allowlist,
      syncAvatar: !!(section && section.syncAvatar),
    });

    const result = await applySync({ prisma, provider: 'github', trigger, updates, clock });

    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        status: 'connected',
        accountLabel: snapshot.profile.login || integration.accountLabel,
        lastSyncAt: clock(),
        lastSyncStatus: 'success',
        lastError: '',
      },
    });

    return {
      ...result,
      provider: 'github',
      repositories: snapshot.repos.length,
      truncated: snapshot.truncated,
      rateLimit: snapshot.rateLimit,
    };
  } catch (err) {
    const httpError = toHttpError(err);
    try {
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          status: httpError.code === 'SYNC_RECONNECT_REQUIRED' ? 'error' : 'connected',
          lastSyncAt: clock(),
          lastSyncStatus: 'error',
          lastError: scrub(httpError.message),
        },
      });
    } catch {
      // Recording the failure must never mask the original error.
    }
    throw httpError;
  }
}

async function syncProvider(options) {
  const opts = options || {};
  const provider = assertProvider(opts.provider);
  if (provider === 'github') return syncGithub(opts);

  throw new HttpError(
    409,
    'LinkedIn synchronisation is not configured yet.',
    'INTEGRATION_NOT_CONFIGURED'
  );
}

// ---------------------------------------------------------------------------
// Read-only views
// ---------------------------------------------------------------------------

async function getStatus(options) {
  const opts = options || {};

  const rows = await opts.prisma.integration.findMany({});
  const byProvider = new Map(rows.map((row) => [row.provider, row]));

  const runs = await opts.prisma.syncRun.findMany({});
  const recentRuns = runs
    .slice()
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 10)
    .map(publicRun);

  const fields = await opts.prisma.fieldState.findMany({});

  return {
    github: publicIntegration(byProvider.get('github'), 'github'),
    linkedin: publicIntegration(byProvider.get('linkedin'), 'linkedin'),
    recentRuns,
    fields: fields.map(publicField),
  };
}

async function listGithubRepos(options) {
  const opts = options || {};
  const clock = opts.clock || (() => new Date());

  const { token } = await loadGithubToken(opts.prisma, clock);
  const section = await opts.prisma.githubSection.findUnique({ where: { id: 'singleton' } });
  const username = (section && section.username) || '';

  if (!username) {
    throw new HttpError(409, 'No GitHub username is configured.', 'SYNC_NO_USERNAME');
  }

  let snapshot;
  try {
    snapshot = await fetchGithubSnapshot({
      username,
      token,
      http: opts.http || createHttp(),
    });
  } catch (err) {
    throw toHttpError(err);
  }

  const projects = await opts.prisma.project.findMany({});
  const featured = new Set(
    projects
      .filter((project) => project && typeof project.githubRepo === 'string')
      .map((project) => project.githubRepo.toLowerCase())
  );

  return {
    username: snapshot.profile.login,
    repositories: snapshot.repos.map((repo) => ({
      fullName: repo.fullName,
      name: repo.name,
      description: repo.description,
      htmlUrl: repo.htmlUrl,
      language: repo.language,
      topics: repo.topics,
      updatedAt: repo.updatedAt,
      featured: featured.has(repo.fullName.toLowerCase()),
    })),
    rateLimit: snapshot.rateLimit,
  };
}

module.exports = {
  PROVIDERS,
  GITHUB_TOKEN_PATTERN,
  assertProvider,
  connectGithub,
  disconnectProvider,
  syncProvider,
  syncGithub,
  getStatus,
  listGithubRepos,
  publicIntegration,
  publicRun,
  publicField,
  toHttpError,
  findIntegration,
};
