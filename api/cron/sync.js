// GET /api/cron/sync
//
// Scheduled synchronisation entry point. Vercel Cron calls this with
// `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is configured.
//
// Fail-closed: without CRON_SECRET this route refuses to run at all, so a
// misconfigured deployment can never expose an unauthenticated sync trigger.
const crypto = require('crypto');

const prisma = require('../../lib/db');
const { sendError } = require('../../lib/errors');
const { syncProvider } = require('../../lib/sync/service');
const { recordAudit } = require('../../lib/audit');

const MIN_SECRET_LENGTH = 16;

function safeEqual(a, b) {
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function readSecret() {
  const raw = process.env.CRON_SECRET;
  return typeof raw === 'string' ? raw.trim() : '';
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const secret = readSecret();
    if (secret.length < MIN_SECRET_LENGTH) {
      res.status(503).json({ error: 'Scheduled sync is not configured.' });
      return;
    }

    const header = String(req.headers.authorization || '');
    const expected = 'Bearer ' + secret;
    if (!safeEqual(header, expected)) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    // Only providers that are actually connected are attempted.
    const integrations = await prisma.integration.findMany({ where: { status: 'connected' } });
    const attempted = [];

    for (const integration of integrations) {
      try {
        const result = await syncProvider({
          prisma,
          provider: integration.provider,
          trigger: 'cron',
        });
        attempted.push({
          provider: integration.provider,
          status: 'success',
          changed: result.changed,
          skipped: result.skipped,
        });
      } catch (err) {
        // One failing provider must not abort the others.
        attempted.push({
          provider: integration.provider,
          status: 'error',
          error: err && err.code ? err.code : 'SYNC_FAILED',
        });
      }
    }

    await recordAudit(prisma, {
      actorEmail: 'system:cron',
      action: 'sync',
      resource: 'integration:cron',
      resourceId: 'cron',
      ip: 'cron',
    });

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ providers: attempted, ranAt: new Date().toISOString() });
  } catch (err) {
    sendError(res, err, 'cron/sync');
  }
};
