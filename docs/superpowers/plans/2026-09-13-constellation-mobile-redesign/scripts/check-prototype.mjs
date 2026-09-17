// Automated Phase 0 checks against the phone prototype (fixture data only).
// Drives real headless Chrome with touch emulation, taps by coordinates so hit
// testing is real, and writes screenshots + a pass/fail report.
//
// Usage (repo root), with the prototype server running:
//   node docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/prototype/serve.mjs
//   node docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/scripts/check-prototype.mjs
// Output: ../evidence/prototype/*.png and ../evidence/prototype/report.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from './cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../evidence/prototype');
const BASE = process.env.PROTO_URL || 'http://localhost:4410/docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/prototype/index.html';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const { client, close } = await launchChrome({ port: 9231 });
const js = (expr) => client.eval(expr);

async function viewport(w, h, touch = true) {
  await client.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: touch, screenOrientation: w > h ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
  await client.send('Emulation.setTouchEmulationEnabled', touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  // Touch emulation alone does not flip the pointer/hover media features.
  await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: touch ? 'coarse' : 'fine' }, { name: 'hover', value: touch ? 'none' : 'hover' }] });
}
async function open(query, hash) {
  await client.send('Page.navigate', { url: 'about:blank' });
  await sleep(150);
  await client.send('Page.navigate', { url: `${BASE}?${query}#${hash}` });
  for (let i = 0; i < 40; i += 1) { await sleep(150); if (await js('!!window.__proto').catch(() => false)) break; }
  await sleep(250);
}
async function shot(name) {
  const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
}
// Tap the centre of the first element matching `sel` after asserting it is the
// top-most element there (i.e. a real finger would hit it).
async function tap(sel, label = sel) {
  const pt = await js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null;
    el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y); return { x, y, hit: !!top && (top === el || el.contains(top)), w: r.width, h: r.height }; })()`);
  if (!pt) { check(`tap ${label}`, false, 'element not found'); return false; }
  if (!pt.hit) check(`hit-test ${label}`, false, 'another element covers it');
  // synthesizeTapGesture does not produce a click in headless Chrome; raw touch events do.
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(pt.x), y: Math.round(pt.y) }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(350);
  return true;
}
async function key(k) {
  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: k === 'Escape' ? 27 : 0 });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: k === 'Escape' ? 27 : 0 });
  await sleep(300);
}
const hash = () => js('location.hash');
const LAYOUT = `(() => ({
  scrollW: document.documentElement.scrollWidth, innerW: innerWidth, screenW: screen.width,
  bodyOverflow: document.documentElement.scrollWidth > screen.width,
  navItems: [...document.querySelectorAll('.m-nav-item')].map(el => ({ label: el.textContent.trim(), h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width), truncated: el.querySelector('span').scrollWidth > el.querySelector('span').clientWidth + 1, current: el.getAttribute('aria-current') === 'page' })),
  small: [...document.querySelectorAll('.m-app button, .m-app a[href], .m-app input, .m-app select, #overlays button, #overlays a[href], #route-dialog button')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && (r.height < 40 || r.width < 40); }).map(el => (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 30) + ' ' + Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height)),
  compact: window.__proto.isCompact(),
  navInView: (() => { const n = document.querySelector('.m-nav'); if (!n) return false; const r = n.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 0.5; })(),
}))()`;

try {
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  // Headless pages are unfocused, so focus/focusin never fire without this.
  await client.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const errors = [];
  client.on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description?.split('\n')[0]));

  // 1. Compact condition boundaries.
  const cases = [
    [767, 800, false, true, '767px wide, mouse'], [768, 800, false, false, '768px wide, mouse'],
    [320, 640, true, true, '320 portrait touch'], [844, 390, true, true, '844×390 landscape touch'],
    [1023, 480, true, true, '1023×480 touch'], [1024, 480, true, false, '1024×480 touch'],
    [900, 520, true, false, '900×520 touch (too tall)'], [844, 390, false, false, '844×390 mouse window'],
  ];
  for (const [w, h, touch, want, label] of cases) {
    await viewport(w, h, touch);
    await open('persona=member', '/clubpm');
    const got = await js('window.__proto.isCompact()');
    const nav = await js('!!document.querySelector(".m-nav")');
    check(`compact condition: ${label}`, got === want && nav === want, `compact=${got}, bottom nav rendered=${nav}`);
  }

  // 2. Layout + nav at each phone size, every primary screen, both personas.
  const screensToCheck = [
    ['home', '/clubpm', 'home'], ['tasks', '/clubpm/projects/p1', 'projects'], ['empty-project', '/clubpm/projects/p4', 'projects'],
    ['chat-list', '/clubpm/chat', 'chat'], ['conversation', '/clubpm/chat/C2', 'chat'], ['people', '/clubpm/members?view=dms', 'chat'],
    ['calendar', '/clubpm/calendar', 'calendar'], ['notifications', '/clubpm/notifications', 'more'], ['gantt', '/clubpm/projects/p1/gantt', 'projects'],
  ];
  const sizes = [[320, 640, 'p320'], [390, 844, 'p390'], [844, 390, 'l844']];
  const smallTargets = {};
  for (const [w, h, tag] of sizes) {
    await viewport(w, h, true);
    for (const persona of ['member', 'admin']) {
      for (const [name, route, navId] of screensToCheck) {
        await open(`persona=${persona}&projects=${persona === 'admin' ? 'many' : 'few'}`, route);
        const L = await js(LAYOUT);
        const labels = L.navItems.map((n) => n.label).join('/');
        const cur = L.navItems.filter((n) => n.current).map((n) => n.label.toLowerCase());
        check(`${tag} ${persona} ${name}: no page-wide horizontal overflow`, !L.bodyOverflow && L.innerW === w, `scrollWidth=${L.scrollW}, innerWidth=${L.innerW}`);
        check(`${tag} ${persona} ${name}: 5 labelled nav items, none truncated, ≥44px`, L.navItems.length === 5 && L.navInView && L.navItems.every((n) => !n.truncated && n.h >= 44), labels + (L.navInView ? '' : ' — NAV NOT IN VIEWPORT'));
        check(`${tag} ${persona} ${name}: current item = ${navId}`, cur.length === 1 && cur[0] === navId, `current=${cur.join(',') || 'none'}`);
        if (L.small.length) smallTargets[`${tag} ${persona} ${name}`] = L.small;
        if (persona === 'member' || name === 'home') await shot(`${tag}-${persona}-${name}`);
      }
    }
  }

  // 3. Journeys at 320px (the hardest width).
  await viewport(320, 640, true);
  // 3a. Home → task → change status without dragging → Back returns to Home.
  await open('persona=member', '/clubpm');
  await tap('.m-card .m-row a[href*="?task="]', 'first My work task');
  check('task opens full-screen from Home', await js('!!document.querySelector("#route-dialog .m-dialog")'), await hash());
  await shot('p320-journey-task-detail');
  await tap('#route-dialog [data-action="set-status"][data-arg$="|DONE"]', 'Completed status');
  check('status changes via explicit control', await js('document.querySelector("#route-dialog [data-arg$=\\"|DONE\\"]").getAttribute("aria-pressed") === "true"'));
  await tap('#route-dialog [data-action="assign"]', 'Assign');
  check('assign picker opens over task (stacked overlay)', await js('document.querySelectorAll("#overlays .m-overlay").length === 1 && document.getElementById("route-dialog").inert === true'));
  await shot('p320-journey-assign-sheet');
  await key('Escape');
  check('Escape closes only the top overlay', await js('!document.querySelector("#overlays .m-overlay") && !!document.querySelector("#route-dialog .m-dialog")'));
  await tap('#route-dialog [data-action="close-task"]', 'task Back');
  check('closing task returns to the list it came from', (await hash()) === '#/clubpm', await hash());

  // 3b. Project picker: sheet state, search, choose, Back does not reopen sheet.
  await open('persona=admin&projects=many', '/clubpm');
  await tap('[data-nav-id="projects"]', 'Projects nav button');
  check('Projects sheet open + aria-expanded', await js('!!document.querySelector("[data-overlay=projects]") && document.querySelector("[data-nav-id=projects]").getAttribute("aria-expanded") === "true" && document.getElementById("app").inert'));
  check('admin sees New project in picker', await js('!!document.querySelector("[data-overlay=projects] [data-action=new-project]")'));
  await shot('p320-admin-project-picker-many');
  await js(`(() => { const i = document.querySelector('[data-input="project-filter"]'); i.value = 'cubesat'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const filtered = await js('document.querySelectorAll("#project-list .m-row").length');
  check('project search filters list', filtered > 0 && filtered < 26, `${filtered} rows for "cubesat"`);
  await tap('#project-list .m-row a[href*="/projects/"]', 'first matching project');
  const afterPick = await hash();
  check('choosing a project navigates and closes sheet', /projects\/px/.test(afterPick) && !(await js('!!document.querySelector("[data-overlay=projects]")')), afterPick);
  await js('history.back()'); await sleep(500);
  check('Back after picking returns to Home (sheet not reopened)', (await hash()) === '#/clubpm' && !(await js('!!document.querySelector("[data-overlay]")')), await hash());
  await js('history.forward()'); await sleep(500);
  check('Forward returns to the project', /projects\/px/.test(await hash()), await hash());

  // 3c. Sheet Back + focus return.
  await open('persona=member', '/clubpm');
  await tap('[data-nav-id="more"]', 'More');
  check('member More has no Admin row', !(await js('!!document.querySelector("[data-overlay=more] a[href=\\"#/clubpm/admin\\"]")')));
  await js('history.back()'); await sleep(500);
  check('browser Back closes More sheet, stays on page', !(await js('!!document.querySelector("[data-overlay]")')) && (await hash()) === '#/clubpm');
  await js('document.querySelector("[data-nav-id=more]").focus()');
  await js('document.querySelector("[data-nav-id=more]").click()'); await sleep(300);
  await key('Escape');
  check('focus returns to More after Escape', await js('document.activeElement && document.activeElement.getAttribute("data-nav-id") === "more"'));
  await open('persona=admin', '/clubpm');
  await tap('[data-nav-id="more"]', 'More (admin)');
  check('admin More has Admin row with separate badges', await js('!!document.querySelector("[data-overlay=more] a[href=\\"#/clubpm/admin\\"] .m-role-badge")'));
  await shot('p320-admin-more');
  await js('document.querySelector("[data-overlay=more] .m-sheet-body").scrollTop = 10000'); await sleep(200);
  await shot('p320-admin-more-bottom');

  // 3d. Chat list → conversation → draft survives Back.
  await open('persona=member', '/clubpm/chat');
  check('/clubpm/chat stays on the channel list (no auto-open)', (await hash()) === '#/clubpm/chat' && await js('!!document.querySelector("[data-tour-id=\\"chat.people\\"]")'));
  await tap('a[href="#/clubpm/chat/C2"]', 'long channel');
  await js(`(() => { const t = document.querySelector('.m-composer textarea'); t.value = 'draft that must survive'; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await shot('p320-journey-conversation');
  await tap('.m-header [data-action="back"]', 'conversation Back');
  check('conversation Back returns to channel list', (await hash()) === '#/clubpm/chat', await hash());
  await tap('a[href="#/clubpm/chat/C2"]', 'long channel again');
  check('composer draft preserved', (await js('document.querySelector(".m-composer textarea").value')) === 'draft that must survive');
  const composer = await js('(() => { const r = document.querySelector(".m-composer").getBoundingClientRect(); const n = document.querySelector(".m-nav").getBoundingClientRect(); return { composerBottom: r.bottom, navTop: n.top }; })()');
  check('composer sits above bottom nav, not under it', composer.composerBottom <= composer.navTop + 1, JSON.stringify(composer));
  await open('persona=member&kb=1', '/clubpm/chat/C1');
  await js('document.querySelector(".m-composer textarea").focus()'); await sleep(200);
  check('simulated software keyboard hides bottom nav', await js('getComputedStyle(document.querySelector(".m-nav")).display === "none"'));
  await shot('p320-conversation-keyboard-sim');
  await open('persona=member', '/clubpm/chat/C1');
  await js('document.querySelector(".m-composer textarea").focus()'); await sleep(200);
  check('focus alone (no viewport shrink) keeps bottom nav', await js('getComputedStyle(document.querySelector(".m-nav")).display !== "none"'));
  await open('persona=member', '/clubpm/chat/C5');
  check('unjoined channel shows preview + Join, no composer', await js('!!document.querySelector("[data-action=join]") && !document.querySelector(".m-composer")'));

  // 3e. Direct links get deterministic parents.
  await open('persona=member', '/clubpm/projects/p1?task=p1-t3');
  await tap('#route-dialog [data-action="close-task"]', 'task Back from deep link');
  check('deep-linked task Back → project Tasks', (await hash()) === '#/clubpm/projects/p1', await hash());
  await open('persona=member', '/clubpm/chat/C1');
  await tap('.m-header [data-action="back"]', 'deep conversation Back');
  check('deep-linked conversation Back → channel list', (await hash()) === '#/clubpm/chat', await hash());
  await open('persona=member', '/clubpm/projects/p1?tab=reports');
  check('legacy ?tab=reports rewritten to Insights (replace)', (await hash()) === '#/clubpm/projects/p1?tab=insights', await hash());
  await open('persona=member', '/clubpm/projects/p1?tab=members');
  check('legacy ?tab=members rewritten to Chat › Members', (await hash()) === '#/clubpm/projects/p1?tab=chat&view=members', await hash());

  // 3f. Project sections use replace (desktop parity): Back leaves the project.
  await open('persona=member', '/clubpm');
  await tap('.m-card a[href="#/clubpm/projects/p1"]', 'project from Home');
  await tap('.m-sections a[href*="tab=files"]', 'Files section');
  await tap('.m-sections a[href*="tab=insights"]', 'Insights section');
  await js('history.back()'); await sleep(500);
  check('section switches do not add history entries', (await hash()) === '#/clubpm', await hash());

  // 3g. New task validation + draft retention; empty/error states.
  await open('persona=member', '/clubpm/projects/p4');
  check('empty project shows create-first-task action', await js('!!document.querySelector(".m-empty [data-action=new-task]")'));
  await tap('.m-task-toolbar [data-action="new-task"]', 'New task');
  await tap('[data-action="create-task"]', 'Create (empty)');
  check('empty title blocked with message', (await js('document.getElementById("nt-err").textContent')).length > 0);
  await js(`(() => { const i = document.querySelector('[data-input="nt-title"]'); i.value = 'Draft title'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await shot('p320-new-task');
  await key('Escape');
  await tap('.m-task-toolbar [data-action="new-task"]', 'New task again');
  check('new-task draft kept after closing', (await js('document.querySelector("[data-input=nt-title]").value')) === 'Draft title');
  await open('persona=member&projects=error', '/clubpm');
  check('project load error shows Retry', await js('!!document.querySelector("[data-action=retry-projects]")'));
  await shot('p320-error-state');
  await open('persona=member&projects=none', '/clubpm');
  await shot('p320-member-no-projects');

  // 3h. Bulk selection reachable without Ctrl/Shift.
  await open('persona=member', '/clubpm/projects/p1');
  await tap('[data-action="project-actions"]', 'Project actions');
  await shot('p320-project-actions');
  await tap('[data-action="select-mode-on"]', 'Select tasks');
  await tap('[data-action="toggle-select"]', 'first task checkbox');
  check('bulk bar appears after selecting', await js('!!document.querySelector(".m-bulkbar")'));
  await shot('p320-bulk-select');

  // 4. Breakpoint crossing keeps state.
  await viewport(390, 844, true);
  await open('persona=member', '/clubpm/chat/C1');
  await js(`(() => { const t = document.querySelector('.m-composer textarea'); t.value = 'rotation draft'; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await viewport(844, 390, true); await sleep(400);
  await viewport(390, 844, true); await sleep(400);
  check('draft survives rotation', (await js('document.querySelector(".m-composer textarea").value')) === 'rotation draft');
  await viewport(1280, 800, false); await sleep(400);
  check('crossing to desktop shows desktop presentation', await js('!!document.querySelector(".m-desktop-note") && !document.querySelector(".m-nav")'));
  await viewport(390, 844, true); await sleep(400);
  check('draft survives desktop↔phone crossing', (await js('document.querySelector(".m-composer textarea").value')) === 'rotation draft');

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), base: BASE, fixtureOnly: true,
    passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length,
    results, controlsUnder40pxInView: smallTargets, pageErrors: errors,
  }, null, 2));
  console.log(`\n${results.filter((r) => r.ok).length} passed, ${results.filter((r) => !r.ok).length} failed; page errors: ${errors.length}`);
  if (errors.length) console.log(errors.slice(0, 5));
} finally {
  await close();
}
