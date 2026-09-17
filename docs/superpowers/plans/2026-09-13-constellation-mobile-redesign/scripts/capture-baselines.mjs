// Phase 0 baseline capture: renders the PRODUCTION Constellation routes (served
// by `npm start` on :3000, API answered by fixture-api.mjs on :3001) at desktop
// and phone viewports, saves screenshots, and records layout measurements.
//
// Usage (repo root, with both servers running):
//   node docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/scripts/capture-baselines.mjs
// Output: ../evidence/browser/*.png and ../evidence/browser/metrics.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from './cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../evidence/browser');
const APP = process.env.APP_URL || 'http://localhost:3000';
const API = process.env.FIXTURE_URL || 'http://localhost:3001';
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = {
  d1440: { width: 1440, height: 900, mobile: false },
  d1280: { width: 1280, height: 800, mobile: false },
  p390: { width: 390, height: 844, mobile: true },
  p320: { width: 320, height: 640, mobile: true },
  l844: { width: 844, height: 390, mobile: true },
};

const ROUTES = {
  home: '/clubpm',
  tasks: '/clubpm/projects/p1',
  chatlist: '/clubpm/chat',
  conversation: '/clubpm/chat/C_FIX_GENERAL',
  members: '/clubpm/members',
  calendar: '/clubpm/calendar',
  notifications: '/clubpm/notifications',
};

// Injected measurement. Everything is read from the live DOM.
const MEASURE = `(() => {
  // On a mobile viewport, content wider than the device makes Chrome zoom the
  // page out, which inflates innerWidth. screen.width is the emulated device width.
  const vw = Math.min(innerWidth, screen.width), vh = innerHeight;
  const desc = (el) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
    ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '');
  const label = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40);
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.05; };
  const rect = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }; };
  const interactive = [...document.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [role="tab"]')].filter(visible)
    .filter((el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw; });
  const small = interactive.filter((el) => { const r = el.getBoundingClientRect(); return r.width < 44 || r.height < 44; });
  const offRight = [...document.querySelectorAll('body *')].filter(visible)
    .filter((el) => el.getBoundingClientRect().right > vw + 1)
    .filter((el) => !el.closest('.pm-sidebar'));
  const topOff = offRight.filter((el) => !offRight.some((o) => o !== el && o.contains(el)))
    .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right).slice(0, 8)
    .map((el) => ({ el: desc(el), right: Math.round(el.getBoundingClientRect().right), text: label(el) }));
  const content = document.querySelector('.pm-shell-content');
  const navLabel = document.querySelector('.pm-nav-item-label');
  const composer = document.querySelector('.cpm-chat-composer');
  return {
    url: location.pathname + location.search,
    viewport: { vw, vh, innerWidth, deviceWidth: screen.width },
    layoutWiderThanDevice: Math.max(0, document.documentElement.scrollWidth - screen.width),
    docOverflowX: document.documentElement.scrollWidth - vw,
    contentOverflowX: content ? content.scrollWidth - content.clientWidth : null,
    sidebar: rect('.pm-sidebar'),
    sidebarLabelOpacity: navLabel ? getComputedStyle(navLabel).opacity : null,
    shellMain: rect('.pm-shell-main'),
    topbar: rect('.pm-topbar'),
    breadcrumb: (document.querySelector('.pm-breadcrumb')?.textContent || '').trim(),
    projectMain: rect('.cpm-project-main'),
    assigneePanel: rect('.cpm-assignee-panel'),
    chatSide: rect('.cpm-chatpage-side'),
    chatMain: rect('.cpm-chatpage-main'),
    composer: composer ? rect('.cpm-chat-composer') : null,
    taskModal: rect('[data-tour-id="task.modal"]'),
    errorBoundary: /something went wrong/i.test(document.body.innerText),
    interactiveInView: interactive.length,
    under44InView: small.length,
    under44Sample: small.slice(0, 10).map((el) => { const r = el.getBoundingClientRect(); return { el: desc(el), w: Math.round(r.width), h: Math.round(r.height), label: label(el) }; }),
    overflowRightOfViewport: topOff,
    interactiveBeyondRightEdge: [...document.querySelectorAll('a[href], button, input, select, textarea')].filter(visible)
      .filter((el) => el.getBoundingClientRect().left >= vw - 4 && !el.closest('.pm-sidebar')).slice(0, 10).map((el) => ({ el: desc(el), left: Math.round(el.getBoundingClientRect().left), text: label(el) })),
  };
})()`;

async function fixture(q) { return (await fetch(`${API}/__fixture/${q}`)).json(); }

