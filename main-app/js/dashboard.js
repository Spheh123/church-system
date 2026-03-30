import { supabase } from "../../shared/supabase.js";
import { appConfig, defaultRouteByRole, followUpStatuses, roles, statusLabels } from "../../shared/config.js";
import { initProtectedPage, escapeHtml, formatTimestamp, populateRoleSelect, setMessage, clearMessage, subscribeTables } from "./auth.js";

const summaryCards = document.getElementById("summaryCards");
const prayerList = document.getElementById("prayerList");
const notContactedList = document.getElementById("notContactedList");
const newVisitorsList = document.getElementById("newVisitorsList");
const progressSummary = document.getElementById("progressSummary");
const createUserForm = document.getElementById("createUserForm");
const newUserRole = document.getElementById("newUserRole");
const generatedPasswordCard = document.getElementById("generatedPasswordCard");
const userDirectory = document.getElementById("userDirectory");

let currentProfile = null;
let people = [];

function withinDays(dateString, days) {
  if (!dateString) {
    return false;
  }

  return Date.now() - new Date(dateString).getTime() <= days * 24 * 60 * 60 * 1000;
}

function renderStack(container, rows, emptyText, template) {
  container.innerHTML = rows.length ? rows.map(template).join("") : `<div class="empty-state">${emptyText}</div>`;
}

function renderDashboard() {
  const visiblePeople = currentProfile.role === "team"
    ? people.filter((person) => person.assigned_to === currentProfile.id)
    : people;
  const firstTimers = visiblePeople.filter((person) => withinDays(person.created_at, appConfig.firstTimerWindowDays));
  const pending = visiblePeople.filter((person) => person.status === "not_called");
  const prayer = visiblePeople.filter((person) => person.prayer_points);

  summaryCards.innerHTML = `
    <article class="metric-card"><span class="muted-text">Total People</span><strong>${visiblePeople.length}</strong></article>
    <article class="metric-card"><span class="muted-text">First Timers</span><strong>${firstTimers.length}</strong></article>
    <article class="metric-card"><span class="muted-text">Pending Calls</span><strong>${pending.length}</strong></article>
    <article class="metric-card"><span class="muted-text">Prayer Needs</span><strong>${prayer.length}</strong></article>
  `;

  renderStack(
    prayerList,
    prayer.slice(0, 8),
    "No urgent prayer requests right now.",
    (person) => `<article class="stack-item"><strong>${escapeHtml(person.full_name)}</strong><div class="prayer-highlight">${escapeHtml(person.prayer_points)}</div></article>`,
  );

  renderStack(
    notContactedList,
    pending.slice(0, 8),
    "Everyone has moved beyond the first call stage.",
    (person) => `<article class="stack-item"><strong>${escapeHtml(person.full_name)}</strong><div class="muted-text">${escapeHtml(person.phone || "No phone")} | ${escapeHtml(person.area_of_residence || "No residence")}</div></article>`,
  );

  renderStack(
    newVisitorsList,
    firstTimers.slice(0, 8),
    "No new first timers in the current window.",
    (person) => `<article class="stack-item"><strong>${escapeHtml(person.full_name)}</strong><div class="muted-text">${formatTimestamp(person.created_at)}</div></article>`,
  );

  progressSummary.innerHTML = followUpStatuses
    .map((status) => {
      const count = visiblePeople.filter((person) => person.status === status).length;
      return `<article class="summary-pill"><strong>${count}</strong><div>${escapeHtml(statusLabels[status])}</div></article>`;
    })
    .join("");
}

async function loadPeople() {
  const { data, error } = await supabase.from("people_overview").select("*").order("created_at", { ascending: false });
  if (error) {
    throw error;
  }

  people = data ?? [];
  renderDashboard();
}

async function loadUsers() {
  const { data, error } = await supabase.from("users").select("*").order("created_at", { ascending: false });
  if (error) {
    throw error;
  }

  userDirectory.innerHTML = `
    <div class="table-header">
      <div>User</div>
      <div>Role</div>
      <div>Email</div>
      <div>Last active</div>
    </div>
    ${(data ?? []).map((user) => `
      <div class="table-row">
        <div><strong>${escapeHtml(user.name || user.email)}</strong></div>
        <div>${escapeHtml(user.role)}</div>
        <div>${escapeHtml(user.email)}</div>
        <div>${formatTimestamp(user.last_active_at || user.last_login_at || user.created_at)}</div>
      </div>
    `).join("")}
  `;
}

function bindAdminCreateUser(session) {
  populateRoleSelect(newUserRole, "team");

  if (currentProfile.role !== "admin") {
    createUserForm.closest(".admin-panel")?.classList.add("hidden");
    return;
  }

  createUserForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage(generatedPasswordCard);

    const response = await fetch(appConfig.adminUserProvisionPath, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        name: document.getElementById("newUserName").value.trim(),
        email: document.getElementById("newUserEmail").value.trim(),
        role: newUserRole.value,
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      setMessage(generatedPasswordCard, result.error || "User creation failed.", "error");
      return;
    }

    createUserForm.reset();
    populateRoleSelect(newUserRole, "team");
    setMessage(generatedPasswordCard, `User created. Temporary password: ${result.password}`, "success");
    await loadUsers();
  });
}

initProtectedPage({
  allowedRoles: roles,
  onReady: async ({ session, profile }) => {
    currentProfile = profile;

    if (profile.role === "team") {
      window.location.replace(defaultRouteByRole.team);
      return;
    }

    await Promise.all([loadPeople(), loadUsers()]);
    bindAdminCreateUser(session);

    const peopleChannel = subscribeTables(["people", "followups"], loadPeople);
    const usersChannel = subscribeTables(["users"], loadUsers);

    window.addEventListener("beforeunload", () => {
      supabase.removeChannel(peopleChannel);
      supabase.removeChannel(usersChannel);
    });
  },
}).catch((error) => {
  console.error("Dashboard failed", error);
});
