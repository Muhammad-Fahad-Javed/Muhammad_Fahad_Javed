const prisma = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const { getJsonBody, methodNotAllowed } = require('../../lib/http');
const { COLLECTIONS } = require('../../lib/resources');

module.exports = requireAuth(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  const { resource, orderedIds } = getJsonBody(req);
  const def = COLLECTIONS[resource];
  if (!def) {
    res.status(404).json({ error: `Unknown resource "${resource}".` });
    return;
  }
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    res.status(400).json({ error: '"orderedIds" must be a non-empty array.' });
    return;
  }

  const model = prisma[def.model];
  await prisma.$transaction(
    orderedIds.map((id, index) => model.update({ where: { id }, data: { order: index } }))
  );

  res.status(200).json({ ok: true });
});
