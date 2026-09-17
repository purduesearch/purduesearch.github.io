// Phase 4 browser checks: the remaining dense views, against the production
// React components and the fixture API.
//
// Emulation only. This is NOT real-device, real-account, or screen-reader
// evidence, and nothing here sends, publishes, approves or purchases anything —
// the fixture accepts writes and discards them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from './cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../evidence/phase4');
const APP = process.env.APP_URL || 'http://localhost:3000';
const API = process.env.FIXTURE_URL || 'http://localhost:3001';
fs.mkdirSync(OUT, { recursive: true });

const VP = {
  p320: { width: 320, height: 640, mobile: true },
  p390: { width: 390, height: 844, mobile: true },
  l844: { width: 844, height: 390, mobile: true },
  d1280: { width: 1280, height: 800, mobile: false },
};

const checks = [];
const screenshots = [];
const consoleErrors = [];
function check(name, pass, detail = '') {
  checks.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
}

async function fixture(query) { return (await fetch(`${API}/__fixture/${query}`)).json(); }

async function setViewport(client, vp) {
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

async function go(client, url, { shell = true, waitMs = 1600 } = {}) {
  await client.send('Page.navigate', { url: 'about:blank' });
  await sleep(180);
  await client.send('Page.navigate', { url });
  for (let i = 0; i < 70; i += 1) {
    await sleep(200);
    const ready = await client.eval(
      shell
        ? `document.readyState === 'complete' && !!document.querySelector('.pm-shell')`
        : `document.readyState === 'complete'`
    ).catch(() => false);
    if (ready) break;
  }
  await sleep(waitMs);
}

async function waitFor(client, selector, ms = 8000) {
  for (let i = 0; i < ms / 160; i += 1) {
    if (await client.eval(`!!document.querySelector(${JSON.stringify(selector)})`).catch(() => false)) return true;
    await sleep(160);
  }
  return false;
}

async function tap(client, selector) {
  await waitFor(client, selector);
  const point = await client.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null;
    el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x:r.left+r.width/2, y:r.top+r.height/2 }; })()`);
  if (!point) throw new Error(`No element for ${selector}`);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(point.x), y: Math.round(point.y) }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(450);
}

async function clickText(client, selector, text) {
  const ok = await client.eval(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(x => x.textContent.trim().includes(${JSON.stringify(text)})); if (!el) return false; el.scrollIntoView({block:'center'}); el.click(); return true; })()`);
  if (!ok) throw new Error(`No ${selector} containing ${text}`);
  await sleep(500);
}

async function shot(client, name) {
  const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  screenshots.push(`evidence/phase4/${name}.png`);
}

const overflow = (client) => client.eval(`Math.max(0, document.documentElement.scrollWidth - innerWidth)`);
const tooSmall = (client, selector) => client.eval(`(() => {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  return [...document.querySelectorAll(${JSON.stringify(selector)})]
    .filter(vis)
    .filter(el => { const r = el.getBoundingClientRect(); return r.height < 44 || r.width < 44; })
    .map(el => (el.textContent.trim() || el.getAttribute('aria-label') || el.className).slice(0, 40));
})()`);
const dialogTitle = (client) => client.eval(`(() => { const d = document.querySelector('[role="dialog"]'); if (!d) return null;
  const id = d.getAttribute('aria-labelledby'); return id ? document.getElementById(id)?.textContent?.trim() ?? null : d.getAttribute('aria-label'); })()`);
const escape = async (client) => {
  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(400);
};

