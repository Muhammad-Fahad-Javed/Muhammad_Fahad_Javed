const prisma = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const { getJsonBody, assertBodySize, getClientIp, methodNotAllowed } = require('../../lib/http');
const {
  COLLECTIONS,
  SINGLETONS,
  buildWriteData,
  validatePayload,
  applyMetaFields,
} = require('../../lib/resources');
const { sendError, badRequest } = require('../../lib/errors');
const { recordAudit } = require('../../lib/audit');

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

// Import is additive/upsert-only by design: rows whose id already exists are
// updated in place, everything else is inserted. Nothing is ever deleted.
//
// Hardening:
//  * every record is validated BEFORE any write happens;
//  * HTML/URL fields go through the same sanitisation as normal writes;
//  * administrator credentials, sessions and other internal columns are not
//    part of any registry definition, so they can never be imported;
//  * the whole import runs in one transaction, so a failure cannot leave a
//    partially imported database.
module.exports = requireAuth(async (req, res) => {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
    assertBodySize(req);

    const backup = getJsonBody(req);
    if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
      throw badRequest('Invalid backup file.');
    }

    const errors = [];
    const collectionOps = [];
    const singletonOps = [];

    for (const [key, def] of Object.entries(COLLECTIONS)) {
      const source = backup.collections && backup.collections[key];
      const rows = Array.isArray(source) ? source : [];
      const seenIds = new Set();

      rows.forEach((row, index) => {
        const where = `collections.${key}[${index}]`;
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
          errors.push(`${where} is not an object.`);
          return;
        }
        // Ids are later rendered into admin URLs/attributes and used as DB
        // keys, so an imported file must not be able to smuggle markup or
        // oversized values through them.
        if (row.id !== undefined && (typeof row.id !== 'string' || !SAFE_ID.test(row.id))) {
          errors.push(`${where}.id must be 1-64 characters of letters, digits, "_" or "-".`);
          return;
        }
        if (row.id && seenIds.has(row.id)) {
          errors.push(`${where}.id is duplicated.`);
          return;
        }
        const rowErrors = validatePayload(row, def, { partial: true });
        if (rowErrors.length) {
          errors.push(`${where}: ${rowErrors.join(' ')}`);
          return;
        }
        if (row.id) seenIds.add(row.id);

        const data = buildWriteData(row, def);
        applyMetaFields(row, def, data);
        collectionOps.push({ resource: key, model: def.model, id: row.id, data });
      });
    }

    for (const [key, def] of Object.entries(SINGLETONS)) {
      const row = backup.singletons && backup.singletons[key];
      if (!row) continue;
      if (typeof row !== 'object' || Array.isArray(row)) {
        errors.push(`singletons.${key} is not an object.`);
        continue;
      }
      const rowErrors = validatePayload(row, def, { partial: true });
      if (rowErrors.length) {
        errors.push(`singletons.${key}: ${rowErrors.join(' ')}`);
        continue;
      }
      singletonOps.push({ key, model: def.model, data: buildWriteData(row, def) });
    }

    if (errors.length) {
      const preview = errors.slice(0, 10).join(' | ');
      throw badRequest(
        `Import rejected: ${errors.length} problem${errors.length === 1 ? '' : 's'} found. ${preview}`,
        'IMPORT_VALIDATION'
      );
    }

    const summary = { collections: {}, singletons: {} };

    await prisma.$transaction(
      async (tx) => {
        for (const op of collectionOps) {
          const bucket = summary.collections[op.resource]
            || (summary.collections[op.resource] = { created: 0, updated: 0 });

          if (op.id) {
            const existing = await tx[op.model].findUnique({ where: { id: op.id } });
            if (existing) {
              await tx[op.model].update({ where: { id: op.id }, data: op.data });
              bucket.updated += 1;
              continue;
            }
            await tx[op.model].create({ data: { id: op.id, ...op.data } });
            bucket.created += 1;
            continue;
          }
          await tx[op.model].create({ data: op.data });
          bucket.created += 1;
        }

        for (const op of singletonOps) {
          await tx[op.model].upsert({
            where: { id: 'singleton' },
            update: op.data,
            create: { id: 'singleton', ...op.data },
          });
          summary.singletons[op.key] = 'updated';
        }
      },
      { timeout: 60000, maxWait: 15000 }
    );

    await recordAudit(prisma, {
      actorEmail: req.admin && req.admin.email,
      action: 'import',
      resource: 'backup',
      ip: getClientIp(req),
      meta: { collections: Object.keys(summary.collections).length, singletons: Object.keys(summary.singletons).length },
    });

    res.status(200).json({ ok: true, summary });
  } catch (err) {
    sendError(res, err, 'admin/import');
  }
});
