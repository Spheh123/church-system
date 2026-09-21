const { randomInt } = require('node:crypto');
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}
async function api(path, { method = 'GET', body, token, prefer } = {}) {
  const env = process.env;
  for (const key of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!env[key]) throw new HttpError(503, 'Server setup is incomplete. Please contact your administrator.');
  }
  const response = await fetch(`${env.SUPABASE_URL}${path}`, {
    method, signal: AbortSignal.timeout(15000),
    headers: { apikey: token ? env.SUPABASE_ANON_KEY : env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token || env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new HttpError(response.status >= 500 ? 503 : response.status,
    result?.msg || result?.message || result?.error_description || 'Database request failed.');
  return result;
}
async function authorize(event, allowed = ['admin', 'pastor', 'team', 'usher']) {
  const token = (event.headers?.authorization || event.headers?.Authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Please sign in.');
  const user = await api('/auth/v1/user', { token });
  const [profile] = await api(`/rest/v1/users?id=eq.${user.id}&select=*`);
  if (!profile || profile.is_active === false || !allowed.includes(profile.role)) throw new HttpError(403, 'You do not have permission for this action.');
  // Only inspect claims after Supabase has validated the exact token.
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  return { user, profile, token, sessionId: claims.session_id };
}
function parseBody(event) {
  if ((event.body || '').length > 1000000) throw new HttpError(413, 'Request is too large.');
  try { return JSON.parse(event.body || '{}'); } catch { throw new HttpError(400, 'Invalid JSON request.'); }
}
function password() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  return 'J9!' + Array.from({ length: 19 }, () => chars[randomInt(chars.length)]).join('');
}
async function audit(userId, action, details = {}, personId = null) {
  return api('/rest/v1/activity_logs', { method: 'POST', body: { user_id: userId, action, details, person_id: personId } });
}
function handler(callback) {
  return async event => {
    try {
      if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
      return json(200, await callback(event));
    } catch (error) {
      console.error('Request failed:', error.status || 503, error.message);
      return json(error.status || 503, { error: error.status ? error.message : 'The service is unavailable. Please try again shortly.' });
    }
  };
}
module.exports = { HttpError, json, api, authorize, parseBody, password, audit, handler };
