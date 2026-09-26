const prisma = require('../../lib/db');
const { comparePassword, signSession, setSessionCookie } = require('../../lib/auth');
const { getJsonBody, getClientIp, methodNotAllowed } = require('../../lib/http');

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  const ip = getClientIp(req);
  const since = new Date(Date.now() - WINDOW_MS);

  const recentFailures = await prisma.loginAttempt.count({
    where: { ip, success: false, createdAt: { gte: since } },
  });

  if (recentFailures >= MAX_ATTEMPTS) {
    res.status(429).json({ error: 'Too many failed login attempts. Please try again later.' });
    return;
  }

  const { email, password } = getJsonBody(req);
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const user = await prisma.adminUser.findUnique({ where: { email: String(email).toLowerCase().trim() } });
  const valid = user ? await comparePassword(password, user.passwordHash) : false;

  await prisma.loginAttempt.create({ data: { ip, success: valid } });

  if (!valid) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const token = signSession(user);
  setSessionCookie(res, token);
  res.status(200).json({ id: user.id, email: user.email, name: user.name });
};
