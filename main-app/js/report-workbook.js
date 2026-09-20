import ExcelJS from 'exceljs';

// Explicit string values preserve phone zeros and never interpret visitor text as formulas.
export const reportColumns = [
  ['full_name', 'Full name', 28], ['gender', 'Gender', 14],
  ['phone', 'Phone number', 22], ['email', 'Email address', 34],
  ['area_of_residence', 'Area of residence', 28], ['dob', 'Date of birth (as supplied)', 24],
  ['occupation', 'Occupation', 26], ['marital_status', 'Marital status', 18],
  ['status', 'Follow-up status', 22], ['assigned_name', 'Assigned team member', 26],
  ['assigned_email', 'Assigned team email', 32], ['prayer_points', 'Prayer requests', 48],
  ['service_feedback', 'Service feedback / service date', 48], ['nsppdian', 'NSPPD participant', 20],
  ['next_sunday', 'Returning next Sunday', 24], ['membership_interest', 'Membership interest', 24],
  ['whatsapp_group', 'WhatsApp group preference', 26], ['invite', 'Invited by someone', 22],
  ['invite_details', 'Invitation details', 34], ['followup_notes', 'Latest follow-up summary', 48],
  ['created_at', 'Captured at (Johannesburg)', 27], ['last_contacted', 'Last contacted (Johannesburg)', 27],
  ['next_followup_at', 'Next follow-up (Johannesburg)', 27], ['updated_at', 'Follow-up updated (Johannesburg)', 27],
  ['person_id', 'Visitor reference', 38],
];
const dateFields = new Set(['created_at', 'last_contacted', 'next_followup_at', 'updated_at']);
function cellValue(row, key, labels) {
  const value = row[key];
  if (value == null) return '';
  if (key === 'status') return labels[value] || String(value);
  if (dateFields.has(key) && Number.isFinite(Date.parse(value))) {
    // Excel has no timezone. Store the Johannesburg wall-clock date explicitly.
    return new Date(Date.parse(value) + 2 * 60 * 60 * 1000);
  }
  return String(value);
}
export function createReportWorkbook(items, labels = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Streams of Joy Johannesburg';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Visitors', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
  sheet.columns = reportColumns.map(([key, header, width]) => ({ key, header, width }));
  sheet.addTable({ name: 'ChurchVisitors', ref: 'A1', headerRow: true,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: reportColumns.map(([, name]) => ({ name, filterButton: true })),
    rows: items.map(row => reportColumns.map(([key]) => cellValue(row, key, labels))),
  });
  sheet.eachRow((row, number) => {
    let lines = 1;
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      cell.font = { name: 'Calibri', size: 11, ...(number === 1 ? { bold: true, color: { argb: 'FFFFFFFF' } } : {}) };
      cell.alignment = { vertical: 'top', wrapText: true };
      const key = reportColumns[column - 1][0];
      cell.numFmt = dateFields.has(key) ? 'dd mmm yyyy hh:mm' : '@';
      if (number === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123458' } };
      lines = Math.max(lines, ...String(cell.value ?? '').split('\n').map(s => Math.ceil(s.length / Math.max(10, reportColumns[column - 1][2] - 3))));
    });
    row.height = number === 1 ? 34 : Math.min(409, Math.max(32, lines * 16 + 8));
  });
  const guide = workbook.addWorksheet('How to use');
  guide.columns = [{ width: 30 }, { width: 105 }];
  [
    ['Streams of Joy Johannesburg', 'Visitor report'],
    ['Records exported', items.length],
    ['Filter in Excel', 'Open Visitors. Use the arrow in any heading to filter, for example Gender → Female or Male. Clear the filter to show everyone again.'],
    ['Read across the table', 'Scroll horizontally for all captured fields. The full name column and header stay visible. Text is wrapped and phone numbers retain their leading zeros.'],
    ['Dates', 'Timestamp columns use Johannesburg time. Birth dates remain exactly as supplied. Area of residence is the location captured; a street address is not collected.'],
    ['Follow-up notes', 'Latest follow-up summary is included. The separate conversation-note history remains on the person’s profile.'],
    ['Confidential', 'Contains personal details and prayer requests. Share only with authorised church staff. A visitor report is not a full system backup.'],
  ].forEach(values => { const row = guide.addRow(values); row.alignment = { wrapText: true, vertical: 'top' }; row.height = 48; });
  return workbook;
}
export async function reportBuffer(items, labels) {
  return createReportWorkbook(items, labels).xlsx.writeBuffer();
}
