import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

import { auth, db, functions } from "../../shared/firebase.js";
import {
  appConfig,
  navItems,
  roles,
  followUpStatuses,
  statusToneMap,
  defaultRouteByRole,
} from "../../shared/config.js";
import { startActivitySession, finishActivitySession, logActivity } from "./activity.js";

let currentAuthUser = null;
let currentUserProfile = null;
let heartbeatTimer = null;
let unloadBound = false;
let authLoadingTimeout = null;

function navigateTo(target) {
  const currentPath = window.location.pathname.split("/").pop() || "index.html";
  if (currentPath === target) {
    return;
  }

  window.location.assign(target);
}

function stopAuthLoading() {
  document.body.classList.remove("auth-loading");
  if (authLoadingTimeout) {
    window.clearTimeout(authLoadingTimeout);
    authLoadingTimeout = null;
  }
}

function showAuthProblem(message) {
  stopAuthLoading();

  const shell = document.getElementById("appShell");
  if (!shell) {
    return;
  }

  shell.innerHTML = `
    <main class="page-content">
      <section class="panel auth-problem">
        <span class="eyebrow">Access Check</span>
        <h1>We could not finish loading your workspace</h1>
        <p>${escapeHtml(message)}</p>
        <div class="card-actions">
          <button id="forceReturnLogin" class="secondary-action" type="button">Return to login</button>
          <button id="retryCurrentPage" class="ghost-action" type="button">Retry this page</button>
        </div>
      </section>
    </main>
  `;

  document.getElementById("forceReturnLogin")?.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.warn("Sign out during recovery failed", error);
    }

    navigateTo("login.html");
  });

  document.getElementById("retryCurrentPage")?.addEventListener("click", () => {
    window.location.reload();
  });
}

function getLoginPage() {
  return window.location.pathname.endsWith("/login.html");
}

function getIndexPage() {
  return window.location.pathname.endsWith("/index.html") || window.location.pathname === "/main-app/";
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
  const date = value?.toDate?.() ?? (value instanceof Date ? value : value ? new Date(value) : null);

  if (!date || Number.isNaN(date.getTime())) {
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
  } else if (type === "error") {
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

export function getStatusBadge(status = "Pending") {
  const tone = statusToneMap[status] ?? "info";
  return `<span class="status-badge status-${tone}">${escapeHtml(status)}</span>`;
}

export function populateRoleSelect(selectElement, selectedValue = "Follow-up team") {
  if (!selectElement) {
    return;
  }

  selectElement.innerHTML = roles
    .map((role) => `<option value="${role}" ${role === selectedValue ? "selected" : ""}>${role}</option>`)
    .join("");
}

export function populateStatusSelect(selectElement, selectedValue = "Pending", includeAllOption = false) {
  if (!selectElement) {
    return;
  }

  const baseOptions = includeAllOption ? [`<option value="">All statuses</option>`] : [];
  const statusOptions = followUpStatuses.map(
    (status) => `<option value="${status}" ${status === selectedValue ? "selected" : ""}>${status}</option>`,
  );

  selectElement.innerHTML = [...baseOptions, ...statusOptions].join("");
}

async function fetchUserProfile(uid) {
  const userRef = doc(db, "users", uid);
  const snapshot = await getDoc(userRef);
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
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
  const visibleNav = navItems
    .filter((item) => item.roles.includes(profile.role))
    .map((item) => {
      const activeClass = item.key === activeNav ? "active" : "";
      return `<a class="nav-link ${activeClass}" href="${item.href}">${item.label}</a>`;
    })
    .join("");

  shell.innerHTML = `
    <aside class="sidebar">
      <div class="brand-block">
        <span class="eyebrow">Secure Access</span>
        <h2>${escapeHtml(appConfig.appName)}</h2>
        <p>Extending the existing Firestore-driven visitor system without touching the intake pipeline.</p>
      </div>

      <nav class="sidebar-nav">${visibleNav}</nav>

      <div class="sidebar-footer">
        <strong>${escapeHtml(profile.name ?? profile.email)}</strong>
        <span>${escapeHtml(profile.role)}</span>
        <span id="lastActiveIndicator" class="muted-text">Last active: syncing...</span>
      </div>
    </aside>

    <div class="app-main">
      <header class="topbar">
        <div>
          <span class="eyebrow">Operational Workspace</span>
          <h1>${escapeHtml(pageTitle)}</h1>
        </div>
        <div class="topbar-actions">
          <button id="logoutButton" class="ghost-action">Logout</button>
        </div>
      </header>

      ${existingContent}
    </div>
  `;

  shell.dataset.enhanced = "true";
  shell.classList.add("shell-ready");
}

function bindLogout(profile) {
  const logoutButton = document.getElementById("logoutButton");

  if (!logoutButton || logoutButton.dataset.bound === "true") {
    return;
  }

  logoutButton.dataset.bound = "true";
  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;

    try {
      await finishActivitySession(profile, "manual-logout");
      await signOut(auth);
      navigateTo("login.html");
    } catch (error) {
      console.error("Logout failed", error);
      logoutButton.disabled = false;
    }
  });
}

