import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from "../../shared/firebase.js";
import { followUpStatuses, roles } from "../../shared/config.js";
import { initProtectedPage, escapeHtml, formatTimestamp, getStatusBadge, populateStatusSelect } from "./auth.js";
import { logActivity } from "./activity.js";

const followupStatusFilter = document.getElementById("followupStatusFilter");
const followupAssignmentScope = document.getElementById("followupAssignmentScope");
const followupList = document.getElementById("followupList");
const followupEmptyState = document.getElementById("followupEmptyState");

let currentProfile = null;
let allPeople = [];

function renderStatusOptions(selectedValue) {
  return followUpStatuses
    .map((status) => `<option value="${status}" ${status === selectedValue ? "selected" : ""}>${status}</option>`)
    .join("");
}

function getFilteredPeople() {
  const status = followupStatusFilter.value;
  const scope = followupAssignmentScope.value;

  return allPeople.filter((person) => {
    const personStatus = person.follow_up_status || "Pending";
    const matchesStatus = !status || personStatus === status;
    const assignedToMe = person.assigned_to === currentProfile.email;
    const isAssigned = Boolean(person.assigned_to);
    const isLeader = [roles[0], roles[1]].includes(currentProfile.role);

    const matchesScope =
      (scope === "mine" && assignedToMe) ||
      (scope === "all" && isLeader) ||
      (scope === "unassigned" && !isAssigned);

    return matchesStatus && matchesScope;
  });
}

function render() {
  const people = getFilteredPeople();

  followupList.innerHTML = people
    .map((person) => {
      const prayer = person.prayer_points ? `<div class="prayer-highlight">${escapeHtml(person.prayer_points)}</div>` : "";
      return `
        <article class="card">
          <div class="card-topline">
            <div>
              <h3>${escapeHtml(person.name || "Unnamed visitor")}</h3>
              <p class="muted-text">${escapeHtml(person.phone || "No phone")} | ${escapeHtml(person.email || "No email")}</p>
            </div>
            ${getStatusBadge(person.follow_up_status || "Pending")}
          </div>
          <div class="card-meta">
            <span><strong>Assigned to:</strong> ${escapeHtml(person.assigned_to || "Unassigned")}</span>
            <span><strong>Created:</strong> ${formatTimestamp(person.createdAt || person.timestamp)}</span>
          </div>
          ${prayer}
          <div class="quick-editor" data-person-id="${person.id}">
            <label>
              Status
              <select data-role="status">${renderStatusOptions(person.follow_up_status || "Pending")}</select>
            </label>
            <label class="full-width">
              Note
              <textarea data-role="note" rows="3" placeholder="Add a quick follow-up note"></textarea>
            </label>
            <div class="card-actions">
              <a class="ghost-action" href="person.html?id=${person.id}">Open profile</a>
              <button class="secondary-action" type="button" data-action="save">Save follow-up</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  followupEmptyState.classList.toggle("hidden", people.length > 0);
}

function bindEvents() {
  followupStatusFilter.addEventListener("change", render);
  followupAssignmentScope.addEventListener("change", render);

  followupList.addEventListener("click", async (event) => {
    const saveButton = event.target.closest("[data-action='save']");
    if (!saveButton) {
      return;
    }

    const editor = saveButton.closest("[data-person-id]");
    const personId = editor.dataset.personId;
    const nextStatus = editor.querySelector("[data-role='status']").value;
    const note = editor.querySelector("[data-role='note']").value.trim();

    await updateDoc(doc(db, "people", personId), {
      follow_up_status: nextStatus,
      updatedAt: serverTimestamp(),
      updatedBy: currentProfile.email,
    });

    if (note) {
      await addDoc(collection(db, "people", personId, "notes"), {
        text: note,
        createdBy: currentProfile.email,
        timestamp: serverTimestamp(),
      });
    }

    await logActivity(currentProfile, "update_follow_up", personId, {
      summary: note,
      nextStatus,
    });

    editor.querySelector("[data-role='note']").value = "";
  });
}

populateStatusSelect(followupStatusFilter, "", true);
bindEvents();

initProtectedPage({
  viewAction: "view_followup_workspace",
  onReady: async ({ profile }) => {
    currentProfile = profile;

    if (![roles[0], roles[1]].includes(profile.role)) {
      followupAssignmentScope.innerHTML = `
        <option value="mine">My queue</option>
      `;
    }

    onSnapshot(query(collection(db, "people"), orderBy("createdAt", "desc")), (snapshot) => {
      allPeople = snapshot.docs.map((personDoc) => ({
        id: personDoc.id,
        ...personDoc.data(),
      }));

      render();
    });
  },
}).catch((error) => {
  console.error("Unable to initialise follow-up page", error);
});
