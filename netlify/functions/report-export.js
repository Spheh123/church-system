const { authorize, handler, HttpError } = require('./lib/server');
// Old clients receive a clear retirement message; no data is sent externally.
exports.handler = handler(async event => {
  await authorize(event, ['admin', 'pastor']);
  throw new HttpError(410, 'Google Sheets reporting has been retired. Download an Excel report from Reports.');
});
