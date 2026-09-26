const prisma = require('../../../lib/db');
const { requireAuth } = require('../../../lib/auth');
const { getJsonBody, methodNotAllowed } = require('../../../lib/http');
const { SINGLETONS, deserializeRow, serializePayload, validatePayload, HTML_JSON_FIELDS } = require('../../../lib/resources');
const { sanitizeHtml } = require('../../../lib/sanitize');

function sanitizeHtmlJsonFields(data) {
  for (const name of HTML_JSON_FIELDS) {
    if (data[name] === undefined) continue;
    try {
      const arr = JSON.parse(data[name]);
      if (Array.isArray(arr)) {
        data[name] = JSON.stringify(arr.map((s) => sanitizeHtml(String(s))));
      }
    } catch { /* not JSON, leave as-is */ }
  }
  return data;
}

module.exports = requireAuth(async (req, res) => {
  const { type } = req.query;
  const def = SINGLETONS[type];
  if (!def) {
    res.status(404).json({ error: `Unknown settings type "${type}".` });
    return;
  }
  const model = prisma[def.model];

  if (req.method === 'GET') {
    const row = await model.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton' },
    });
    res.status(200).json(deserializeRow(row, def));
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const body = getJsonBody(req);
    if (req.method === 'PUT') {
      const errors = validatePayload(body, def);
      if (errors.length) {
        res.status(400).json({ error: errors.join(' ') });
        return;
      }
    }
    const data = serializePayload(body, def);
    sanitizeHtmlJsonFields(data);
    const updated = await model.upsert({
      where: { id: 'singleton' },
      update: data,
      create: { id: 'singleton', ...data },
    });
    res.status(200).json(deserializeRow(updated, def));
    return;
  }

  methodNotAllowed(res, ['GET', 'PUT', 'PATCH']);
});
