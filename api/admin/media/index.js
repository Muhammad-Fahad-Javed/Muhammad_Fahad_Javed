const prisma = require('../../../lib/db');
const { requireAuth } = require('../../../lib/auth');
const { getJsonBody, methodNotAllowed } = require('../../../lib/http');
const { saveFile, validateUpload, StorageNotConfiguredError } = require('../../../lib/storage');

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

    if (typeof dataBase64 !== 'string' || typeof contentType !== 'string') {
      res.status(400).json({ error: 'Invalid upload payload.' });
      return;
    }
    const buffer = Buffer.from(dataBase64, 'base64');

    const validationError = validateUpload({ contentType, size: buffer.length, buffer });
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    try {
      const { url } = await saveFile({ filename, buffer, contentType });
      const safeName = String(filename).replace(/[^\w.\- ]+/g, '_').slice(0, 120);
      const media = await prisma.media.create({
        data: { filename: safeName, url, type: contentType, size: buffer.length },
      });
      res.status(201).json(media);
    } catch (err) {
      console.error('Upload failed:', err && err.message);
      if (err instanceof StorageNotConfiguredError) {
        res.status(503).json({ error: err.message });
      } else {
        res.status(500).json({ error: 'Upload failed. Your existing image was not changed. Please try again.' });
      }
    }
    return;
  }

  methodNotAllowed(res, ['GET', 'POST']);
});
