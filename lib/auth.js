// ============================================================================
// Authentication primitives: password hashing, session cookie handling,
// CSRF protection and the `requireAuth` route wrapper.
//
// Layer 1 (identity) lives in lib/sessions.js — database-backed, revocable.
// Layer 2 (browser protections) lives here: HttpOnly/Secure/SameSite cookies
// plus a same-origin + custom-header CSRF requirement on every mutating call.
// ============================================================================
'use strict';

const bcrypt = require('bcryptjs');
const cookie = require('cookie');

const { unauthorized, forbidden, sendError } = require('./errors');
const { isProduction } = require('./config');
const { resolveSession } = require('./sessions');

const COOKIE_NAME = 'admin_session';
const SESSION_DAYS = 7;
const CSRF_HEADER = 'x-requested-with';
const CSRF_VALUE = 'portfolio-admin';
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_BYTES = 72; // bcrypt truncates beyond 72 bytes

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

function assertPasswordUsable(plain) {
  if (typeof plain !== 'string' || !plain) {
    throw new Error('Password must be a non-empty string.');
  }
  const clean = plain.trim();
  if (clean.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (Buffer.byteLength(clean, 'utf8') > PASSWORD_MAX_BYTES) {
    throw new Error(`Password must be at most ${PASSWORD_MAX_BYTES} bytes.`);
  }
  return clean;
}

async function hashPassword(plain) {
  const clean = assertPasswordUsable(plain);
  return bcrypt.hash(clean, 12);
}

async function comparePassword(plain, hash) {
  if (typeof plain !== 'string' || !plain) return false;
  if (typeof hash !== 'string' || hash.length !== 60) return false;
  try {
    return await bcrypt.compare(plain.trim(), hash.trim());
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Session cookie
// ---------------------------------------------------------------------------

function setSessionCookie(res, token) {
  const serialized = cookie.serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  res.setHeader('Set-Cookie', serialized);
}

function clearSessionCookie(res) {
  const serialized = cookie.serialize(COOKIE_NAME, '', {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  res.setHeader('Set-Cookie', serialized);
}

function getSessionToken(req) {
  const header = (req.headers && req.headers.cookie) || '';
  const parsed = cookie.parse(header);
  return parsed[COOKIE_NAME] || null;
}

// ---------------------------------------------------------------------------
// CSRF
// ---------------------------------------------------------------------------

function allowedOrigins(req) {
  const set = new Set();
  const proto = String((req.headers && req.headers['x-forwarded-proto']) || 'https')
    .split(',')[0]
    .trim();
  const host = (req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '';
  if (host) {
    set.add(`${proto}://${host}`);
    set.add(`https://${host}`);
    set.add(`http://${host}`);
  }
  const extra = process.env.EXTRA_ALLOWED_ORIGINS;
  if (typeof extra === 'string' && extra.trim()) {
    for (const o of extra.split(',').map((s) => s.trim()).filter(Boolean)) set.add(o);
  }
  return set;
}

// Defence in depth: a request must both carry the custom header (which a
// cross-site form/script cannot set) AND come from our own origin.
function enforceCsrf(req) {
  const method = (req.method || 'GET').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;

  const headerValue = req.headers && req.headers[CSRF_HEADER];
  if (headerValue !== CSRF_VALUE) {
    throw forbidden('Missing or invalid security header.', 'CSRF_HEADER');
  }

  const allowed = allowedOrigins(req);
  const origin = req.headers && req.headers.origin;
  if (origin) {
    if (!allowed.has(origin)) throw forbidden('Cross-origin request rejected.', 'CSRF_ORIGIN');
    return;
  }
  const referer = req.headers && req.headers.referer;
  if (referer) {
    let refOrigin = null;
    try {
      refOrigin = new URL(referer).origin;
    } catch {
      refOrigin = null;
    }
    if (!refOrigin || !allowed.has(refOrigin)) {
      throw forbidden('Cross-origin request rejected.', 'CSRF_REFERER');
    }
    return;
  }
  throw forbidden('Request is missing an Origin/Referer header.', 'CSRF_NO_ORIGIN');
}

// ---------------------------------------------------------------------------
// Route guard
// ---------------------------------------------------------------------------

function requireAuth(handler) {
  return async (req, res) => {
    try {
      const token = getSessionToken(req);
      if (!token) throw unauthorized('Unauthorized. Please log in again.');

      let resolved;
      try {
        resolved = await resolveSession(token);
      } catch (err) {
        // Deactivated/legacy sessions table or DB outage — reject, never allow.
        console.error('[requireAuth] session resolution failed:', err && err.message);
        resolved = null;
      }
      if (!resolved) throw unauthorized('Unauthorized. Please log in again.');

      enforceCsrf(req);

      req.admin = { sub: resolved.user.id, email: resolved.user.email };
      req.session = resolved.session;
      req.user = resolved.user;
      return await handler(req, res);
    } catch (err) {
      sendError(res, err, 'requireAuth');
    }
  };
}

module.exports = {
  COOKIE_NAME,
  CSRF_HEADER,
  CSRF_VALUE,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_BYTES,
  hashPassword,
  comparePassword,
  assertPasswordUsable,
  setSessionCookie,
  clearSessionCookie,
  getSessionToken,
  allowedOrigins,
  enforceCsrf,
  requireAuth,
};
