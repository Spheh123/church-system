const { randomUUID } = require('node:crypto');
const { authorize, parseBody, audit, handler } = require('./lib/server');
const { reportRows, sendReport } = require('./lib/reports');
exports.handler = handler(async event => {
  const { user } = await authorize(event, ['admin', 'pastor']);
  const rows = await reportRows(parseBody(event));
  const result = await sendReport(rows, 'manual-' + randomUUID());
  await audit(user.id, 'report_sent_to_sheets', { summary: `Sent ${rows.length} records to Google Sheets` });
  return result;
});
