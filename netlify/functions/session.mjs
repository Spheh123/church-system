import server from './lib/server.js';
const { authorize, api, HttpError } = server;
export default async (request, context) => {
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  try {
    if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
    const { user, sessionId } = await authorize({ headers: { authorization: request.headers.get('authorization') } });
    if (!sessionId) throw new HttpError(401, 'Please sign out and sign in again.');
    let input;
    try { input = await request.json(); } catch { throw new HttpError(400, 'Invalid request.'); }
    if (!['heartbeat', 'logout'].includes(input.action)) throw new HttpError(400, 'Invalid session action.');
    const result = await api('/rest/v1/rpc/record_staff_session', { method: 'POST', body: {
      p_session: sessionId, p_user: user.id, p_action: input.action,
      p_active: input.active === true, p_ip: context.ip || null,
      p_location: [context.geo?.city, context.geo?.country?.name].filter(Boolean).join(', ') || null,
      p_device: (request.headers.get('user-agent') || 'Unknown device').slice(0, 500),
    } });
    return reply({ ok: true, session: result });
  } catch (error) { return reply({ error: error.status ? error.message : 'Session tracking is temporarily unavailable.' }, error.status || 503); }
};
