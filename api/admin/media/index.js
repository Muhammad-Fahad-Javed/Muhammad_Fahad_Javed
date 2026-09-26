const prisma = require('../../../lib/db');
const { requireAuth } = require('../../../lib/auth');
const { getJsonBody, methodNotAllowed } = require('../../../lib/http');
const { saveFile, validateUpload } = require('../../../lib/storage');

module.exports = requireAuth(async (req, res) => {
  if (req.method === 'GET') {
    const items = await prisma.media.findMany({ orderBy: { createdAt: 'desc' } });
    res.status(200).json(items);
    return;
  }

  if (req.method === 'POST') {
    const { filename, dataBase64, contentType } = getJsonBody(req);
    if (!filename || !dataBase64 || !contentType) {
      res.status(400).json({ error: 'filename, dataBase64 and contentType are required.' });
      return;
    }

    let buffer;
    try {
      buffer = Buffer.from(dataBase64, 'base64');
    } catch {
      res.status(400).json({ error: 'dataBase64 could not be decoded.' });
      return;
    }

    const validationError = validateUpload({ contentType, size: buffer.length });
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    try {
      const { url } = await saveFile({ filename, buffer, contentType });
      const media = await prisma.media.create({
        data: { filename, url, type: contentType, size: buffer.length },
      });
      res.status(201).json(media);
    } catch (err) {
      console.error('Upload failed:', err);
      res.status(500).json({ error: 'Upload failed. Please try again.' });
    }
    return;
  }

  methodNotAllowed(res, ['GET', 'POST']);
});
