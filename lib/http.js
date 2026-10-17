// ============================================================================
// HTTP request helpers.
// ============================================================================
'use strict';

const { badRequest, payloadTooLarge } = require('./errors');

const DEFAULT_MAX_BODY_BYTES = 4 * 1024 * 1024; // matches Vercel's ~4.5MB cap

// Strict JSON body reader. Malformed JSON is a client error (400) instead of
// silently becoming an empty object that looks like a successful no-op write.
function getJsonBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    const raw = req.body.trim();
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      throw badRequest('Malformed JSON request body.', 'MALFORMED_JSON');
    }
  }
  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString('utf8'));
    } catch {
      throw badRequest('Malformed JSON request body.', 'MALFORMED_JSON');
    }
  }
  if (typeof req.body === 'object') return req.body;
  throw badRequest('Unsupported request body.', 'UNSUPPORTED_BODY');
}

// Rejects oversized bodies *before* they are parsed or processed.
function assertBodySize(req, maxBytes = DEFAULT_MAX_BODY_BYTES) {
  const header = req.headers && req.headers['content-length'];
  const declared = Number(header);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw payloadTooLarge(
      `Request body is too large (max ${Math.floor(maxBytes / (1024 * 1024))}MB).`
    );
  }
  const body = req.body;
  if (typeof body === 'string' && Buffer.byteLength(body, 'utf8') > maxBytes) {
    throw payloadTooLarge('Request body is too large.');
  }
  if (Buffer.isBuffer(body) && body.length > maxBytes) {
    throw payloadTooLarge('Request body is too large.');
  }
}

// Returns the client IP using only trusted hops.
//
// X-Forwarded-For is client-appendable, so the left-most entry is attacker
// controlled. Managed platforms append the observed peer at the END of the
// chain, so we count back `trustedHops` entries from the right (default 1 =
// the platform edge). Set TRUSTED_PROXY_HOPS=0 to ignore XFF entirely.
function getClientIp(req) {
  const configured = Number(process.env.TRUSTED_PROXY_HOPS);
  const hops = Number.isFinite(configured) && configured >= 0 ? Math.floor(configured) : 1;

  const xff = req.headers && req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    // hops = 0 -> trust nothing from XFF (use the socket peer).
    // hops = 1 -> the last entry is the value added by the platform edge.
    // hops = n -> count back n entries from the right.
    if (hops === 0) return (req.socket && req.socket.remoteAddress) || 'unknown';
    const idx = parts.length - hops;
    if (idx >= 0 && parts[idx]) return parts[idx];
    // Chain shorter than expected: do not guess — fall through to safer sources.
  }

  const real = req.headers && req.headers['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim();

  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  res.status(405).json({ error: `Method not allowed. Use: ${allowed.join(', ')}`, code: 'METHOD_NOT_ALLOWED' });
}

// Bounded pagination: every list endpoint has a maximum page size so a large
// table cannot be dumped in one request.
function parsePagination(query, options) {
  const opts = options || {};
  const defaultLimit = opts.defaultLimit || 100;
  const maxLimit = opts.maxLimit || 500;
  const rawLimit = Number(query && query.limit);
  const rawOffset = Number(query && query.offset);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(Math.trunc(rawLimit), maxLimit)
    : defaultLimit;
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.trunc(rawOffset) : 0;
  return { take: limit, skip: offset, limit, offset };
}

module.exports = {
  getJsonBody,
  assertBodySize,
  getClientIp,
  methodNotAllowed,
  parsePagination,
  DEFAULT_MAX_BODY_BYTES,
};
