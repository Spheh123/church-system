import { doc, updateDoc, addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from "../../shared/firebase.js";

const SESSION_KEY = "soj-cms-session";

function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error("Unable to read session state", error);
    return null;
  }
}

function writeSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function startActivitySession(profile) {
  let session = readSession();

  if (session?.userId !== profile.id) {
    session = {
      userId: profile.id,
      email: profile.email,
      role: profile.role,
      sessionId: crypto.randomUUID(),
      startedAt: Date.now(),
      loginLogId: null,
    };
  }

  if (!session.loginLogId) {
    const loginLog = await addDoc(collection(db, "activity_logs"), {
      user_email: profile.email,
      action: "login",
      target_person_id: null,
      timestamp: serverTimestamp(),
      duration: null,
      session_id: session.sessionId,
      user_role: profile.role,
    });

    session.loginLogId = loginLog.id;
    writeSession(session);
  }

  return session;
}

export async function logActivity(profile, action, targetPersonId = null, details = {}) {
  if (!profile?.email) {
    return;
  }

  const session = readSession();

  await addDoc(collection(db, "activity_logs"), {
    user_email: profile.email,
    action,
    target_person_id: targetPersonId,
    timestamp: serverTimestamp(),
    duration: details.duration ?? null,
    session_id: session?.sessionId ?? null,
    user_role: profile.role,
    details,
  });
}

export async function finishActivitySession(profile, reason = "logout") {
  const session = readSession();

  if (!profile?.email || !session?.loginLogId) {
    sessionStorage.removeItem(SESSION_KEY);
    return;
  }

  const duration = Math.max(0, Math.round((Date.now() - session.startedAt) / 1000));

  await updateDoc(doc(db, "activity_logs", session.loginLogId), {
    duration,
    endedAt: serverTimestamp(),
  });

  await addDoc(collection(db, "activity_logs"), {
    user_email: profile.email,
    action: "logout",
    target_person_id: null,
    timestamp: serverTimestamp(),
    duration,
    session_id: session.sessionId,
    user_role: profile.role,
    details: { reason },
  });

  sessionStorage.removeItem(SESSION_KEY);
}
