import { supabase } from "../../shared/supabase.js";
import { readAllRows, initProtectedPage, escapeHtml, formatTimestamp, getStatusBadge, populateStatusSelect, subscribeTables } from "./auth.js";

import { logActivityOnce } from "./activity.js";

const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const assignmentFilter = document.getElementById("assignmentFilter");
const peopleList = document.getElementById("peopleList");
const peopleEmptyState = document.getElementById("peopleEmptyState");
const directoryStats = document.getElementById("directoryStats");

let people = [];
let currentProfile = null;

function renderStats(rows) {
  directoryStats.innerHTML = `
    <article class="metric-card"><span class="muted-text">Total People</span><strong>${rows.length}</strong></article>
    <article class="metric-card"><span class="muted-text">Prayer Needs</span><strong>${rows.filter((row) => row.prayer_points).length}</strong></article>
    <article class="metric-card"><span class="muted-text">Pending Follow-Up</span><strong>${rows.filter((row) => row.status === "not_called").length}</strong></article>
    <article class="metric-card"><span class="muted-text">Assigned</span><strong>${rows.filter((row) => row.assigned_to).length}</strong></article>
  `;
}

function renderPeople(rows) {
  peopleList.innerHTML = rows
    .map((person) => `
      <article class="card" tabindex="0" role="link" aria-label="Open ${escapeHtml(person.full_name)}" data-person-id="${person.person_id}">
        <div class="card-topline">
          <div>
            <h3>${escapeHtml(person.full_name)}</h3>
            <p class="muted-text">${escapeHtml(person.email || "No email supplied")}</p>
          </div>
          ${getStatusBadge(person.status)}
        </div>
        <div class="card-meta">
          <span><strong>Cellphone:</strong> ${escapeHtml(person.phone || "Not supplied")}</span>
          <span><strong>Residence:</strong> ${escapeHtml(person.area_of_residence || "Not supplied")}</span>
          <span><strong>Assigned to:</strong> ${escapeHtml(person.assigned_name || "Unassigned")}</span>
          <span><strong>Captured:</strong> ${formatTimestamp(person.created_at)}</span>
        </div>
        ${person.followup_notes ? `<div class="response-highlight"><strong>Latest response:</strong> ${escapeHtml(person.followup_notes)}</div>` : ""}
        ${person.prayer_points ? `<div class="prayer-highlight">${escapeHtml(person.prayer_points)}</div>` : ""}
      </article>
    `)
    .join("");

  peopleEmptyState.classList.toggle("hidden", rows.length > 0);
}

function applyFilters() {
  const query = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  const assignment = assignmentFilter.value;

  const visibleRows = people.filter((person) => {
    const blob = [
      person.full_name,
      person.email,
      person.phone,
      person.area_of_residence,
      person.occupation,
      person.assigned_name,
    ].filter(Boolean).join(" ").toLowerCase();

    const matchesSearch = !query || blob.includes(query);
    const matchesStatus = !status || person.status === status;
    const matchesAssignment =
      !assignment ||
      (assignment === "assigned" && Boolean(person.assigned_to)) ||
      (assignment === "unassigned" && !person.assigned_to);

    return matchesSearch && matchesStatus && matchesAssignment;
  });

  renderStats(visibleRows);
  renderPeople(visibleRows);
}

async function loadPeople() {
  const data = await readAllRows("people_overview", "*", "created_at");

  people = data ?? [];
  applyFilters();
}

populateStatusSelect(statusFilter, "", true);

[searchInput, statusFilter, assignmentFilter].forEach((element) => {
  element.addEventListener("input", applyFilters);
  element.addEventListener("change", applyFilters);
});

peopleList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-person-id]");
  if (!card) {
    return;
  }

  window.location.assign(`person.html?id=${card.dataset.personId}`);
});

peopleList.addEventListener("keydown", event => { if (event.key === "Enter" && event.target.matches("[data-person-id]")) event.target.click(); });

initProtectedPage({
  onReady: async ({ profile }) => {
    currentProfile = profile;
    await loadPeople();
    await logActivityOnce("directory-view", "viewed_directory", null, { summary: "Opened the people directory" });

    const channel = subscribeTables(["people", "followups"], loadPeople);
    window.addEventListener("beforeunload", () => {
      supabase.removeChannel(channel);
    });
  },
}).catch((error) => {
  console.error("People page failed", error);
});
