import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from "../../shared/firebase.js";
import { initProtectedPage, escapeHtml, formatTimestamp, getStatusBadge, populateStatusSelect } from "./auth.js";

const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const assignmentFilter = document.getElementById("assignmentFilter");
const peopleList = document.getElementById("peopleList");
const peopleEmptyState = document.getElementById("peopleEmptyState");

let allPeople = [];

function renderPeople(people) {
  peopleList.innerHTML = people
    .map(({ id, ...person }) => {
      const prayerCard = person.prayer_points
        ? `<div class="prayer-highlight">${escapeHtml(person.prayer_points)}</div>`
        : "";

      return `
        <article class="card" data-person-id="${id}">
          <div class="card-topline">
            <div>
              <h3>${escapeHtml(person.name || "Unnamed visitor")}</h3>
              <p class="muted-text">${escapeHtml(person.email || "No email supplied")}</p>
            </div>
            ${getStatusBadge(person.follow_up_status || "Pending")}
          </div>
          <div class="card-meta">
            <span><strong>Phone:</strong> ${escapeHtml(person.phone || "Not supplied")}</span>
            <span><strong>Occupation:</strong> ${escapeHtml(person.occupation || "Not supplied")}</span>
            <span><strong>Assigned to:</strong> ${escapeHtml(person.assigned_to || "Unassigned")}</span>
            <span><strong>Created:</strong> ${formatTimestamp(person.createdAt || person.timestamp)}</span>
          </div>
          ${prayerCard}
        </article>
      `;
    })
    .join("");

  peopleEmptyState.classList.toggle("hidden", people.length > 0);
}

function applyFilters() {
  const keyword = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  const assignmentScope = assignmentFilter.value;

  const filtered = allPeople.filter((person) => {
    const searchable = [
      person.name,
      person.email,
      person.phone,
      person.occupation,
      person.assigned_to,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchesKeyword = !keyword || searchable.includes(keyword);
    const matchesStatus = !status || (person.follow_up_status || "Pending") === status;
    const isAssigned = Boolean(person.assigned_to);
    const matchesAssignment =
      !assignmentScope ||
      (assignmentScope === "assigned" && isAssigned) ||
      (assignmentScope === "unassigned" && !isAssigned);

    return matchesKeyword && matchesStatus && matchesAssignment;
  });

  renderPeople(filtered);
}

function bindEvents() {
  [searchInput, statusFilter, assignmentFilter].forEach((element) => {
    element.addEventListener("input", applyFilters);
    element.addEventListener("change", applyFilters);
  });

  peopleList.addEventListener("click", (event) => {
    const card = event.target.closest("[data-person-id]");
    if (!card) {
      return;
    }

    window.location.href = `person.html?id=${card.dataset.personId}`;
  });
}

populateStatusSelect(statusFilter, "", true);
bindEvents();

initProtectedPage({
  viewAction: "view_people_directory",
  onReady: async () => {
    const peopleQuery = query(collection(db, "people"), orderBy("createdAt", "desc"));

    onSnapshot(peopleQuery, (snapshot) => {
      allPeople = snapshot.docs.map((personDoc) => ({
        id: personDoc.id,
        ...personDoc.data(),
      }));

      applyFilters();
    });
  },
}).catch((error) => {
  console.error("Unable to initialise people page", error);
});
