import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from "../../shared/firebase.js";
import { roles } from "../../shared/config.js";
import { initProtectedPage, escapeHtml, formatTimestamp, getStatusBadge, populateStatusSelect, setMessage, clearMessage } from "./auth.js";
import { logActivity } from "./activity.js";

const params = new URLSearchParams(window.location.search);
const personId = params.get("id");

const personName = document.getElementById("personName");
const personMeta = document.getElementById("personMeta");
const profileFields = document.getElementById("profileFields");
const prayerPointsCard = document.getElementById("prayerPointsCard");
const assignedToSelect = document.getElementById("assignedToSelect");
const followUpStatusSelect = document.getElementById("followUpStatusSelect");
const personUpdateForm = document.getElementById("personUpdateForm");
const personUpdateMessage = document.getElementById("personUpdateMessage");
const noteForm = document.getElementById("noteForm");
const noteText = document.getElementById("noteText");
const notesList = document.getElementById("notesList");
const personActivityLog = document.getElementById("personActivityLog");
const profileStatusBadgeContainer = document.getElementById("profileStatusBadgeContainer");
const openWhatsAppLink = document.getElementById("openWhatsAppLink");
const updateSummary = document.getElementById("updateSummary");

let currentPerson = null;
let currentProfile = null;
let hasLoggedView = false;

function orderedFields(person) {
  const preferredOrder = [
    "timestamp",
    "name",
    "email",
    "phone",
    "dob",
    "gender",
    "occupation",
    "marital_status",
    "service_feedback",
    "nsppdian",
    "next_sunday",
    "membership_interest",
    "whatsapp_group",
    "prayer_points",
    "invite",
    "invite_details",
    "createdAt",
    "follow_up_status",
    "assigned_to",
    "updatedAt",
    "updatedBy",
  ];

  const remaining = Object.keys(person).filter((key) => !preferredOrder.includes(key)).sort();
  return [...preferredOrder.filter((key) => key in person), ...remaining];
}

function renderProfile(person) {
  currentPerson = person;
  personName.textContent = person.name || "Unnamed visitor";
  personMeta.textContent = `${person.email || "No email"} | ${person.phone || "No phone"} | Created ${formatTimestamp(person.createdAt || person.timestamp)}`;
  profileStatusBadgeContainer.innerHTML = getStatusBadge(person.follow_up_status || "Pending");
  prayerPointsCard.textContent = person.prayer_points || "No prayer points supplied.";

  const phone = (person.phone || "").replace(/\s+/g, "");
  openWhatsAppLink.href = phone ? `https://wa.me/${phone.replace(/^\+/, "")}` : "#";
  openWhatsAppLink.classList.toggle("hidden", !phone);

  profileFields.innerHTML = orderedFields(person)
    .map((field) => {
      const value = person[field];
      const formattedValue = typeof value === "object" && value?.toDate ? formatTimestamp(value) : value || "Not supplied";
      return `
        <div class="detail-item">
          <span>${escapeHtml(field)}</span>
          <strong>${escapeHtml(formattedValue)}</strong>
        </div>
      `;
    })
    .join("");

  followUpStatusSelect.value = person.follow_up_status || "Pending";
}

