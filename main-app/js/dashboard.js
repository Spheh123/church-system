import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from "../../shared/firebase.js";
import { appConfig, followUpStatuses, roles } from "../../shared/config.js";
import {
  initProtectedPage,
  escapeHtml,
  formatTimestamp,
  populateRoleSelect,
  setMessage,
  clearMessage,
  createManagedUserAccount,
  resetManagedUserPassword,
  updateManagedUserRole,
} from "./auth.js";

const summaryCards = document.getElementById("summaryCards");
const prayerList = document.getElementById("prayerList");
const notContactedList = document.getElementById("notContactedList");
const newVisitorsList = document.getElementById("newVisitorsList");
const progressSummary = document.getElementById("progressSummary");
const createUserForm = document.getElementById("createUserForm");
const newUserRole = document.getElementById("newUserRole");
const generatedPasswordCard = document.getElementById("generatedPasswordCard");
const userDirectory = document.getElementById("userDirectory");

let allPeople = [];

function renderList(container, rows, emptyText, formatter) {
  container.innerHTML = rows.length
    ? rows.map(formatter).join("")
    : `<div class="empty-state">${emptyText}</div>`;
}

function renderPeopleWidgets() {
  const now = Date.now();
  const recentWindow = appConfig.newVisitorHours * 60 * 60 * 1000;
  const prayerNeeded = allPeople.filter((person) => person.prayer_points);
  const notContacted = allPeople.filter((person) => !person.follow_up_status || person.follow_up_status === "Pending");
  const newVisitors = allPeople.filter((person) => {
    const createdAt = person.createdAt?.toDate?.() ?? person.timestamp?.toDate?.() ?? null;
    return createdAt && now - createdAt.getTime() <= recentWindow;
  });

  summaryCards.innerHTML = `
    <article class="metric-card"><span class="muted-text">People</span><strong>${allPeople.length}</strong></article>
    <article class="metric-card"><span class="muted-text">Prayer Needs</span><strong>${prayerNeeded.length}</strong></article>
    <article class="metric-card"><span class="muted-text">Pending Contact</span><strong>${notContacted.length}</strong></article>
    <article class="metric-card"><span class="muted-text">New Visitors</span><strong>${newVisitors.length}</strong></article>
  `;

  renderList(
    prayerList,
    prayerNeeded.slice(0, 8),
    "No active prayer requests right now.",
    (person) => `
      <article class="stack-item">
        <strong>${escapeHtml(person.name || "Unnamed visitor")}</strong>
        <div class="prayer-highlight">${escapeHtml(person.prayer_points)}</div>
      </article>
    `,
  );

  renderList(
    notContactedList,
    notContacted.slice(0, 8),
    "Everyone has at least one follow-up status update.",
    (person) => `
      <article class="stack-item">
        <strong>${escapeHtml(person.name || "Unnamed visitor")}</strong>
        <div class="muted-text">${escapeHtml(person.phone || "No phone")} | ${escapeHtml(person.assigned_to || "Unassigned")}</div>
      </article>
    `,
  );

  renderList(
    newVisitorsList,
    newVisitors.slice(0, 8),
    "No new visitors inside the current time window.",
    (person) => `
      <article class="stack-item">
        <strong>${escapeHtml(person.name || "Unnamed visitor")}</strong>
        <div class="muted-text">${formatTimestamp(person.createdAt || person.timestamp)}</div>
      </article>
    `,
  );

  progressSummary.innerHTML = followUpStatuses
    .map((status) => {
      const count = allPeople.filter((person) => (person.follow_up_status || "Pending") === status).length;
      return `<article class="summary-pill"><strong>${count}</strong><div>${escapeHtml(status)}</div></article>`;
    })
    .join("");
}

function bindAdminEvents(profile) {
  populateRoleSelect(newUserRole);

  createUserForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage(generatedPasswordCard);

    try {
      const result = await createManagedUserAccount({
        name: document.getElementById("newUserName").value.trim(),
        email: document.getElementById("newUserEmail").value.trim(),
        role: newUserRole.value,
      });

      createUserForm.reset();
      populateRoleSelect(newUserRole);
      setMessage(
        generatedPasswordCard,
        `User created. Temporary password for ${result.email}: ${result.password}`,
        "success",
      );
    } catch (error) {
      console.error("Create user failed", error);
      setMessage(generatedPasswordCard, error.message, "error");
    }
  });

  userDirectory.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-role-select]");
    if (!select) {
      return;
    }

    try {
      await updateManagedUserRole({
        uid: select.dataset.userId,
        role: select.value,
      });
    } catch (error) {
      console.error("Role update failed", error);
      setMessage(generatedPasswordCard, error.message, "error");
    }
  });

  userDirectory.addEventListener("click", async (event) => {
    const resetButton = event.target.closest("[data-reset-user]");
    if (!resetButton) {
      return;
    }

    try {
      const result = await resetManagedUserPassword({
        uid: resetButton.dataset.userId,
      });

      setMessage(
        generatedPasswordCard,
        `Temporary password reset for ${result.email}: ${result.password}`,
        "success",
      );
    } catch (error) {
      console.error("Password reset failed", error);
      setMessage(generatedPasswordCard, error.message, "error");
    }
  });

  if (![roles[0], roles[1]].includes(profile.role)) {
    createUserForm.closest(".admin-grid")?.classList.add("hidden");
  }
}

initProtectedPage({
  allowedRoles: [roles[0], roles[1]],
  viewAction: "view_dashboard",
  onReady: async ({ profile }) => {
    bindAdminEvents(profile);

    onSnapshot(query(collection(db, "people"), orderBy("createdAt", "desc")), (snapshot) => {
      allPeople = snapshot.docs.map((personDoc) => ({
        id: personDoc.id,
        ...personDoc.data(),
      }));

      renderPeopleWidgets();
    });

    onSnapshot(query(collection(db, "users"), orderBy("name", "asc")), (snapshot) => {
      const header = `
        <div class="table-header">
          <div>User</div>
          <div>Role</div>
          <div>Last active</div>
          <div>Actions</div>
        </div>
      `;

      const rows = snapshot.docs
        .map((userDoc) => {
          const user = userDoc.data();
          const roleOptions = roles
            .map((role) => `<option value="${role}" ${role === user.role ? "selected" : ""}>${role}</option>`)
            .join("");

          return `
            <div class="table-row">
              <div>
                <strong>${escapeHtml(user.name || user.email)}</strong>
                <div class="muted-text">${escapeHtml(user.email)}</div>
              </div>
              <div>
                <select data-role-select data-user-id="${userDoc.id}">
                  ${roleOptions}
                </select>
              </div>
              <div>${formatTimestamp(user.lastActive || user.createdAt)}</div>
              <div>
                <button class="secondary-action" type="button" data-reset-user data-user-id="${userDoc.id}">Reset password</button>
              </div>
            </div>
          `;
        })
        .join("");

      userDirectory.innerHTML = `${header}${rows}`;
    });
  },
}).catch((error) => {
  console.error("Unable to initialise dashboard", error);
});
