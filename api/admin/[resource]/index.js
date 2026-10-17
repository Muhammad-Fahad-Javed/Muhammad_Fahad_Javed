const prisma = require('../../../lib/db');
const { requireAuth } = require('../../../lib/auth');
const { getJsonBody, getClientIp, methodNotAllowed, parsePagination } = require('../../../lib/http');
const {
  getCollection,
  deserializeRow,
  buildWriteData,
  validatePayload,
  applyMetaFields,
} = require('../../../lib/resources');
const { sendError, badRequest, notFound } = require('../../../lib/errors');
const { recordAudit } = require('../../../lib/audit');

module.exports = requireAuth(async (req, res) => {
  try {
    const { resource } = req.query;
    // Prototype-safe lookup: "__proto__" / "constructor" must never resolve.
    const def = getCollection(resource);
    if (!def) throw notFound('Unknown resource.', 'UNKNOWN_RESOURCE');
    const model = prisma[def.model];

    if (req.method === 'GET') {
      const { take, skip } = parsePagination(req.query, { defaultLimit: 200, maxLimit: 500 });
      const rows = await model.findMany({
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        take,
        skip,
      });
      res.status(200).json(rows.map((row) => deserializeRow(row, def)));
      return;
    }

    if (req.method === 'POST') {
      const body = getJsonBody(req);
      const errors = validatePayload(body, def);
      if (errors.length) throw badRequest(errors.join(' '), 'VALIDATION_ERROR');

      const data = buildWriteData(body, def);
      applyMetaFields(body, def, data);
      if (def.publishField && !(def.publishField in data)) data[def.publishField] = true;
      if (def.featuredField && !(def.featuredField in data)) data[def.featuredField] = false;

      // Append with max(order)+1 rather than count(). Deleting a middle item
      // then adding a new one can no longer produce duplicate order values.
      const last = await model.findFirst({ orderBy: { order: 'desc' }, select: { order: true } });
      data.order = last && Number.isFinite(last.order) ? last.order + 1 : 0;

      const created = await model.create({ data });
      await recordAudit(prisma, {
        actorEmail: req.admin && req.admin.email,
        action: 'create',
        resource,
        resourceId: created.id,
        ip: getClientIp(req),
      });

      res.status(201).json(deserializeRow(created, def));
      return;
    }

    methodNotAllowed(res, ['GET', 'POST']);
  } catch (err) {
    sendError(res, err, 'admin/collection');
  }
});
