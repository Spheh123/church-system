import { supabase } from "../../shared/supabase.js";
import {
  appConfig,
  defaultRouteByRole,
  followUpStatuses,
  navItems,
  roles,
  statusLabels,
  statusToneMap,
} from "../../shared/config.js";
import { recordLogin, recordLogout, setActivityProfile, touchPresence } from "./activity.js";

let currentSession = null;
let currentProfile = null;
let heartbeatHandle = null;

function currentFileName() {
  const name = window.location.pathname.split("/").pop() || "index.html";
  // Netlify pretty URLs remove .html from links in served HTML.
  return name.includes('.') ? name : `${name}.html`;
}

function navigateTo(target) {
  if (currentFileName() === target) {
    return;
  }

  window.location.assign(target);
}

function startLoading() {
  document.body.classList.add("auth-loading");
}

function stopLoading() {
  document.body.classList.remove("auth-loading");
}

function stopPresenceHeartbeat() {
  if (heartbeatHandle) {
    window.clearInterval(heartbeatHandle);
    heartbeatHandle = null;
  }
}

function startPresenceHeartbeat() {
  stopPresenceHeartbeat();
  heartbeatHandle = window.setInterval(() => {
    touchPresence().catch((error) => {
      console.warn("Presence heartbeat failed", error);
    });
  }, appConfig.sessionHeartbeatMs);
}

function showProblem(message) {
  stopLoading();

  const shell = document.getElementById("appShell");
  if (!shell) {
    return;
  }

  shell.innerHTML = `
    <main class="page-content">
      <section class="panel auth-problem">
        <span class="eyebrow">Workspace Check</span>
        <h1>We could not finish loading your workspace</h1>
        <p>${escapeHtml(message)}</p>
        <div class="card-actions">
          <button id="backToLogin" class="secondary-action" type="button">Return to login</button>
          <button id="reloadPage" class="ghost-action" type="button">Reload page</button>
        </div>
      </section>
    </main>
  `;

  document.getElementById("backToLogin")?.addEventListener("click", async () => {
    await recordLogout().catch(() => {});
    await supabase.auth.signOut({ scope: "local" });
    navigateTo(currentFileName() === "attendance.html" ? "usher-login.html" : "login.html");
  });

  document.getElementById("reloadPage")?.addEventListener("click", () => {
    window.location.reload();
  });
}

async function getProfile(userId) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Your account signed in, but no user profile was found in the users table. Add this Auth user to public.users with a role like admin.");
  }

  if (data.is_active === false) throw new Error("Your access has been disabled. Contact the church administrator.");
  if (!roles.includes(data.role)) throw new Error("Your account does not have a recognised role.");
  return data;
}

function routeForRole(role) {
  return defaultRouteByRole[role] ?? "people.html";
}

