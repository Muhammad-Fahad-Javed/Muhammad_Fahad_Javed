// ============================================================================
// Database-backed rate limiting.
//
// A single shared store (the database) keeps the limit effective across
// serverless instances. Counting is done against BOTH the client IP and the
// submitted account identifier, so rotating an IP (or spoofing a forwarding
// header) does not fully bypass the control.
// ============================================================================
'use strict';

const prisma = require('./db');

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_IDENTITY = 10;

async function recordAttempt({ ip, identifier, success }) {
  try {
    await prisma.loginAttempt.create({
      data: {
        ip: ip || 'unknown',
        identifier: identifier || '',
        success: !!success,
      },
    });
  } catch {
    // Logging must never break authentication.
  }
}

async function countRecentFailures({ ip, identifier, windowMs = WINDOW_MS }) {
  const since = new Date(Date.now() - windowMs);
  const or = [];
  if (ip && ip !== 'unknown') or.push({ ip });
  if (identifier) or.push({ identifier });
  if (!or.length) return 0;

  try {
    return await prisma.loginAttempt.count({
      where: { success: false, createdAt: { gte: since }, OR: or },
    });
  } catch {
    return 0;
  }
}

async function isRateLimited({ ip, identifier, max = MAX_FAILURES_PER_IDENTITY, windowMs = WINDOW_MS }) {
  const failures = await countRecentFailures({ ip, identifier, windowMs });
  return failures >= max;
}

// Housekeeping: keeps the LoginAttempt table bounded. Safe to call any time.
async function pruneLoginAttempts({ olderThanMs = 7 * 24 * 60 * 60 * 1000 } = {}) {
  const cutoff = new Date(Date.now() - olderThanMs);
  try {
    const result = await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return result.count || 0;
  } catch {
    return 0;
  }
}

module.exports = {
  recordAttempt,
  countRecentFailures,
  isRateLimited,
  pruneLoginAttempts,
  WINDOW_MS,
  MAX_FAILURES_PER_IDENTITY,
};
