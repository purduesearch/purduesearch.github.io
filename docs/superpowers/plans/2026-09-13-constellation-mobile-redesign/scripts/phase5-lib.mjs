// Shared helpers for the Phase 5 browser checks.
//
// Emulation only: Chromium viewport/touch emulation against the fixture API.
// Nothing here is real-device, real-account, or screen-reader evidence.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from './cdp.mjs';

export { sleep };
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const OUT = path.resolve(HERE, '../evidence/phase5');
export const API = process.env.FIXTURE_URL || 'http://localhost:3001';
fs.mkdirSync(OUT, { recursive: true });

export const VP = {
  p320: { width: 320, height: 640, mobile: true },
  p360: { width: 360, height: 740, mobile: true },
  p390: { width: 390, height: 844, mobile: true },
  p430: { width: 430, height: 932, mobile: true },
  l667: { width: 667, height: 375, mobile: true },   // short landscape (iPhone SE class)
  l844: { width: 844, height: 390, mobile: true },   // landscape (iPhone 14 class)
  x767: { width: 767, height: 900, mobile: false },  // narrow desktop window, mouse
  x768: { width: 768, height: 1024, mobile: true },  // portrait tablet, touch
  t1024: { width: 1024, height: 768, mobile: true }, // landscape tablet, touch
  d1280: { width: 1280, height: 800, mobile: false },
  d1440: { width: 1440, height: 900, mobile: false },
};

export function makeReport(name) {
  const checks = [];
  const screenshots = [];
  const consoleErrors = [];
  const notes = [];
  return {
    checks, screenshots, consoleErrors, notes,
    check(label, pass, detail = '') {
      checks.push({ name: label, pass: Boolean(pass), detail });
      const d = detail === '' ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
      console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${d.slice(0, 2500)}`);
    },
    async shot(client, file) {
      const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, `${file}.png`), Buffer.from(data, 'base64'));
      screenshots.push(`evidence/phase5/${file}.png`);
      return data;
    },
    write(extra = {}) {
      const summary = { passed: checks.filter((c) => c.pass).length, failed: checks.filter((c) => !c.pass).length, total: checks.length };
      const report = {
        generatedAt: new Date().toISOString(),
        note: 'Chromium viewport/touch emulation against fixture data (production build unless stated). Not real iOS/Android, real-account, software-keyboard, or screen-reader evidence.',
        summary, checks, screenshots, notes, consoleErrors: [...new Set(consoleErrors)], ...extra,
      };
      fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(report, null, 2));
      console.log(`\n${summary.passed}/${summary.total} passed; ${summary.failed} failed. Report: evidence/phase5/${name}.json`);
      if (summary.failed) process.exitCode = 1;
      return report;
    },
  };
}

export async function fixture(query) { return (await fetch(`${API}/__fixture/${query}`)).json(); }

export const SEED = `try { localStorage.setItem('clubpm_auth_token','fixture-token'); sessionStorage.setItem('cpm.bell.greeted','1'); localStorage.setItem('clubpm-last-seen-rank','CELESTIAL'); } catch {}`;

export async function start(report, { port = 9240, seed = SEED } = {}) {
  // A leftover headless Chrome on this port would be driven instead of ours.
  const stale = await fetch(`http://127.0.0.1:${port}/json/version`).then(() => true, () => false);
  if (stale) throw new Error(`CDP port ${port} is already in use by another Chrome; close it first`);
  const { client, close } = await launchChrome({ port });
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  client.on('Runtime.exceptionThrown', (p) => report.consoleErrors.push(p.exceptionDetails?.exception?.description?.split('\n')[0] ?? 'exception'));
  client.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') report.consoleErrors.push(String(p.args?.[0]?.value ?? p.args?.[0]?.description ?? '').split('\n')[0].slice(0, 200)); });
  if (seed) await client.send('Page.addScriptToEvaluateOnNewDocument', { source: seed });
  return { client, close };
}

export async function setViewport(client, vp) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile,
    screenWidth: vp.width, screenHeight: vp.height,
    screenOrientation: vp.width > vp.height ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 },
  });
  await client.send('Emulation.setTouchEmulationEnabled', vp.mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  await client.send('Emulation.setEmulatedMedia', { features: vp.mobile
    ? [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }, { name: 'any-hover', value: 'none' }]
    : [{ name: 'pointer', value: 'fine' }, { name: 'hover', value: 'hover' }] });
}

