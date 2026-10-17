// ============================================================================
// Minimal HTTP error plumbing.
//
// Handlers throw HttpError for expected client failures; sendError() maps any
// thrown value to a safe client response. Internal (unexpected) errors are
// logged server-side but never echoed to clients, so stack traces, SQL and
// configuration details cannot leak.
// ============================================================================
'use strict';

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code || 'HTTP_ERROR';
    this.expose = true;
  }
}

function badRequest(message, code) {
  return new HttpError(400, message, code || 'BAD_REQUEST');
}

function payloadTooLarge(message) {
  return new HttpError(413, message || 'Request body is too large.', 'PAYLOAD_TOO_LARGE');
}

function forbidden(message, code) {
  return new HttpError(403, message || 'Forbidden.', code || 'FORBIDDEN');
}

function unauthorized(message, code) {
  return new HttpError(401, message || 'Unauthorized.', code || 'UNAUTHORIZED');
}

function notFound(message, code) {
  return new HttpError(404, message || 'Not found.', code || 'NOT_FOUND');
}

// Serialises an error to the client. `context` is only used for the server log.
function sendError(res, err, context) {
  if (err instanceof HttpError && err.expose) {
    if (res.headersSent) return;
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }

  const label = context ? `[${context}]` : '[api]';
  // Log full detail server-side; never send it to the client.
  console.error(label, 'Unhandled error:', err && err.message ? err.message : err);

  if (res.headersSent) return;
  res.status(500).json({ error: 'Server error.', code: 'INTERNAL_ERROR' });
}

module.exports = {
  HttpError,
  badRequest,
  payloadTooLarge,
  forbidden,
  unauthorized,
  notFound,
  sendError,
};
