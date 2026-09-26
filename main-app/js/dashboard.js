import { supabase } from "../../shared/supabase.js";
import { appConfig, followUpStatuses, statusLabels } from "../../shared/config.js";
import { readAllRows, initProtectedPage, escapeHtml, formatTimestamp, populateRoleSelect, setMessage, clearMessage, subscribeTables, apiRequest } from "./auth.js";
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

  const age = Date.now() - new Date(dateString).getTime();
  return age >= 0 && age <= days * 24 * 60 * 60 * 1000;
}

function renderStack(container, rows, emptyText, template) {
  container.innerHTML = rows.length ? rows.map(template).join("") : `<div class="empty-state">${emptyText}</div>`;
}

function renderDashboard() {
  const firstTimers = people.filter((person) => withinDays(person.created_at, appConfig.firstTimerWindowDays));
  const pending = people.filter((person) => person.status === "not_called");
  const prayer = people.filter((person) => person.prayer_points);
  const overdue = people.filter(p => p.next_followup_at && new Date(p.next_followup_at) < new Date() && p.status !== "completed");
  const contacted = people.filter((person) => ["contacted", "feedback_given", "completed"].includes(person.status));

  summaryCards.innerHTML = `
    <article class="metric-card"><span class="muted-text">Total People</span><strong>${people.length}</strong></article>
    <article class="metric-card"><span class="muted-text">New in 48 hours</span><strong>${firstTimers.length}</strong></article>
    <article class="metric-card"><span class="muted-text">Pending Calls</span><strong>${pending.length}</strong></article>
    <article class="metric-card"><span class="muted-text">Contacted</span><strong>${contacted.length}</strong></article>
  `;

  renderStack(
    prayerList,
    prayer.slice(0, 8),
    "No urgent prayer requests right now.",
    (person) => `<article class="stack-item"><a class="text-link" href="person.html?id=${person.person_id}">${escapeHtml(person.full_name)}</a><div class="prayer-highlight">${escapeHtml(person.prayer_points)}</div></article>`,
  );

  renderStack(
    notContactedList,
    pending.slice(0, 8),
    "Everyone has moved beyond the first call stage.",
    (person) => `<article class="stack-item"><a class="text-link" href="person.html?id=${person.person_id}">${escapeHtml(person.full_name)}</a><div class="muted-text">${escapeHtml(person.phone || "No phone")} | ${escapeHtml(person.area_of_residence || "No residence")}</div></article>`,
  );

  renderStack(
    newVisitorsList,
    firstTimers.slice(0, 8),
    "No new first timers in the current window.",
    (person) => `<article class="stack-item"><a class="text-link" href="person.html?id=${person.person_id}">${escapeHtml(person.full_name)}</a><div class="muted-text">${formatTimestamp(person.created_at)}</div></article>`,
  );

  document.getElementById("overdueList").innerHTML = overdue.length ? overdue.map(p => `<a class="stack-item text-link" href="person.html?id=${p.person_id}">${escapeHtml(p.full_name)}<span class="muted-text"> · Due ${formatTimestamp(p.next_followup_at)}</span></a>`).join("") : `<div class="empty-state">No overdue follow-ups.</div>`;
  progressSummary.innerHTML = followUpStatuses
    .map((status) => {
      const count = people.filter((person) => person.status === status).length;
      return `<article class="summary-pill"><strong>${count}</strong><div>${escapeHtml(statusLabels[status])}</div></article>`;
    })
    .join("");
}

