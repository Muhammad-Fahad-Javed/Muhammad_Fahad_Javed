const prisma = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const { getJsonBody, methodNotAllowed } = require('../../lib/http');
const { COLLECTIONS, SINGLETONS, serializePayload } = require('../../lib/resources');

// Import is additive/upsert-only by design (section 29 of the brief:
// "do not make destructive changes to existing data"). Rows whose id is
// already in the database are updated in place; rows with an id that does
// not exist yet, or with no id, are inserted as new records. Nothing is
// ever deleted by an import.
module.exports = requireAuth(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  const backup = getJsonBody(req);
  if (!backup || typeof backup !== 'object') {
    res.status(400).json({ error: 'Invalid backup file.' });
    return;
  }

  const summary = { collections: {}, singletons: {} };

  for (const [key, def] of Object.entries(COLLECTIONS)) {
    const rows = Array.isArray(backup.collections?.[key]) ? backup.collections[key] : [];
    let created = 0;
    let updated = 0;
    for (const row of rows) {
      const data = serializePayload(row, def);
      if (def.publishField && row[def.publishField] !== undefined) data[def.publishField] = !!row[def.publishField];
      if (def.featuredField && row[def.featuredField] !== undefined) data[def.featuredField] = !!row[def.featuredField];
      if (typeof row.order === 'number') data.order = row.order;

      if (row.id) {
        const existing = await prisma[def.model].findUnique({ where: { id: row.id } });
        if (existing) {
          await prisma[def.model].update({ where: { id: row.id }, data });
          updated += 1;
          continue;
        }
      }
      await prisma[def.model].create({ data });
      created += 1;
    }
    summary.collections[key] = { created, updated };
  }

  for (const [key, def] of Object.entries(SINGLETONS)) {
    const row = backup.singletons?.[key];
    if (!row) continue;
    const data = serializePayload(row, def);
    await prisma[def.model].upsert({
      where: { id: 'singleton' },
      update: data,
      create: { id: 'singleton', ...data },
    });
    summary.singletons[key] = 'updated';
  }

  res.status(200).json({ ok: true, summary });
});
