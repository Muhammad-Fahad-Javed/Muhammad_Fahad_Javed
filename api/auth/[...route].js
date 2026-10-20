const prisma = require('../../lib/db');
const {
  comparePassword,
  hashPassword,
  setSessionCookie,
  clearSessionCookie,
  getSessionToken,
  enforceCsrf,
  requireAuth,
  assertPasswordUsable,
} = require('../../lib/auth');
const {
  createSession,
  resolveSession,
  revokeSession,
  revokeAllSessions,
} = require('../../lib/sessions');
const { getJsonBody, getClientIp, methodNotAllowed } = require('../../lib/http');
const { sendError, unauthorized, badRequest } = require('../../lib/errors');
const { recordAttempt, isRateLimited, pruneLoginAttempts } = require('../../lib/ratelimit');

// A valid bcrypt hash used to equalise timing when the account does not exist,
// so login does not reveal whether an email is registered.
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO1D8r7mF5h5r9k9b5n7Q3wq2vJ6Y3n2u';

function getRoute(req) {
  const route = req.query && req.query.route;
  if (Array.isArray(route)) return route.join('/').replace(/^\/+|\/+$/g, '');
  if (typeof route === 'string') return route.replace(/^\/+|\/+$/g, '');
  const pathname = String(req.url || '').split('?')[0];
  return pathname.replace(/^\/api\/auth\/?/, '').replace(/^\/+|\/+$/g, '');
}

async function login(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  enforceCsrf(req);

  const ip = getClientIp(req);
  const { email, password } = getJsonBody(req);

  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    throw badRequest('Email and password are required.');
  }

  const cleanEmail = email.toLowerCase().trim();

  // Account- and IP-scoped throttling. Neither alone is sufficient: the IP can
  // be rotated, the account can be targeted from many IPs.
  if (await isRateLimited({ ip, identifier: cleanEmail })) {
    res.status(429).json({
      error: 'Too many failed login attempts. Please try again later.',
      code: 'RATE_LIMITED',
    });
    return;
  }

  const user = await prisma.adminUser.findUnique({ where: { email: cleanEmail } });

  // Always perform one comparison to keep timing flat for unknown accounts.
  const valid = user
    ? await comparePassword(password.trim(), user.passwordHash)
    : ((await comparePassword(password.trim(), DUMMY_HASH)), false);

  await recordAttempt({ ip, identifier: cleanEmail, success: valid });

  if (!valid || !user) {
    res.status(401).json({ error: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' });
    return;
  }

  const { token } = await createSession(user);
  setSessionCookie(res, token);

  res.status(200).json({ id: user.id, email: user.email, name: user.name });
}

async function logout(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  enforceCsrf(req);

  const token = getSessionToken(req);
  if (token) {
    try {
      const resolved = await resolveSession(token);
      if (resolved && resolved.session) await revokeSession(resolved.session.id);
    } catch {
      /* fall through — clearing the cookie is still correct */
    }
  }
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
}

const me = requireAuth(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  res.status(200).json({ email: req.user.email, id: req.user.id, name: req.user.name });
});

const changePassword = requireAuth(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  const { currentPassword, newPassword } = getJsonBody(req);
  if (!currentPassword || !newPassword) {
    throw badRequest('Current and new password are required.');
  }
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    throw badRequest('Passwords must be strings.');
  }
  try {
    assertPasswordUsable(newPassword);
  } catch (err) {
    throw badRequest(err.message);
  }

  const user = await prisma.adminUser.findUnique({ where: { id: req.admin.sub } });
  if (!user) throw unauthorized('Admin user not found.');

  // The throttle must be checked BEFORE the password comparison. Checking it
  // only after a failed guess lets an attacker holding a stolen session keep
  // guessing the current password: the correct guess would still succeed.
  const ip = getClientIp(req);
  if (await isRateLimited({ ip, identifier: user.email })) {
    res.status(429).json({ error: 'Too many attempts. Please try again later.', code: 'RATE_LIMITED' });
    return;
  }

  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) {
    await recordAttempt({ ip, identifier: user.email, success: false });
    res.status(401).json({ error: 'Current password is incorrect.', code: 'INVALID_CREDENTIALS' });
    return;
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.adminUser.update({ where: { id: user.id }, data: { passwordHash } });

  // Revoke every existing session (including any stolen cookie) and issue a
  // fresh one for the browser that just changed the password.
  await revokeAllSessions(user.id);
  const refreshed = await prisma.adminUser.findUnique({ where: { id: user.id } });
  const { token } = await createSession(refreshed);
  setSessionCookie(res, token);

  res.status(200).json({ ok: true });
});

async function prune(req, res) {
  // Authenticated housekeeping endpoint (also safe to call from a cron).
  const count = await pruneLoginAttempts();
  res.status(200).json({ ok: true, pruned: count });
}

module.exports = async (req, res) => {
  try {
    const route = getRoute(req);
    switch (route) {
      case 'login':
        return await login(req, res);
      case 'logout':
        return await logout(req, res);
      case 'me':
        return await me(req, res);
      case 'change-password':
        return await changePassword(req, res);
      case 'prune':
        return await requireAuth(prune)(req, res);
      default:
        res.status(404).json({ error: 'Auth route not found.', code: 'NOT_FOUND' });
    }
  } catch (err) {
    sendError(res, err, 'auth');
  }
};
