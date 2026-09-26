const prisma = require('../../../lib/db');
const { requireAuth } = require('../../../lib/auth');
const { getJsonBody, methodNotAllowed } = require('../../../lib/http');
const { COLLECTIONS, deserializeRow, serializePayload, validatePayload } = require('../../../lib/resources');
const { sanitizeHtml } = require('../../../lib/sanitize');
const { deleteFile } = require('../../../lib/storage');

module.exports = requireAuth(async (req, res) => {
  const { resource, id } = req.query;
  const def = COLLECTIONS[resource];
  if (!def) {
    res.status(404).json({ error: `Unknown resource "${resource}".` });
    return;
  }
  const model = prisma[def.model];

  const existing = await model.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Item not found.' });
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json(deserializeRow(existing, def));
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const body = getJsonBody(req);

    // Partial updates (e.g. just toggling "visible") skip full validation
    // of required fields that weren't sent.
    const isPartial = req.method === 'PATCH';
    if (!isPartial) {
      const errors = validatePayload(body, def);
      if (errors.length) {
        res.status(400).json({ error: errors.join(' ') });
        return;
      }
    }

    const data = serializePayload(body, def);
    for (const field of def.fields) {
      if (field.type === 'richtext' && data[field.name] !== undefined) {
        data[field.name] = sanitizeHtml(data[field.name]);
      }
    }
    if (def.publishField && def.publishField in body) data[def.publishField] = !!body[def.publishField];
    if (def.featuredField && def.featuredField in body) data[def.featuredField] = !!body[def.featuredField];
    if (typeof body.order === 'number') data.order = body.order;

    const updated = await model.update({ where: { id }, data });
    res.status(200).json(deserializeRow(updated, def));
    return;
  }

  if (req.method === 'DELETE') {
    // Best-effort cleanup of any uploaded image/file fields on this item.
    const imageFields = def.fields.filter((f) => f.type === 'image').map((f) => f.name);
    for (const fieldName of imageFields) {
      const value = existing[fieldName];
      if (value && value.startsWith('/uploads/')) {
        await deleteFile(value).catch(() => {});
      }
    }
    await model.delete({ where: { id } });
    res.status(200).json({ ok: true });
    return;
  }

  methodNotAllowed(res, ['GET', 'PUT', 'PATCH', 'DELETE']);
});
