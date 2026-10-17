const prisma = require('../../../lib/db');
const { requireAuth } = require('../../../lib/auth');
const { getJsonBody, getClientIp, methodNotAllowed } = require('../../../lib/http');
const {
  getSingleton,
  deserializeRow,
  deserializeSingleton,
  buildWriteData,
  validatePayload,
} = require('../../../lib/resources');
const { sendError, badRequest, notFound } = require('../../../lib/errors');
const { recordAudit } = require('../../../lib/audit');
const { collectRowMediaUrls, deleteManagedFileIfUnreferenced } = require('../../../lib/media');

module.exports = requireAuth(async (req, res) => {
  try {
    const { type } = req.query;
    const def = getSingleton(type);
    if (!def) throw notFound('Unknown settings type.', 'UNKNOWN_SETTINGS_TYPE');
    const model = prisma[def.model];

    if (req.method === 'GET') {
      // Side-effect free: a missing singleton is returned as validated
      // defaults instead of being created here (a GET must not write).
      const row = await model.findUnique({ where: { id: 'singleton' } });
      res.status(200).json(deserializeSingleton(row, def));
      return;
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = getJsonBody(req);
      const partial = req.method === 'PATCH';
      const errors = validatePayload(body, def, { partial });
      if (errors.length) throw badRequest(errors.join(' '), 'VALIDATION_ERROR');

      const data = buildWriteData(body, def);
      const beforeRow = await model.findUnique({ where: { id: 'singleton' } });

      const updated = await model.upsert({
        where: { id: 'singleton' },
        update: data,
        create: { id: 'singleton', ...data },
      });

      const before = collectRowMediaUrls(beforeRow, def);
      const after = collectRowMediaUrls(updated, def);
      for (const url of before) {
        if (!after.has(url)) await deleteManagedFileIfUnreferenced(url, prisma);
      }

      await recordAudit(prisma, {
        actorEmail: req.admin && req.admin.email,
        action: 'update',
        resource: `singleton:${type}`,
        resourceId: 'singleton',
        ip: getClientIp(req),
      });

      res.status(200).json(deserializeRow(updated, def));
      return;
    }

    methodNotAllowed(res, ['GET', 'PUT', 'PATCH']);
  } catch (err) {
    sendError(res, err, 'admin/singleton');
  }
});
