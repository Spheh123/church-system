// Install in a SEPARATE report spreadsheet, never the Google Form responses sheet.
// Set REPORT_SPREADSHEET_ID and GOOGLE_SHEETS_REPORT_SECRET in Script Properties.
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var input = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();
    var secret = props.getProperty('GOOGLE_SHEETS_REPORT_SECRET');
    if (!secret || input.secret !== secret) throw new Error('Unauthorised');
    if (!Array.isArray(input.rows) || input.rows.length > 20000) throw new Error('Invalid rows');
    if (!/^(daily-\d{4}-\d{2}-\d{2}|manual-[a-f0-9-]{36})$/.test(input.report_id)) throw new Error('Invalid report ID');
    lock.waitLock(20000);
    var book = SpreadsheetApp.openById(props.getProperty('REPORT_SPREADSHEET_ID'));
    // A repeated delivery is idempotent. No visitor source sheet is modified.
    var sheet = book.getSheetByName(input.report_id);
    if (sheet && sheet.getRange('A1').getValue() === 'full_name') return reportReply({ ok: true, duplicate: true });
    if (!sheet) sheet = book.insertSheet(input.report_id);
    var headers = ['full_name','phone','email','prayer_points','status','assigned_name','created_at'];
    var rows = input.rows.map(function(row) { return headers.map(function(key) {
      var text = String(row[key] == null ? '' : row[key]);
      // Prevent spreadsheet formula execution from visitor-entered text.
      return /^[\s]*[=+@-]/.test(text) ? "'" + text : text;
    }); });
    if (rows.length) sheet.getRange(2,1,rows.length,headers.length).setNumberFormat('@').setValues(rows);
    sheet.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return reportReply({ ok: true, count: rows.length });
  } catch (error) { return reportReply({ ok: false, error: error.message }); }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}
function reportReply(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
