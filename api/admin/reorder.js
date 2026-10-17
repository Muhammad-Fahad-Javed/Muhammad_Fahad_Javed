const prisma = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const { getJsonBody, getClientIp, methodNotAllowed } = require('../../lib/http');
const { getCollection } = require('../../lib/resources');
const { sendError, badRequest, notFound } = require('../../lib/errors');
const { recordAudit } = require('../../lib/audit');

module.exports = requireAuth(async (req, res) => {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

    const { resource, orderedIds } = getJsonBody(req);
    const def = getCollection(resource);
    if (!def) throw notFound('Unknown resource.', 'UNKNOWN_RESOURCE');

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      throw badRequest('"orderedIds" must be a non-empty array.');
    }
    if (orderedIds.some((id) => typeof id !== 'string' || !id)) {
      throw badRequest('"orderedIds" must contain only non-empty string ids.');
    }
    if (new Set(orderedIds).size !== orderedIds.length) {
      throw badRequest('"orderedIds" must not contain duplicates.');
    }

    const model = prisma[def.model];
    const existing = await model.findMany({ select: { id: true } });
    const known = new Set(existing.map((row) => row.id));
    for (const id of orderedIds) {
      if (!known.has(id)) throw badRequest('"orderedIds" contains an id that is not part of this resource.');
    }

    // Two-phase update inside a single transaction. Every affected row is
    // first pushed into a temporary negative range, so no intermediate state
    // can create a duplicate/colliding order value, then the final positions
    // are assigned. Concurrent reorders serialise on the transaction.
    await prisma.$transaction(
      async (tx) => {
        await tx[def.model].updateMany({
          where: { id: { in: orderedIds } },
          data: { order: { decrement: 1000000 } },
        });
        for (let i = 0; i < orderedIds.length; i += 1) {
          await tx[def.model].update({ where: { id: orderedIds[i] }, data: { order: i } });
        }
      },
      { timeout: 30000 }
    );

    await recordAudit(prisma, {
      actorEmail: req.admin && req.admin.email,
      action: 'reorder',
      resource,
      ip: getClientIp(req),
      meta: { count: orderedIds.length },
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    sendError(res, err, 'admin/reorder');
  }
});
