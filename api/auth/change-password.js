const prisma = require('../../lib/db');
const { requireAuth, comparePassword, hashPassword } = require('../../lib/auth');
const { getJsonBody, methodNotAllowed } = require('../../lib/http');

module.exports = requireAuth(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  const { currentPassword, newPassword } = getJsonBody(req);
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Current and new password are required.' });
    return;
  }
  if (String(newPassword).length < 8) {
    res.status(400).json({ error: 'New password must be at least 8 characters.' });
    return;
  }

  const user = await prisma.adminUser.findUnique({ where: { id: req.admin.sub } });
  if (!user) {
    res.status(404).json({ error: 'Admin user not found.' });
    return;
  }

  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Current password is incorrect.' });
    return;
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.adminUser.update({ where: { id: user.id }, data: { passwordHash } });

  res.status(200).json({ ok: true });
});
