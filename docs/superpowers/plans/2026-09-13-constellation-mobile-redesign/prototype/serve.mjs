// Tiny read-only static server for the phone prototype, so it can be opened from
// a phone on the same network. Serves ONLY this prototype folder and the Font
// Awesome package it references; everything else is 404.
//
//   node docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/prototype/serve.mjs [port]
//   → http://localhost:4410/  (redirects to the prototype)
//   Phone on the same Wi-Fi: http://<this-computer's-LAN-IP>:4410/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../../..');
const PROTO_URL = '/' + path.relative(REPO, HERE).split(path.sep).join('/') + '/';
const ALLOWED = [HERE, path.join(REPO, 'node_modules/@fortawesome/fontawesome-free')];
const PORT = Number(process.argv[2] || process.env.PORT || 4410);
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.md': 'text/markdown', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') { res.writeHead(302, { Location: PROTO_URL }); return res.end(); }
  let file = path.normalize(path.join(REPO, decodeURIComponent(url.pathname)));
  if (file.endsWith(path.sep)) file = path.join(file, 'index.html');
  if (!ALLOWED.some((dir) => file === dir || file.startsWith(dir + path.sep)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found (prototype server serves only the prototype folder).');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  return fs.createReadStream(file).pipe(res);
}).listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`Prototype:      http://localhost:${PORT}${PROTO_URL}`);
  console.log(`Review frames:  http://localhost:${PORT}${PROTO_URL}review.html`);
  for (const ip of lan) console.log(`On a phone:     http://${ip}:${PORT}${PROTO_URL}`);
});
