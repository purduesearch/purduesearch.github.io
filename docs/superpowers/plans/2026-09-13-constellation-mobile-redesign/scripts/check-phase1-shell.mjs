// Phase 1 browser checks: the PRODUCTION shell (npm start on :3000, fixture API
// on :3001 — never the real backend) at phone, boundary and desktop viewports.
//
// Usage (repo root, both servers running — see ../README.md):
//   node docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/scripts/check-phase1-shell.mjs
// Output: ../evidence/phase1/*.png and ../evidence/phase1/report.json
//
// Emulation only. Nothing here is a real-device, real-account or screen-reader
// result; the report says so.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from './cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../evidence/phase1');
const BASELINE = path.resolve(HERE, '../evidence/browser/metrics.json');
const APP = process.env.APP_URL || 'http://localhost:3000';
const API = process.env.FIXTURE_URL || 'http://localhost:3001';
fs.mkdirSync(OUT, { recursive: true });

const VP = {
  d1440: { width: 1440, height: 900, mobile: false },
  d1280: { width: 1280, height: 800, mobile: false },
  x768: { width: 768, height: 1024, mobile: true },   // touch tablet at the boundary → desktop
  x767: { width: 767, height: 900, mobile: false },   // narrow mouse window → compact
  p390: { width: 390, height: 844, mobile: true },
  p320: { width: 320, height: 640, mobile: true },
  l844: { width: 844, height: 390, mobile: true },    // short landscape phone → compact
  l1024: { width: 1024, height: 480, mobile: true },  // just outside the landscape clause → desktop
};

const checks = [];
const shots = [];
const consoleErrors = [];
function check(name, pass, detail = '') {
  checks.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
}

async function fixture(q) { return (await fetch(`${API}/__fixture/${q}`)).json(); }

async function setViewport(client, vp) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile,
    screenWidth: vp.width, screenHeight: vp.height,
    screenOrientation: vp.width > vp.height ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 },
  });
  await client.send('Emulation.setTouchEmulationEnabled', vp.mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  // Touch emulation alone does not flip (pointer)/(hover) media features.
  await client.send('Emulation.setEmulatedMedia', {
    features: vp.mobile
      ? [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }, { name: 'any-hover', value: 'none' }]
      : [{ name: 'pointer', value: 'fine' }, { name: 'hover', value: 'hover' }],
  });
}

async function go(client, url, waitMs = 2200) {
  await client.send('Page.navigate', { url: 'about:blank' });
  await sleep(250);
  await client.send('Page.navigate', { url });
  for (let i = 0; i < 60; i += 1) {
    await sleep(250);
    const ready = await client.eval(`document.readyState === 'complete' && !!document.querySelector('.pm-shell')`).catch(() => false);
    if (ready) break;
  }
  await sleep(waitMs);
}

async function shot(client, name) {
  const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  shots.push(`evidence/phase1/${name}.png`);
}

async function waitFor(client, selector, ms = 8000) {
  for (let i = 0; i < ms / 200; i += 1) {
    if (await client.eval(`!!document.querySelector(${JSON.stringify(selector)})`).catch(() => false)) return true;
    await sleep(200);
  }
  return false;
}

async function tap(client, selector) {
  await waitFor(client, selector);
  const pt = await client.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null;
    el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!pt) throw new Error(`tap: no element for ${selector}`);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(pt.x), y: Math.round(pt.y) }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(600);
}

async function key(client, k, mods = 0) {
  const code = k.length === 1 ? `Key${k.toUpperCase()}` : k;
  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, modifiers: mods, windowsVirtualKeyCode: k === 'Escape' ? 27 : k === 'Tab' ? 9 : k.toUpperCase().charCodeAt(0) });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers: mods });
  await sleep(300);
}