function renderShell(profile) {
  const shell = document.getElementById("appShell");

  if (!shell || shell.dataset.enhanced === "true") {
    return;
  }

  const pageTitle = shell.dataset.pageTitle ?? appConfig.appName;
  const activeNav = shell.dataset.nav ?? "";
  // Move the original nodes: serialising innerHTML would destroy every page's
  // cached element reference and all listeners attached before authentication.
  const existingContent = document.createDocumentFragment();
  while (shell.firstChild) existingContent.append(shell.firstChild);
  const navMarkup = navItems
    .filter((item) => item.roles.includes(profile.role) && (!item.requiresReportPermission || ["super_admin","admin","pastor"].includes(profile.role) || profile.can_export_reports))
    .map((item) => {
      const activeClass = item.key === activeNav ? "active" : "";
      return `<a class="nav-link ${activeClass}" href="${item.href}">${profile.role === "usher" && item.usherLabel ? item.usherLabel : item.label}</a>`;
    })
    .join("");

  shell.innerHTML = `
    <aside class="sidebar">
      <div class="brand-block">
        <a href="https://streamsofjoyjohannesburg.org/"><img class="church-logo" src="${appConfig.logoPath}" alt="Streams of Joy Johannesburg"></a>
        <span class="eyebrow">Ministry workspace</span>
        <p>Every person matters.</p>
      </div>

      <nav class="sidebar-nav">${navMarkup}</nav>

      <div class="sidebar-footer">
        <strong>${escapeHtml(profile.name || profile.email)}</strong>
        <span>${escapeHtml(profile.role)}</span>
        <span class="muted-text">${escapeHtml(profile.email)}</span>
      </div>
    </aside>

    <div class="app-main">
      <header class="topbar">
        <div>
          <span class="eyebrow">Operations Workspace</span>
          <h1>${escapeHtml(pageTitle)}</h1>
        </div>
        <div class="topbar-actions">
          <span id="connectionStatus" class="connection-status" role="status">Connecting…</span>
          <button id="logoutButton" class="ghost-action" type="button">Sign out</button>
        </div>
      </header>
    </div>
  `;
  shell.querySelector(".app-main").append(existingContent);

  shell.dataset.enhanced = "true";
  shell.classList.add("shell-ready");

  document.getElementById("logoutButton")?.addEventListener("click", async () => {
    await recordLogout().catch(() => {});
    await supabase.auth.signOut({ scope: "local" });
    navigateTo(currentFileName() === "attendance.html" ? "usher-login.html" : "login.html");
  });
}

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatTimestamp(value) {
  if (!value) {
    return "Not available";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function setMessage(element, message, type = "info") {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.remove("hidden", "success", "error");

  if (type === "success") {
    element.classList.add("success");
  }

  if (type === "error") {
    element.classList.add("error");
  }
}

export function clearMessage(element) {
  if (!element) {
    return;
  }

  element.textContent = "";
  element.classList.add("hidden");
  element.classList.remove("success", "error");
}

export function getStatusBadge(status = "not_called") {
  const tone = statusToneMap[status] ?? "info";
  const label = statusLabels[status] ?? status;
  return `<span class="status-badge status-${tone}">${escapeHtml(label)}</span>`;
}

export function populateRoleSelect(selectElement, selectedValue = "team") {
  if (!selectElement) {
    return;
  }

  const labels = { coordinator: "Operations Admin", pastor: "Pastor", team: "Follow-up Team", usher: "Usher" };
  selectElement.innerHTML = roles.filter(role => !["super_admin","admin"].includes(role))
    .map((role) => `<option value="${role}" ${role === selectedValue ? "selected" : ""}>${labels[role] || role}</option>`)
    .join("");
}

export function populateStatusSelect(selectElement, selectedValue = "not_called", includeAllOption = false) {
  if (!selectElement) {
    return;
  }

  const options = [
    includeAllOption ? `<option value="">All statuses</option>` : "",
    ...followUpStatuses.map(
      (status) => `<option value="${status}" ${status === selectedValue ? "selected" : ""}>${statusLabels[status]}</option>`,
    ),
  ].filter(Boolean);

  selectElement.innerHTML = options.join("");
}

export function getCurrentProfile() {
  return currentProfile;
}

export function getCurrentSession() {
  return currentSession;
}

export function subscribeTables(tables, callback) {
  const channel = supabase.channel(`live-${tables.join("-")}-${Date.now()}`);

  tables.forEach((table) => {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      () => Promise.resolve(callback()).catch(showConnectionError),
    );
  });

  channel.subscribe((status) => {
    const label = document.getElementById("connectionStatus");
    if (label) label.textContent = status === "SUBSCRIBED" ? "Live updates" : "Reconnecting…";
  });
  const refresh = window.setInterval(() => { if (!document.hidden) Promise.resolve(callback()).catch(showConnectionError); }, 60000);
  window.addEventListener("beforeunload", () => clearInterval(refresh), { once: true });
  return channel;
}

export async function initProtectedPage({ allowedRoles = ["super_admin","admin","coordinator","pastor","team"], onReady } = {}) {
  startLoading();

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      throw sessionError;
    }

    if (!session) {
      navigateTo(currentFileName() === "attendance.html" ? "usher-login.html" : "login.html");
      return;
    }

    const profile = await getProfile(session.user.id);

    currentSession = session;
    currentProfile = profile;
    setActivityProfile(profile);
    await recordLogin();
    startPresenceHeartbeat();

    if (!allowedRoles.includes(profile.role)) {
      navigateTo(routeForRole(profile.role));
      return;
    }

    renderShell(profile);
    stopLoading();

    if (typeof onReady === "function") {
      await onReady({ session, profile });
    }
  } catch (error) {
    console.error("Protected page failed", error);
    stopPresenceHeartbeat();
    showProblem(error.message || "The workspace could not be loaded.");
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const message = document.getElementById("loginMessage");

  clearMessage(message);
  const button = event.submitter;
  if (button) { button.disabled = true; button.textContent = "Signing in…"; }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(message, friendlyError(error), "error");
      return;
    }

    const profile = await getProfile(data.user.id);
    setActivityProfile(profile);
    await recordLogin();
    navigateTo(routeForRole(profile.role));
  } catch (error) {
    setMessage(message, friendlyError(error), "error");
  } finally {
    if (button) { button.disabled = false; button.textContent = "Sign in to workspace"; }
  }
}

