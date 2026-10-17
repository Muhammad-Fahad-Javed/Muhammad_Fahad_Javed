// ============================================================================
// Local development server.
//
// Serves frontend/ statically and mounts the REAL api/** route handlers,
// unmodified, backed by the throwaway SQLite database in .local-dev/.
// The request/response plumbing mimics what Vercel provides.
//
// Note: Node caches required modules, so restart this process after editing
// anything under api/ or lib/. Editing content in the admin dashboard needs no
// restart — the data is read per request.
// ============================================================================
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

// Installs the SQLite client and repoints DATABASE_URL before anything else
// loads. Must stay the first require with side effects.
const preload = require('./preload.js');

const { REPO_ROOT, DB_FILE } = require('./paths');
const { ROUTES } = require('./routes');
const { resolveStaticPath } = require('./static');

const FRONTEND = path.join(REPO_ROOT, 'frontend');
const PORT = Number(process.env.PORT || 4180);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.pdf': 'application/pdf',
  '.map': 'application/json; charset=utf-8',
};

// ---------------------------------------------------------------------------
// Vercel-style req/res adapter
// ---------------------------------------------------------------------------
function readRawBody(raw) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    raw.on('data', (c) => chunks.push(c));
    raw.on('end', () => resolve(Buffer.concat(chunks)));
    raw.on('error', reject);
  });
}

function makeMockRes(raw) {
  const state = { statusCode: 200, headers: {}, body: undefined, sent: false };
  const res = {
    get headersSent() { return state.sent; },
    status(code) { state.statusCode = code; return res; },
    setHeader(key, value) { state.headers[key] = value; return res; },
    json(payload) {
      state.body = JSON.stringify(payload);
      if (!state.headers['Content-Type']) state.headers['Content-Type'] = 'application/json; charset=utf-8';
      state.sent = true;
      return res;
    },
    end(chunk) { if (chunk !== undefined) state.body = chunk; state.sent = true; },
    writeHead(code, headers) { state.statusCode = code; if (headers) Object.assign(state.headers, headers); },
    __status() { return state.statusCode; },
    __flush() {
      raw.writeHead(state.statusCode, state.headers);
      raw.end(state.body === undefined ? '' : state.body);
    },
  };
  return res;
}

function logApi(method, url, statusCode) {
  const flag = statusCode >= 500 ? 'ERR ' : statusCode >= 400 ? 'WARN' : 'OK  ';
  console.log(`[api] ${flag} ${statusCode} ${method} ${url}`);
}

// ---------------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------------
function serveStatic(res, pathname) {
  const filePath = resolveStaticPath(FRONTEND, pathname);
  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found: ' + pathname);
      return;
    }
    // no-store so a refresh always shows the latest edit.
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
const server = http.createServer(async (rawReq, rawRes) => {
  const url = new URL(rawReq.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  if (!pathname.startsWith('/api/')) {
    serveStatic(rawRes, pathname);
    return;
  }

  const route = ROUTES.find((r) => r.re.test(pathname));
  if (!route) {
    rawRes.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    rawRes.end(JSON.stringify({ error: 'No such API route.', code: 'NO_ROUTE' }));
    logApi(rawReq.method, rawReq.url, 404);
    return;
  }

  const match = pathname.match(route.re);
  const query = Object.assign({}, route.params(match));
  for (const [key, value] of url.searchParams) query[key] = value;

  const bodyBuffer = await readRawBody(rawReq);
  const text = bodyBuffer.toString('utf8');

  const req = {
    method: rawReq.method,
    url: rawReq.url,
    query,
    headers: Object.assign({}, rawReq.headers),
    socket: rawReq.socket,
    body: undefined,
  };

  const contentType = String(rawReq.headers['content-type'] || '');
  if (text && contentType.includes('application/json')) {
    try {
      req.body = JSON.parse(text);
    } catch {
      req.body = text; // reproduces the malformed-JSON path
    }
  } else if (text) {
    req.body = text;
  }

  const res = makeMockRes(rawRes);

  let handler;
  try {
    handler = require(path.join(REPO_ROOT, route.file));
  } catch (err) {
    rawRes.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    rawRes.end(JSON.stringify({ error: `Failed to load handler: ${err.message}` }));
    return;
  }

  try {
    await handler(req, res);
  } catch (err) {
    if (!res.headersSent) {
      rawRes.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      rawRes.end(JSON.stringify({ error: `Unhandled: ${err.message}` }));
      logApi(rawReq.method, rawReq.url, 500);
      return;
    }
  }

  res.__flush();
  logApi(rawReq.method, rawReq.url, res.__status());
});

// Exposed so helper scripts can reach the same client instance.
global.__LOCAL_PRISMA__ = preload;

server.listen(PORT, () => {
  const adminEmail = process.env.ADMIN_EMAIL || '(ADMIN_EMAIL not set in .env)';
  console.log('');
  console.log(`  Public site   http://localhost:${PORT}/`);
  console.log(`  Admin         http://localhost:${PORT}/admin/dashboard.html`);
  console.log(`  Admin login   ${adminEmail} / ${process.env.ADMIN_PASSWORD}`);
  console.log(`  Database      ${DB_FILE}  (local SQLite, never production)`);
  console.log('');
  console.log('  Restart this process after editing anything under api/ or lib/.');
  console.log('');
});