function renderNotes(snapshot) {
  notesList.innerHTML = snapshot.docs.length
    ? snapshot.docs
        .map((noteDoc) => {
          const note = noteDoc.data();
          return `
            <article class="note-item">
              <div class="timeline-item">
                <strong>${escapeHtml(note.createdBy || "Unknown user")}</strong>
                <span class="muted-text">${formatTimestamp(note.timestamp)}</span>
              </div>
              <div>${escapeHtml(note.text || "")}</div>
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state">No notes added yet.</div>`;
}

function renderActivity(snapshot) {
  const rows = snapshot.docs
    .filter((logDoc) => logDoc.data().target_person_id === personId)
    .sort((a, b) => {
      const left = a.data().timestamp?.toMillis?.() ?? 0;
      const right = b.data().timestamp?.toMillis?.() ?? 0;
      return right - left;
    })
    .slice(0, 25);

  personActivityLog.innerHTML = rows.length
    ? rows
        .map((logDoc) => {
          const log = logDoc.data();
          return `
            <article class="timeline-item">
              <div class="timeline-item">
                <strong>${escapeHtml(log.user_email || "Unknown user")}</strong>
                <span class="muted-text">${formatTimestamp(log.timestamp)}</span>
              </div>
              <div>${escapeHtml(log.action)}</div>
              <div class="muted-text">${escapeHtml(log.details?.summary || "")}</div>
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state">No activity recorded for this person yet.</div>`;
}

function bindForms() {
  personUpdateForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentPerson || !currentProfile) {
      return;
    }

    clearMessage(personUpdateMessage);

    const nextStatus = followUpStatusSelect.value;
    const nextAssignee = assignedToSelect.value;
    const summary = updateSummary.value.trim();
    const changes = [];
    const payload = {
      follow_up_status: nextStatus,
      updatedAt: serverTimestamp(),
      updatedBy: currentProfile.email,
    };

    if (nextStatus !== (currentPerson.follow_up_status || "Pending")) {
      changes.push(`Status changed to ${nextStatus}`);
    }

    if ([roles[0], roles[1]].includes(currentProfile.role) && nextAssignee !== (currentPerson.assigned_to || "")) {
      payload.assigned_to = nextAssignee || "";
      changes.push(`Assigned to ${nextAssignee || "no one"}`);
    }

    if (!changes.length && !summary) {
      setMessage(personUpdateMessage, "No changes detected.", "error");
      return;
    }

    try {
      await updateDoc(doc(db, "people", personId), payload);

      if (summary) {
        await addDoc(collection(db, "people", personId, "notes"), {
          text: summary,
          createdBy: currentProfile.email,
          timestamp: serverTimestamp(),
        });
      }

      await logActivity(currentProfile, "edit_record", personId, { summary, changes });

      if (payload.assigned_to !== undefined) {
        await logActivity(currentProfile, "assign_follow_up", personId, {
          assigned_to: payload.assigned_to,
          summary,
        });
      }

      updateSummary.value = "";
      setMessage(personUpdateMessage, "Person record updated successfully.", "success");
    } catch (error) {
      console.error("Failed to update person", error);
      setMessage(personUpdateMessage, error.message, "error");
    }
  });

  noteForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!noteText.value.trim()) {
      return;
    }

    await addDoc(collection(db, "people", personId, "notes"), {
      text: noteText.value.trim(),
      createdBy: currentProfile.email,
      timestamp: serverTimestamp(),
    });

    await logActivity(currentProfile, "add_note", personId, { summary: noteText.value.trim() });
    noteText.value = "";
  });
}

populateStatusSelect(followUpStatusSelect);
bindForms();

initProtectedPage({
  viewAction: "view_person_profile",
  onReady: async ({ profile }) => {
    currentProfile = profile;

    if (!personId) {
      personName.textContent = "Missing person id";
      personMeta.textContent = "Open a record from the People page.";
      personUpdateForm.classList.add("hidden");
      noteForm.classList.add("hidden");
      return;
    }

    onSnapshot(query(collection(db, "users"), orderBy("name", "asc")), (snapshot) => {
      assignedToSelect.innerHTML = [
        `<option value="">Unassigned</option>`,
        ...snapshot.docs.map((userDoc) => {
          const user = userDoc.data();
          const selected = user.email === (currentPerson?.assigned_to || "") ? "selected" : "";
          return `<option value="${escapeHtml(user.email)}" ${selected}>${escapeHtml(user.name)} (${escapeHtml(user.role)})</option>`;
        }),
      ].join("");
    });

    onSnapshot(doc(db, "people", personId), async (personSnapshot) => {
      if (!personSnapshot.exists()) {
        personName.textContent = "Person not found";
        personMeta.textContent = "This record may have been deleted.";
        return;
      }

      const person = { id: personSnapshot.id, ...personSnapshot.data() };
      renderProfile(person);

      if (!hasLoggedView) {
        hasLoggedView = true;
        await logActivity(profile, "view_record", personId, { name: person.name || "" });
      }
    });

    onSnapshot(query(collection(db, "people", personId, "notes"), orderBy("timestamp", "desc")), renderNotes);
    onSnapshot(
      query(collection(db, "activity_logs"), where("target_person_id", "==", personId), orderBy("timestamp", "desc")),
      renderActivity,
    );
  },
}).catch((error) => {
  console.error("Unable to initialise person page", error);
});
