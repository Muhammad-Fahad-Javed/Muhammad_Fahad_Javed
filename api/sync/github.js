// POST   /api/sync/github   { token }  -> connect and verify
// DELETE /api/sync/github             -> disconnect and wipe the credential
//
// The token is verified against GitHub before it is stored, sealed with
// AES-256-GCM, and never echoed back in the response.
const prisma = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const { getJsonBody, getClientIp, methodNotAllowed } = require('../../lib/http');
const { sendError, badRequest } = require('../../lib/errors');
const { recordAudit } = require('../../lib/audit');
const { connectGithub, disconnectProvider } = require('../../lib/sync/service');

module.exports = requireAuth(async (req, res) => {
  try {
    if (req.method === 'POST') {
      const body = getJsonBody(req);
      const token = typeof body.token === 'string' ? body.token : '';
      if (!token.trim()) throw badRequest('A GitHub token is required.', 'TOKEN_REQUIRED');

      const integration = await connectGithub({ prisma, token });

      await recordAudit(prisma, {
        actorEmail: req.admin && req.admin.email,
        action: 'connect',
        resource: 'integration:github',
        resourceId: integration.accountLabel || 'github',
        ip: getClientIp(req),
      });

      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json(integration);
      return;
    }

    if (req.method === 'DELETE') {
      const integration = await disconnectProvider({ prisma, provider: 'github' });

      await recordAudit(prisma, {
        actorEmail: req.admin && req.admin.email,
        action: 'disconnect',
        resource: 'integration:github',
        resourceId: 'github',
        ip: getClientIp(req),
      });

      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json(integration);
      return;
    }

    methodNotAllowed(res, ['POST', 'DELETE']);
  } catch (err) {
    sendError(res, err, 'sync/github');
  }
});
