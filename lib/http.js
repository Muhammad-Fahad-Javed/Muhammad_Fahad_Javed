function getJsonBody(req) {
  // Vercel Node functions auto-parse JSON bodies into req.body, but guard
  // against it arriving as a raw string just in case.
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}

function sendError(res, status, message) {
  res.status(status).json({ error: message });
}

function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  res.status(405).json({ error: `Method not allowed. Use: ${allowed.join(', ')}` });
}

module.exports = { getJsonBody, getClientIp, sendError, methodNotAllowed };
