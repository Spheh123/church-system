import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";

initializeApp();

const adminAuth = getAuth();
const adminDb = getFirestore();
const reportWebhookUrl = defineSecret("REPORT_WEBHOOK_URL");

const VALID_ROLES = ["Admin", "Pastor", "Follow-up team"];
const DAILY_REPORT_HOUR = 18;

function generatePassword(length = 16) {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  return Array.from({ length }, () => charset[Math.floor(Math.random() * charset.length)]).join("");
}

async function getRequesterProfile(authContext) {
  if (!authContext?.uid) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }

  const requesterSnapshot = await adminDb.collection("users").doc(authContext.uid).get();

  if (!requesterSnapshot.exists) {
    throw new HttpsError("permission-denied", "No user profile exists for this account.");
  }

  return {
    id: requesterSnapshot.id,
    ...requesterSnapshot.data(),
  };
}

function assertLeader(profile) {
  if (!["Admin", "Pastor"].includes(profile.role)) {
    throw new HttpsError("permission-denied", "Only Admins and Pastors can perform this action.");
  }
}

async function logAdminActivity(profile, action, details = {}) {
  await adminDb.collection("activity_logs").add({
    user_email: profile.email,
    action,
    target_person_id: details.target_person_id ?? null,
    timestamp: FieldValue.serverTimestamp(),
    duration: null,
    session_id: details.session_id ?? null,
    user_role: profile.role,
    details,
  });
}

async function buildExportRows(mode) {
  const peopleSnapshot = await adminDb.collection("people").orderBy("createdAt", "desc").get();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;

  return peopleSnapshot.docs
    .map((personDoc) => ({
      id: personDoc.id,
      ...personDoc.data(),
    }))
    .filter((person) => {
      if (mode !== "daily") {
        return true;
      }

      const createdAt = person.createdAt?.toDate?.() ?? person.timestamp?.toDate?.() ?? null;
      return createdAt ? createdAt.getTime() >= cutoff : false;
    })
    .map((person) => ({
      id: person.id,
      name: person.name || "",
      phone: person.phone || "",
      email: person.email || "",
      prayer_points: person.prayer_points || "",
      follow_up_status: person.follow_up_status || "Pending",
      assigned_to: person.assigned_to || "",
      createdAt: person.createdAt?.toDate?.()?.toISOString?.() ?? person.timestamp?.toDate?.()?.toISOString?.() ?? "",
    }));
}

async function postReport(mode, rows, actor) {
  const webhook = reportWebhookUrl.value();

  if (!webhook) {
    throw new HttpsError("failed-precondition", "REPORT_WEBHOOK_URL is not configured.");
  }

  const response = await fetch(webhook, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode,
      rows,
      generatedAt: new Date().toISOString(),
      generatedBy: actor,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new HttpsError("internal", `Google Sheets export failed: ${body}`);
  }

  return response.json().catch(() => ({}));
}

export const createManagedUser = onCall({ secrets: [] }, async (request) => {
  const profile = await getRequesterProfile(request.auth);
  assertLeader(profile);

  const name = request.data?.name?.trim();
  const email = request.data?.email?.trim()?.toLowerCase();
  const role = request.data?.role;

  if (!name || !email || !VALID_ROLES.includes(role)) {
    throw new HttpsError("invalid-argument", "Name, email, and a valid role are required.");
  }

  const password = generatePassword();
  const userRecord = await adminAuth.createUser({
    email,
    password,
    displayName: name,
    emailVerified: true,
  });

  await adminDb.collection("users").doc(userRecord.uid).set({
    name,
    email,
    role,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: profile.email,
    lastActive: FieldValue.serverTimestamp(),
  });

  await adminAuth.setCustomUserClaims(userRecord.uid, { role });
  await logAdminActivity(profile, "create_user", { created_user_email: email, created_role: role });

  return {
    uid: userRecord.uid,
    email,
    password,
    role,
  };
});

export const resetManagedUserPassword = onCall({ secrets: [] }, async (request) => {
  const profile = await getRequesterProfile(request.auth);
  assertLeader(profile);

  const uid = request.data?.uid;

  if (!uid) {
    throw new HttpsError("invalid-argument", "A user id is required.");
  }

  const targetSnapshot = await adminDb.collection("users").doc(uid).get();
  if (!targetSnapshot.exists) {
    throw new HttpsError("not-found", "The selected user no longer exists.");
  }

  const password = generatePassword();
  const target = targetSnapshot.data();

  await adminAuth.updateUser(uid, { password });
  await adminDb.collection("users").doc(uid).update({
    passwordResetAt: FieldValue.serverTimestamp(),
    passwordResetBy: profile.email,
  });

  await logAdminActivity(profile, "reset_password", { target_user_email: target.email });

  return {
    uid,
    email: target.email,
    password,
  };
});

export const updateManagedUserRole = onCall({ secrets: [] }, async (request) => {
  const profile = await getRequesterProfile(request.auth);
  assertLeader(profile);

  const uid = request.data?.uid;
  const role = request.data?.role;

  if (!uid || !VALID_ROLES.includes(role)) {
    throw new HttpsError("invalid-argument", "A user id and valid role are required.");
  }

  await adminDb.collection("users").doc(uid).update({
    role,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: profile.email,
  });

  await adminAuth.setCustomUserClaims(uid, { role });
  await logAdminActivity(profile, "update_user_role", { target_user_id: uid, next_role: role });

  return { uid, role };
});

export const exportPeopleReport = onCall({ secrets: [reportWebhookUrl] }, async (request) => {
  const profile = await getRequesterProfile(request.auth);
  assertLeader(profile);

  const mode = request.data?.mode === "daily" ? "daily" : "all";
  const rows = await buildExportRows(mode);
  const result = await postReport(mode, rows, profile.email);
  const message = `Exported ${rows.length} row(s) to Google Sheets.`;

  await adminDb.collection("report_exports").add({
    mode,
    rowsExported: rows.length,
    message,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: profile.email,
    providerResponse: result,
  });

  await logAdminActivity(profile, "export_report", { mode, rows: rows.length });

  return {
    ok: true,
    message,
  };
});

export const scheduledDailyReport = onSchedule(
  {
    schedule: `0 ${DAILY_REPORT_HOUR} * * *`,
    timeZone: "Africa/Johannesburg",
    secrets: [reportWebhookUrl],
  },
  async () => {
    const rows = await buildExportRows("daily");
    const result = await postReport("daily", rows, "system@scheduled");
    const message = `Daily export completed with ${rows.length} row(s).`;

    await adminDb.collection("report_exports").add({
      mode: "daily",
      rowsExported: rows.length,
      message,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: "system@scheduled",
      providerResponse: result,
    });
  },
);
