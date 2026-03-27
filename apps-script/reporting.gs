function doPost(e) {
  var payload = JSON.parse(e.postData.contents || "{}");
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = payload.mode === "daily" ? "Daily Report" : "Manual Export";
  var sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);

  sheet.clearContents();
  sheet.appendRow([
    "name",
    "phone",
    "email",
    "prayer_points",
    "follow_up_status",
    "assigned_to",
    "createdAt"
  ]);

  (payload.rows || []).forEach(function(row) {
    sheet.appendRow([
      row.name || "",
      row.phone || "",
      row.email || "",
      row.prayer_points || "",
      row.follow_up_status || "",
      row.assigned_to || "",
      row.createdAt || ""
    ]);
  });

  sheet.autoResizeColumns(1, 7);
  return ContentService.createTextOutput(JSON.stringify({
    ok: true,
    sheetName: sheetName,
    rowsWritten: (payload.rows || []).length,
    generatedBy: payload.generatedBy || "unknown"
  })).setMimeType(ContentService.MimeType.JSON);
}
