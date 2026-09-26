const prisma = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const { methodNotAllowed } = require('../../lib/http');
const { COLLECTIONS, SINGLETONS, deserializeRow } = require('../../lib/resources');

module.exports = requireAuth(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const data = { exportedAt: new Date().toISOString(), collections: {}, singletons: {} };

  for (const [key, def] of Object.entries(COLLECTIONS)) {
    const rows = await prisma[def.model].findMany({ orderBy: { order: 'asc' } });
    data.collections[key] = rows.map((r) => deserializeRow(r, def));
  }
  for (const [key, def] of Object.entries(SINGLETONS)) {
    const row = await prisma[def.model].findUnique({ where: { id: 'singleton' } });
    data.singletons[key] = row ? deserializeRow(row, def) : null;
  }

  res.setHeader('Content-Disposition', 'attachment; filename="portfolio-backup.json"');
  res.status(200).json(data);
});
