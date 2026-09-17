// Phase 0 supplementary captures of the PRODUCTION app (fixture API):
//   - the 767/768 boundary and tablet sizes (desktop presentation must stay usable there);
//   - admin persona sidebar (Other › Admin + badges) with the rank-up celebration dismissed;
//   - the expanded sidebar at desktop (mouse hover) and on a phone (touch tap → sticky hover).
// Usage: same servers as capture-baselines.mjs. Output: ../evidence/browser/x-*.png + metrics-extras.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from './cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../evidence/browser');
const APP = process.env.APP_URL || 'http://localhost:3000';
const API = process.env.FIXTURE_URL || 'http://localhost:3001';
const fixture = async (q) => (await fetch(`${API}/__fixture/${q}`)).json();

const { client, close } = await launchChrome({ port: 9224 });
const js = (e) => client.eval(e);
const rows = [];

async function vp(w, h, touch) {
  await client.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: touch, screenWidth: w, screenHeight: h });
  await client.send('Emulation.setTouchEmulationEnabled', touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
}
async function go(url) {
  await client.send('Page.navigate', { url: 'about:blank' });
  await sleep(300);
  await client.send('Page.navigate', { url });
  for (let i = 0; i < 60; i += 1) { await sleep(250); if (await js(`!!document.querySelector('.pm-shell')`).catch(() => false)) break; }
  await sleep(2500);
}
async function shot(name, note) {
  const m = await js(`(() => ({ url: location.pathname + location.search, innerWidth, deviceWidth: screen.width,
    layoutWiderThanDevice: Math.max(0, document.documentElement.scrollWidth - screen.width),
    sidebar: (() => { const r = document.querySelector('.pm-sidebar')?.getBoundingClientRect(); return r ? Math.round(r.width) : null; })(),
    projectMain: (() => { const r = document.querySelector('.cpm-project-main')?.getBoundingClientRect(); return r ? Math.round(r.width) : null; })(),
    topbarActionsRight: (() => { const r = document.querySelector('.pm-topbar-actions')?.getBoundingClientRect(); return r ? Math.round(r.right) : null; })(),
  }))()`);
  const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  rows.push({ name, note, file: `evidence/browser/${name}.png`, ...m });
  console.log(name.padEnd(36), JSON.stringify(m));
}
async function touchTap(sel) {
  const p = await js(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(700);
}

try {
  await client.send('Page.enable');
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('clubpm_auth_token', 'fixture-token'); sessionStorage.setItem('cpm.bell.greeted', '1'); } catch {}` });
  await fixture('state?persona=member&projects=few');

  for (const [w, h, touch, tag] of [[767, 1024, false, 'x767-mouse'], [768, 1024, true, 'x768-tablet'], [1024, 768, true, 'x1024-tablet']]) {
    await vp(w, h, touch);
    for (const [route, name] of [['/clubpm', 'home'], ['/clubpm/projects/p1', 'tasks'], ['/clubpm/chat/C_FIX_GENERAL', 'conversation']]) {
      await go(APP + route);
      await shot(`${tag}-${name}`, `${w}x${h} ${touch ? 'touch' : 'mouse'}`);
    }
  }

  // Admin persona. Switching persona raises the rank, so RankUpModal fires first.
  await fixture('state?persona=admin&projects=many');
  for (const [w, h, touch, tag] of [[1440, 900, false, 'x1440-admin'], [390, 844, true, 'x390-admin']]) {
    await vp(w, h, touch);
    await go(`${APP}/clubpm`);
    await shot(`${tag}-rankup-celebration`, 'RankUpModal after persona switch (reward overlay evidence)');
    await js(`(() => { const b = [...document.querySelectorAll('button')].find(x => /continue/i.test(x.textContent)); b && b.click(); })()`);
    await sleep(800);
    if (touch) {
      await touchTap('[data-tour-id="nav.other"]');
      await shot(`${tag}-sidebar-after-tap-other`, 'Tap on the collapsed rail: sticky :hover expands it over content; Other group opens');
    } else {
      await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 30, y: 300 });
      await sleep(500);
      await js(`document.querySelector('[data-tour-id="nav.other"]').click()`);
      await sleep(600);
      await shot(`${tag}-sidebar-hover-other`, 'Mouse hover expands the rail to 220px; Other › Admin with badges');
    }
  }
  await fixture('state?persona=member&projects=few');
  fs.writeFileSync(path.join(OUT, 'metrics-extras.json'), JSON.stringify({ generatedAt: new Date().toISOString(), api: `${API} (FIXTURE)`, captures: rows }, null, 2));
} finally {
  await close();
}