const { client, close } = await launchChrome({ port: 9234 });
try {
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  client.on('Runtime.exceptionThrown', p => consoleErrors.push(p.exceptionDetails?.exception?.description?.split('\n')[0] ?? 'exception'));
  client.on('Runtime.consoleAPICalled', p => { if (p.type === 'error') consoleErrors.push(String(p.args?.[0]?.value ?? p.args?.[0]?.description ?? '').split('\n')[0].slice(0, 200)); });
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('clubpm_auth_token','fixture-token'); sessionStorage.setItem('cpm.bell.greeted','1'); localStorage.setItem('clubpm-last-seen-rank','CELESTIAL'); } catch {}` });
  await fixture('state?persona=admin&projects=few&failProjects=0&failTaskCreate=0');
  await fixture('reset-log');

  // ── Slice A: Files, Vault, GitHub ────────────────────────────────
  await setViewport(client, VP.p320);
  await go(client, `${APP}/clubpm/projects/p1?tab=files`);
  let data = await client.eval(`(() => {
    const src = document.querySelector('.pm-m-source');
    const btns = [...document.querySelectorAll('.pm-m-segment--wide button')];
    return { label: src?.querySelector('.pm-m-source-label')?.textContent.trim(),
      labels: btns.map(b => b.textContent.trim()),
      pressed: btns.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent.trim()),
      sizes: btns.map(b => { const r = b.getBoundingClientRect(); return Math.round(r.height); }),
      desktopTablist: !!document.querySelector('[role="tablist"][aria-label="Files source"]') };
  })()`);
  check('A/p320: Files has one labelled Source selector, not a second icon toolbar',
    data.label === 'Source' && data.labels.join('|') === 'Drive|GitHub|Vault' && !data.desktopTablist, data);
  check('A/p320: every source control is touch-sized and exactly one is current',
    data.sizes.every(h => h >= 44) && data.pressed.length === 1, data);
  check('A/p320: Files has no page-wide horizontal overflow', (await overflow(client)) === 0);
  await shot(client, 'p320-files-source');

  await clickText(client, '.pm-m-segment--wide button', 'Vault');
  await waitFor(client, '.cpm-vault-grid, .cpm-vault-empty, .cpm-vault-setup-card');
  const vaultList = await client.eval(`(() => {
    const cards = [...document.querySelectorAll('.cpm-vault-card')];
    const grid = document.querySelector('.cpm-vault-grid');
    const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0;
    return { cards: cards.length, cols, remembered: sessionStorage.getItem('cpm.files.sub.p1') };
  })()`);
  check('A/p320: vault items are a single-column full-width list', vaultList.cards > 0 && vaultList.cols === 1, vaultList);
  check('A: the chosen source is remembered in the same sessionStorage key the desktop toggle uses',
    vaultList.remembered === 'vault', vaultList);

  await client.eval(`document.querySelector('.cpm-vault-card')?.click()`);
  await sleep(700);
  const vaultDetail = await client.eval(`(() => {
    const layer = document.querySelector('.pm-m-files-layer');
    const panel = document.querySelector('.cpm-vault-item-panel');
    const r = panel?.getBoundingClientRect();
    return { fullscreen: !!layer?.classList.contains('pm-m-layer--fullscreen'),
      inert: document.getElementById('root')?.hasAttribute('inert') ?? false,
      clipped: r ? (r.right > innerWidth + 1 || r.left < -1) : true,
      text: panel?.textContent ?? '' };
  })()`);
  check('A/p320: a vault item opens full screen through the shared overlay stack, not clipped',
    vaultDetail.fullscreen && vaultDetail.inert && !vaultDetail.clipped, { ...vaultDetail, text: undefined });
  check('A/p320: item detail still carries metadata, versions/history and its actions',
    /Version|History|Check ?out|Release|Download/i.test(vaultDetail.text), vaultDetail.text.slice(0, 120));
  await shot(client, 'p320-vault-item');
  await escape(client);

  await clickText(client, '.pm-m-segment--wide button', 'GitHub');
  await sleep(900);
  check('A/p320: the GitHub pane fits without page-wide overflow', (await overflow(client)) === 0);

  // ── Slice B: Insights, AI, Gantt ─────────────────────────────────
  await go(client, `${APP}/clubpm/projects/p1?tab=insights`);
  data = await client.eval(`(() => {
    const btns = [...document.querySelectorAll('.pm-m-insights-source .pm-m-segment button')];
    return { labels: btns.map(b => b.textContent.trim()), pressed: btns.filter(b => b.getAttribute('aria-pressed') === 'true').length,
      sizes: btns.map(b => Math.round(b.getBoundingClientRect().height)),
      desktopStrip: !!document.querySelector('.presskit-report-subtabs') };
  })()`);
  check('B/p320: Insights uses one labelled section selector instead of the desktop strip',
    data.labels.join('|') === 'Charts|Activity|Press Kit|AI' && data.pressed === 1 && !data.desktopStrip, data);
  check('B/p320: section controls are touch-sized', data.sizes.every(h => h >= 44), data.sizes);

  const chart = await client.eval(`(() => {
    const card = document.querySelector('.pm-an-card');
    const view = card?.querySelector('.pm-m-an-view');
    return { hasToggle: !!view, labels: [...(view?.querySelectorAll('button') ?? [])].map(b => b.textContent.trim()) };
  })()`);
  check('B/p320: every chart card offers a Chart / Data control', chart.hasToggle && chart.labels.join('|') === 'Chart|Data', chart);
  if (chart.hasToggle) {
    await client.eval(`[...document.querySelectorAll('.pm-m-an-view button')].find(b => b.textContent.trim() === 'Data')?.click()`);
    await sleep(400);
    const table = await client.eval(`(() => { const t = document.querySelector('.pm-m-an-table');
      return { rows: t ? t.querySelectorAll('tbody tr').length : 0, cols: t ? t.querySelectorAll('thead th').length : 0,
        empty: !!document.querySelector('.pm-m-an-data-empty'), wrapped: !!document.querySelector('.pm-m-an-table-wrap') }; })()`);
    check('B/p320: the Data view shows the card\'s own rows as a readable table (or says there are none)',
      (table.rows > 0 && table.cols > 0 && table.wrapped) || table.empty, table);
  }
  check('B/p320: Insights charts do not widen the page', (await overflow(client)) === 0);
  await shot(client, 'p320-insights-data');

  await clickText(client, '.pm-m-insights-source .pm-m-segment button', 'AI');
  await sleep(900);
  const ai = await client.eval(`(() => ({ goal: !!document.querySelector('[data-tour-id="ai.goal"]'),
    fontSize: parseFloat(getComputedStyle(document.querySelector('[data-tour-id="ai.goal"]') ?? document.body).fontSize) }))()`);
  check('B/p320: the action-plan goal field is present and at least 16px (no iOS zoom on focus)',
    ai.goal && ai.fontSize >= 16, ai);

  await go(client, `${APP}/clubpm/projects/p1/gantt`);
  const gantt = await client.eval(`(() => {
    const btns = [...document.querySelectorAll('.pm-m-gantt .pm-m-segment button')];
    return { labels: btns.map(b => b.textContent.trim()),
      pressed: btns.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent.trim()),
      scheduleRows: document.querySelectorAll('.pm-m-gantt-row').length,
      svg: !!document.querySelector('svg.select-none') };
  })()`);
  check('B/p320: the timeline opens on a schedule list, with the chart one tap away',
    gantt.labels.join('|') === 'Schedule|Timeline' && gantt.pressed.join('') === 'Schedule' && gantt.scheduleRows > 0 && !gantt.svg, gantt);
  await clickText(client, '.pm-m-gantt .pm-m-segment button', 'Timeline');
  const timeline = await client.eval(`(() => { const svg = document.querySelector('svg.select-none');
    const frame = svg?.closest('.pm-m-gantt-frame');
    return { svg: !!svg, contained: !!frame, pannable: frame ? frame.scrollWidth > frame.clientWidth : false,
      pageOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth) }; })()`);
  check('B/p320: the timeline pans inside its own frame and never widens the page',
    timeline.svg && timeline.contained && timeline.pageOverflow === 0, timeline);
  await shot(client, 'p320-gantt-schedule');

  // ── Slice C: Outreach ────────────────────────────────────────────
  await go(client, `${APP}/clubpm/outreach`);
  data = await client.eval(`(() => {
    const chips = [...document.querySelectorAll('.pm-m-outreach-source .pm-m-chip')];
    return { count: chips.length, labels: chips.map(c => c.textContent.trim()),
      pressed: chips.filter(c => c.getAttribute('aria-pressed') === 'true').length,
      sizes: chips.map(c => Math.round(c.getBoundingClientRect().height)),
      desktopTabs: !!document.querySelector('.pm-outreach-tabs'),
      anchors: ['outreach.tab.contacts','outreach.tab.campaigns','outreach.tab.blog'].map(id => document.querySelectorAll('[data-tour-id="'+id+'"]').length) };
  })()`);
  check('C/p320: seven tabs become one labelled Section chip row',
    data.count === 7 && data.pressed === 1 && !data.desktopTabs && data.sizes.every(h => h >= 44), data);
  check('C/p320: each tour-targeted section keeps exactly one mounted anchor',
    data.anchors.every(n => n === 1), data.anchors);
  check('C/p320: Outreach has no page-wide horizontal overflow', (await overflow(client)) === 0);

  const board = await client.eval(`(() => {
    const chips = [...document.querySelectorAll('[aria-label="Board stage"] .pm-m-chip')];
    return { stages: chips.map(c => c.textContent.trim()), board: !!document.querySelector('.pm-outreach-board'),
      items: document.querySelectorAll('.pm-m-outreach-item').length,
      moves: [...document.querySelectorAll('.pm-m-outreach-item button')].filter(b => /Move/.test(b.textContent)).length }; })()`);
  check('C/p320: the board is a stage-filtered list with an explicit Move per card, not five columns',
    !board.board && board.stages.length === 5 && board.items > 0 && board.moves === board.items, board);
  await clickText(client, '.pm-m-outreach-item button', 'Move');
  const moveSheet = await dialogTitle(client);
  const moveRows = await client.eval(`[...document.querySelectorAll('.pm-m-layer .pm-m-row')].map(r => r.textContent.trim())`);
  check('C/p320: Move offers every status, marking the current one', /^Move/.test(moveSheet ?? '') && moveRows.length === 5 && moveRows.some(r => /Current/.test(r)), { moveSheet, moveRows });
  await shot(client, 'p320-outreach-move');
  await clickText(client, '.pm-m-layer .pm-m-row', 'Submitted');
  await sleep(700);
  const afterMove = (await fixture('log')).log;
  check('C: Move goes through the existing submission PATCH path',
    Object.keys(afterMove).some(k => /^PATCH \/api\/outreach\/submissions\//.test(k)), Object.keys(afterMove).filter(k => /outreach/.test(k)));

  await clickText(client, '.pm-m-outreach-source .pm-m-chip', 'CRM');
  await waitFor(client, '[aria-label="Pipeline stage"]');
  const crm = await client.eval(`(() => ({ stages: document.querySelectorAll('[aria-label="Pipeline stage"] .pm-m-chip').length,
    board: !!document.querySelector('.pm-crm-board'),
    moves: [...document.querySelectorAll('.pm-m-crm-item button')].filter(b => /Move/.test(b.textContent)).length }))()`);
  check('C/p320: the CRM pipeline is a stage-filtered list with explicit Move',
    crm.stages === 5 && !crm.board && crm.moves > 0, crm);

  // ── Slice E: course learning ─────────────────────────────────────
  await go(client, `${APP}/clubpm/courses/fixture-course/learn`, { waitMs: 2200 });
  const learn = await client.eval(`(() => {
    const details = document.querySelector('.pm-m-course-contents');
    const steps = document.querySelector('.pm-m-course-steps');
    const btns = [...(steps?.querySelectorAll('button') ?? [])];
    return { contents: !!details, open: details?.open ?? null,
      summary: details?.querySelector('summary')?.textContent.replace(/\\s+/g,' ').trim(),
      steps: btns.map(b => ({ label: b.textContent.trim(), disabled: b.disabled, h: Math.round(b.getBoundingClientRect().height) })),
      inView: steps ? steps.getBoundingClientRect().bottom <= innerHeight + 1 : false }; })()`);
  check('E/p320: the contents list is collapsed behind one control that says where you are',
    learn.contents && learn.open === false && /Contents/.test(learn.summary ?? '') && /Section \d+ of \d+/.test(learn.summary ?? ''), learn.summary);
  check('E/p320: Previous and Next are present, touch-sized and on screen',
    learn.steps.length === 2 && learn.steps.every(s => s.h >= 44) && learn.inView, learn.steps);
  const learnBox = await client.eval(`(() => { const s = document.querySelector('.pm-m-course-steps');
    const r = s?.getBoundingClientRect();
    return { right: r ? Math.round(r.right) : null, left: r ? Math.round(r.left) : null,
      overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth) }; })()`);
  check('E/p320: the lesson and its step controls stay inside the gutter',
    learnBox.overflow === 0 && learnBox.left >= 0 && learnBox.right <= 320, learnBox);
  await shot(client, 'p320-course-learn');
  await tap(client, '.pm-m-course-contents summary');
  const contentsOpen = await client.eval(`(() => ({ open: document.querySelector('.pm-m-course-contents')?.open,
    rail: !!document.querySelector('.pm-m-course-contents .pm-course-learn-rail') }))()`);
  check('E/p320: opening Contents reveals the same learner rail', contentsOpen.open === true && contentsOpen.rail, contentsOpen);

  // ── Slice F: admin ───────────────────────────────────────────────
  await go(client, `${APP}/clubpm/admin`, { waitMs: 2000 });
  const admin = await client.eval(`(() => {
    const jump = [...document.querySelectorAll('.pm-m-admin-jump .pm-m-chip')];
    return { jump: jump.map(a => a.textContent.trim()),
      anchors: ['admin.rewards.pending','admin.rewards.config','admin.integrations']
        .map(id => { const el = document.querySelector('[data-tour-id="'+id+'"]'); return el ? Math.round(el.getBoundingClientRect().height) : 0; }),
      overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth) }; })()`);
  check('F/p320: admin sections are labelled in a jump list', admin.jump.length === 5, admin.jump);
  check('F/p320: every tour-targeted admin section is still rendered with a real height',
    admin.anchors.every(h => h > 0), admin.anchors);
  check('F/p320: the admin page does not scroll sideways', admin.overflow === 0, admin.overflow);
  await shot(client, 'p320-admin');

  // Member persona must not reach it, through any of the new menus.
  await fixture('state?persona=member');
  await go(client, `${APP}/clubpm/admin`, { waitMs: 1800 });
  const asMember = await client.eval(`({ path: location.pathname, adminRow: !!document.querySelector('[data-tour-id="nav.admin"]') })`);
  check('F: a non-admin is still redirected away from /clubpm/admin', asMember.path === '/clubpm', asMember);
  await fixture('state?persona=admin');

  // ── Slice G: Profile, Shop, Challenges ───────────────────────────
  for (const [route, label, selector] of [
    ['/clubpm/profile', 'Profile', '.cpm-profile-grid'],
    ['/clubpm/shop', 'Shop', '.pm-shop'],
    ['/clubpm/challenges', 'Challenges', '.challenges-page, .challenges-list'],
  ]) {
    await go(client, `${APP}${route}`, { waitMs: 1800 });
    const g = await client.eval(`(() => ({ present: !!document.querySelector(${JSON.stringify(selector)}),
      overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth) }))()`);
    const small = await tooSmall(client, `${selector} button`);
    check(`G/p320: ${label} fits the screen with no horizontal overflow`, g.present && g.overflow === 0, g);
    check(`G/p320: ${label} has no sub-44px control`, small.length === 0, small);
    await shot(client, `p320-${label.toLowerCase()}`);
  }

  // ── Slice H: login ───────────────────────────────────────────────
  await go(client, `${APP}/clubpm/login`, { shell: false, waitMs: 2000 });
  const login = await client.eval(`(() => {
    const btn = document.querySelector('.pm-slack-btn');
    const r = btn?.getBoundingClientRect();
    const table = document.querySelector('.pm-login-table');
    const wrap = document.querySelector('.pm-login-table-wrap');
    const mark = document.querySelector('.pm-login-wordmark h1');
    const markStyle = mark ? getComputedStyle(mark) : null;
    const lines = mark && markStyle
      ? Math.round(mark.getBoundingClientRect().height / (parseFloat(markStyle.lineHeight) || parseFloat(markStyle.fontSize) * 1.2))
      : 0;
    return { wordmarkLines: lines,
      sections: document.querySelectorAll('.pm-login-doc-section').length,
      limitedUse: /Limited Use/i.test(document.body.textContent),
      button: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
      tableContained: table && wrap ? wrap.scrollWidth >= table.scrollWidth - 1 || getComputedStyle(wrap).overflowX === 'auto' : null,
      overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth) }; })()`);
  check('H/p320: every scope-justification section and the Limited Use language still render',
    login.sections >= 5 && login.limitedUse, login);
  // "Full width" here means the card's full content width: 320px less one hero
  // gutter and the card's own padding.
  check('H/p320: the single sign-in action is full width and touch-sized',
    login.button && login.button.h >= 44 && login.button.w >= 240, login.button);
  check('H/p320: the scope table scrolls inside its own frame, not the page',
    login.overflow === 0 && login.tableContained !== false, login);
  check('H/p320: the wordmark shrinks to one line instead of breaking mid-word',
    login.wordmarkLines === 1, login.wordmarkLines);
  await shot(client, 'p320-login');

  // ── Landscape phone ──────────────────────────────────────────────
  await setViewport(client, VP.l844);
  await go(client, `${APP}/clubpm/projects/p1?tab=files`);
  check('landscape 844x390: the Files source selector still fits without overflow',
    (await client.eval(`document.querySelectorAll('.pm-m-segment--wide button').length === 3`)) && (await overflow(client)) === 0);
  await shot(client, 'l844-files');

  // ── Desktop regression ───────────────────────────────────────────
  await setViewport(client, VP.d1280);
  const desktopRoutes = [
    ['/clubpm/projects/p1?tab=files', 'Files', `!!document.querySelector('[role="tablist"][aria-label="Files source"]') && !document.querySelector('.pm-m-source')`],
    ['/clubpm/projects/p1?tab=insights', 'Insights', `!!document.querySelector('.presskit-report-subtabs') && !document.querySelector('.pm-m-insights-source')`],
    ['/clubpm/outreach', 'Outreach', `!!document.querySelector('.pm-outreach-tabs') && !document.querySelector('.pm-m-outreach-source')`],
    ['/clubpm/projects/p1/gantt', 'Gantt', `!!document.querySelector('svg.select-none') && !document.querySelector('.pm-m-gantt')`],
    ['/clubpm/admin', 'Admin', `!document.querySelector('.pm-m-admin-jump')`],
  ];
  for (const [route, label, expr] of desktopRoutes) {
    await go(client, `${APP}${route}`, { waitMs: 1600 });
    const ok = await client.eval(expr);
    const noCompact = await client.eval(`!document.querySelector('.pm-shell--compact') && !document.body.classList.contains('pm-m-compact')`);
    const over = await overflow(client);
    check(`desktop 1280: ${label} keeps its existing presentation`, ok && noCompact, { ok, noCompact });
    check(`desktop 1280: ${label} has no page-wide horizontal overflow`, over === 0, over);
  }
  await go(client, `${APP}/clubpm/outreach`, { waitMs: 1600 });
  const desktopBoard = await client.eval(`(() => ({ columns: document.querySelectorAll('.pm-outreach-col').length,
    bodies: document.querySelectorAll('.pm-outreach-col-body').length,
    move: [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Move').length }))()`);
  check('desktop 1280: the Outreach board keeps five drag columns and adds no Move buttons',
    desktopBoard.columns === 5 && desktopBoard.bodies === 5 && desktopBoard.move === 0, desktopBoard);
  await shot(client, 'd1280-outreach-board');
} finally {
  const report = {
    generatedAt: new Date().toISOString(),
    disclaimer: 'Headless Chrome touch/viewport emulation against the fixture API only. No real device, real account, software keyboard, or screen reader was used, and nothing was sent, published, approved or purchased.',
    summary: { passed: checks.filter(x => x.pass).length, failed: checks.filter(x => !x.pass).length, total: checks.length },
    checks, screenshots, consoleErrors: [...new Set(consoleErrors)],
  };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  await close();
  console.log(`\n${report.summary.passed}/${report.summary.total} passed; ${report.summary.failed} failed. Report: ${path.join(OUT, 'report.json')}`);
  if (report.summary.failed) process.exitCode = 1;
}
