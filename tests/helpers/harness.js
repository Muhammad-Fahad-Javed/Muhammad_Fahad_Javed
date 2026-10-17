// ============================================================================
// Test harness: isolated env, isolated module loading, mock req/res.
// ============================================================================
'use strict';

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
// --- Isolated environment -------------------------------------------------
// These are set before any lib/api module is loaded. dotenv is deliberately
// NOT loaded so the real .env (with the production DATABASE_URL) can never be
// picked up by the test process.
process.env.NODE_ENV = 'test';
delete process.env.VERCEL_ENV;
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/portfolio_test';
process.env.JWT_SECRET = 'test-only-secret-value-0123456789abcdefghijklmnop';
process.env.TRUSTED_PROXY_HOPS = '1';
delete process.env.BLOB_READ_WRITE_TOKEN;

function clearAppModules() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(path.join(ROOT, 'lib')) || key.startsWith(path.join(ROOT, 'api'))) {
      delete require.cache[key];
    }
  }
}

// Loads an api/lib module with a specific fake Prisma client installed as the
// global singleton that lib/db.js reuses. The module cache is only flushed
// when the client actually changes, so every module a test touches shares one
// consistent set of singletons (important for `instanceof` checks).
let installedPrisma = null;

function loadModule(relativePath, prisma) {
  if (prisma && prisma !== installedPrisma) {
    installedPrisma = prisma;
    global.__PORTFOLIO_PRISMA__ = prisma;
    clearAppModules();
  }
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require(path.join(ROOT, relativePath));
}

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    headersSent: false,
  };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; res.headersSent = true; return res; };
  res.setHeader = (key, value) => { res.headers[String(key).toLowerCase()] = value; };
  res.end = () => { res.headersSent = true; };
  return res;
}

// Defaults mirror a same-origin browser request so CSRF passes by default;
// individual tests override `headers` to simulate attacks.
function mockReq(options) {
  const opts = options || {};
  return {
    method: opts.method || 'GET',
    url: opts.url || '/',
    query: opts.query || {},
    body: opts.body,
    headers: Object.assign(
      {
        host: 'portfolio.test',
        'x-forwarded-proto': 'https',
        origin: 'https://portfolio.test',
        cookie: opts.cookie || '',
        'x-requested-with': 'portfolio-admin',
      },
      opts.headers || {}
    ),
    socket: { remoteAddress: '203.0.113.9' },
  };
}

// Invokes a Vercel-style handler (req, res) and resolves the response.
async function callHandler(handler, req, res) {
  const response = res || mockRes();
  await handler(req, response);
  return response;
}

// Temporarily overrides environment variables for the duration of `fn`.
async function withEnv(patch, fn) {
  const saved = {};
  for (const [key, value] of Object.entries(patch)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

// Reads the first cookie pair from a Set-Cookie response header.
function cookieFrom(res) {
  const header = res.headers['set-cookie'];
  if (!header) return '';
  const raw = Array.isArray(header) ? header[0] : header;
  return String(raw).split(';')[0];
}

module.exports = {
  ROOT,
  clearAppModules,
  loadModule,
  mockReq,
  mockRes,
  callHandler,
  withEnv,
  cookieFrom,
};