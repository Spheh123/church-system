const { api, authorize, parseBody, password, audit, handler, HttpError } = require('./lib/server');
const { randomUUID } = require('node:crypto');
exports.handler = handler(async event => {
  const { user } = await authorize(event, ['super_admin', 'admin', 'pastor']);
  const { userId } = parseBody(event);
  if (!/^[0-9a-f-]{36}$/i.test(userId || '')) throw new HttpError(400, 'A valid user ID is required.');
  const [target] = await api(`/rest/v1/users?id=eq.${userId}&select=id`);
  if (!target) throw new HttpError(404, 'Staff account not found.');
  const generated = password();
  await api(`/auth/v1/admin/users/${userId}`, { method: 'PUT', body: { password: generated, app_metadata: { staff_password_change: randomUUID() } } });
  await audit(user.id, 'password_reset', { target_user_id: userId, summary: 'Admin generated a new password' });
  return { ok: true, password: generated };
});
