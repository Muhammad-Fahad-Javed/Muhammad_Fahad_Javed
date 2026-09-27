const prisma = require('../../lib/db');
const { methodNotAllowed } = require('../../lib/http');
const { COLLECTIONS, SINGLETONS, deserializeRow } = require('../../lib/resources');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  try {
    const out = {};

    for (const [key, def] of Object.entries(COLLECTIONS)) {
      const where = def.publishField ? { [def.publishField]: true } : {};
      const rows = await prisma[def.model].findMany({ where, orderBy: { order: 'asc' } });
      out[key] = rows.map((r) => deserializeRow(r, def));
    }

    for (const [key, def] of Object.entries(SINGLETONS)) {
      const row = await prisma[def.model].findUnique({ where: { id: 'singleton' } });
      out[key] = row ? deserializeRow(row, def) : null;
    }

    // Prevent edge and browser caching so Admin CMS updates appear immediately
    // on public homepage refresh.
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.status(200).json(out);
  } catch (err) {
    console.error('Public content fetch failed:', err);
    // Frontend treats a non-200 as "keep the static fallback content".
    res.status(503).json({ error: 'Content temporarily unavailable.' });
  }
};
