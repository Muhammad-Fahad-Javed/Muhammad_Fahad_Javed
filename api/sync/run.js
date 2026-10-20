// POST /api/sync/run   { provider: "github" }
//
// Manual "Sync Now". Authorisation is enforced server-side by requireAuth
// (session + CSRF), not by hiding the button in the dashboard.
const prisma = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const { getJsonBody, getClientIp, methodNotAllowed } = require('../../lib/http');
const { sendError } = require('../../lib/errors');
const { recordAudit } = require('../../lib/audit');
const { syncProvider, assertProvider } = require('../../lib/sync/service');

module.exports = requireAuth(async (req, res) => {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

    const body = getJsonBody(req);
    const provider = assertProvider(body.provider || 'github');

    const result = await syncProvider({ prisma, provider, trigger: 'manual' });

    await recordAudit(prisma, {
      actorEmail: req.admin && req.admin.email,
      action: 'sync',
      resource: `integration:${provider}`,
      resourceId: provider,
      ip: getClientIp(req),
    });

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(result);
  } catch (err) {
    if (err && err.code === 'SYNC_RATE_LIMITED' && err.rateLimitReset) {
      const reset = new Date(err.rateLimitReset);
      if (!Number.isNaN(reset.getTime())) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000))));
      }
    }
    sendError(res, err, 'sync/run');
  }
});
