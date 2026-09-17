// Serve a production `build/` directory like GitHub Pages does (static files,
// SPA fallback to index.html) and proxy /api + /auth to the fixture API.
//
// Phase 5 uses this to compare the HEAD build with the working-tree build under
// identical conditions (same fixture, same Chrome, no dev server, no StrictMode).
//
// Usage: node serve-build.mjs <buildDir> <port> [fixturePort=3001]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const [, , dirArg, portArg, fixtureArg] = process.argv;
if (!dirArg || !portArg) {
  console.error('usage: node serve-build.mjs <buildDir> <port> [fixturePort]');
  process.exit(2);
}
const ROOT = path.resolve(dirArg);
const PORT = Number(portArg);
const FIXTURE = Number(fixtureArg || 3001);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain', '.map': 'application/json',
  '.gif': 'image/gif', '.mp4': 'video/mp4', '.lottie': 'application/zip',
};

function proxy(req, res) {
  const upstream = http.request({
    host: 'localhost', port: FIXTURE, path: req.url, method: req.method, headers: req.headers,
  }, (up) => {
    res.writeHead(up.statusCode, up.headers);
    up.pipe(res);
  });
  upstream.on('error', () => { res.writeHead(502); res.end('fixture unavailable'); });
  req.pipe(upstream);
  res.on('close', () => upstream.destroy());
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return proxy(req, res);
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  // GitHub Pages serves 404.html (a copy of index.html) for unknown paths.
  let status = 200;
  if (!fs.existsSync(file)) { file = path.join(ROOT, 'index.html'); status = 404; }
  res.writeHead(status, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
  return undefined;
}).listen(PORT, () => console.log(`[serve-build] ${ROOT} on http://localhost:${PORT} (api -> :${FIXTURE})`));
