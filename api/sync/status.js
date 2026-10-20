// GET /api/sync/status
//
// Read-only view of the integrations: connection state, last run and per-field
// provenance. Tokens are never part of the projection.
const prisma = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const { methodNotAllowed } = require('../../lib/http');
const { sendError } = require('../../lib/errors');
const { getStatus } = require('../../lib/sync/service');

module.exports = requireAuth(async (req, res) => {
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

    const status = await getStatus({ prisma });
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(status);
  } catch (err) {
    sendError(res, err, 'sync/status');
  }
});