// Everything measured from the live DOM.
const SHELL = `(() => {
  const vw = Math.min(innerWidth, screen.width), vh = innerHeight;
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { left: Math.round(b.left), top: Math.round(b.top), width: Math.round(b.width), height: Math.round(b.height) }; };
  const nav = document.querySelector('.pm-m-nav');
  const items = nav ? [...nav.querySelectorAll('.pm-m-nav-item')] : [];
  const hit = (el) => { const b = el.getBoundingClientRect(); const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!at && (at === el || el.contains(at)); };
  const header = document.querySelector('.pm-m-header');
  const headerBtns = header ? [...header.querySelectorAll('button, a')] : [];
  const ids = [...document.querySelectorAll('[data-tour-id]')].map((n) => n.getAttribute('data-tour-id'));
  return {
    url: location.pathname + location.search,
    compactClass: !!document.querySelector('.pm-shell.pm-shell--compact'),
    sidebar: r(document.querySelector('.pm-sidebar')),
    topbar: r(document.querySelector('.pm-topbar')),
    shellMain: r(document.querySelector('.pm-shell-main')),
    breadcrumb: (document.querySelector('.pm-breadcrumb')?.textContent || '').trim(),
    layoutWiderThanDevice: Math.max(0, document.documentElement.scrollWidth - screen.width),
    docOverflowX: document.documentElement.scrollWidth - vw,
    nav: r(nav),
    navItems: items.map((el) => ({ label: el.textContent.trim(), rect: r(el), current: el.getAttribute('aria-current'), expanded: el.getAttribute('aria-expanded'), hit: hit(el) })),
    navInViewport: items.every((el) => { const b = el.getBoundingClientRect(); return b.left >= 0 && b.right <= vw + 0.5 && b.bottom <= vh + 0.5 && b.top >= 0; }),
    labelsTruncated: items.filter((el) => { const s = el.querySelector('span'); return s && s.scrollWidth > s.clientWidth + 1; }).map((el) => el.textContent.trim()),
    headerTitle: (header?.querySelector('.pm-m-title')?.textContent || '').trim(),
    headerBtns: headerBtns.map((el) => ({ label: el.getAttribute('aria-label') || el.textContent.trim(), rect: r(el), hit: hit(el) })),
    sections: [...document.querySelectorAll('.pm-m-section-btn')].map((el) => ({ label: el.textContent.trim(), rect: r(el), current: el.getAttribute('aria-current'), hit: hit(el) })),
    content: r(document.querySelector('.pm-shell-content')),
    duplicateTourIds: ids.filter((id, i) => ids.indexOf(id) !== i),
    dialogs: [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].map((d) => d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.textContent),
    rootInert: document.getElementById('root')?.hasAttribute('inert'),
    active: (() => { const a = document.activeElement; return a ? (a.getAttribute('aria-label') || a.textContent || a.tagName).trim().slice(0, 40) : null; })(),
    errorBoundary: /something went wrong/i.test(document.body.innerText),
  };
})()`;
const m = (client) => client.eval(SHELL);

const small = (list) => list.filter((x) => x.rect && (x.rect.width < 44 || x.rect.height < 44)).map((x) => `${x.label} ${x.rect.width}x${x.rect.height}`);

