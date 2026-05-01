import { supabase } from "../../shared/supabase.js";
import { followUpBoardColumns, statusLabels } from "../../shared/config.js";
import { escapeHtml, formatTimestamp, getStatusBadge, initProtectedPage, subscribeTables } from "./auth.js";
import { logActivity } from "./activity.js";

const boardSearch = document.getElementById("boardSearch");
const followupAssignmentScope = document.getElementById("followupAssignmentScope");
const followupBoard = document.getElementById("followupBoard");
const followupEmptyState = document.getElementById("followupEmptyState");
const boardStats = document.getElementById("boardStats");

let currentProfile = null;
let people = [];

function currentRows() {
  const query = boardSearch.value.trim().toLowerCase();
  const scope = followupAssignmentScope.value;

  return people.filter((person) => {
    const blob = [
      person.full_name,
      person.phone,
      person.email,
      person.area_of_residence,
      person.assigned_name,
    ].filter(Boolean).join(" ").toLowerCase();

    const matchesSearch = !query || blob.includes(query);
    const matchesScope =
      (scope === "incoming" && person.status === "not_called" && !person.assigned_to) ||
      (scope === "mine" && person.assigned_to === currentProfile.id) ||
      scope === "all" ||
      (scope === "unassigned" && !person.assigned_to);

    return matchesSearch && matchesScope;
  });
}

function renderStats(rows) {
  boardStats.innerHTML = `
    <article class="metric-card"><span class="muted-text">Visible Cards</span><strong>${rows.length}</strong></article>
    <article class="metric-card"><span class="muted-text">Just Came In</span><strong>${rows.filter((row) => row.status === "not_called").length}</strong></article>
    <article class="metric-card"><span class="muted-text">Unassigned</span><strong>${rows.filter((row) => !row.assigned_to).length}</strong></article>
    <article class="metric-card"><span class="muted-text">Prayer Needs</span><strong>${rows.filter((row) => row.prayer_points).length}</strong></article>
  `;
}

function cardMarkup(person) {
  return `
    <article class="kanban-card" draggable="true" data-person-id="${person.person_id}">
      <div class="card-topline">
        <strong>${escapeHtml(person.full_name)}</strong>
        ${getStatusBadge(person.status)}
      </div>
      <div class="card-meta">
        <span>${escapeHtml(person.phone || "No cellphone")}</span>
        <span>${escapeHtml(person.area_of_residence || "No residence")}</span>
        <span>${escapeHtml(person.assigned_name || "Unassigned")}</span>
        <span>${formatTimestamp(person.updated_at || person.created_at)}</span>
      </div>
      ${person.followup_notes ? `<div class="response-highlight"><strong>Latest response:</strong> ${escapeHtml(person.followup_notes)}</div>` : ""}
      ${person.prayer_points ? `<div class="prayer-highlight">${escapeHtml(person.prayer_points)}</div>` : ""}
      <a class="text-link" href="person.html?id=${person.person_id}">Open profile</a>
    </article>
  `;
}

function renderBoard() {
  const rows = currentRows();
  renderStats(rows);

  followupBoard.innerHTML = followUpBoardColumns
    .map((status) => {
      const columnRows = rows.filter((person) => person.status === status);
      return `
        <section class="kanban-column" data-status="${status}">
          <div class="kanban-column-header">
            <h2>${escapeHtml(statusLabels[status])}</h2>
            <span>${columnRows.length}</span>
          </div>
          <div class="kanban-dropzone">
            ${columnRows.map(cardMarkup).join("")}
          </div>
        </section>
      `;
    })
    .join("");

  followupEmptyState.classList.toggle("hidden", rows.length > 0);
}

async function loadBoard() {
  const { data, error } = await supabase.from("people_overview").select("*").order("updated_at", { ascending: false });
  if (error) {
    throw error;
  }

  people = data ?? [];
  renderBoard();
}

async function updateStatus(personId, nextStatus) {
  const person = people.find((item) => item.person_id === personId);
  const payload = {
    status: nextStatus,
    updated_at: new Date().toISOString(),
  };

  if (nextStatus !== "not_called") {
    payload.last_contacted = new Date().toISOString();
  }

  if (currentProfile.role === "team" && !person?.assigned_to) {
    payload.assigned_to = currentProfile.id;
  }

  const { error } = await supabase
    .from("followups")
    .update(payload)
    .eq("person_id", personId);

  if (!error) {
    await logActivity("status_changed", personId, { summary: `Moved to ${statusLabels[nextStatus]}` });
  }
}

boardSearch.addEventListener("input", renderBoard);
followupAssignmentScope.addEventListener("change", renderBoard);

followupBoard.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-person-id]");
  if (!card) {
    return;
  }

  event.dataTransfer.setData("text/plain", card.dataset.personId);
});

followupBoard.addEventListener("dragover", (event) => {
  if (event.target.closest(".kanban-dropzone")) {
    event.preventDefault();
  }
});

followupBoard.addEventListener("drop", async (event) => {
  const column = event.target.closest(".kanban-column");
  if (!column) {
    return;
  }

  event.preventDefault();
  const personId = event.dataTransfer.getData("text/plain");
  await updateStatus(personId, column.dataset.status);
  await loadBoard();
});

initProtectedPage({
  onReady: async ({ profile }) => {
    currentProfile = profile;

    if (profile.role === "team") {
      followupAssignmentScope.innerHTML = `
        <option value="incoming">Just came in</option>
        <option value="mine">My queue</option>
        <option value="all">All visible people</option>
      `;
    }

    await loadBoard();

    const channel = subscribeTables(["followups", "people"], loadBoard);
    window.addEventListener("beforeunload", () => {
      supabase.removeChannel(channel);
    });
  },
}).catch((error) => {
  console.error("Follow-up board failed", error);
});
