const prisma = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const { methodNotAllowed } = require('../../lib/http');
const { COLLECTIONS, SINGLETONS, deserializeRow } = require('../../lib/resources');
const { sendError } = require('../../lib/errors');

module.exports = requireAuth(async (req, res) => {
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

    const data = { exportedAt: new Date().toISOString(), collections: {}, singletons: {} };

    // deserializeRow() applies an allow-list, so password hashes, secrets and
    // any future internal column can never end up in a backup file.
    for (const [key, def] of Object.entries(COLLECTIONS)) {
      const rows = await prisma[def.model].findMany({
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        take: 2000,
      });
      data.collections[key] = rows.map((row) => deserializeRow(row, def));
    }

    for (const [key, def] of Object.entries(SINGLETONS)) {
      const row = await prisma[def.model].findUnique({ where: { id: 'singleton' } });
      data.singletons[key] = row ? deserializeRow(row, def) : null;
    }

    res.setHeader('Content-Disposition', 'attachment; filename="portfolio-backup.json"');
    res.status(200).json(data);
  } catch (err) {
    sendError(res, err, 'admin/export');
  }
});
