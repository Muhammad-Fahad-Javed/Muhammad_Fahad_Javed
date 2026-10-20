// ============================================================================
// Vercel's filesystem routing, transcribed for the local dev server.
//
// More specific patterns must come first, because the server picks the first
// match. Every file under api/ has to appear here, otherwise an endpoint would
// work in production but 404 locally — tests/local-dev.test.js enforces that.
// ============================================================================
'use strict';

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const ROUTES = [
  { re: /^\/api\/auth\/(.+)$/, file: 'api/auth/[...route].js', params: (m) => ({ route: m[1] }) },
  { re: /^\/api\/auth\/?$/, file: 'api/auth/[...route].js', params: () => ({ route: '' }) },
  { re: /^\/api\/public\/content\/?$/, file: 'api/public/content.js', params: () => ({}) },
  { re: /^\/api\/sync\/status\/?$/, file: 'api/sync/status.js', params: () => ({}) },
  { re: /^\/api\/sync\/run\/?$/, file: 'api/sync/run.js', params: () => ({}) },
  { re: /^\/api\/sync\/github\/?$/, file: 'api/sync/github.js', params: () => ({}) },
  { re: /^\/api\/sync\/repos\/?$/, file: 'api/sync/repos.js', params: () => ({}) },
  { re: /^\/api\/cron\/sync\/?$/, file: 'api/cron/sync.js', params: () => ({}) },
  { re: /^\/api\/admin\/stats\/?$/, file: 'api/admin/stats.js', params: () => ({}) },
  { re: /^\/api\/admin\/reorder\/?$/, file: 'api/admin/reorder.js', params: () => ({}) },
  { re: /^\/api\/admin\/import\/?$/, file: 'api/admin/import.js', params: () => ({}) },
  { re: /^\/api\/admin\/export\/?$/, file: 'api/admin/export.js', params: () => ({}) },
  { re: /^\/api\/admin\/media\/?$/, file: 'api/admin/media/index.js', params: () => ({}) },
  { re: /^\/api\/admin\/media\/(.+)$/, file: 'api/admin/media/[id].js', params: (m) => ({ id: decode(m[1]) }) },
  { re: /^\/api\/admin\/singleton\/(.+)$/, file: 'api/admin/singleton/[type].js', params: (m) => ({ type: decode(m[1]) }) },
  { re: /^\/api\/admin\/([^/]+)\/(.+)$/, file: 'api/admin/[resource]/[id].js', params: (m) => ({ resource: decode(m[1]), id: decode(m[2]) }) },
  { re: /^\/api\/admin\/([^/]+)\/?$/, file: 'api/admin/[resource]/index.js', params: (m) => ({ resource: decode(m[1]) }) },
];

module.exports = { ROUTES };
