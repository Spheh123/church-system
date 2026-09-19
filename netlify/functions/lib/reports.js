const { api, HttpError } = require('./server');
async function reportRows(filters = {}) {
  const params = new URLSearchParams({ select: 'full_name,phone,email,prayer_points,status,assigned_name,created_at,person_id', order: 'created_at.desc' });
  if (filters.start) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(filters.start)) throw new HttpError(400, 'Invalid start date.');
    params.append('created_at', `gte.${filters.start}T00:00:00+02:00`);
  }
  if (filters.end) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(filters.end)) throw new HttpError(400, 'Invalid end date.');
    params.append('created_at', `lte.${filters.end}T23:59:59.999+02:00`);
  }
  if (filters.status) params.set('status', `eq.${filters.status}`);
  if (filters.assignee) {
    if (!/^[0-9a-f-]{36}$/i.test(filters.assignee)) throw new HttpError(400, 'Invalid assignee.');
    params.set('assigned_to', `eq.${filters.assignee}`);
  }
  let rows = [];
  for (let offset = 0; ; offset += 500) {
    params.set('offset', offset); params.set('limit', 500);
    const page = await api(`/rest/v1/people_overview?${params}`);
    rows.push(...page);
    if (page.length < 500) break;
    if (rows.length >= 20000) throw new HttpError(413, 'Choose a smaller report date range.');
  }
  return rows;
}
async function sendReport(rows, reportId) {
  const { GOOGLE_SHEETS_WEBHOOK_URL: url, GOOGLE_SHEETS_REPORT_SECRET: secret } = process.env;
  if (!url || !secret) throw new HttpError(503, 'Google Sheets reporting has not been configured yet. CSV export is available.');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'script.google.com') throw new HttpError(503, 'Use a Google Apps Script HTTPS report endpoint.');
  const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret, report_id: reportId, rows }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) throw new HttpError(502, 'Google Sheets did not confirm the report. Please try again.');
  return { ok: true, count: rows.length };
}
module.exports = { reportRows, sendReport };
