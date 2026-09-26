const { clearSessionCookie } = require('../../lib/auth');
const { methodNotAllowed } = require('../../lib/http');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
};
