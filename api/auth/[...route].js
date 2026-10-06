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

  let recentFailures = 0;
  try {
    recentFailures = await prisma.loginAttempt.count({
      where: {
        ip,
        success: false,
        createdAt: { gte: since },
      },
    });
  } catch (e) { /* ignore attempt logging error if table missing */ }

  if (recentFailures >= MAX_ATTEMPTS) {
    res.status(429).json({
      error: 'Too many failed login attempts. Please try again later.',
    });
    return;
  }

  const { email, password } = getJsonBody(req);

  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password.trim()) {
    res.status(400).json({
      error: 'Email and password are required.',
    });
    return;
  }

  const cleanEmail = email.toLowerCase().trim();
  const cleanPassword = password.trim();

  let user = await prisma.adminUser.findUnique({
    where: {
      email: cleanEmail,
    },
  });

  // If no admin user exists in the database at all, automatically initialize the first admin account
  if (!user) {
    const totalAdmins = await prisma.adminUser.count().catch(() => 0);
    if (totalAdmins === 0) {
      if (cleanPassword.length < 8) {
        res.status(400).json({
          error: 'Initial admin password must be at least 8 characters.',
        });
        return;
      }
      try {
        const passwordHash = await hashPassword(cleanPassword);
        user = await prisma.adminUser.create({
          data: {
            email: cleanEmail,
            passwordHash,
            name: 'Admin',
          },
        });
      } catch (e) {
        console.error('Failed to create initial admin user:', e);
      }
    } else if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      if (cleanEmail === process.env.ADMIN_EMAIL.toLowerCase().trim() && cleanPassword === process.env.ADMIN_PASSWORD) {
        try {
          const passwordHash = await hashPassword(process.env.ADMIN_PASSWORD);
          user = await prisma.adminUser.upsert({
            where: { email: cleanEmail },
            update: { passwordHash },
            create: { email: cleanEmail, passwordHash, name: 'Admin' },
          });
        } catch (e) { /* ignore fallback creation error */ }
      }
    }
  }

  const valid = user
    ? await comparePassword(cleanPassword, user.passwordHash)
    : false;

  try {
    await prisma.loginAttempt.create({
      data: {
        ip,
        success: valid,
      },
    });
  } catch (e) { /* ignore attempt logging error if table missing */ }

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

      default:
        res.status(404).json({
          error: 'Auth route not found.',
        });
    }
  } catch (err) {
    console.error('Auth API handler error:', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
};