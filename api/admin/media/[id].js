const prisma = require('../../../lib/db');
const { requireAuth } = require('../../../lib/auth');
const { methodNotAllowed } = require('../../../lib/http');
const { deleteFile } = require('../../../lib/storage');

module.exports = requireAuth(async (req, res) => {
  if (req.method !== 'DELETE') return methodNotAllowed(res, ['DELETE']);

  const { id } = req.query;
  const media = await prisma.media.findUnique({ where: { id } });
  if (!media) {
    res.status(404).json({ error: 'Media not found.' });
    return;
  }

  await deleteFile(media.url).catch(() => {});
  await prisma.media.delete({ where: { id } });
  res.status(200).json({ ok: true });
});