function initLoginPage() {
  const loginForm = document.getElementById("loginForm");
  if (!loginForm || loginForm.dataset.bound === "true") {
    return;
  }

  loginForm.dataset.bound = "true";
  loginForm.addEventListener("submit", handleLoginSubmit);

  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (!session) {
      return;
    }

    try {
      const profile = await getProfile(session.user.id);
      navigateTo(routeForRole(profile.role));
    } catch (error) {
      console.warn("Login redirect skipped", error);
    }
  });
}

function initIndexPage() {
  startLoading();
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (!session) {
      stopLoading();
      navigateTo(currentFileName() === "attendance.html" ? "usher-login.html" : "login.html");
      return;
    }

    try {
      const profile = await getProfile(session.user.id);
      stopLoading();
      navigateTo(routeForRole(profile.role));
    } catch (error) {
      console.warn("Index redirect failed", error);
      stopLoading();
      navigateTo(currentFileName() === "attendance.html" ? "usher-login.html" : "login.html");
    }
  });
}

if (["login.html","usher-login.html"].includes(currentFileName())) {
  initLoginPage();
}

if (currentFileName() === "index.html") {
  initIndexPage();
}

export function friendlyError(error) {
  const message = error?.message || 'Something went wrong. Please try again.';
  if (/fetch|network|resolve|timeout/i.test(message)) return 'We cannot reach the login service. Check your connection; the administrator may need to restore the Supabase project.';
  if (/invalid login/i.test(message)) return 'Email or password is incorrect. Contact your administrator if you need a new password.';
  return message;
}
function showConnectionError(error) {
  const label = document.getElementById('connectionStatus');
  if (label) label.textContent = 'Updates interrupted — retrying';
  console.warn('Refresh failed', error.message);
}
export async function apiRequest(path, body) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Please sign in again.');
  const response = await fetch(path, { method: 'POST', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The request failed. Please try again.');
  return result;
}

// Clear protected screens when this browser session ends in another tab.
supabase.auth.onAuthStateChange((event, session) => {
  currentSession = session;
  if (event === 'SIGNED_OUT' && !['login.html','intake.html'].includes(currentFileName())) {
    stopPresenceHeartbeat();
    document.getElementById('appShell')?.replaceChildren();
    navigateTo('login.html');
  }
});
export async function readAllRows(table, columns = '*', order = 'created_at') {
  let rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from(table).select(columns).order(order, { ascending: false }).range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
}
