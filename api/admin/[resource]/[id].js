const prisma = require('../../../lib/db');
const { requireAuth } = require('../../../lib/auth');
const { getJsonBody, getClientIp, methodNotAllowed } = require('../../../lib/http');
const {
  getCollection,
  deserializeRow,
  buildWriteData,
  validatePayload,
  applyMetaFields,
} = require('../../../lib/resources');
const { sendError, badRequest, notFound, HttpError } = require('../../../lib/errors');
const { recordAudit } = require('../../../lib/audit');
const { collectRowMediaUrls, deleteManagedFileIfUnreferenced } = require('../../../lib/media');

module.exports = requireAuth(async (req, res) => {
  try {
    const { resource, id } = req.query;
    const def = getCollection(resource);
    if (!def) throw notFound('Unknown resource.', 'UNKNOWN_RESOURCE');
    if (typeof id !== 'string' || !id) throw badRequest('Item id is required.');
    const model = prisma[def.model];

    const existing = await model.findUnique({ where: { id } });
    if (!existing) throw notFound('Item not found.');

    if (req.method === 'GET') {
      res.status(200).json(deserializeRow(existing, def));
      return;
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = getJsonBody(req);

      // Optimistic concurrency control: when the client sends back the
      // updatedAt it loaded, refuse the write if the row changed underneath.
      const expected = body.updatedAt;
      if (expected && existing.updatedAt
        && new Date(expected).getTime() !== new Date(existing.updatedAt).getTime()) {
        throw new HttpError(409, 'This item was changed elsewhere. Reload and try again.', 'CONFLICT');
      }

      const partial = req.method === 'PATCH';
      const errors = validatePayload(body, def, { partial });
      if (errors.length) throw badRequest(errors.join(' '), 'VALIDATION_ERROR');

      const data = buildWriteData(body, def);
      applyMetaFields(body, def, data);

      const updated = await model.update({ where: { id }, data });

      // Only after the write succeeded do we remove uploads that were replaced
      // and are not referenced by any other record.
      const before = collectRowMediaUrls(existing, def);
      const after = collectRowMediaUrls(updated, def);
      for (const url of before) {
        if (!after.has(url)) await deleteManagedFileIfUnreferenced(url, prisma);
      }

      await recordAudit(prisma, {
        actorEmail: req.admin && req.admin.email,
        action: 'update',
        resource,
        resourceId: id,
        ip: getClientIp(req),
      });

      res.status(200).json(deserializeRow(updated, def));
      return;
    }

    if (req.method === 'DELETE') {
      const refs = collectRowMediaUrls(existing, def);
      await model.delete({ where: { id } });
      for (const url of refs) {
        await deleteManagedFileIfUnreferenced(url, prisma);
      }

      await recordAudit(prisma, {
        actorEmail: req.admin && req.admin.email,
        action: 'delete',
        resource,
        resourceId: id,
        ip: getClientIp(req),
      });

      res.status(200).json({ ok: true });
      return;
    }

    methodNotAllowed(res, ['GET', 'PUT', 'PATCH', 'DELETE']);
  } catch (err) {
    sendError(res, err, 'admin/item');
  }
});
