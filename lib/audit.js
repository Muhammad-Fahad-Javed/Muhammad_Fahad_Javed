// ============================================================================
// Administrator audit trail.
//
// Records WHO changed WHAT and WHEN. Payload bodies are never stored — only a
// short, non-sensitive description — so secrets, password hashes and rich
// content are not duplicated into the log.
// ============================================================================
'use strict';

const MAX_META_LENGTH = 1000;

async function recordAudit(prisma, entry) {
  const e = entry || {};
  let meta = null;
  if (e.meta !== undefined && e.meta !== null) {
    try {
      meta = JSON.stringify(e.meta).slice(0, MAX_META_LENGTH);
    } catch {
      meta = null;
    }
  }

  try {
    await prisma.auditLog.create({
      data: {
        actorEmail: String(e.actorEmail || '').slice(0, 320),
        action: String(e.action || 'unknown').slice(0, 64),
        resource: String(e.resource || '').slice(0, 64),
        resourceId: String(e.resourceId || '').slice(0, 64),
        ip: String(e.ip || '').slice(0, 64),
        meta,
      },
    });
  } catch (err) {
    // Auditing must never break the operation it is describing.
    console.error('[audit] failed to record entry:', err && err.message);
  }
}

module.exports = { recordAudit, MAX_META_LENGTH };