// A client-side redirect can race Page.navigate ("Inspected target navigated or
// closed"); retry instead of aborting a 20-minute run.
async function navigate(client, target) {
  for (let i = 0; i < 4; i += 1) {
    try { await client.send('Page.navigate', { url: target }); return; } catch (err) {
      if (i === 3) throw err;
      await sleep(400);
    }
  }
}

export async function go(client, url, { shell = true, waitMs = 1400 } = {}) {
  await navigate(client, 'about:blank');
  await sleep(150);
  await navigate(client, url);
  for (let i = 0; i < 70; i += 1) {
    await sleep(200);
    const ready = await client.eval(shell
      ? `document.readyState === 'complete' && !!document.querySelector('.pm-shell')`
      : `document.readyState === 'complete'`).catch(() => false);
    if (ready) break;
  }
  await sleep(waitMs);
}

export async function waitFor(client, expr, ms = 8000) {
  const js = expr.startsWith('js:') ? expr.slice(3) : `!!document.querySelector(${JSON.stringify(expr)})`;
  for (let i = 0; i < ms / 150; i += 1) {
    if (await client.eval(js).catch(() => false)) return true;
    await sleep(150);
  }
  return false;
}

// Real touch at the element's centre, after checking it is the hit target.
export async function tap(client, selector, { text } = {}) {
  await waitFor(client, text ? `js:[...document.querySelectorAll(${JSON.stringify(selector)})].some(e => e.textContent.includes(${JSON.stringify(text)}))` : selector);
  const pt = await client.eval(`(() => {
    const all = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const el = ${text ? `all.find(e => e.textContent.includes(${JSON.stringify(text)}))` : 'all[0]'};
    if (!el) return null;
    el.scrollIntoView({ block: 'nearest' });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const at = document.elementFromPoint(x, y);
    return { x, y, hit: !!at && (at === el || el.contains(at)), covered: at && !(at === el || el.contains(at)) ? (at.className || at.tagName).toString().slice(0, 60) : null };
  })()`);
  if (!pt) throw new Error(`tap: no element for ${selector}${text ? ` (${text})` : ''}`);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(pt.x), y: Math.round(pt.y) }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(550);
  return pt;
}

export async function key(client, k, { mods = 0, shift = false } = {}) {
  const codes = { Escape: 27, Tab: 9, Enter: 13, ArrowDown: 40, ArrowUp: 38, ' ': 32 };
  const modifiers = mods | (shift ? 8 : 0);
  const code = k.length === 1 ? (k === ' ' ? 'Space' : `Key${k.toUpperCase()}`) : k;
  const vk = codes[k] ?? k.toUpperCase().charCodeAt(0);
  await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, modifiers, windowsVirtualKeyCode: vk });
  if (k === 'Enter' || k === ' ') await client.send('Input.dispatchKeyEvent', { type: 'char', key: k, text: k === 'Enter' ? '\r' : ' ', modifiers });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers, windowsVirtualKeyCode: vk });
  await sleep(220);
}

export async function typeText(client, text) {
  await client.send('Input.insertText', { text });
  await sleep(250);
}

// React-safe value setter for inputs/textareas.
export async function fill(client, selector, value) {
  const ok = await client.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.focus();
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  if (!ok) throw new Error(`fill: no element for ${selector}`);
  await sleep(250);
}