async function loadPeople() {
  const data = await readAllRows("people_overview", "*", "created_at");

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
    <article class="summary-pill"><strong>${users.filter((user) => ["super_admin","admin","coordinator"].includes(user.role)).length}</strong><div>Administrators</div></article>
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
          <span class="status-badge status-info">${escapeHtml(user.role)}${user.is_active === false ? " · Disabled" : ""}</span>
        </div>
        <div class="directory-person-meta">
          <span><strong>Added:</strong> ${formatTimestamp(user.created_at)}</span>
          <span><strong>Last active:</strong> ${formatTimestamp(user.last_active_at || user.last_login_at)}</span>
        </div>
        ${['super_admin','admin','pastor'].includes(currentProfile.role)
          ? `<button type="button" class="secondary-action user-password-reset" data-user-id="${user.id}" data-user-name="${escapeHtml(user.name || user.email)}">Generate password</button>
            ${user.id !== currentProfile.id ? `<button type="button" class="ghost-action user-access-toggle" data-user-id="${user.id}" data-active="${user.is_active === false}">${user.is_active === false ? "Restore access" : "Disable access"}</button>` : ""}`
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


async function loadSessions() {
  const container = document.getElementById('sessionHistory');
  const { data, error } = await supabase.from('login_sessions').select('*, users(name,email)').order('started_at', { ascending: false }).limit(100);
  if (error) { container.innerHTML = '<p class="inline-alert error">Login history unavailable. The administrator must apply the database upgrade.</p>'; return; }
  const minutes = seconds => Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'm';
  container.innerHTML = data.length ? '<div class="session-table-wrap"><table class="session-table"><thead><tr><th>Staff member</th><th>Signed in / last seen</th><th>Location & device</th><th>Duration</th><th>State</th></tr></thead><tbody>' + data.map(s => {
    const recent = Date.now() - new Date(s.last_seen_at).getTime() < 150000;
    const elapsed = Math.max(0, (new Date(s.ended_at || s.last_seen_at) - new Date(s.started_at)) / 1000);
    const state = s.ended_at ? 'Signed out' : recent ? (s.was_active ? 'Active' : 'Idle') : 'Disconnected';
    return '<tr><td><strong>' + escapeHtml(s.users?.name || 'Staff member') + '</strong><small>' + escapeHtml(s.users?.email || '') + '</small></td><td>' + formatTimestamp(s.started_at) + '<small>Last seen: ' + formatTimestamp(s.last_seen_at) + '</small></td><td>' + escapeHtml(s.location || 'Location unavailable') + '<small>' + escapeHtml(s.ip_address || 'IP unavailable') + '</small><details><summary>Device</summary>' + escapeHtml(s.device || 'Unknown') + '</details></td><td>' + minutes(elapsed) + (!s.ended_at ? ' (observed)' : '') + '<small>Active ≈ ' + minutes(s.active_seconds) + '</small></td><td><span class="status-badge status-' + (state === 'Active' ? 'success' : 'muted') + '">' + state + '</span></td></tr>';
  }).join('') + '</tbody></table></div>' : '<div class="empty-state">Login sessions will appear here as staff sign in.</div>';
}
function showPassword(message) {
  setMessage(generatedPasswordCard, message + ' Copy it now and share it privately with this person.', 'success');
  generatedPasswordCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => clearMessage(generatedPasswordCard), 120000);
}
function bindAdminCreateUser() {
  populateRoleSelect(newUserRole, 'team');
  if (!['super_admin','admin','pastor'].includes(currentProfile.role)) { createUserForm.closest('.admin-panel').classList.add('hidden'); return; }
  createUserForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    clearMessage(generatedPasswordCard);
    try {
      const result = await apiRequest(appConfig.adminUserProvisionPath, { name: document.getElementById('newUserName').value.trim(), email: document.getElementById('newUserEmail').value.trim(), role: newUserRole.value });
      createUserForm.reset(); populateRoleSelect(newUserRole, 'team');
      showPassword('Account created. Password: ' + result.password);
      await Promise.all([loadUsers(), loadActivityAudit()]);
    } catch (error) { setMessage(generatedPasswordCard, error.message, 'error'); }
    finally { button.disabled = false; }
  });
}
userDirectory.addEventListener('click', async event => {
  const button = event.target.closest('.user-password-reset, .user-access-toggle');
  if (!button || !['super_admin','admin','pastor'].includes(currentProfile?.role)) return;
  button.disabled = true;
  try {
    if (button.classList.contains('user-password-reset')) {
      const result = await apiRequest(appConfig.adminPasswordResetPath, { userId: button.dataset.userId });
      showPassword(button.dataset.userName + ' — new password: ' + result.password);
    } else {
      await apiRequest('/.netlify/functions/admin-manage-user', { userId: button.dataset.userId, active: button.dataset.active === 'true' });
      setMessage(generatedPasswordCard, 'Staff access updated.', 'success');
    }
    await Promise.all([loadUsers(), loadActivityAudit()]);
  } catch (error) { setMessage(generatedPasswordCard, error.message, 'error'); }
  finally { button.disabled = false; }
});
initProtectedPage({
  allowedRoles: ['super_admin','admin','coordinator','pastor'],
  onReady: async ({ profile }) => {
    currentProfile = profile;
    bindAdminCreateUser();
    await Promise.all([loadPeople(), loadUsers(), loadActivityAudit(), loadSessions()]);
    const channels = [subscribeTables(['people','followups'], loadPeople), subscribeTables(['users'], loadUsers), subscribeTables(['activity_logs'], loadActivityAudit), subscribeTables(['login_sessions'], loadSessions)];
    window.addEventListener('beforeunload', () => channels.forEach(c => supabase.removeChannel(c)));
  },
});
