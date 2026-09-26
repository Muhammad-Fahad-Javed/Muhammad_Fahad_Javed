const prisma = require('../../lib/db');
const {
  comparePassword,
  signSession,
  setSessionCookie,
  clearSessionCookie,
  getSessionFromReq,
  requireAuth,
  hashPassword,
} = require('../../lib/auth');

const {
  getJsonBody,
  getClientIp,
  methodNotAllowed,
} = require('../../lib/http');

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function getRoute(req) {
  const route = req.query?.route;

  if (Array.isArray(route)) {
    return route.join('/').replace(/^\/+|\/+$/g, '');
  }

  if (typeof route === 'string') {
    return route.replace(/^\/+|\/+$/g, '');
  }

  const pathname = String(req.url || '').split('?')[0];
  return pathname
    .replace(/^\/api\/auth\/?/, '')
    .replace(/^\/+|\/+$/g, '');
}

async function login(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  const ip = getClientIp(req);
  const since = new Date(Date.now() - WINDOW_MS);

  const recentFailures = await prisma.loginAttempt.count({
    where: {
      ip,
      success: false,
      createdAt: { gte: since },
    },
  });

  if (recentFailures >= MAX_ATTEMPTS) {
    res.status(429).json({
      error: 'Too many failed login attempts. Please try again later.',
    });
    return;
  }

  const { email, password } = getJsonBody(req);

  if (!email || !password) {
    res.status(400).json({
      error: 'Email and password are required.',
    });
    return;
  }

  const user = await prisma.adminUser.findUnique({
    where: {
      email: String(email).toLowerCase().trim(),
    },
  });

  const valid = user
    ? await comparePassword(password, user.passwordHash)
    : false;

  await prisma.loginAttempt.create({
    data: {
      ip,
      success: valid,
    },
  });

  if (!valid) {
    res.status(401).json({
      error: 'Invalid email or password.',
    });
    return;
  }

  const token = signSession(user);
  setSessionCookie(res, token);

  res.status(200).json({
    id: user.id,
    email: user.email,
    name: user.name,
  });
}

async function logout(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  clearSessionCookie(res);

  res.status(200).json({
    ok: true,
  });
}

async function me(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  const session = getSessionFromReq(req);

  if (!session) {
    res.status(401).json({
      error: 'Not logged in.',
    });
    return;
  }

  res.status(200).json({
    email: session.email,
    id: session.sub,
  });
}

const changePassword = requireAuth(async (req, res) => {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  const { currentPassword, newPassword } = getJsonBody(req);

  if (!currentPassword || !newPassword) {
    res.status(400).json({
      error: 'Current and new password are required.',
    });
    return;
  }

  if (String(newPassword).length < 8) {
    res.status(400).json({
      error: 'New password must be at least 8 characters.',
    });
    return;
  }

  const user = await prisma.adminUser.findUnique({
    where: {
      id: req.admin.sub,
    },
  });

  if (!user) {
    res.status(404).json({
      error: 'Admin user not found.',
    });
    return;
  }

  const valid = await comparePassword(
    currentPassword,
    user.passwordHash
  );

  if (!valid) {
    res.status(401).json({
      error: 'Current password is incorrect.',
    });
    return;
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.adminUser.update({
    where: {
      id: user.id,
    },
    data: {
      passwordHash,
    },
  });

  res.status(200).json({
    ok: true,
  });
});

module.exports = async (req, res) => {
  const route = getRoute(req);

  switch (route) {
    case 'login':
      return login(req, res);

    case 'logout':
      return logout(req, res);

    case 'me':
      return me(req, res);

    case 'change-password':
      return changePassword(req, res);

    default:
      res.status(404).json({
        error: 'Auth route not found.',
      });
  }
};