async function setViewport(client, vp) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile,
    // Without these, headless reports an 800×600 screen for desktop viewports.
    screenWidth: vp.width, screenHeight: vp.height,
    screenOrientation: vp.width > vp.height ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 },
  });
  await client.send('Emulation.setTouchEmulationEnabled', vp.mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
}

async function go(client, url, waitMs = 2500) {
  // Unload the previous page first so its EventSource socket is released; the
  // CRA dev proxy otherwise lets them pile up against Chrome's 6-per-host limit.
  await client.send('Page.navigate', { url: 'about:blank' });
  await sleep(300);
  await client.send('Page.navigate', { url });
  for (let i = 0; i < 60; i += 1) {
    await sleep(250);
    const ready = await client.eval(`document.readyState === 'complete' && !!document.querySelector('.pm-shell, .pm-login-hero')`).catch(() => false);
    if (ready) break;
  }
  await sleep(waitMs);
}

async function shot(client, name) {
  const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  return `evidence/browser/${name}.png`;
}

const results = [];
const consoleErrors = [];

async function capture(client, name, note = '') {
  let metrics; let lastErr = '';
  for (let i = 0; i < 8 && !metrics; i += 1) {
    metrics = await client.eval(`document.body ? ${MEASURE} : null`).catch((e) => { lastErr = e.message; return null; });
    if (!metrics) await sleep(1000);
  }
  if (!metrics) throw new Error(`page never settled for ${name}: ${lastErr}`);
  const file = await shot(client, name);
  results.push({ name, note, file, ...metrics });
  console.log(`${name.padEnd(34)} ${metrics.url.padEnd(40)} wider=${metrics.layoutWiderThanDevice} overflowX=${metrics.docOverflowX}/${metrics.contentOverflowX} <44=${metrics.under44InView}/${metrics.interactiveInView}`);
}

