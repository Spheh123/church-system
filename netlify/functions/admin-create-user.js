const { api, authorize, parseBody, password, audit, handler, HttpError } = require('./lib/server');
exports.handler = handler(async event => {
  const { user } = await authorize(event, ['admin']);
  const input = parseBody(event);
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!name || name.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !['admin', 'pastor', 'team', 'usher'].includes(input.role)) throw new HttpError(400, 'Enter a name, valid email address, and role.');
  const generated = password();
  const created = await api('/auth/v1/admin/users', { method: 'POST', body: { email, password: generated, email_confirm: true, user_metadata: { name } } });
  const id = created.user?.id || created.id;
  let profile;
  try {
    [profile] = await api('/rest/v1/users', { method: 'POST', prefer: 'return=representation', body: { id, name, email, role: input.role, created_by: user.id } });
  } catch (error) {
    // Roll back only the auth account created by this failed request.
    await api(`/auth/v1/admin/users/${id}`, { method: 'DELETE' }).catch(() => {});
    throw error;
  }
  await audit(user.id, 'user_created', { target_user_id: id, summary: `Created ${email} (${input.role})` });
  return { user: profile, password: generated };
});
