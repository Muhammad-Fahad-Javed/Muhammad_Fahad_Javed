// ============================================================================
// Static file resolution for the local dev server.
//
// Mirrors the two rewrites in vercel.json (/admin -> /admin/index.html) and
// refuses anything that would escape the frontend/ directory, so a request
// like /../../.env cannot be used to read files outside the site root.
// ============================================================================
'use strict';

const path = require('path');

// Returns an absolute path inside frontendDir, or null if the request is
// rejected.
function resolveStaticPath(frontendDir, pathname) {
  let relative = pathname === '/' ? '/index.html' : pathname;
  if (relative === '/admin' || relative === '/admin/') relative = '/admin/index.html';

  let decoded;
  try {
    decoded = decodeURIComponent(relative);
  } catch {
    return null;
  }

  // A NUL byte can truncate a path inside some system calls.
  if (decoded.includes('\0')) return null;

  const root = path.resolve(frontendDir);
  const resolved = path.resolve(path.join(root, decoded));

  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

module.exports = { resolveStaticPath };
