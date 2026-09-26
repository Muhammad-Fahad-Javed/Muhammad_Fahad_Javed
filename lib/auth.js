const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');

const COOKIE_NAME = 'admin_session';
const SESSION_DAYS = 7;

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'JWT_SECRET is missing or too short. Set a long random value in your environment variables.'
    );
  }
  return secret;
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function signSession(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    getSecret(),
    { expiresIn: `${SESSION_DAYS}d` }
  );
}

function verifySession(token) {
  try {
    return jwt.verify(token, getSecret());
  } catch (err) {
    return null;
  }
}

function setSessionCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  const serialized = cookie.serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  res.setHeader('Set-Cookie', serialized);
}

function clearSessionCookie(res) {
  const isProd = process.env.NODE_ENV === 'production';
  const serialized = cookie.serialize(COOKIE_NAME, '', {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  res.setHeader('Set-Cookie', serialized);
}

function getSessionFromReq(req) {
  const header = req.headers.cookie || '';
  const parsed = cookie.parse(header);
  const token = parsed[COOKIE_NAME];
  if (!token) return null;
  return verifySession(token);
}

// CSRF mitigation: every mutating admin request must come from same-origin
// JS (which can set this custom header). Cross-site <form> submissions and
// simple cross-site fetches cannot set custom headers without triggering a
// CORS preflight that our API never approves for foreign origins.
function requireCsrfHeader(req) {
  return req.headers['x-requested-with'] === 'portfolio-admin';
}

// Wraps an API handler so it 401s unless a valid session cookie is present.
// Also enforces the CSRF header on state-changing methods.
function requireAuth(handler) {
  return async (req, res) => {
    const session = getSessionFromReq(req);
    if (!session) {
      res.status(401).json({ error: 'Unauthorized. Please log in again.' });
      return;
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !requireCsrfHeader(req)) {
      res.status(403).json({ error: 'Missing security header.' });
      return;
    }
    req.admin = session;
    return handler(req, res);
  };
}

module.exports = {
  COOKIE_NAME,
  hashPassword,
  comparePassword,
  signSession,
  verifySession,
  setSessionCookie,
  clearSessionCookie,
  getSessionFromReq,
  requireAuth,
  requireCsrfHeader,
};
