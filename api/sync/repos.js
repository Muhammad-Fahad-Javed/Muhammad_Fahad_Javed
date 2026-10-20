// GET /api/sync/repos
//
// Lists the account's public repositories so the dashboard can build the
// featured-projects allowlist. Private repositories are filtered out by the
// provider before they ever reach this response.
const prisma = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const { methodNotAllowed } = require('../../lib/http');
const { sendError } = require('../../lib/errors');
const { listGithubRepos } = require('../../lib/sync/service');

module.exports = requireAuth(async (req, res) => {
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

    const data = await listGithubRepos({ prisma });
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(data);
  } catch (err) {
    sendError(res, err, 'sync/repos');
  }
});
