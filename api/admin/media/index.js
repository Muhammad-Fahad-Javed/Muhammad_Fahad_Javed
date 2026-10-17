const prisma = require('../../../lib/db');
const { requireAuth } = require('../../../lib/auth');
const {
  getJsonBody,
  assertBodySize,
  getClientIp,
  methodNotAllowed,
  parsePagination,
  DEFAULT_MAX_BODY_BYTES,
} = require('../../../lib/http');
const {
  saveFile,
  validateUpload,
  normalizeContentType,
  sanitizeFilename,
} = require('../../../lib/storage');
const { readImageSize } = require('../../../lib/image-size');
const { sendError, badRequest } = require('../../../lib/errors');
const { recordAudit } = require('../../../lib/audit');

// base64 is ~33% larger than the raw file; allow a little headroom.
const MAX_BASE64_LENGTH = Math.ceil((DEFAULT_MAX_BODY_BYTES * 4) / 3) + 4096;

module.exports = requireAuth(async (req, res) => {
  try {
    if (req.method === 'GET') {
      const { take, skip } = parsePagination(req.query, { defaultLimit: 100, maxLimit: 300 });
      const items = await prisma.media.findMany({ orderBy: { createdAt: 'desc' }, take, skip });
      res.status(200).json(items);
      return;
    }

    if (req.method === 'POST') {
      assertBodySize(req);

      const { filename, dataBase64, contentType } = getJsonBody(req);
      if (!filename || !dataBase64 || !contentType) {
        throw badRequest('filename, dataBase64 and contentType are required.');
      }
      if (typeof dataBase64 !== 'string') throw badRequest('dataBase64 must be a base64 string.');
      if (typeof filename !== 'string') throw badRequest('filename must be a string.');
      // Bounded before decoding so a huge string cannot exhaust memory.
      if (dataBase64.length > MAX_BASE64_LENGTH) throw badRequest('File is too large.');

      const buffer = Buffer.from(dataBase64, 'base64');
      if (!buffer.length) throw badRequest('dataBase64 could not be decoded.');
      if (buffer.length > DEFAULT_MAX_BODY_BYTES) throw badRequest('File is too large.');

      const cleanType = normalizeContentType(contentType, filename);
      // Real content is verified by magic bytes, not the declared type.
      const validationError = validateUpload({
        contentType: cleanType,
        filename,
        size: buffer.length,
        buffer,
      });
      if (validationError) throw badRequest(validationError);

      const cleanName = sanitizeFilename(filename);
      const { url } = await saveFile({ filename: cleanName, buffer, contentType: cleanType });
      const dims = readImageSize(buffer) || {};

      const media = await prisma.media.create({
        data: {
          filename: cleanName,
          url,
          type: cleanType,
          size: buffer.length,
          width: dims.width || null,
          height: dims.height || null,
        },
      });

      await recordAudit(prisma, {
        actorEmail: req.admin && req.admin.email,
        action: 'upload',
        resource: 'media',
        resourceId: media.id,
        ip: getClientIp(req),
        meta: { type: cleanType, size: buffer.length },
      });

      res.status(201).json(media);
      return;
    }

    methodNotAllowed(res, ['GET', 'POST']);
  } catch (err) {
    sendError(res, err, 'admin/media');
  }
});
