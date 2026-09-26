const { api, authorize, parseBody, handler, HttpError } = require('./lib/server');
exports.handler = handler(async event => {
  const { user } = await authorize(event, ['super_admin', 'admin', 'pastor']);
  const { userId, active } = parseBody(event);
  if (!/^[0-9a-f-]{36}$/i.test(userId || '') || typeof active !== 'boolean') throw new HttpError(400, 'A valid account and access state are required.');
  if (user.id === userId) throw new HttpError(400, 'You cannot disable your own account.');
  await api('/rest/v1/rpc/set_staff_access', { method: 'POST', body: { actor: user.id, target: userId, enabled: active } });
  return { ok: true };
});
