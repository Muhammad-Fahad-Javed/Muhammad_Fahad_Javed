const prisma = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const { methodNotAllowed } = require('../../lib/http');
const { COLLECTIONS } = require('../../lib/resources');

module.exports = requireAuth(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const entries = Object.entries(COLLECTIONS);
  const results = await Promise.all(
    entries.map(async ([key, def]) => {
      const model = prisma[def.model];
      const total = await model.count();
      let published = total;
      let draft = 0;
      if (def.publishField) {
        published = await model.count({ where: { [def.publishField]: true } });
        draft = total - published;
      }
      return [key, { label: def.label, total, published, draft }];
    })
  );

  const stats = Object.fromEntries(results);
  const mediaCount = await prisma.media.count();

  res.status(200).json({ resources: stats, mediaCount });
});
