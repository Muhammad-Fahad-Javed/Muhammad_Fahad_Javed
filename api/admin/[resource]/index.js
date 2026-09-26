const prisma = require('../../../lib/db');
const { requireAuth } = require('../../../lib/auth');
const { getJsonBody, methodNotAllowed } = require('../../../lib/http');
const { COLLECTIONS, deserializeRow, serializePayload, validatePayload } = require('../../../lib/resources');
const { sanitizeHtml } = require('../../../lib/sanitize');

module.exports = requireAuth(async (req, res) => {
  const { resource } = req.query;
  const def = COLLECTIONS[resource];
  if (!def) {
    res.status(404).json({ error: `Unknown resource "${resource}".` });
    return;
  }
  const model = prisma[def.model];

  if (req.method === 'GET') {
    const rows = await model.findMany({ orderBy: { order: 'asc' } });
    res.status(200).json(rows.map((row) => deserializeRow(row, def)));
    return;
  }

  if (req.method === 'POST') {
    const body = getJsonBody(req);
    const errors = validatePayload(body, def);
    if (errors.length) {
      res.status(400).json({ error: errors.join(' ') });
      return;
    }

    const data = serializePayload(body, def);
    for (const field of def.fields) {
      if (field.type === 'richtext' && data[field.name]) {
        data[field.name] = sanitizeHtml(data[field.name]);
      }
    }

    if (def.publishField && !(def.publishField in data)) {
      data[def.publishField] = body[def.publishField] !== undefined ? !!body[def.publishField] : true;
    }
    if (def.featuredField && !(def.featuredField in data)) {
      data[def.featuredField] = !!body[def.featuredField];
    }

    // New items go to the end of the current order.
    const count = await model.count();
    data.order = count;

    const created = await model.create({ data });
    res.status(201).json(deserializeRow(created, def));
    return;
  }

  methodNotAllowed(res, ['GET', 'POST']);
});
