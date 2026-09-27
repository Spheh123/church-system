const { randomUUID } = require('node:crypto');
const { api, authorize, parseBody, audit, handler, HttpError } = require('./lib/server');

function requiresPasswordChange(user) {
  const marker = user?.app_metadata?.staff_password_change;
  // Accounts created before this workflow have no marker and still use their
  // original system-generated password, so include them in the one-time setup.
  return !String(marker || '').startsWith('completed:');
}

exports.handler = handler(async event => {
  const { user } = await authorize(event);
  if (!requiresPasswordChange(user)) throw new HttpError(403, 'A password change is not currently required for this account.');

  const { password } = parseBody(event);
  if (typeof password !== 'string' || password.length < 10 || password.length > 64 ||
      !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || /\s/.test(password)) {
    throw new HttpError(400, 'Use 10–64 characters with an uppercase letter, lowercase letter and number, without spaces.');
  }

  await api(`/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    body: {
      password,
      app_metadata: {
        ...user.app_metadata,
        staff_password_change: `completed:${randomUUID()}`,
      },
    },
  });

  // The password has already changed, so an audit outage must not tell the user
  // that the password failed and cause them to retry with the old credential.
  await audit(user.id, 'password_changed', { summary: 'Staff member created a personal password' }).catch(error => {
    console.error('Password-change audit failed:', error.message);
  });
  return { ok: true };
});
