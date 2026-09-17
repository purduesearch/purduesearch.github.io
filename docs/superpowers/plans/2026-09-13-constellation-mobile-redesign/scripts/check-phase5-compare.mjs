// Phase 5 — pre-redesign (HEAD) build vs working-tree build, same fixture,
// same Chrome, production bundles:
//   1. desktop screenshots (1280, 1440) pixel-compared route by route
//   2. public pages (phone + desktop), including after visiting /clubpm
//   3. desktop drag (task board, Outreach board) and keyboard shortcuts
//   4. responsiveness: load time, long tasks, scroll frame time, window/document
//      listener counts after repeated navigation
// Emulation only; see phase5-lib.mjs.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  VP, OUT, makeReport, fixture, start, setViewport, go, key, val, url, sleep, closeAll, waitFor,
} from './phase5-lib.mjs';

const HEAD = process.env.APP_HEAD_URL || 'http://localhost:4001';
const CUR = process.env.APP_URL || 'http://localhost:4002';
const R = makeReport('compare');
const DIFF_DIR = path.join(OUT, 'compare');
fs.mkdirSync(DIFF_DIR, { recursive: true });

// ── Minimal PNG decoder (8-bit RGB/RGBA, non-interlaced: what Chrome emits) ──
function decodePng(buf) {
  let pos = 8; let width; let height; let colorType; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(width * height * 4);
  const stride = width * bpp; let prev = Buffer.alloc(stride); let p = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[p]; p += 1;
    const line = Buffer.from(raw.subarray(p, p + stride)); p += stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? line[x - bpp] : 0; const b = prev[x]; const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a; else if (filter === 2) v += b; else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[x] = v & 255;
    }
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4; const i = x * bpp;
      out[o] = line[i]; out[o + 1] = line[i + 1]; out[o + 2] = line[i + 2]; out[o + 3] = bpp === 4 ? line[i + 3] : 255;
    }
    prev = line;
  }
  return { width, height, data: out };
}
function diff(aB64, bB64) {
  const a = decodePng(Buffer.from(aB64, 'base64')); const b = decodePng(Buffer.from(bB64, 'base64'));
  if (a.width !== b.width || a.height !== b.height) return { sizeMismatch: true, a: [a.width, a.height], b: [b.width, b.height] };
  let n = 0; let minX = 1e9; let minY = 1e9; let maxX = -1; let maxY = -1;
  for (let y = 0; y < a.height; y += 1) for (let x = 0; x < a.width; x += 1) {
    const o = (y * a.width + x) * 4;
    if (Math.abs(a.data[o] - b.data[o]) + Math.abs(a.data[o + 1] - b.data[o + 1]) + Math.abs(a.data[o + 2] - b.data[o + 2]) > 24) {
      n += 1; if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
  }
  return { changedPixels: n, ratio: +(n / (a.width * a.height)).toFixed(5), box: n ? [minX, minY, maxX, maxY] : null };
}

// Freeze motion so both builds settle to the same frame.
const STILL = `try { const s=document.createElement('style'); s.textContent='*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'; (document.head||document.documentElement).appendChild(s); } catch {}`;

async function snap(client, base, route, { shell = true } = {}) {
  await go(client, base + route, { shell, waitMs: 2200 });
  await val(client, STILL);
  await sleep(300);
  const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
  const geo = await val(client, `(() => { const r=(s)=>{const e=document.querySelector(s); if(!e) return null; const b=e.getBoundingClientRect(); return [Math.round(b.left),Math.round(b.top),Math.round(b.width),Math.round(b.height)];};
    return { sidebar: r('.pm-sidebar'), topbar: r('.pm-topbar'), main: r('.pm-shell-main'), content: r('.pm-shell-content'), crumb: (document.querySelector('.pm-breadcrumb')?.textContent||'').trim(), overflow: document.documentElement.scrollWidth - innerWidth, url: location.pathname + location.search }; })()`);
  return { data, geo };
}

const { client, close } = await start(R, { port: 9243 });
const results = { desktop: {}, public: {}, perf: {} };
try {
  await fixture('state?persona=admin&projects=few&failProjects=0&failTaskCreate=0&failChatSend=0&slowWrites=0&failAuth=0&slackExpired=0');
  await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

  // ── 1. Desktop screenshots ─────────────────────────────────────────
  const DESKTOP = {
    home: '/clubpm', tasks: '/clubpm/projects/p1', files: '/clubpm/projects/p1?tab=files', insights: '/clubpm/projects/p1?tab=insights',
    ai: '/clubpm/projects/p1?tab=insights&view=ai', 'task-modal': '/clubpm/projects/p1?task=t3', conversation: '/clubpm/chat/C_FIX_GENERAL',
    thread: '/clubpm/chat/C_FIX_GENERAL?thread=1757700240.000100', members: '/clubpm/members', dm: '/clubpm/members?dm=D_FIX_JORDAN',
    calendar: '/clubpm/calendar', notifications: '/clubpm/notifications', prefs: '/clubpm/notifications/preferences',
    admin: '/clubpm/admin', outreach: '/clubpm/outreach?tab=board', crm: '/clubpm/outreach?tab=crm', courses: '/clubpm/courses',
    learn: '/clubpm/courses/fixture-course/learn', gantt: '/clubpm/projects/p1/gantt', profile: '/clubpm/profile', shop: '/clubpm/shop',
    challenges: '/clubpm/challenges',
  };
  // Desktop differences that are intentional and listed for sign-off in release-readiness.md §3.
  const EXPECTED_DESKTOP = { learn: 'course player gained a Previous/Next row on every width (Phase 4E)' };
  for (const vpName of ['d1280', 'd1440']) {
    await setViewport(client, VP[vpName]);
    await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'pointer', value: 'fine' }, { name: 'hover', value: 'hover' }] });
    const changed = [];
    for (const [name, route] of Object.entries(DESKTOP)) {
      const h = await snap(client, HEAD, route);
      const c = await snap(client, CUR, route);
      const d = diff(h.data, c.data);
      const geoSame = JSON.stringify({ ...h.geo }) === JSON.stringify({ ...c.geo });
      results.desktop[`${vpName}:${name}`] = { diff: d, geoSame, head: h.geo, cur: c.geo };
      if (!geoSame || d.sizeMismatch || d.ratio > 0.0005) {
        // Re-capture HEAD: a route whose own two captures differ as much is nondeterministic (timers, generated text).
        const h2 = await snap(client, HEAD, route);
        const h3 = await snap(client, HEAD, route);
        const n2 = diff(h.data, h2.data); const n3 = diff(h.data, h3.data);
        const noise = (n2.ratio || 0) >= (n3.ratio || 0) ? n2 : n3;
        const expected = EXPECTED_DESKTOP[name];
        const real = !geoSame || d.sizeMismatch || d.ratio > (noise.ratio || 0) * 2 + 0.0005;
        results.desktop[`${vpName}:${name}`].noise = noise;
        if (real && !expected) changed.push({ name, ratio: d.ratio, noise: noise.ratio, box: d.box, geoSame });
        else R.notes.push({ desktopDiff: `${vpName}:${name}`, ratio: d.ratio, noise: noise.ratio, box: d.box, reason: expected || 'same-route HEAD captures differ as much (nondeterministic content)' });
        fs.writeFileSync(path.join(DIFF_DIR, `${vpName}-${name}-head.png`), Buffer.from(h.data, 'base64'));
        fs.writeFileSync(path.join(DIFF_DIR, `${vpName}-${name}-cur.png`), Buffer.from(c.data, 'base64'));
      }
    }
    R.check(`${vpName}: ${Object.keys(DESKTOP).length} desktop routes — shell geometry, breadcrumb and pixels match the pre-redesign build (≤0.05% pixels)`, changed.length === 0, changed);
  }

  // ── 2. Public pages ────────────────────────────────────────────────
  const PUBLIC = { home: '/', about: '/about', ares: '/ares', blog: '/blog', contact: '/contact', outreach: '/outreach', astrousa: '/astrousa', login: '/clubpm/login', rsvp: '/rsvp/e1' };
  for (const vpName of ['p390', 'd1280']) {
    await setViewport(client, VP[vpName]);
    const changed = [];
    for (const [name, route] of Object.entries(PUBLIC)) {
      const h = await snap(client, HEAD, route, { shell: false });
      const c = await snap(client, CUR, route, { shell: false });
      const d = diff(h.data, c.data);
      results.public[`${vpName}:${name}`] = { diff: d, head: h.geo.overflow, cur: c.geo.overflow };
      const expectedPublic = vpName === 'p390' && name === 'login' ? 'phone sign-in layout (Phase 4H): one gutter, full-width sign-in button, scaled wordmark' : null;
      if (d.sizeMismatch || d.ratio > 0.0005) {
        if (expectedPublic) R.notes.push({ publicDiff: `${vpName}:${name}`, ratio: d.ratio, reason: expectedPublic });
        else changed.push({ name, ratio: d.ratio, box: d.box });
        fs.writeFileSync(path.join(DIFF_DIR, `pub-${vpName}-${name}-head.png`), Buffer.from(h.data, 'base64'));
        fs.writeFileSync(path.join(DIFF_DIR, `pub-${vpName}-${name}-cur.png`), Buffer.from(c.data, 'base64'));
      }
    }
    R.check(`${vpName}: public pages + login render the same as the pre-redesign build (first viewport, ≤0.05% pixels)`, changed.length === 0, changed);
  }
  // Theme hygiene: visiting /clubpm then leaving must not leave compact state behind.
  await setViewport(client, VP.p390);
  await go(client, `${CUR}/clubpm`);
  await val(client, `(() => { const a=document.createElement('a'); a.href='/about'; document.body.appendChild(a); })()`);
  await val(client, `window.history.pushState({}, '', '/about'); window.dispatchEvent(new PopStateEvent('popstate'))`);
  await sleep(2000);
  const leak = await val(client, `({ url: location.pathname, marker: document.body.classList.contains('pm-m-compact'), phoneNodes: document.querySelectorAll('.pm-m-nav, .pm-m-header, .pm-m-layer').length, inert: document.getElementById('root')?.hasAttribute('inert'), overflow: document.documentElement.scrollWidth - innerWidth, scrollLocked: getComputedStyle(document.body).overflow })`);
  R.check('public after ClubPM (phone): leaving the app removes body.pm-m-compact, phone nodes, inert and scroll lock', leak.url === '/about' && !leak.marker && leak.phoneNodes === 0 && !leak.inert && leak.scrollLocked !== 'hidden', leak);

  // ── 3. Desktop drag and keyboard shortcuts on both builds ──────────
  await setViewport(client, VP.d1280);
  async function mouseDrag(from, to) {
    const pts = await val(client, `(() => { const f=document.querySelector(${JSON.stringify(from)}); const t=document.querySelector(${JSON.stringify(to)}); if(!f||!t) return null; f.scrollIntoView({block:'center'});
      const a=f.getBoundingClientRect(), b=t.getBoundingClientRect(); return { x1:a.left+a.width/2, y1:a.top+a.height/2, x2:b.left+b.width/2, y2:b.top+Math.min(b.height/2, 60) }; })()`);
    if (!pts) return false;
    const m = (type, x, y, buttons = 1) => client.send('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
    await m('mouseMoved', pts.x1, pts.y1, 0); await m('mousePressed', pts.x1, pts.y1); await sleep(150);
    for (let i = 1; i <= 16; i += 1) { await m('mouseMoved', pts.x1 + ((pts.x2 - pts.x1) * i) / 16, pts.y1 + ((pts.y2 - pts.y1) * i) / 16); await sleep(30); }
    await sleep(200); await m('mouseReleased', pts.x2, pts.y2, 0); await sleep(900);
    return true;
  }
  for (const [label, base] of [['head', HEAD], ['cur', CUR]]) {
    await fixture('reset-log');
    await go(client, `${base}/clubpm/projects/p1`, { waitMs: 2000 });
    const dragged = await mouseDrag('[data-bin-id="TODO"] [aria-roledescription]', '[data-bin-id="IN_PROGRESS"]');
    const taskPatch = Object.entries((await fixture('log')).log).filter(([k]) => /^PATCH \/api\/tasks\//.test(k)).length;
    results[`drag-task-${label}`] = { dragged, taskPatch };
    await fixture('reset-log');
    await go(client, `${base}/clubpm/outreach?tab=board`, { waitMs: 2000 });
    const cols = await val(client, `document.querySelectorAll('.pm-outreach-col-body').length`);
    const card = label === 'head' ? '[data-rfd-draggable-id="s1"]' : '.pm-outreach-col-body [aria-roledescription]';
    await val(client, `(() => { const b=[...document.querySelectorAll('.pm-outreach-col-body')]; b.forEach((e,i)=>e.setAttribute('data-p5-col', i)); })()`);
    const odragged = await mouseDrag(card, '[data-p5-col="1"]');
    const oPatch = (await fixture('log')).log['PATCH /api/outreach/submissions/s1'] || 0;
    results[`drag-outreach-${label}`] = { cols, dragged: odragged, oPatch };
    // Task opened from the Dashboard must close, and the same task must reopen.
    await go(client, `${base}/clubpm`, { waitMs: 1500 });
    const isOpen = () => val(client, `!!document.querySelector('[data-tour-id="task.modal.status"]')`);
    const clickClose = () => val(client, `[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || b.title) === 'Close')?.click()`);
    await val(client, `document.querySelector('.cpm-work-panel .cpm-task-row')?.click()`);
    await waitFor(client, '[data-tour-id="task.modal.status"]');
    const openedFromHome = await isOpen();
    await clickClose(); await sleep(1000);
    const closed = !(await isOpen());
    const openTaskId = await val(client, `new URLSearchParams(location.search).get('task')`);
    await val(client, `document.querySelector('[data-bin-id] [aria-roledescription]')?.click()`);
    await sleep(900);
    const reopened = await isOpen();
    await clickClose(); await sleep(900);
    results[`taskclose-${label}`] = { openedFromHome, closed, openTaskId, reopened, closedAgain: !(await isOpen()) };

    await go(client, `${base}/clubpm`, { waitMs: 1500 });
    await val(client, `document.body.focus()`);
    await key(client, 'g'); await key(client, 'e'); await sleep(900);
    const ge = await url(client);
    await key(client, 'g'); await key(client, 'o'); await sleep(900);
    const go_ = await url(client);
    await key(client, 'k', { mods: 2 }); await sleep(500);
    const palette = await val(client, `!!document.querySelector('.pm-palette-box')`);
    await key(client, 'Escape');
    await key(client, '?', { shift: true }); await sleep(500);
    const help = await val(client, `/shortcut/i.test(document.querySelector('.pm-shortcuts-modal')?.textContent || '')`);
    await key(client, 'Escape');
    const hover = await val(client, `(async () => { const s=document.querySelector('.pm-sidebar'); return Math.round(s.getBoundingClientRect().width); })()`);
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 30, y: 300 }); await sleep(600);
    const hoverOpen = await val(client, `Math.round(document.querySelector('.pm-sidebar').getBoundingClientRect().width)`);
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900, y: 300 }); await sleep(400);
    results[`keys-${label}`] = { ge, go: go_, palette, help, sidebar: [hover, hoverOpen] };
  }
  const same = (k) => JSON.stringify(results[`${k}-head`]) === JSON.stringify(results[`${k}-cur`]);
  R.check('desktop: dragging a task between status bins issues the task PATCH, same as before', results['drag-task-cur'].taskPatch >= 1 && same('drag-task'), { head: results['drag-task-head'], cur: results['drag-task-cur'] });
  R.check('desktop: dragging an Outreach card to another column issues the status PATCH (dnd-kit now; hello-pangea before)', results['drag-outreach-cur'].oPatch === 1 && results['drag-outreach-cur'].cols === 5, { head: results['drag-outreach-head'], cur: results['drag-outreach-cur'] });
  R.check('desktop: a task opened from the Dashboard closes, and a task row reopens detail, same as before (Phase 5 regression fix)',
    same('taskclose') && results['taskclose-cur'].closed && results['taskclose-cur'].reopened && results['taskclose-cur'].closedAgain, { head: results['taskclose-head'], cur: results['taskclose-cur'] });
  R.check('desktop: g e / g o shortcuts, Ctrl+K palette, ? help and sidebar hover expansion behave as before', same('keys') && results['keys-cur'].palette && results['keys-cur'].ge === '/clubpm/calendar', { head: results['keys-head'], cur: results['keys-cur'] });

  // ── 4. Responsiveness and listener counts ──────────────────────────
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__p5long=[]; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__p5long.push(e.duration); }).observe({ type: 'longtask', buffered: true }); } catch {}` });
  async function listenerCount(expr) {
    const { result } = await client.send('Runtime.evaluate', { expression: expr });
    const { listeners } = await client.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
    await client.send('Runtime.releaseObject', { objectId: result.objectId });
    return listeners.length;
  }
  async function measure(base, vpName) {
    await setViewport(client, VP[vpName]);
    const loads = []; const longs = []; const frames = [];
    for (let i = 0; i < 5; i += 1) {
      const t = Date.now();
      await client.send('Page.navigate', { url: 'about:blank' }); await sleep(150);
      await client.send('Page.navigate', { url: `${base}/clubpm/projects/p1` });
      await waitFor(client, 'js:!!document.querySelector(".pm-m-task-row, [data-bin-id] [aria-roledescription]")', 15000);
      loads.push(Date.now() - t);
      await sleep(1500);
      longs.push(await val(client, `(window.__p5long||[]).reduce((a,b)=>a+Math.max(0,b-50),0)`));
      frames.push(await val(client, `new Promise(res => { const sc=document.querySelector('.cpm-proj-main-body') || document.scrollingElement; const ts=[]; let i=0; const step=(t)=>{ ts.push(t); sc.scrollTop += 40; if (++i<40) requestAnimationFrame(step); else { const d=ts.slice(1).map((x,j)=>x-ts[j]); d.sort((a,b)=>a-b); res(d[Math.floor(d.length*0.95)]); } }; requestAnimationFrame(step); })`));
    }
    await go(client, `${base}/clubpm`, { waitMs: 1500 });
    const w0 = await listenerCount('window'); const d0 = await listenerCount('document');
    for (let i = 0; i < 3; i += 1) {
      for (const r of ['/clubpm/chat/C_FIX_GENERAL', '/clubpm/calendar', '/clubpm/projects/p1', '/clubpm']) {
        await val(client, `window.history.pushState({}, '', ${JSON.stringify(r)}); window.dispatchEvent(new PopStateEvent('popstate'))`);
        await sleep(900);
      }
    }
    const w1 = await listenerCount('window'); const d1 = await listenerCount('document');
    const heap = await val(client, `performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576) : null`);
    const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    return { loadMsMedian: med(loads), loads, longTaskBlockingMsMedian: med(longs), scrollP95FrameMsMedian: med(frames), listeners: { window: [w0, w1], document: [d0, d1] }, heapMB: heap };
  }
  await client.send('DOMDebugger.enable').catch(() => {});
  for (const vpName of ['d1280', 'p390']) {
    results.perf[`head-${vpName}`] = await measure(HEAD, vpName);
    results.perf[`cur-${vpName}`] = await measure(CUR, vpName);
  }
  const ph = results.perf['head-d1280']; const pc = results.perf['cur-d1280'];
  R.check('perf (desktop): task-route load and blocking time within 25% (+50 ms) of the pre-redesign build',
    pc.loadMsMedian <= ph.loadMsMedian * 1.25 + 50 && pc.longTaskBlockingMsMedian <= ph.longTaskBlockingMsMedian * 1.25 + 50, { head: ph, cur: pc });
  const leaks = (p) => (p.listeners.window[1] - p.listeners.window[0]) + (p.listeners.document[1] - p.listeners.document[0]);
  R.check('listeners: 12 in-app navigations add no window/document listeners beyond the pre-redesign build (desktop and phone)',
    leaks(pc) <= Math.max(0, leaks(ph)) && leaks(results.perf['cur-p390']) <= Math.max(0, leaks(results.perf['head-p390'])) + 0, { head: [ph.listeners, results.perf['head-p390'].listeners], cur: [pc.listeners, results.perf['cur-p390'].listeners] });
  R.notes.push({ perf: results.perf });

  R.write({ results });
} finally {
  await closeAll(close);
}