const { client, close } = await launchChrome({ port: 9231 });
const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')).captures : [];
const baseOf = (name) => baseline.find((c) => c.name === name);
const log = {};
try {
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  client.on('Runtime.exceptionThrown', (p) => consoleErrors.push(p.exceptionDetails?.exception?.description?.split('\n')[0] ?? 'exception'));
  client.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') consoleErrors.push(String(p.args?.[0]?.value ?? p.args?.[0]?.description ?? '').split('\n')[0].slice(0, 200)); });
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('clubpm_auth_token', 'fixture-token'); sessionStorage.setItem('cpm.bell.greeted', '1'); localStorage.setItem('clubpm-last-seen-rank', 'CELESTIAL'); } catch {}` });
  // (The rank seed keeps the rank-up celebration — a modal that correctly covers the bar — out of persona switches.)
  await fixture('state?persona=member&projects=few&failProjects=0');

  // ── 1. Which shell mounts at each viewport (contracts.md §1) ──
  const expectCompact = { d1440: false, d1280: false, x768: false, x767: true, p390: true, p320: true, l844: true, l1024: false };
  for (const [name, compact] of Object.entries(expectCompact)) {
    await setViewport(client, VP[name]);
    await go(client, `${APP}/clubpm`);
    const s = await m(client);
    check(`${name}: ${compact ? 'compact' : 'desktop'} shell mounts`, s.compactClass === compact && (!!s.sidebar) === !compact, { compactClass: s.compactClass, sidebar: !!s.sidebar });
    check(`${name}: no duplicate tour ids`, s.duplicateTourIds.length === 0, s.duplicateTourIds);
  }

  // ── 2. Desktop equivalence with the Phase 0 baseline ──
  const DESKTOP_ROUTES = { home: '/clubpm', tasks: '/clubpm/projects/p1', chatlist: '/clubpm/chat', members: '/clubpm/members', calendar: '/clubpm/calendar', notifications: '/clubpm/notifications' };
  for (const vpName of ['d1440', 'd1280']) {
    await setViewport(client, VP[vpName]);
    for (const [routeName, route] of Object.entries(DESKTOP_ROUTES)) {
      await go(client, APP + route);
      const s = await m(client);
      await shot(client, `${vpName}-${routeName}`);
      const b = baseOf(`${vpName}-${routeName}`);
      const same = b && JSON.stringify([b.sidebar, b.topbar, b.shellMain, b.breadcrumb]) === JSON.stringify([s.sidebar, s.topbar, s.shellMain, s.breadcrumb]);
      check(`${vpName}-${routeName}: sidebar/topbar/main rects + breadcrumb equal Phase 0`, same,
        same ? '' : { baseline: b && [b.sidebar, b.topbar, b.shellMain, b.breadcrumb], now: [s.sidebar, s.topbar, s.shellMain, s.breadcrumb] });
    }
  }
  await setViewport(client, VP.d1280);
  await go(client, `${APP}/clubpm`);
  await key(client, 'k', 2 /* Ctrl */);
  const deskPalette = await client.eval(`!!document.querySelector('.pm-palette-box') && !document.querySelector('.pm-m-layer')`);
  check('d1280: Ctrl+K opens the unchanged desktop palette box', deskPalette);
  await key(client, 'Escape');

  // ── 3. Phone route matrix ──
  const PHONE_ROUTES = {
    home: ['/clubpm', 'Home', 'Home', false],
    tasks: ['/clubpm/projects/p1', 'Projects', null, false],
    chatlist: ['/clubpm/chat', 'Chat', 'Chat', false],
    conversation: ['/clubpm/chat/C_FIX_GENERAL', 'Chat', 'Conversation', true],
    members: ['/clubpm/members', 'Chat', 'People & DMs', true],
    calendar: ['/clubpm/calendar', 'Calendar', 'Calendar', false],
    notifications: ['/clubpm/notifications', 'More', 'Notifications', true],
    prefs: ['/clubpm/notifications/preferences', 'More', 'Notification preferences', true],
    profile: ['/clubpm/profile', 'More', 'Profile', true],
    courses: ['/clubpm/courses', 'More', 'Courses', true],
    outreach: ['/clubpm/outreach', 'More', 'Outreach Hub', true],
    gantt: ['/clubpm/projects/p1/gantt', 'Projects', 'Timeline', true],
  };
  for (const vpName of ['p390', 'p320', 'l844']) {
    await setViewport(client, VP[vpName]);
    for (const [routeName, [route, current, title0, back0]] of Object.entries(PHONE_ROUTES)) {
      let title = title0; let back = back0;
      if (vpName !== 'p390' && !['home', 'tasks', 'chatlist', 'conversation', 'calendar'].includes(routeName)) continue;
      await go(client, APP + route);
      const s = await m(client);
      await shot(client, `${vpName}-${routeName}`);
      const cur = s.navItems.filter((i) => i.current === 'page');
      const tag = `${vpName}-${routeName}`;
      check(`${tag}: 5 labelled items, all in view, all hit-testable`, s.navItems.length === 5 && s.navInViewport && s.navItems.every((i) => i.hit) && s.labelsTruncated.length === 0,
        { n: s.navItems.length, inView: s.navInViewport, missed: s.navItems.filter((i) => !i.hit).map((i) => i.label), truncated: s.labelsTruncated });
      check(`${tag}: exactly one current item (${current})`, cur.length === 1 && cur[0].label === current, cur.map((i) => i.label));
      check(`${tag}: no page-wide horizontal overflow`, s.layoutWiderThanDevice === 0 && s.docOverflowX <= 0, { wider: s.layoutWiderThanDevice, docOverflowX: s.docOverflowX });
      check(`${tag}: bottom bar and header targets ≥44px`, small(s.navItems).length === 0 && small(s.headerBtns).length === 0, [...small(s.navItems), ...small(s.headerBtns)]);
      // /clubpm/chat still auto-opens the first channel (Phase 3, Q2, changes that on
      // phones), so the landing URL decides which header is correct.
      const redirected = routeName === 'chatlist' && s.url.startsWith('/clubpm/chat/');
      if (redirected) { title = 'Conversation'; back = true; }
      if (title) check(`${tag}: header title "${title}"${redirected ? ' (auto-opened channel)' : ''}`, s.headerTitle === title, s.headerTitle);
      check(`${tag}: Back ${back ? 'shown' : 'absent'}`, s.headerBtns.some((b) => b.label === 'Back') === back);
      check(`${tag}: no duplicate tour ids, no error boundary`, s.duplicateTourIds.length === 0 && !s.errorBoundary, s.duplicateTourIds);
      if (routeName === 'tasks') {
        check(`${tag}: four project sections from ProjectNavContext`, JSON.stringify(s.sections.map((x) => x.label)) === '["Tasks","Files","Chat","Insights"]' && s.sections.every((x) => x.hit), s.sections.map((x) => `${x.label}:${x.rect.width}x${x.rect.height}`));
        check(`${tag}: header is the project switch`, s.headerBtns.some((b) => /switch project/.test(b.label)), s.headerBtns.map((b) => b.label));
      }
    }
  }

  // ── 4. Phone interactions (touch, p390) ──
  await setViewport(client, VP.p390);
  await go(client, `${APP}/clubpm/calendar`);
  await tap(client, '[data-tour-id="nav.more"]');
  let s = await m(client);
  await shot(client, 'p390-more-sheet');
  const moreRows = await client.eval(`[...document.querySelectorAll('.pm-m-layer .pm-m-row')].map((r) => r.textContent.trim())`);
  check('More: opens as a modal sheet; More expanded; Calendar still current; app inert', s.dialogs.includes('More') && s.navItems.find((i) => i.label === 'More').expanded === 'true'
    && s.navItems.find((i) => i.current === 'page')?.label === 'Calendar' && s.rootInert, { dialogs: s.dialogs, inert: s.rootInert });
  check('More: focus starts on the sheet heading', s.active === 'More', s.active);
  const wanted = ['Profile', 'Quests & achievements', 'Shop', 'People & DMs', 'Notification Center', 'Notification preferences', 'Outreach Hub', 'Blog', 'Courses', 'Keyboard shortcuts', 'Main site', 'Sign out'];
  check('More (member): every destination present, no Admin', wanted.every((w) => moreRows.some((r) => r.startsWith(w))) && !moreRows.some((r) => r.startsWith('Admin')), moreRows);
  const rowHits = await client.eval(`(() => { const rows = [...document.querySelectorAll('.pm-m-layer .pm-m-row')];
    return rows.map((el) => { el.scrollIntoView({ block: 'nearest' }); const b = el.getBoundingClientRect(); const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return { label: el.textContent.trim().slice(0, 30), h: Math.round(b.height), hit: !!at && el.contains(at) }; }); })()`);
  check('More: every row hit-testable and ≥44px tall', rowHits.every((r) => r.hit && r.h >= 44), rowHits.filter((r) => !r.hit || r.h < 44));
  await client.eval('history.back()');
  await sleep(700);
  s = await m(client);
  check('Back closes the More sheet and stays on Calendar', s.dialogs.length === 0 && s.url === '/clubpm/calendar' && !s.rootInert, { url: s.url, dialogs: s.dialogs });
  await client.eval('history.forward()');
  await sleep(700);
  s = await m(client);
  check('Forward reopens the More sheet (Q10: reopen)', s.dialogs.includes('More'));
  await tap(client, '.pm-m-layer a[href="/clubpm/shop"]');
  await sleep(1500);
  s = await m(client);
  check('Choosing Shop in More navigates and closes the sheet', s.url === '/clubpm/shop' && s.dialogs.length === 0, s.url);
  await client.eval('history.back()');
  await sleep(1800);
  s = await m(client);
  check('Back from Shop returns to Calendar (sheet entry was replaced)', s.url === '/clubpm/calendar' && s.dialogs.length === 0, s.url);

  // Escape (hardware keyboard) closes the top sheet and returns focus to More.
  await tap(client, '[data-tour-id="nav.more"]');
  await key(client, 'Escape');
  s = await m(client);
  check('Escape closes the sheet; focus returns to the More button', s.dialogs.length === 0 && s.active === 'More', s.active);

  // More › Keyboard shortcuts: the sheet closes and the existing help modal opens.
  await tap(client, '[data-tour-id="nav.more"]');
  await client.eval(`[...document.querySelectorAll('.pm-m-layer .pm-m-row')].find((r) => r.textContent.includes('Keyboard shortcuts')).click()`);
  await sleep(900);
  const help = await client.eval(`({ modal: !!document.querySelector('.pm-shortcuts-modal'), sheet: !!document.querySelector('.pm-m-layer'), url: location.pathname })`);
  check('More › Keyboard shortcuts closes the sheet and opens the shortcuts modal', help.modal && !help.sheet && help.url === '/clubpm/calendar', help);
  await client.eval(`document.querySelector('.pm-shortcuts-backdrop')?.click()`);
  await sleep(400);

  // Projects sheet: list, search not auto-focused, choose a project.
  await tap(client, '[data-tour-id="nav.projects"]');
  s = await m(client);
  await shot(client, 'p390-projects-sheet');
  const projRows = await client.eval(`[...document.querySelectorAll('[data-tour-id="projects.sheet"] .pm-m-row')].map((r) => r.textContent.trim())`);
  check('Projects: sheet lists the projects; search field not focused', s.dialogs.includes('Projects') && projRows.length > 0 && s.active === 'Projects', { rows: projRows.length, active: s.active });
  await tap(client, '[data-tour-id="projects.sheet"] .pm-m-row');
  await sleep(2000);
  s = await m(client);
  check('Projects: choosing one opens its existing URL', /^\/clubpm\/projects\/p\d/.test(s.url) && s.dialogs.length === 0, s.url);
  const projectUrl = s.url;
  await tap(client, '[data-tour-id="project.tab.files"]');
  await sleep(1200);
  s = await m(client);
  check('Project sections: Files switches ?tab=files and marks it current', /tab=files/.test(s.url) && s.sections.find((x) => x.current === 'page')?.label === 'Files', s.url);
  await client.eval('history.back()');
  await sleep(1800);
  s = await m(client);
  check('Back after a section switch leaves the project (replace — desktop parity)', s.url === '/clubpm/calendar', s.url);

  // Project title → picker with project actions (Timeline).
  await go(client, `${APP}${projectUrl}`);
  await tap(client, '[data-m-opener="project-title"]');
  s = await m(client);
  await shot(client, 'p390-project-sheet-actions');
  const actions = await client.eval(`[...document.querySelectorAll('.pm-m-layer section .pm-m-row')].map((r) => r.textContent.trim())`);
  check('Project title opens the picker with This project actions', s.dialogs.includes('Projects') && actions.includes('Timeline (Gantt)') && actions.some((a) => /Pin project|Unpin project/.test(a)), actions);
  await client.eval(`[...document.querySelectorAll('.pm-m-layer section .pm-m-row')].find((r) => r.textContent.includes('Timeline')).click()`);
  await sleep(1800);
  s = await m(client);
  check('Timeline action opens the Gantt route (no entry point existed before)', /\/gantt$/.test(s.url), s.url);

  // Search: full-screen, focused field, Back closes.
  await go(client, `${APP}/clubpm`);
  await tap(client, '[data-m-opener="search"]');
  s = await m(client);
  await shot(client, 'p390-search');
  const searchLayer = await client.eval(`(() => { const d = document.querySelector('.pm-m-layer--palette .pm-m-dialog'); if (!d) return null; const b = d.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), focused: document.activeElement?.classList.contains('pm-palette-input') }; })()`);
  check('Search: full-screen dialog with the field focused', searchLayer && searchLayer.w === 390 && searchLayer.h === 844 && searchLayer.focused, searchLayer);
  await client.eval('history.back()');
  await sleep(700);
  s = await m(client);
  check('Back closes Search', s.dialogs.length === 0 && ['/clubpm', '/clubpm/'].includes(s.url), { url: s.url, dialogs: s.dialogs });

  // Bell links to the Notification Center.
  await tap(client, '[data-tour-id="topbar.notifications"]');
  await sleep(1500);
  s = await m(client);
  check('Bell opens the Notification Center page', s.url === '/clubpm/notifications' && s.navItems.find((i) => i.current === 'page')?.label === 'More', s.url);

  // ── 5. Picker failure + Retry ──
  await fixture('state?failProjects=1');
  await go(client, `${APP}/clubpm`);
  await tap(client, '[data-tour-id="nav.projects"]');
  const errText = await client.eval(`document.querySelector('.pm-m-layer [role="alert"]')?.textContent || ''`);
  await shot(client, 'p390-projects-error');
  check('Projects: a failed load shows an error with Retry', /didn.t load/i.test(errText) && /Retry/.test(errText), errText);
  await fixture('state?failProjects=0');
  await tap(client, '.pm-m-layer [role="alert"] button');
  await sleep(1200);
  const afterRetry = await client.eval(`document.querySelectorAll('[data-tour-id="projects.sheet"] .pm-m-row').length`);
  check('Projects: Retry recovers the list', afterRetry > 0, afterRetry);

  // ── 6. Admin persona: Admin row with badges ──
  await fixture('state?persona=admin&projects=many');
  await go(client, `${APP}/clubpm`);
  await waitFor(client, '[data-tour-id="nav.more"]');
  await sleep(1500);
  await tap(client, '[data-tour-id="nav.more"]');
  await waitFor(client, '.pm-m-layer [data-tour-id="nav.admin"]', 5000);
  const admin = await client.eval(`(() => { const a = document.querySelector('.pm-m-layer [data-tour-id="nav.admin"]'); return a ? a.textContent.trim() : null; })()`);
  await shot(client, 'p390-more-admin');
  check('More (admin): Admin row present', !!admin, admin);
  await client.eval('history.back()');
  await sleep(500);
  await tap(client, '[data-tour-id="nav.projects"]');
  const many = await client.eval(`document.querySelectorAll('[data-tour-id="projects.sheet"] .pm-m-row').length`);
  const sheetBox = await client.eval(`(() => { const b = document.querySelector('.pm-m-sheet').getBoundingClientRect(); const body = document.querySelector('.pm-m-sheet-body'); return { top: Math.round(b.top), scrolls: body.scrollHeight > body.clientHeight }; })()`);
  await shot(client, 'p390-projects-many');
  check('Projects (26): sheet caps its height and scrolls internally', many >= 20 && sheetBox.top > 0 && sheetBox.scrolls, { many, ...sheetBox });
  await fixture('state?persona=member&projects=few');

  // ── 7. Crossing the breakpoint: no remount-driven refetch, no second stream ──
  await setViewport(client, VP.p390);
  await go(client, `${APP}/clubpm`);
  await sleep(1500);
  await fixture('reset-log');
  for (const vp of [VP.d1280, VP.p390, VP.d1440, VP.l844, VP.p390]) { await setViewport(client, vp); await sleep(700); }
  const crossLog = await fixture('log');
  log.crossing = crossLog;
  const refetched = Object.keys(crossLog.log).filter((k) => /notifications|\/api\/projects$|auth\/me/.test(k));
  check('Five breakpoint crossings: no notification/project/auth refetch, no new stream', refetched.length === 0 && crossLog.sse.opened === 0, { refetched, sse: crossLog.sse });

  // ── 8. Walkthrough reveal on a phone: first-look step 3 (nav.xp inside More) ──
  const steps = JSON.parse(fs.readFileSync(path.resolve(HERE, '../../../../courses/constellation-101/walkthroughs/first-look.steps.json'), 'utf8')).steps;
  await go(client, `${APP}/clubpm`);
  await client.eval(`sessionStorage.setItem('clubpm_tour_resume', ${JSON.stringify(JSON.stringify({ tour: { sectionId: 'fixture', tourId: 'first-look', steps, preview: true }, stepIndex: 2 }))})`);
  await go(client, `${APP}/clubpm`);
  await client.eval(`[...document.querySelectorAll('.pm-tour-pill button')].find((b) => b.textContent.includes('Resume'))?.click()`);
  await sleep(2500);
  const tourXp = await client.eval(`(() => { const ring = document.querySelector('.pm-tour-ring'); const t = document.querySelector('[data-tour-id="nav.xp"]'); const card = document.querySelector('.pm-tour-card');
    if (!ring || !t) return { ring: !!ring, target: !!t, sheet: !!document.querySelector('.pm-m-sheet') };
    const a = ring.getBoundingClientRect(), b = t.getBoundingClientRect(), c = card.getBoundingClientRect();
    const overlapCard = !(c.bottom <= b.top || c.top >= b.bottom);
    return { sheet: !!document.querySelector('.pm-m-sheet'), ringAroundTarget: a.left <= b.left && a.top <= b.top && a.right >= b.right && a.bottom >= b.bottom,
      body: document.getElementById('pm-tour-card-body')?.textContent.slice(0, 200), cardCoversTarget: overlapCard }; })()`);
  await shot(client, 'p390-tour-xp-reveal');
  check('Tour: compact step opens More and rings nav.xp (phone copy, card not covering it)', tourXp.sheet && tourXp.ringAroundTarget && /top of More/.test(tourXp.body || '') && !tourXp.cardCoversTarget, tourXp);
  await client.eval(`[...document.querySelectorAll('.pm-tour-card button')].find((b) => /Next/.test(b.textContent))?.click()`);
  await sleep(2500);
  const tourAfter = await client.eval(`({ sheet: !!document.querySelector('.pm-m-sheet'), anchor: document.getElementById('pm-tour-card-title')?.textContent })`);
  check('Tour: the next step (dash.work) closes the sheet the tour opened', !tourAfter.sheet, tourAfter);
  await client.eval(`sessionStorage.removeItem('clubpm_tour_resume')`);

  // Desktop walkthrough unchanged: the same step on desktop targets the sidebar XP bar.
  await setViewport(client, VP.d1280);
  await client.eval(`sessionStorage.setItem('clubpm_tour_resume', ${JSON.stringify(JSON.stringify({ tour: { sectionId: 'fixture', tourId: 'first-look', steps, preview: true }, stepIndex: 2 }))})`);
  await go(client, `${APP}/clubpm`);
  await client.eval(`[...document.querySelectorAll('.pm-tour-pill button')].find((b) => b.textContent.includes('Resume'))?.click()`);
  await sleep(2500);
  const deskTour = await client.eval(`({ inSidebar: !!document.querySelector('.pm-sidebar [data-tour-id="nav.xp"]'), pinned: !!document.querySelector('.pm-sidebar.is-tour-pinned'), body: document.getElementById('pm-tour-card-body')?.textContent.slice(0, 200), sheet: !!document.querySelector('.pm-m-sheet') })`);
  check('Tour (desktop): same step keeps desktop copy, pins the sidebar, opens no sheet', deskTour.inSidebar && deskTour.pinned && /always in the sidebar/.test(deskTour.body || '') && !deskTour.sheet, deskTour);
  await shot(client, 'd1280-tour-xp');
  await client.eval(`sessionStorage.removeItem('clubpm_tour_resume')`);
} finally {
  const passed = checks.filter((c) => c.pass).length;
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    scope: 'Headless Chrome emulation against the fixture API. NOT a real device, real account, or screen reader.',
    summary: { passed, failed: checks.length - passed },
    checks, shots, log, consoleErrors: [...new Set(consoleErrors)].slice(0, 60),
  }, null, 2));
  console.log(`\n${passed}/${checks.length} checks passed`);
  await close();
}
