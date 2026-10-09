// Storage abstraction for uploaded media (project/certificate images, profile
// photo, etc). Vercel's serverless filesystem is read-only/ephemeral, so in
// production we use Vercel Blob (@vercel/blob). For local development
// without a Blob token configured, files are written to frontend/uploads/
// so you can still test the full flow without any extra account.
const fs = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');

const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;
const IS_VERCEL = !!process.env.VERCEL;
const LOCAL_UPLOAD_DIR = path.join(process.cwd(), 'frontend', 'uploads');

// Extension is derived from the *validated* MIME type, never from the
// client-supplied filename, so a file named "x.html" can't be stored as HTML.
const EXT_BY_TYPE = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
};

class StorageNotConfiguredError extends Error {}

async function saveFile({ filename, buffer, contentType }) {
  if (IS_VERCEL && !USE_BLOB) {
    // Vercel's filesystem is read-only/ephemeral: never pretend it is storage.
    throw new StorageNotConfiguredError(
      'Image storage is not configured. Add a Vercel Blob store (BLOB_READ_WRITE_TOKEN) to this project and redeploy.'
    );
  }
  const key = `${Date.now()}-${nanoid(8)}${EXT_BY_TYPE[contentType] || ''}`;

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
  'application/pdf',
]);

// Uploads are sent as base64 JSON (~33% larger than the raw file) and Vercel
// serverless functions reject request bodies over ~4.5MB. 3MB raw => ~4MB
// base64 + JSON overhead, which fits. (The old 4MB raw limit produced ~5.3MB
// bodies, which Vercel rejected before our code ran.)
const MAX_SIZE_BYTES = 3 * 1024 * 1024;

// Verify the bytes really are what the client claims (never trust Content-Type).
function sniffType(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.slice(4, 8).toString('ascii') === 'ftyp' && /avif|avis/.test(buf.slice(8, 16).toString('ascii'))) return 'image/avif';
  if (buf.slice(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

function validateUpload({ contentType, size, buffer }) {
  if (!ALLOWED_TYPES.has(contentType)) {
    return `File type "${contentType}" is not allowed. Use JPG, PNG, WebP, AVIF, GIF or PDF.`;
  }
  if (!size) return 'The uploaded file is empty.';
  if (size > MAX_SIZE_BYTES) {
    return 'File is too large (max 3MB). Please compress or resize it and try again.';
  }
  if (buffer && sniffType(buffer) !== contentType) {
    return 'The file contents do not match its type. Upload a real JPG, PNG, WebP, AVIF, GIF or PDF.';
  }
  return null;
}

module.exports = { saveFile, deleteFile, validateUpload, sniffType, StorageNotConfiguredError, USE_BLOB, MAX_SIZE_BYTES };
