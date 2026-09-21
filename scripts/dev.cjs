const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const preview = process.argv.includes('--preview');
const root = path.resolve(preview ? 'test-results/preview' : 'dist');
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.jpeg':'image/jpeg', '.svg':'image/svg+xml' };
http.createServer((req,res) => {
  let pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if (pathname === '/') pathname = '/main-app/login.html';
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type':'application/json' }); res.end(JSON.stringify({error:'Not available in the local static preview.'})); return;
  }
  res.writeHead(200, { 'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' }); fs.createReadStream(file).pipe(res);
}).listen(Number(process.env.PREVIEW_PORT || 4173), '127.0.0.1', () => console.log('Local preview: http://127.0.0.1:4173'));
