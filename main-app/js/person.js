import { supabase } from "../../shared/supabase.js";
import { personFieldLabels, personFieldOrder } from "../../shared/config.js";
import { clearMessage, escapeHtml, formatTimestamp, getStatusBadge, initProtectedPage, populateStatusSelect, setMessage, subscribeTables } from "./auth.js";
import { logActivity, logActivityOnce } from "./activity.js";

const personId = new URLSearchParams(window.location.search).get("id");
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

let currentProfile = null;
let currentPerson = null;

function renderProfile(person) {
  currentPerson = person;
  personName.textContent = person.full_name;
  personMeta.textContent = `${person.email || "No email"} | ${person.phone || "No cellphone"} | ${person.area_of_residence || "No residence"}`;
  profileStatusBadgeContainer.innerHTML = getStatusBadge(person.status);
  prayerPointsCard.textContent = person.prayer_points || "No prayer points supplied.";

  const whatsappNumber = (person.phone || "").replace(/\D/g, "");
  openWhatsAppLink.href = whatsappNumber ? `https://wa.me/${whatsappNumber}` : "#";
  openWhatsAppLink.classList.toggle("hidden", !whatsappNumber);

  profileFields.innerHTML = personFieldOrder
    .map((field) => `
      <div class="detail-item">
        <span>${escapeHtml(personFieldLabels[field] || field)}</span>
        <strong>${escapeHtml(person[field] || "Not supplied")}</strong>
      </div>
    `)
    .join("");

  followUpStatusSelect.value = person.status || "not_called";
}

async function loadPerson() {
  const { data, error } = await supabase.from("people_overview").select("*").eq("person_id", personId).single();
  if (error) {
    throw error;
  }

  renderProfile(data);
}

async function loadUsers() {
  const { data, error } = await supabase.from("users").select("id, name, email, role").order("name");
  if (error) {
    throw error;
  }

  assignedToSelect.innerHTML = [`<option value="">Unassigned</option>`, ...(data ?? []).map((user) => `
    <option value="${user.id}" ${user.id === currentPerson?.assigned_to ? "selected" : ""}>${escapeHtml(user.name)} (${escapeHtml(user.role)})</option>
  `)].join("");

  if (currentProfile.role === "team") {
    assignedToSelect.disabled = true;
  }
}

async function loadNotes() {
  const { data, error } = await supabase
    .from("followup_notes")
    .select("*, users(name, email)")
    .eq("person_id", personId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  notesList.innerHTML = (data ?? []).length
    ? data.map((note) => `
      <article class="note-item">
        <div class="timeline-item">
          <strong>${escapeHtml(note.users?.name || note.users?.email || "Unknown user")}</strong>
          <span class="muted-text">${formatTimestamp(note.created_at)}</span>
        </div>
        <div>${escapeHtml(note.note)}</div>
      </article>
    `).join("")
    : `<div class="empty-state">No notes added yet.</div>`;
}

async function loadActivity() {
  const { data, error } = await supabase
    .from("activity_logs")
    .select("*, users(name, email)")
    .eq("person_id", personId)
    .order("timestamp", { ascending: false });

  if (error) {
    throw error;
  }

  personActivityLog.innerHTML = (data ?? []).length
    ? data.map((item) => `
      <article class="timeline-item">
        <div class="timeline-item">
          <strong>${escapeHtml(item.users?.name || item.users?.email || "Unknown user")}</strong>
          <span class="muted-text">${formatTimestamp(item.timestamp)}</span>
        </div>
        <div>${escapeHtml(item.action)}</div>
        <div class="muted-text">${escapeHtml(item.details?.summary || "")}</div>
      </article>
    `).join("")
    : `<div class="empty-state">No activity recorded yet.</div>`;
}

populateStatusSelect(followUpStatusSelect);

personUpdateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(personUpdateMessage);

  const updates = {
    status: followUpStatusSelect.value,
    notes: updateSummary.value.trim() || currentPerson.followup_notes || "",
    updated_at: new Date().toISOString(),
  };

  if (followUpStatusSelect.value !== "not_called") {
    updates.last_contacted = new Date().toISOString();
  }

  if (currentProfile.role !== "team") {
    updates.assigned_to = assignedToSelect.value || null;
  } else if (!currentPerson.assigned_to) {
    updates.assigned_to = currentProfile.id;
  }

  const { error } = await supabase.from("followups").update(updates).eq("person_id", personId);
  if (error) {
    setMessage(personUpdateMessage, error.message, "error");
    return;
  }

  if (updateSummary.value.trim()) {
    await supabase.from("followup_notes").insert({
      person_id: personId,
      user_id: currentProfile.id,
      note: updateSummary.value.trim(),
    });
  }

  await logActivity("status_changed", personId, { summary: updateSummary.value.trim() || "Updated follow-up details" });
  updateSummary.value = "";
  setMessage(personUpdateMessage, "Follow-up updated successfully.", "success");
  await Promise.all([loadPerson(), loadNotes(), loadActivity()]);
});

noteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!noteText.value.trim()) {
    return;
  }

  const { error } = await supabase.from("followup_notes").insert({
    person_id: personId,
    user_id: currentProfile.id,
    note: noteText.value.trim(),
  });

  if (!error) {
    await logActivity("note_added", personId, { summary: noteText.value.trim() });
    noteText.value = "";
    await Promise.all([loadNotes(), loadActivity()]);
  }
});

initProtectedPage({
  onReady: async ({ profile }) => {
    currentProfile = profile;

    if (!personId) {
      personName.textContent = "Person not found";
      personMeta.textContent = "Open this page from the people directory.";
      return;
    }

    await Promise.all([loadPerson(), loadUsers(), loadNotes(), loadActivity()]);
    await logActivityOnce(`view-person-${personId}`, "viewed_record", personId, {
      summary: "Opened the person profile",
    });

    const channel = subscribeTables(["people", "followups", "followup_notes", "activity_logs"], async () => {
      await Promise.all([loadPerson(), loadNotes(), loadActivity()]);
    });

    window.addEventListener("beforeunload", () => {
      supabase.removeChannel(channel);
    });
  },
}).catch((error) => {
  console.error("Person page failed", error);
});
