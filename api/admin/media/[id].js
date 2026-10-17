const prisma = require('../../../lib/db');
const { requireAuth } = require('../../../lib/auth');
const { getClientIp, methodNotAllowed } = require('../../../lib/http');
const { sendError, badRequest, notFound } = require('../../../lib/errors');
const { recordAudit } = require('../../../lib/audit');
const { deleteManagedFileIfUnreferenced } = require('../../../lib/media');

module.exports = requireAuth(async (req, res) => {
  try {
    if (req.method !== 'DELETE') return methodNotAllowed(res, ['DELETE']);

    const { id } = req.query;
    if (typeof id !== 'string' || !id) throw badRequest('Media id is required.');

    const media = await prisma.media.findUnique({ where: { id } });
    if (!media) throw notFound('Media not found.');

    // Remove the library row first, then the file only if no content row still
    // references it (gallery images are frequently shared).
    await prisma.media.delete({ where: { id } });
    const result = await deleteManagedFileIfUnreferenced(media.url, prisma);

    await recordAudit(prisma, {
      actorEmail: req.admin && req.admin.email,
      action: 'delete',
      resource: 'media',
      resourceId: id,
      ip: getClientIp(req),
      meta: { fileDeleted: !!result.deleted, reason: result.reason || null },
    });

    res.status(200).json({ ok: true, fileDeleted: !!result.deleted, reason: result.reason || null });
  } catch (err) {
    sendError(res, err, 'admin/media-item');
  }
});
