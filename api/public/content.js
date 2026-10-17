const prisma = require('../../lib/db');
const { methodNotAllowed } = require('../../lib/http');
const { COLLECTIONS, SINGLETONS, deserializeRow } = require('../../lib/resources');

// The maximum number of rows of a single collection returned to the public
// site, so a runaway table cannot produce an unbounded response.
const PUBLIC_ROW_LIMIT = 500;

module.exports = async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  try {
    const out = {};

    const collectionEntries = Object.entries(COLLECTIONS);
    const singletonEntries = Object.entries(SINGLETONS);

    const collectionPromises = collectionEntries.map(([, def]) => {
      const where = def.publishField && def.filterByPublish !== false
        ? { [def.publishField]: true }
        : {};
      return prisma[def.model].findMany({
        where,
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        take: PUBLIC_ROW_LIMIT,
      });
    });

    const singletonPromises = singletonEntries.map(([, def]) =>
      prisma[def.model].findUnique({ where: { id: 'singleton' } })
    );

    const [collectionResults, singletonResults] = await Promise.all([
      Promise.all(collectionPromises),
      Promise.all(singletonPromises),
    ]);

    // deserializeRow() applies an allow-list of registry fields, so a newly
    // added (possibly internal) database column is never published by default.
    collectionEntries.forEach(([key, def], i) => {
      const rows = collectionResults[i] || [];
      out[key] = rows.map((row) => deserializeRow(row, def));
    });

    singletonEntries.forEach(([key, def], i) => {
      const row = singletonResults[i];
      out[key] = row ? deserializeRow(row, def) : null;
    });

    // Prevent edge and browser caching so Admin CMS updates appear immediately
    // on public homepage refresh.
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).json(out);
  } catch (err) {
    console.error('Public content fetch failed:', err && err.message);
    res.status(503).json({ error: 'Content temporarily unavailable.' });
  }
};
