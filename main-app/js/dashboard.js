import { supabase } from "../../shared/supabase.js";
import { appConfig, followUpStatuses, statusLabels } from "../../shared/config.js";
import { initProtectedPage, escapeHtml, formatTimestamp, populateRoleSelect, setMessage, clearMessage, subscribeTables } from "./auth.js";
import { logActivity } from "./activity.js";

const summaryCards = document.getElementById("summaryCards");
const prayerList = document.getElementById("prayerList");
const notContactedList = document.getElementById("notContactedList");
const newVisitorsList = document.getElementById("newVisitorsList");
const progressSummary = document.getElementById("progressSummary");
const createUserForm = document.getElementById("createUserForm");
const newUserRole = document.getElementById("newUserRole");
const generatedPasswordCard = document.getElementById("generatedPasswordCard");
const userDirectory = document.getElementById("userDirectory");
const activityAuditLog = document.getElementById("activityAuditLog");
const accessOverview = document.getElementById("accessOverview");

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
  const firstTimers = people.filter((person) => withinDays(person.created_at, appConfig.firstTimerWindowDays));
  const pending = people.filter((person) => person.status === "not_called");
  const prayer = people.filter((person) => person.prayer_points);
  const contacted = people.filter((person) => person.status && person.status !== "not_called");

  summaryCards.innerHTML = `
    <article class="metric-card"><span class="muted-text">Total People</span><strong>${people.length}</strong></article>
    <article class="metric-card"><span class="muted-text">First Timers</span><strong>${firstTimers.length}</strong></article>
    <article class="metric-card"><span class="muted-text">Pending Calls</span><strong>${pending.length}</strong></article>
    <article class="metric-card"><span class="muted-text">Contacted</span><strong>${contacted.length}</strong></article>
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
      const count = people.filter((person) => person.status === status).length;
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

  const users = data ?? [];
  const activeThisWeek = users.filter((user) => {
    const lastTouch = user.last_active_at || user.last_login_at;
    return lastTouch && withinDays(lastTouch, 7);
  });

  accessOverview.innerHTML = `
    <article class="summary-pill"><strong>${users.length}</strong><div>Total staff access</div></article>
    <article class="summary-pill"><strong>${users.filter((user) => user.role === "admin").length}</strong><div>Admins</div></article>
    <article class="summary-pill"><strong>${users.filter((user) => user.role === "pastor").length}</strong><div>Pastors</div></article>
    <article class="summary-pill"><strong>${activeThisWeek.length}</strong><div>Active this week</div></article>
  `;

  userDirectory.innerHTML = users.length
    ? users.map((user) => `
      <article class="directory-person-card">
        <div class="directory-person-top">
          <div>
            <strong>${escapeHtml(user.name || user.email)}</strong>
            <div class="muted-text">${escapeHtml(user.email)}</div>
          </div>
          <span class="status-badge status-info">${escapeHtml(user.role)}</span>
        </div>
        <div class="directory-person-meta">
          <span><strong>Added:</strong> ${formatTimestamp(user.created_at)}</span>
          <span><strong>Last active:</strong> ${formatTimestamp(user.last_active_at || user.last_login_at || user.created_at)}</span>
        </div>
        ${currentProfile.role === "admin"
          ? `<button type="button" class="secondary-action user-password-reset" data-user-id="${user.id}" data-user-name="${escapeHtml(user.name || user.email)}">Generate password</button>`
          : ""}
      </article>
    `).join("")
    : `<div class="empty-state">No staff accounts are available yet.</div>`;
}

async function loadActivityAudit() {
  let data = null;

  const joinedQuery = await supabase
    .from("activity_logs")
    .select("*, users(name, email)")
    .order("timestamp", { ascending: false })
    .limit(25);

  if (joinedQuery.error) {
    activityAuditLog.innerHTML = `<div class="empty-state">Activity history is not available yet.</div>`;
    return;
  }

  data = joinedQuery.data ?? [];

  activityAuditLog.innerHTML = data.length
    ? data.map((item) => `
      <article class="timeline-item">
        <div class="timeline-item">
          <strong>${escapeHtml(item.users?.name || item.users?.email || "System activity")}</strong>
          <span class="muted-text">${formatTimestamp(item.timestamp)}</span>
        </div>
        <div>${escapeHtml(item.action)}</div>
        <div class="muted-text">${escapeHtml(item.details?.summary || "")}</div>
      </article>
    `).join("")
    : `<div class="empty-state">No activity has been logged yet.</div>`;
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
    await logActivity("user_created", null, {
      summary: `Created ${result.user?.name || result.user?.email || "a new user"} with role ${result.user?.role || newUserRole.value}`,
    });
    await loadUsers();
    await loadActivityAudit();
  });
}

userDirectory.addEventListener("click", async (event) => {
  const button = event.target.closest(".user-password-reset");
  if (!button || currentProfile?.role !== "admin") {
    return;
  }

  clearMessage(generatedPasswordCard);

  const response = await fetch(appConfig.adminPasswordResetPath, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${currentProfile.sessionToken}`,
    },
    body: JSON.stringify({
      userId: button.dataset.userId,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    setMessage(generatedPasswordCard, result.error || "Password reset failed.", "error");
    return;
  }

  setMessage(
    generatedPasswordCard,
    `${button.dataset.userName} now has a new system-managed password: ${result.password}`,
    "success",
  );
  await logActivity("password_reset", null, {
    summary: `Generated a new password for ${button.dataset.userName}`,
  });
  await loadActivityAudit();
});

initProtectedPage({
  allowedRoles: ["admin", "pastor"],
  onReady: async ({ session, profile }) => {
    currentProfile = {
      ...profile,
      sessionToken: session.access_token,
    };

    await Promise.all([loadPeople(), loadUsers(), loadActivityAudit()]);
    bindAdminCreateUser(session);

    const peopleChannel = subscribeTables(["people", "followups"], loadPeople);
    const usersChannel = subscribeTables(["users"], loadUsers);
    const activityChannel = subscribeTables(["activity_logs"], loadActivityAudit);

    window.addEventListener("beforeunload", () => {
      supabase.removeChannel(peopleChannel);
      supabase.removeChannel(usersChannel);
      supabase.removeChannel(activityChannel);
    });
  },
}).catch((error) => {
  console.error("Dashboard failed", error);
});