async function updateLastActive(profile) {
  await updateDoc(doc(db, "users", profile.id), {
    lastActive: serverTimestamp(),
  });

  const indicator = document.getElementById("lastActiveIndicator");
  if (indicator) {
    indicator.textContent = `Last active: ${formatTimestamp(new Date())}`;
  }
}

function startHeartbeat(profile) {
  clearInterval(heartbeatTimer);
  heartbeatTimer = window.setInterval(() => {
    updateLastActive(profile).catch((error) => {
      console.error("Unable to update last active", error);
    });
  }, appConfig.sessionHeartbeatMs);
}

function bindUnload() {
  if (unloadBound) {
    return;
  }

  unloadBound = true;
  window.addEventListener("beforeunload", () => {
    clearInterval(heartbeatTimer);
  });
}

async function finalizeAuth(user) {
  const profile = await fetchUserProfile(user.uid);

  if (!profile) {
    await signOut(auth);
    navigateTo("login.html");
    throw new Error("No profile document exists for this account.");
  }

  currentAuthUser = user;
  currentUserProfile = profile;

  Promise.allSettled([
    startActivitySession(profile),
    updateLastActive(profile),
  ]).then((results) => {
    results
      .filter((result) => result.status === "rejected")
      .forEach((result) => {
        console.warn("Non-blocking auth task failed", result.reason);
      });
  });

  startHeartbeat(profile);
  bindUnload();

  return profile;
}

export async function initProtectedPage({ allowedRoles = roles, onReady, viewAction = "view_page" } = {}) {
  document.body.classList.add("auth-loading");
  authLoadingTimeout = window.setTimeout(() => {
    showAuthProblem("Your account signed in, but the application is waiting too long for Firebase data. This usually means the `users` profile, Firestore rules, or a deployed script is out of sync.");
  }, 8000);

  return new Promise((resolve, reject) => {
    let settled = false;

    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigateTo("login.html");
        return;
      }

      try {
        const profile = await finalizeAuth(user);

        if (!allowedRoles.includes(profile.role)) {
          navigateTo(routeForRole(profile.role));
          return;
        }

        renderShell(profile);
        bindLogout(profile);
        stopAuthLoading();

        logActivity(profile, viewAction, null, { page: window.location.pathname }).catch((error) => {
          console.warn("Activity log write failed", error);
        });

        if (typeof onReady === "function") {
          await onReady({ authUser: user, profile });
        }

        if (!settled) {
          settled = true;
          resolve({ authUser: user, profile });
        }
      } catch (error) {
        stopAuthLoading();
        console.error("Protected page initialisation failed", error);
        showAuthProblem(error.message || "Authentication failed while loading the page.");
        if (!settled) {
          settled = true;
          reject(error);
        }
      }
    });
  });
}

export function getCurrentUserProfile() {
  return currentUserProfile;
}

export async function createManagedUserAccount(payload) {
  const createUser = httpsCallable(functions, "createManagedUser");
  const response = await createUser(payload);
  return response.data;
}

export async function resetManagedUserPassword(payload) {
  const resetPassword = httpsCallable(functions, "resetManagedUserPassword");
  const response = await resetPassword(payload);
  return response.data;
}

export async function updateManagedUserRole(payload) {
  const updateRole = httpsCallable(functions, "updateManagedUserRole");
  const response = await updateRole(payload);
  return response.data;
}

export async function exportPeopleReport(payload) {
  const exportReport = httpsCallable(functions, "exportPeopleReport");
  const response = await exportReport(payload);
  return response.data;
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const message = document.getElementById("loginMessage");

  clearMessage(message);

  try {
    const credential = await signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value);
    const profile = await finalizeAuth(credential.user);
    navigateTo(routeForRole(profile.role));
  } catch (error) {
    console.error("Login error", error);
    setMessage(message, error.message.replace("Firebase: ", ""), "error");
  }
}

function initLoginPage() {
  const loginForm = document.getElementById("loginForm");

  if (!loginForm || loginForm.dataset.bound === "true") {
    return;
  }

  loginForm.dataset.bound = "true";
  loginForm.addEventListener("submit", handleLoginSubmit);

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      return;
    }

    try {
      const profile = await finalizeAuth(user);
      navigateTo(routeForRole(profile.role));
    } catch (error) {
      console.error(error);
    }
  });
}

function initIndexPage() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      navigateTo("login.html");
      return;
    }

    try {
      const profile = await finalizeAuth(user);
      navigateTo(routeForRole(profile.role));
    } catch (error) {
      console.error(error);
      navigateTo("login.html");
    }
  });
}

if (getLoginPage()) {
  stopAuthLoading();
  initLoginPage();
}

if (getIndexPage()) {
  initIndexPage();
}
