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
  return window.location.pathname.split("/").pop() || "index.html";
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
    await recordLogout();
    await supabase.auth.signOut();
    navigateTo("login.html");
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
  const existingContent = shell.innerHTML;
  const navMarkup = navItems
    .filter((item) => item.roles.includes(profile.role))
    .map((item) => {
      const activeClass = item.key === activeNav ? "active" : "";
      return `<a class="nav-link ${activeClass}" href="${item.href}">${item.label}</a>`;
    })
    .join("");

  shell.innerHTML = `
    <aside class="sidebar">
      <div class="brand-block">
        <img class="brand-logo" src="${escapeHtml(appConfig.logoPath)}" alt="Streams of Joy Johannesburg logo">
        <span class="eyebrow">Church Follow-Up</span>
        <h2>${escapeHtml(appConfig.appName)}</h2>
        <p>Built for stable visitor care, reporting, and accountability on Supabase.</p>
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
          <button id="logoutButton" class="ghost-action" type="button">Logout</button>
        </div>
      </header>
      ${existingContent}
    </div>
  `;

  shell.dataset.enhanced = "true";
  shell.classList.add("shell-ready");

  document.getElementById("logoutButton")?.addEventListener("click", async () => {
    await recordLogout();
    await supabase.auth.signOut();
    navigateTo("login.html");
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

  selectElement.innerHTML = roles
    .map((role) => `<option value="${role}" ${role === selectedValue ? "selected" : ""}>${role}</option>`)
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
      () => callback(),
    );
  });

  channel.subscribe();
  return channel;
}

export async function initProtectedPage({ allowedRoles = roles, onReady } = {}) {
  startLoading();

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      throw sessionError;
    }

    if (!session) {
      navigateTo("login.html");
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

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(message, error.message, "error");
      return;
    }

    const profile = await getProfile(data.user.id);
    navigateTo(routeForRole(profile.role));
  } catch (error) {
    setMessage(message, error.message || "We could not find a matching user profile for this account.", "error");
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
      navigateTo("login.html");
      return;
    }

    try {
      const profile = await getProfile(session.user.id);
      stopLoading();
      navigateTo(routeForRole(profile.role));
    } catch (error) {
      console.warn("Index redirect failed", error);
      stopLoading();
      navigateTo("login.html");
    }
  });
}

if (currentFileName() === "login.html") {
  initLoginPage();
}

if (currentFileName() === "index.html") {
  initIndexPage();
}
