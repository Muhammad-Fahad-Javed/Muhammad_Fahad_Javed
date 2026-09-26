const { getSessionFromReq } = require('../../lib/auth');
const { methodNotAllowed } = require('../../lib/http');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const session = getSessionFromReq(req);
  if (!session) {
    res.status(401).json({ error: 'Not logged in.' });
    return;
  }
  res.status(200).json({ email: session.email, id: session.sub });
};
