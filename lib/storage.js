// Storage abstraction for uploaded media (project/certificate images, profile
// photo, etc). Vercel's serverless filesystem is read-only/ephemeral, so in
// production we use Vercel Blob (@vercel/blob). For local development
// without a Blob token configured, files are written to frontend/uploads/
// so you can still test the full flow without any extra account.
const fs = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');

const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;
const LOCAL_UPLOAD_DIR = path.join(process.cwd(), 'frontend', 'uploads');

function safeExt(filename) {
  const ext = path.extname(filename || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
  return ext || '';
}

async function saveFile({ filename, buffer, contentType }) {
  const key = `${Date.now()}-${nanoid(8)}${safeExt(filename)}`;

  if (USE_BLOB) {
    const { put } = require('@vercel/blob');
    const blob = await put(key, buffer, {
      access: 'public',
      contentType,
      addRandomSuffix: false,
    });
    return { url: blob.url, key };
  }

  // Local disk fallback (dev only — does not persist on Vercel prod).
  if (!fs.existsSync(LOCAL_UPLOAD_DIR)) {
    fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
  }
  const filePath = path.join(LOCAL_UPLOAD_DIR, key);
  fs.writeFileSync(filePath, buffer);
  return { url: `/uploads/${key}`, key };
}

async function deleteFile(urlOrKey) {
  if (USE_BLOB && /^https?:\/\//.test(urlOrKey)) {
    const { del } = require('@vercel/blob');
    try {
      await del(urlOrKey);
    } catch (err) {
      // Non-fatal: the DB record is still removed either way.
      console.error('Blob delete failed:', err.message);
    }
    return;
  }
  const key = urlOrKey.replace(/^\/uploads\//, '');
  const filePath = path.join(LOCAL_UPLOAD_DIR, key);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
]);

// Kept conservative because uploads are sent as base64 JSON, which is ~33%
// larger than the raw file, and Vercel serverless functions have a ~4.5MB
// request body limit. Compress/resize larger images before uploading.
const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4MB raw file size

function validateUpload({ contentType, size }) {
  if (!ALLOWED_TYPES.has(contentType)) {
    return `File type "${contentType}" is not allowed.`;
  }
  if (size > MAX_SIZE_BYTES) {
    return 'File is too large (max 8MB).';
  }
  return null;
}

module.exports = { saveFile, deleteFile, validateUpload, USE_BLOB };
