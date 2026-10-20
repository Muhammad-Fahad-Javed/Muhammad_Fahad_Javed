// Storage abstraction for uploaded media (project/certificate images, profile
// photo, etc). Vercel's serverless filesystem is read-only/ephemeral, so in
// production we use Vercel Blob (@vercel/blob). For local development
// without a Blob token configured, files are written to frontend/uploads/
// so you can still test the full flow without any extra account.
//
// SECURITY: the declared Content-Type is never trusted on its own. Files are
// validated by magic bytes, SVG (an active-content format) is rejected, the
// stored extension is derived from the *detected* type, and stored keys are
// random and path-traversal safe.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;
const LOCAL_UPLOAD_DIR = path.join(process.cwd(), 'frontend', 'uploads');

// Raster images + PDF only. SVG is deliberately excluded: it can carry active
// content (scripts, external references) and is served from our own origin.
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'application/pdf',
]);

const EXT_BY_TYPE = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
};

const ALLOWED_EXTENSIONS = new Set(Object.values(EXT_BY_TYPE));

// Kept conservative because uploads are sent as base64 JSON, which is ~33%
// larger than the raw file, and Vercel serverless functions have a ~4.5MB
// request body limit. Compress/resize larger images before uploading.
const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4MB raw file size
const MAX_FILENAME_LENGTH = 200;

function safeExt(filename) {
  const ext = path.extname(filename || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
  return ALLOWED_EXTENSIONS.has(ext) ? ext : '';
}

// Removes directory components and control characters from a display filename.
function sanitizeFilename(filename) {
  const base = String(filename || '')
    .replace(/[\\/]+/g, '_')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  const limited = base.slice(0, MAX_FILENAME_LENGTH);
  return limited || 'upload';
}

function isManagedUrl(url) {
  if (typeof url !== 'string') return false;
  if (url.startsWith('/uploads/')) return true;
  return /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i.test(url);
}

// Detects the real type from the file contents (magic bytes).
function sniffContentType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (buffer.length >= 6 && buffer.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    return 'image/heif';
  }

  const head = buffer.toString('latin1', 0, Math.min(buffer.length, 1024));
  if (head.includes('%PDF-')) return 'application/pdf';

  return null;
}

function normalizeContentType(type, filename) {
  let clean = (type || '').toLowerCase().trim().split(';')[0].trim();
  if (clean === 'image/jpg' || clean === 'image/pjpeg') return 'image/jpeg';
  if (clean === 'image/x-png') return 'image/png';
  if (!clean || clean === 'application/octet-stream') {
    const ext = path.extname(filename || '').toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.avif') return 'image/avif';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.pdf') return 'application/pdf';
    if (ext === '.svg') return 'image/svg+xml'; // recognised only to reject it clearly
  }
  return clean;
}

function validateUpload({ contentType, filename, size, buffer }) {
  const normType = normalizeContentType(contentType, filename);
  const ext = path.extname(String(filename || '')).toLowerCase();

  if (normType === 'image/svg+xml' || ext === '.svg') {
    return 'SVG uploads are not allowed. Please upload a PNG, JPG, WebP, AVIF or GIF image.';
  }
  if (String(filename || '').length > MAX_FILENAME_LENGTH) {
    return `Filename is too long (max ${MAX_FILENAME_LENGTH} characters).`;
  }
  if (typeof size === 'number' && size > MAX_SIZE_BYTES) {
    return 'File is too large (max 4MB).';
  }
  if (!ALLOWED_TYPES.has(normType)) {
    return `File type "${contentType || 'unknown'}" is not allowed. Supported: JPG, PNG, WebP, AVIF, GIF, PDF.`;
  }

  if (buffer) {
    const detected = sniffContentType(buffer);
    const expected = EXT_BY_TYPE[normType];
    if (!detected || !ALLOWED_TYPES.has(detected)) {
      return 'File contents do not match a supported image or PDF format.';
    }
    if (detected !== normType) {
      // Allow the jpg/jpeg alias only; everything else must match exactly.
      if (!(detected === 'image/jpeg' && normType === 'image/jpeg')) {
        return 'File contents do not match the declared file type.';
      }
    }
    if (expected && ext && ALLOWED_EXTENSIONS.has(ext) && EXT_BY_TYPE[detected] !== ext) {
      return 'File extension does not match the file contents.';
    }
  }

  return null;
}

async function saveFile({ filename, buffer, contentType }) {
  const normType = normalizeContentType(contentType, filename);
  // Extension comes from the *detected/declared safe* type, never the raw
  // user filename, so an executable extension can never be stored.
  const ext = EXT_BY_TYPE[normType] || safeExt(filename);
  const key = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;

  if (USE_BLOB) {
    const { put } = require('@vercel/blob');
    const blob = await put(key, buffer, {
      access: 'public',
      contentType: normType,
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

// Only deletes files this application manages; never touches arbitrary URLs.
async function deleteFile(urlOrKey) {
  if (typeof urlOrKey !== 'string' || !urlOrKey) return;

  if (/^https?:\/\//.test(urlOrKey)) {
    if (!isManagedUrl(urlOrKey) || !USE_BLOB) return;
    const { del } = require('@vercel/blob');
    try {
      await del(urlOrKey);
    } catch (err) {
      console.error('Blob delete failed:', err.message);
    }
    return;
  }

  if (!urlOrKey.startsWith('/uploads/')) return;

  const key = urlOrKey.slice('/uploads/'.length);
  // Path-traversal guard: stored keys are strictly random filenames.
  if (!/^[A-Za-z0-9._-]+$/.test(key)) return;

  // "." and ".." match the character class above but are directory
  // references, never file keys.
  if (key === '.' || key === '..') return;

  const filePath = path.join(LOCAL_UPLOAD_DIR, key);
  if (path.dirname(filePath) !== LOCAL_UPLOAD_DIR) return;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    fs.unlinkSync(filePath);
  }
}

module.exports = {
  saveFile,
  deleteFile,
  validateUpload,
  normalizeContentType,
  sniffContentType,
  sanitizeFilename,
  isManagedUrl,
  USE_BLOB,
  ALLOWED_TYPES,
  MAX_SIZE_BYTES,
  MAX_FILENAME_LENGTH,
};
