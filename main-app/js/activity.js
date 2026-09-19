import { supabase } from '../../shared/supabase.js';
import { appConfig } from '../../shared/config.js';
let currentProfile = null;
let lastInteraction = Date.now();
let inFlight = false;
for (const event of ['pointerdown', 'keydown', 'scroll', 'touchstart']) {
  window.addEventListener(event, () => { lastInteraction = Date.now(); }, { passive: true });
}
export function setActivityProfile(profile) { currentProfile = profile; }
export async function logActivity(action, personId = null, details = {}) {
  if (!currentProfile?.id) return;
  const { error } = await supabase.from('activity_logs').insert({ user_id: currentProfile.id, action, person_id: personId, details });
  if (error) console.warn('Activity log failed', error.message);
}
export async function logActivityOnce(cacheKey, action, personId = null, details = {}, ttlMs = appConfig.activityThrottleMs) {
  const key = `${currentProfile?.id}:${cacheKey}`;
  if (Date.now() - Number(sessionStorage.getItem(key) || 0) < ttlMs) return;
  await logActivity(action, personId, details);
  sessionStorage.setItem(key, String(Date.now()));
}
async function sessionEvent(action) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const response = await fetch('/.netlify/functions/session', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action, active: !document.hidden && Date.now() - lastInteraction < 120000 }),
  });
  if (!response.ok) {
    if (response.status === 403) {
      await supabase.auth.signOut();
      window.location.assign('login.html');
    }
    throw new Error('Session tracking unavailable');
  }
}
export async function touchPresence() {
  if (inFlight || !currentProfile) return;
  inFlight = true;
  try {
    await sessionEvent('heartbeat');
    document.getElementById('trackingWarning')?.remove();
  } catch (error) {
    if (!document.getElementById('trackingWarning')) {
      const warning = document.createElement('p');
      warning.id = 'trackingWarning'; warning.className = 'inline-alert error'; warning.role = 'status';
      warning.textContent = 'Login tracking is unavailable. Please tell your administrator; this session may be incomplete.';
      (document.querySelector('.page-content') || document.body).prepend(warning);
    }
    console.warn(error.message);
  } finally { inFlight = false; }
}
export async function recordLogin() { await touchPresence(); }
export async function recordLogout() { await sessionEvent('logout'); }