const { client, close } = await launchChrome();
try {
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  client.on('Runtime.exceptionThrown', (p) => consoleErrors.push(p.exceptionDetails?.exception?.description?.split('\n')[0] ?? 'exception'));
  client.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') consoleErrors.push(String(p.args?.[0]?.value ?? p.args?.[0]?.description ?? '').split('\n')[0].slice(0, 200)); });
  // Fixture bearer token so ClubPmAuth calls /auth/me (answered by the fixture API).
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('clubpm_auth_token', 'fixture-token'); sessionStorage.setItem('cpm.bell.greeted', '1'); } catch {}` });

  // 1. Route × viewport matrix, ordinary member, few projects.
  await fixture('state?persona=member&projects=few');
  for (const [vpName, vp] of Object.entries(VIEWPORTS).filter(([n]) => !process.env.ONLY_VP || process.env.ONLY_VP.split(',').includes(n))) {
    await setViewport(client, vp);
    for (const [routeName, route] of Object.entries(ROUTES)) {
      if (vpName === 'l844' && !['home', 'tasks', 'conversation'].includes(routeName)) continue;
      await go(client, APP + route);
      await capture(client, `${vpName}-${routeName}`);
    }
  }

  // 2. Task detail deep link and project sub-views on a phone.
  await setViewport(client, VIEWPORTS.p390);
  await go(client, `${APP}/clubpm/projects/p1?task=t3`);
  await capture(client, 'p390-task-modal-deeplink', '?task= deep link opens TaskModal');
  await go(client, `${APP}/clubpm/projects/p1?tab=insights&view=ai`);
  await capture(client, 'p390-project-insights-ai', 'legacy/current Insights AI deep link');
  await go(client, `${APP}/clubpm/projects/p1?tab=files`);
  await capture(client, 'p390-project-files', 'Files tab');
  await go(client, `${APP}/clubpm/projects/p4`);
  await capture(client, 'p390-project-empty', 'Project with no tasks');
  await setViewport(client, VIEWPORTS.p320);
  await go(client, `${APP}/clubpm/projects/p1?task=t3`);
  await capture(client, 'p320-task-modal-deeplink', '?task= deep link at 320px');

  // 3. Hover-only sidebar under touch: tap the collapsed Social group.
  await setViewport(client, VIEWPORTS.p390);
  await go(client, `${APP}/clubpm`);
  const social = await client.eval(`(() => { const r = document.querySelector('[data-tour-id="nav.social"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  // synthesizeTapGesture does not produce a click in headless Chrome; raw touch events do.
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(social.x), y: Math.round(social.y) }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(700);
  await capture(client, 'p390-home-after-tap-social', 'Tapped the Social group icon in the 64px rail');

  // 4. Many projects + admin persona.
  await fixture('state?persona=admin&projects=many');
  for (const vpName of ['p390', 'd1440']) {
    await setViewport(client, VIEWPORTS[vpName]);
    await go(client, `${APP}/clubpm`);
    await capture(client, `${vpName}-home-admin-manyprojects`, 'Admin persona, 26 projects');
  }
  await fixture('state?persona=member&projects=none');
  await setViewport(client, VIEWPORTS.p390);
  await go(client, `${APP}/clubpm`);
  await capture(client, 'p390-home-noprojects', 'Member with no projects');
  await fixture('state?persona=member&projects=few');

  // 5. Shell remount + duplicate requests on a client-side route change.
  await setViewport(client, VIEWPORTS.d1280);
  await go(client, `${APP}/clubpm`);
  await fixture('reset-log');
  await client.eval(`(() => { document.querySelector('[data-tour-id="nav.social"]').click(); })()`);
  await sleep(400);
  await client.eval(`(() => { document.querySelector('[data-tour-id="nav.chat"]').click(); })()`);
  await sleep(3000);
  const navLog = await fixture('log');
  await go(client, `${APP}/clubpm/projects/p1`);
  await fixture('reset-log');
  await client.eval(`(() => { const b = document.querySelector('[data-tour-id="project.tab.files"]'); b && b.click(); })()`);
  await sleep(1500);
  const tabLog = await fixture('log');

  // 6. History: project tab changes use replace:true; what does Back do?
  await go(client, `${APP}/clubpm`);
  await client.eval(`(() => { const a = [...document.querySelectorAll('.pm-sidebar-project-item')][0]; a && a.click(); })()`);
  await sleep(2500);
  const beforeTab = await client.eval('location.pathname + location.search');
  await client.eval(`(() => { const b = document.querySelector('[data-tour-id="project.tab.insights"]'); b && b.click(); })()`);
  await sleep(1200);
  const afterTab = await client.eval('location.pathname + location.search + " (history.length=" + history.length + ")"');
  await client.eval('history.back()');
  await sleep(2500);
  const afterBack = await client.eval('location.pathname + location.search');
  // TaskModal close: does it keep the tab/query state?
  await go(client, `${APP}/clubpm/projects/p1?tab=insights&view=activity&task=t3`);
  for (let i = 0; i < 20; i += 1) { if (await client.eval(`!!document.querySelector('[data-tour-id="task.modal"]')`)) break; await sleep(500); }
  const withModal = await client.eval(`location.pathname + location.search + ' modal=' + !!document.querySelector('[data-tour-id="task.modal"]')`);
  await client.eval(`(() => { const b = document.querySelector('[data-tour-id="task.modal"] button[title="Close"]'); b && b.click(); })()`);
  await sleep(1200);
  const afterClose = await client.eval(`location.pathname + location.search + ' activeTabInsights=' + !!document.querySelector('.presskit-report-subtabs')`);

  // 7. Software-keyboard proxy: shrink the viewport height with the composer focused.
  await setViewport(client, VIEWPORTS.p390);
  await go(client, `${APP}/clubpm/chat/C_FIX_GENERAL`);
  await client.eval(`(() => { const t = document.querySelector('.cpm-chat-composer-input'); t && t.focus(); })()`);
  await setViewport(client, { width: 390, height: 460, mobile: true });
  await sleep(800);
  await capture(client, 'p390-conversation-keyboard-proxy', 'Viewport height 460px approximates an open software keyboard; NOT a device test');

  // 8. Signed-out: the login page (Google OAuth reviewer surface) on a phone.
  await fixture('state?persona=anon');
  for (const vpName of ['p320', 'p390', 'd1280']) {
    await setViewport(client, VIEWPORTS[vpName]);
    await go(client, `${APP}/clubpm/login`, 3000);
    await capture(client, `${vpName}-login`, 'Signed out (fixture /auth/me → 401)');
  }
  await go(client, `${APP}/clubpm/projects/p1`, 3000);
  const signedOutDeepLink = await client.eval('location.pathname + location.search');
  await fixture('state?persona=member');

  const history = { beforeTab, afterTab, afterBack, withModal, afterClose, signedOutDeepLink };
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    app: APP, api: `${API} (FIXTURE)`,
    captures: results, navigationRequests: { sidebarDashboardToChat: navLog, projectTabToFiles: tabLog }, history,
    consoleErrors: [...new Set(consoleErrors)].slice(0, 60),
  }, null, 2));
  console.log('history', history);
  console.log('nav log', JSON.stringify(navLog));
  console.log('tab log', JSON.stringify(tabLog));
} finally {
  await close();
}
