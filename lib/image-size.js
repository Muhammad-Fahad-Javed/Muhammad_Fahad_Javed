// ============================================================================
// Minimal, dependency-free image dimension reader.
//
// Supports PNG, GIF, JPEG and WebP (VP8 / VP8L / VP8X). Returns null for
// anything it cannot parse (e.g. AVIF), so callers must treat the result as
// optional metadata.
// ============================================================================
'use strict';

function readPng(buffer) {
  if (buffer.length < 24) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readGif(buffer) {
  if (buffer.length < 10) return null;
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function readJpeg(buffer) {
  let offset = 2; // skip SOI (FFD8)
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    // Standalone markers without a length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break; // EOI / start of scan
    const length = buffer.readUInt16BE(offset + 2);
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      if (offset + 9 > buffer.length) return null;
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return null;
}

function readWebp(buffer) {
  if (buffer.length < 30) return null;
  const chunk = buffer.toString('ascii', 12, 16);

  if (chunk === 'VP8X') {
    const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
    const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
    return { width, height };
  }

  if (chunk === 'VP8 ') {
    // Lossy: frame header starts at 20; width/height are 14-bit at 26/28.
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return { width, height };
  }

  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { width, height };
  }

  return null;
}

function readImageSize(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 10) return null;
  try {
    // PNG
    if (
      buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
      buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
    ) {
      return readPng(buffer);
    }
    if (buffer.toString('ascii', 0, 4) === 'GIF8') return readGif(buffer);
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return readJpeg(buffer);
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
      return readWebp(buffer);
    }
  } catch {
    return null;
  }
  return null;
}

module.exports = { readImageSize };
