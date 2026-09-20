import { supabase } from "../../shared/supabase.js";
import { statusLabels } from "../../shared/config.js";
import { readAllRows, clearMessage, escapeHtml, formatTimestamp, initProtectedPage, populateStatusSelect, setMessage } from "./auth.js";
import { logActivity } from "./activity.js";

const exportFilteredReportButton = document.getElementById("exportFilteredReportButton");

const reportSummary = document.getElementById("reportSummary");
const reportMessage = document.getElementById("reportMessage");
const exportHistory = document.getElementById("exportHistory");
const reportPreview = document.getElementById("reportPreview");
const reportStartDate = document.getElementById("reportStartDate");
const reportEndDate = document.getElementById("reportEndDate");
const reportStatus = document.getElementById("reportStatus");
const reportAssignee = document.getElementById("reportAssignee");

let rows = [];

function filteredRows() {
  return rows.filter((row) => {
    const createdAt = row.created_at ? new Date(row.created_at) : null;
    const startOk = !reportStartDate.value || (createdAt && createdAt >= new Date(`${reportStartDate.value}T00:00:00+02:00`));
    const endOk = !reportEndDate.value || (createdAt && createdAt <= new Date(`${reportEndDate.value}T23:59:59.999+02:00`));
    const statusOk = !reportStatus.value || row.status === reportStatus.value;
    const assigneeOk = !reportAssignee.value || row.assigned_to === reportAssignee.value;
    return startOk && endOk && statusOk && assigneeOk;
  });
}

function renderSummary() {
  const visible = filteredRows();
  reportSummary.innerHTML = `
    <article class="summary-pill"><strong>${visible.length}</strong><div>Matching records</div></article>
    <article class="summary-pill"><strong>${visible.filter((row) => row.status === "not_called").length}</strong><div>Not called</div></article>
    <article class="summary-pill"><strong>${visible.filter((row) => row.prayer_points).length}</strong><div>Prayer needs</div></article>
    <article class="summary-pill"><strong>${visible.filter((row) => row.assigned_to).length}</strong><div>Assigned</div></article>
  `;
}

function renderPreview() {
  const visible = filteredRows();
  reportPreview.innerHTML = `
    <div class="table-header">
      <div>Name</div>
      <div>Residence</div>
      <div>Status</div>
      <div>Assigned</div>
    </div>
    ${visible.slice(0, 20).map((row) => `
      <div class="table-row">
        <div>
          <strong>${escapeHtml(row.full_name)}</strong>
          <div class="muted-text">${escapeHtml(row.email || "No email")}</div>
        </div>
        <div>${escapeHtml(row.area_of_residence || "Not supplied")}</div>
        <div>${escapeHtml(statusLabels[row.status] || row.status || "")}</div>
        <div>${escapeHtml(row.assigned_name || "Unassigned")}</div>
      </div>
    `).join("")}
  `;
}

async function loadRows() {
  const data = await readAllRows("people_overview", "*", "created_at");

  rows = data ?? [];
  renderSummary();
  renderPreview();
}

async function loadUsers() {
  const { data, error } = await supabase.from("users").select("id, name").order("name");
  if (error) {
    throw error;
  }

  reportAssignee.innerHTML = `<option value="">All assignees</option>${(data ?? []).map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("")}`;
}

async function loadHistory() {
  const actions = ["report_exported", "report_sent_to_sheets"];
  let data = null;

  const joinedQuery = await supabase
    .from("activity_logs")
    .select("*, users(name, email)")
    .in("action", actions)
    .order("timestamp", { ascending: false })
    .limit(10);

  if (joinedQuery.error) {
    const fallbackQuery = await supabase
      .from("activity_logs")
      .select("*")
      .in("action", actions)
      .order("timestamp", { ascending: false })
      .limit(10);

    if (fallbackQuery.error) {
      exportHistory.innerHTML = `<div class="empty-state">Report history is not available yet.</div>`;
      return;
    }

    data = fallbackQuery.data;
  } else {
    data = joinedQuery.data;
  }

  exportHistory.innerHTML = (data ?? []).length
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
    : `<div class="empty-state">No report actions logged yet.</div>`;
}

[reportStartDate, reportEndDate, reportStatus, reportAssignee].forEach((element) => {
  element.addEventListener("change", () => {
    renderSummary();
    renderPreview();
  });
});

populateStatusSelect(reportStatus, "", true);

exportFilteredReportButton.addEventListener("click", async () => {
  clearMessage(reportMessage);
  if (reportStartDate.value && reportEndDate.value && reportStartDate.value > reportEndDate.value) {
    setMessage(reportMessage, "The start date must be before the end date.", "error"); return;
  }
  exportFilteredReportButton.disabled = true;
  try {
    await loadRows();
    const visible = filteredRows();
    if (!visible.length) { setMessage(reportMessage, "No records match this report. Adjust the filters and try again.", "error"); return; }
    const { reportBuffer } = await import('./report-workbook.js');
    const buffer = await reportBuffer(visible, statusLabels);
    const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'church-visitor-report-' + new Date().toISOString().slice(0,10) + '.xlsx';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    setMessage(reportMessage, visible.length + ' records exported to Excel. Use the arrows in the column headings to filter inside Excel.', 'success');
    await logActivity('report_exported', null, { summary: 'Exported ' + visible.length + ' visitor records to Excel', format: 'xlsx', count: visible.length });
    await loadHistory();
  } catch (error) { setMessage(reportMessage, 'Could not export the report: ' + error.message, 'error'); }
  finally { exportFilteredReportButton.disabled = false; }
});

initProtectedPage({
  allowedRoles: ["admin", "pastor"],
  onReady: async () => {
    await Promise.all([loadRows(), loadUsers(), loadHistory()]);
  },
}).catch((error) => {
  console.error("Reports page failed", error);
});