export const val = (client, expr) => client.eval(expr);
export const url = (client) => client.eval('location.pathname + location.search');
export const visible = (client, selector) => client.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return false;
  const r = e.getBoundingClientRect(), s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; })()`);
export const back = async (client, ms = 700) => { await client.eval('history.back()'); await sleep(ms); };
export const forward = async (client, ms = 700) => { await client.eval('history.forward()'); await sleep(ms); };
export const reload = async (client, ms = 1600) => {
  await client.send('Page.reload', { ignoreCache: false });
  for (let i = 0; i < 60; i += 1) { await sleep(200); if (await client.eval(`document.readyState === 'complete' && !!document.querySelector('.pm-shell')`).catch(() => false)) break; }
  await sleep(ms);
};

// One DOM snapshot of shell facts used by the matrix.
export const SHELL = `(() => {
  const vw = innerWidth, vh = innerHeight;
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
  const vis = (el) => { if (!el) return false; const b = el.getBoundingClientRect(), s = getComputedStyle(el); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const hit = (el) => { const b = el.getBoundingClientRect(); const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!at && (at === el || el.contains(at)); };
  const nav = document.querySelector('.pm-m-nav');
  const items = nav ? [...nav.querySelectorAll('.pm-m-nav-item')] : [];
  const header = document.querySelector('.pm-m-header');
  const ids = [...document.querySelectorAll('[data-tour-id]')].map((n) => n.getAttribute('data-tour-id'));
  const headerCtl = header ? [...header.querySelectorAll('button, a')].filter(vis) : [];
  // Controls that are visible in the viewport and too small for touch.
  const small = [...document.querySelectorAll('.pm-m-nav-item, .pm-m-header button, .pm-m-header a, .pm-m-section-btn')]
    .filter(vis).filter((e) => { const b = e.getBoundingClientRect(); return b.height < 44 || b.width < 44; })
    .map((e) => (e.getAttribute('aria-label') || e.textContent).trim().slice(0, 30));
  const content = document.querySelector('.pm-shell-content');
  return {
    url: location.pathname + location.search,
    modal: !!document.querySelector('[role="dialog"][aria-modal="true"]'),
    compact: !!document.querySelector('.pm-shell.pm-shell--compact'),
    bodyMarker: document.body.classList.contains('pm-m-compact'),
    sidebar: vis(document.querySelector('.pm-sidebar')),
    topbar: vis(document.querySelector('.pm-topbar')),
    overflowX: Math.max(0, document.documentElement.scrollWidth - vw),
    navCount: items.length,
    navLabels: items.map((e) => e.textContent.trim()),
    navCurrent: items.filter((e) => e.getAttribute('aria-current')).map((e) => e.textContent.trim()),
    navHit: items.every(hit),
    navInView: items.every((e) => { const b = e.getBoundingClientRect(); return b.left >= -0.5 && b.right <= vw + 0.5 && b.bottom <= vh + 0.5 && b.top >= 0; }),
    navTruncated: items.filter((e) => [...e.querySelectorAll('*')].some((c) => c.scrollWidth > c.clientWidth + 1 && getComputedStyle(c).overflow !== 'visible')).map((e) => e.textContent.trim()),
    navTop: nav ? Math.round(nav.getBoundingClientRect().top) : null,
    headerTitle: (header?.querySelector('.pm-m-title')?.textContent || '').trim(),
    headerHit: headerCtl.every(hit),
    small,
    contentWidth: content ? Math.round(content.getBoundingClientRect().width) : null,
    duplicateTourIds: [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))],
    errorBoundary: /something went wrong/i.test(document.body.innerText),
    notFound: /page not found|404/i.test(document.querySelector('main, #root')?.innerText?.slice(0, 400) || '') && !document.querySelector('.pm-shell'),
    bodyText: document.body.innerText.length,
  };
})()`;

export async function closeAll(close) { try { await close(); } catch { /* gone */ } }
