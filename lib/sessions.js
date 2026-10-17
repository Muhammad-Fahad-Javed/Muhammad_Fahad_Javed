// ============================================================================
// Revocable sessions.
//
// Sessions are database rows, not just self-contained JWTs. The token carries
// the session id (`sid`) and the user's session version (`sv`); every
// authenticated request checks that the row still exists, has not expired, and
// that the user's version still matches. This makes logout and password
// changes actually revoke access instead of merely clearing a cookie.
// ============================================================================
'use strict';

const jwt = require('jsonwebtoken');
const prisma = require('./db');
const { getJwtSecret } = require('./config');

const SESSION_DAYS = 7;
const SESSION_TTL_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

function signToken(payload) {
  // Throws a config error (fail-closed) in production when JWT_SECRET is weak.
  return jwt.sign(payload, getJwtSecret(), { expiresIn: `${SESSION_DAYS}d` });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    return null;
  }
}

async function createSession(user) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  // Generate the id and sign the token BEFORE writing anything, so a
  // misconfigured secret fails closed without leaving a dangling session row.
  const id = crypto.randomUUID();
  const token = signToken({
    sub: user.id,
    sid: id,
    sv: typeof user.sessionVersion === 'number' ? user.sessionVersion : 1,
  });
  const session = await prisma.session.create({
    data: { id, userId: user.id, expiresAt },
  });
  return { token, session };
}

// Returns { user, session } for a valid, non-revoked token, otherwise null.
async function resolveSession(token) {
  const payload = verifyToken(token);
  if (!payload || !payload.sid || !payload.sub) return null;

  const session = await prisma.session.findUnique({ where: { id: payload.sid } });
  if (!session) return null;
  if (session.userId !== payload.sub) return null;
  if (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) return null;

  const user = await prisma.adminUser.findUnique({ where: { id: payload.sub } });
  if (!user) return null;

  const currentVersion = typeof user.sessionVersion === 'number' ? user.sessionVersion : 1;
  const tokenVersion = typeof payload.sv === 'number' ? payload.sv : 1;
  if (currentVersion !== tokenVersion) return null;

  return { user, session };
}

async function revokeSession(sessionId) {
  if (!sessionId) return;
  try {
    await prisma.session.delete({ where: { id: sessionId } });
  } catch {
    /* already gone */
  }
}

// Revokes every session for a user and bumps the version so any token that
// somehow survives (e.g. a race) is rejected on its next use.
async function revokeAllSessions(userId) {
  try {
    await prisma.session.deleteMany({ where: { userId } });
  } catch {
    /* ignore */
  }
  try {
    await prisma.adminUser.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
    });
  } catch {
    /* ignore */
  }
}

async function pruneExpiredSessions() {
  try {
    const result = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return result.count || 0;
  } catch {
    return 0;
  }
}

module.exports = {
  createSession,
  resolveSession,
  revokeSession,
  revokeAllSessions,
  pruneExpiredSessions,
  verifyToken,
  signToken,
  SESSION_DAYS,
  SESSION_TTL_MS,
};
