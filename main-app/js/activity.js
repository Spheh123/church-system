import { supabase } from "../../shared/supabase.js";
import { appConfig } from "../../shared/config.js";

let currentProfile = null;
const sessionStartKey = "soj-session-start";
const sessionUserKey = "soj-session-user";

export function setActivityProfile(profile) {
  currentProfile = profile;
}

function ensureSessionStart() {
  if (!currentProfile?.id) {
    return false;
  }

  const currentSessionUser = sessionStorage.getItem(sessionUserKey);
  if (currentSessionUser === currentProfile.id && sessionStorage.getItem(sessionStartKey)) {
    return false;
  }

  sessionStorage.setItem(sessionUserKey, currentProfile.id);
  sessionStorage.setItem(sessionStartKey, Date.now().toString());
  return true;
}

export async function logActivity(action, personId = null, details = {}) {
  if (!currentProfile?.id) {
    return;
  }

  const payload = {
    user_id: currentProfile.id,
    action,
    person_id: personId,
    details,
  };

  const { error } = await supabase.from("activity_logs").insert(payload);

  if (error) {
    console.warn("Activity log failed", error);
  }
}

export async function logActivityOnce(cacheKey, action, personId = null, details = {}, ttlMs = appConfig.activityThrottleMs) {
  const now = Date.now();
  const lastLoggedAt = Number(sessionStorage.getItem(cacheKey) || 0);
  if (now - lastLoggedAt < ttlMs) {
    return;
  }

  sessionStorage.setItem(cacheKey, String(now));
  await logActivity(action, personId, details);
}

export async function touchPresence(markLogin = false) {
  const { error } = await supabase.rpc("touch_my_presence", { mark_login: markLogin });
  if (error) {
    console.warn("Presence update failed", error);
  }
}

export async function recordLogin() {
  const isFreshSession = ensureSessionStart();
  await touchPresence(true);

  if (isFreshSession) {
    await logActivity("login", null, { summary: "Signed into the follow-up workspace" });
  }
}

export async function recordLogout() {
  if (!currentProfile?.id) {
    return;
  }

  const startedAt = Number(sessionStorage.getItem(sessionStartKey) || Date.now());
  const durationSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));

  await logActivity("logout", null, {
    summary: "Signed out of the follow-up workspace",
    duration_seconds: durationSeconds,
  });

  sessionStorage.removeItem(sessionStartKey);
  sessionStorage.removeItem(sessionUserKey);
}
