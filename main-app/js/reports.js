import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from "../../shared/firebase.js";
import { followUpStatuses, roles } from "../../shared/config.js";
import { initProtectedPage, escapeHtml, formatTimestamp, exportPeopleReport, setMessage, clearMessage } from "./auth.js";

const exportDailyReportButton = document.getElementById("exportDailyReportButton");
const exportFullReportButton = document.getElementById("exportFullReportButton");
const reportSummary = document.getElementById("reportSummary");
const reportMessage = document.getElementById("reportMessage");
const exportHistory = document.getElementById("exportHistory");
const reportPreview = document.getElementById("reportPreview");

let allPeople = [];

function renderSummary() {
  const pending = allPeople.filter((person) => !person.follow_up_status || person.follow_up_status === "Pending").length;
  const withPrayer = allPeople.filter((person) => person.prayer_points).length;

  reportSummary.innerHTML = `
    <article class="summary-pill"><strong>${allPeople.length}</strong><div>Total people</div></article>
    <article class="summary-pill"><strong>${pending}</strong><div>Pending follow-up</div></article>
    <article class="summary-pill"><strong>${withPrayer}</strong><div>Prayer requests</div></article>
    <article class="summary-pill"><strong>${followUpStatuses.length}</strong><div>Tracked statuses</div></article>
  `;
}

function renderPreview() {
  const rows = allPeople.slice(0, 12);
  const header = `
    <div class="table-header">
      <div>Name</div>
      <div>Phone</div>
      <div>Email</div>
      <div>Status</div>
    </div>
  `;

  const body = rows
    .map((person) => `
      <div class="table-row">
        <div>
          <strong>${escapeHtml(person.name || "Unnamed visitor")}</strong>
          <div class="muted-text">${escapeHtml(person.assigned_to || "Unassigned")}</div>
        </div>
        <div>${escapeHtml(person.phone || "Not supplied")}</div>
        <div>${escapeHtml(person.email || "Not supplied")}</div>
        <div>${escapeHtml(person.follow_up_status || "Pending")}</div>
      </div>
    `)
    .join("");

  reportPreview.innerHTML = `${header}${body}`;
}

async function runExport(mode) {
  clearMessage(reportMessage);

  try {
    const result = await exportPeopleReport({ mode });
    setMessage(reportMessage, result.message, "success");
  } catch (error) {
    console.error("Report export failed", error);
    setMessage(reportMessage, error.message, "error");
  }
}

exportDailyReportButton.addEventListener("click", () => runExport("daily"));
exportFullReportButton.addEventListener("click", () => runExport("all"));

initProtectedPage({
  allowedRoles: [roles[0], roles[1]],
  viewAction: "view_reports",
  onReady: async () => {
    onSnapshot(query(collection(db, "people"), orderBy("createdAt", "desc")), (snapshot) => {
      allPeople = snapshot.docs.map((personDoc) => personDoc.data());
      renderSummary();
      renderPreview();
    });

    onSnapshot(query(collection(db, "report_exports"), orderBy("createdAt", "desc"), limit(10)), (snapshot) => {
      exportHistory.innerHTML = snapshot.docs.length
        ? snapshot.docs
            .map((exportDoc) => {
              const report = exportDoc.data();
              return `
                <article class="timeline-item">
                  <div class="timeline-item">
                    <strong>${escapeHtml(report.mode || "manual")}</strong>
                    <span class="muted-text">${formatTimestamp(report.createdAt)}</span>
                  </div>
                  <div>${escapeHtml(report.message || "Report export completed.")}</div>
                  <div class="muted-text">${escapeHtml(report.createdBy || "System")}</div>
                </article>
              `;
            })
            .join("")
        : `<div class="empty-state">No export jobs have run yet.</div>`;
    });
  },
}).catch((error) => {
  console.error("Unable to initialise reports page", error);
});
