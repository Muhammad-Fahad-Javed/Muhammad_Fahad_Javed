const prisma = require('../../lib/db');
const { methodNotAllowed } = require('../../lib/http');
const { COLLECTIONS, SINGLETONS, deserializeRow } = require('../../lib/resources');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  try {
    const out = {};

    const collectionEntries = Object.entries(COLLECTIONS);
    const singletonEntries = Object.entries(SINGLETONS);

    const collectionPromises = collectionEntries.map(([, def]) => {
      const where = def.publishField ? { [def.publishField]: true } : {};
      return prisma[def.model].findMany({ where, orderBy: { order: 'asc' } });
    });

    const singletonPromises = singletonEntries.map(([, def]) => {
      return prisma[def.model].findUnique({ where: { id: 'singleton' } });
    });

    const [collectionResults, singletonResults] = await Promise.all([
      Promise.all(collectionPromises),
      Promise.all(singletonPromises),
    ]);

    collectionEntries.forEach(([key, def], i) => {
      const rows = collectionResults[i] || [];
      out[key] = rows.map((r) => deserializeRow(r, def));
    });

    singletonEntries.forEach(([key, def], i) => {
      const row = singletonResults[i];
      out[key] = row ? deserializeRow(row, def) : null;
    });

    // Prevent edge and browser caching so Admin CMS updates appear immediately
    // on public homepage refresh.
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.status(200).json(out);
  } catch (err) {
    console.error('Public content fetch failed:', err);
    res.status(503).json({ error: 'Content temporarily unavailable.' });
  }
};
