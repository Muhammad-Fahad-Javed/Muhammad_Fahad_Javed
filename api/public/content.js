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

    // Cache at the edge for a minute so normal traffic doesn't hit the DB on
    // every single page view, while admin edits still show up quickly.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    res.status(200).json(out);
  } catch (err) {
    console.error('Public content fetch failed:', err);
    // Frontend treats a non-200 as "keep the static fallback content".
    res.status(503).json({ error: 'Content temporarily unavailable.' });
  }
};
