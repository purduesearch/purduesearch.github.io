// Phase 5 — the five primary journeys end to end from the bottom bar, plus
// history/refresh/direct links, keyboard focus, the accessibility tree,
// rotation/breakpoint drafts, duplicate-submission guards and composer
// visibility with a contracted (keyboard-proxy) viewport.
//
// Production build (APP, default :4002) + fixture API. Member persona.
// Emulation only; see phase5-lib.mjs. Nothing real is sent: the fixture
// accepts writes and discards them.
import path from 'node:path';
import os from 'node:os';
import {
  VP, makeReport, fixture, start, setViewport, go, tap, key, val, url, visible,
  back, forward, reload, waitFor, sleep, closeAll, fill,
} from './phase5-lib.mjs';

const APP = process.env.APP_URL || 'http://localhost:4002';
const R = makeReport('journeys');
const log = async () => (await fixture('log')).log;
const count = async (k) => (await log())[k] || 0;
const dialogName = (client) => val(client, `(() => { const d=[...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].pop(); if(!d) return null; const id=d.getAttribute('aria-labelledby'); return (id && document.getElementById(id)?.textContent?.trim()) || d.getAttribute('aria-label'); })()`);
const navUsable = (client) => val(client, `(() => { const n=document.querySelector('.pm-m-nav'); if(!n) return false; const s=getComputedStyle(n), b=n.getBoundingClientRect(); return s.display!=='none' && s.visibility!=='hidden' && b.height>0 && b.bottom<=innerHeight+0.5; })()`);
const rect = (client, sel) => val(client, `(() => { const e=[...document.querySelectorAll(${JSON.stringify(sel)})].filter(x=>x.getBoundingClientRect().height>0).pop(); if(!e) return null; const b=e.getBoundingClientRect(); return { top:Math.round(b.top), bottom:Math.round(b.bottom), h:Math.round(b.height) }; })()`);

const { client, close } = await start(R, { port: 9242 });
// Track EventSource instances in the page (the fixture cannot see sockets a proxy keeps open).
await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const O = window.EventSource; if (!O) return; window.__p5es = []; window.EventSource = function (...a) { const e = new O(...a); window.__p5es.push(e); return e; }; window.EventSource.prototype = O.prototype; Object.assign(window.EventSource, { CONNECTING: 0, OPEN: 1, CLOSED: 2 }); })();` });
const timings = {};
const t0 = () => Date.now();
try {
  await fixture('state?persona=member&projects=few&failProjects=0&failTaskCreate=0&failChatSend=0&slowWrites=0&failAuth=0&slackExpired=0');
  await fixture('reset-log');
  await setViewport(client, VP.p320);

  // ── J1. Find and update an assigned task ───────────────────────────
  let t = t0();
  await go(client, `${APP}/clubpm`);
  await tap(client, '.cpm-work-panel .cpm-task-row');
  await waitFor(client, '[data-tour-id="task.modal.status"]');
  let u = await url(client);
  R.check('J1 task: a My work row on Home opens the task full screen by its ?task= link', /\/clubpm\/projects\/p\d\?task=t\d+/.test(u) && !!(await dialogName(client)), { u, dialog: await dialogName(client) });
  const statusCtl = await val(client, `(() => { const box=document.querySelector('[data-tour-id="task.modal.status"]'); const sel=box?.querySelector('select'); const btns=[...(box?.querySelectorAll('button')||[])].map(b=>b.textContent.trim()); return { select: !!sel, options: sel ? [...sel.options].map(o=>o.value) : [], btns }; })()`);
  const taskId = u.match(/task=(t\d+)/)[1];
  if (statusCtl.select) {
    await val(client, `(() => { const sel=document.querySelector('[data-tour-id="task.modal.status"] select'); const v=[...sel.options].map(o=>o.value).find(v=>v!==sel.value && /IN_PROGRESS|DONE/.test(v)); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(sel,v); sel.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  } else {
    await tap(client, '[data-tour-id="task.modal.status"] button');
    const opts = await val(client, `[...document.querySelectorAll('[data-tour-id="task.modal.status"] button')].slice(1).map(b => ({ t: b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height), r: Math.round(b.getBoundingClientRect().right) }))`);
    R.notes.push({ taskStatusOptions: opts });
    R.check('J1 task: the status picker options are touch-sized and inside the screen', opts.length === 4 && opts.every((o) => o.h >= 44 && o.r <= 320), opts);
    await tap(client, '[data-tour-id="task.modal.status"] button', { text: 'In Progress' });
  }
  await sleep(700);
  R.check('J1 task: status can be changed inside task detail without dragging (PATCH issued)', (await count(`PATCH /api/tasks/${taskId}`)) >= 1, { statusCtl, patches: await count(`PATCH /api/tasks/${taskId}`) });
  await fill(client, '[data-tour-id="task.modal.comments"] input', 'FIXTURE phase 5 comment');
  await fixture('state?slowWrites=1');
  await val(client, `(() => { const b=document.querySelector('[data-tour-id="task.modal.comments"] button'); b.click(); b.click(); })()`);
  await sleep(2200);
  await fixture('state?slowWrites=0');
  R.check('J1 task: a double-tapped comment submit posts once while the first is in flight', (await count(`POST /api/tasks/${taskId}/comments`)) === 1, await count(`POST /api/tasks/${taskId}/comments`));
  await tap(client, '.pm-m-task-detail .pm-m-icon-btn');
  u = await url(client);
  R.check('J1 task: closing detail lands on the project task list (no ?task=) with the phone shell intact', /\/clubpm\/projects\/p\d$/.test(u) && !(await dialogName(client)) && await navUsable(client), { u, dialog: await dialogName(client), nav: await navUsable(client) });
  await back(client, 900);
  const j1back = await url(client);
  R.notes.push({ j1BackAfterClose: j1back });
  timings.J1 = Date.now() - t;
  await R.shot(client, 'j1-after-close');

  // ── J1b. Category blockers on a phone (defect found and fixed in Phase 5) ──
  await fixture('reset-log');
  await go(client, `${APP}/clubpm/projects/p1`);
  await waitFor(client, '.pm-m-blocker');
  const blk = await val(client, `(() => { const b=document.querySelector('.pm-m-blocker'); if(!b) return null; return { text: b.innerText, btns: [...b.querySelectorAll('button')].map(x => ({ t: x.textContent.trim(), h: Math.round(x.getBoundingClientRect().height) })) }; })()`);
  R.check('J1b blockers: the phone Blocked group lists the category blocker with owner, Edit and Resolve (≥44px)',
    blk && /Waiting on parts/.test(blk.text) && /responsible/i.test(blk.text) && blk.btns.map((b) => b.t).join('|') === 'Edit|Resolve' && blk.btns.every((b) => b.h >= 44), blk);
  await tap(client, '.pm-m-blocker button', { text: 'Edit' });
  R.check('J1b blockers: Edit opens a named sheet with name, colour and responsible fields', /Edit blocker/.test(await dialogName(client) || '') && await val(client, `!!document.querySelector('.pm-m-blocker-form select') && document.querySelectorAll('.pm-m-blocker-swatches button').length === 6`));
  await val(client, `(() => { const s=document.querySelector('.pm-m-blocker-form select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s, s.options[2].value); s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await tap(client, '.pm-m-blocker-form button[type="submit"]');
  await sleep(600);
  R.check('J1b blockers: saving reassigns through the existing PATCH /api/blockers/:id and closes the sheet', (await count('PATCH /api/blockers/bk1')) === 1 && !(await dialogName(client)), await count('PATCH /api/blockers/bk1'));
  await tap(client, '.pm-m-blocker button', { text: 'Resolve' });
  R.check('J1b blockers: Resolve asks for confirmation first (nothing sent yet)', /Resolve/.test(await dialogName(client) || '') && (await count('POST /api/blockers/bk1/resolve')) === 0);
  await tap(client, '.pm-m-blocker-confirm button', { text: 'Resolve blocker' });
  await sleep(600);
  R.check('J1b blockers: confirming resolves once through POST /api/blockers/:id/resolve', (await count('POST /api/blockers/bk1/resolve')) === 1 && !(await dialogName(client)));
  await tap(client, '.pm-m-task-row .pm-m-task-actions button', { text: 'Move' });
  await tap(client, '.pm-m-move-picker .pm-m-row', { text: 'Blocked' });
  const blockedStep = await dialogName(client);
  R.check('J1b blockers: Move › Blocked asks what is blocking the task (existing blocker, new blocker, or plain)', /What's blocking/.test(blockedStep || '') && await val(client, `!!document.querySelector('.pm-m-blocker-form') && !!document.querySelector('.pm-m-blocker-plain')`), blockedStep);
  await tap(client, '.pm-m-move-picker .pm-m-row', { text: 'Waiting on parts' });
  await sleep(600);
  R.check('J1b blockers: choosing an existing blocker attaches it via POST /api/tasks/:id/blockers', Object.entries(await log()).filter(([k, v]) => /^POST \/api\/tasks\/[^/]+\/blockers$/.test(k)).reduce((a, [, v]) => a + v, 0) === 1 && !(await dialogName(client)), await log());
  await R.shot(client, 'j1b-blockers');
  await setViewport(client, VP.d1280);
  await go(client, `${APP}/clubpm/projects/p1`);
  R.check('J1b blockers: desktop keeps its sub-bin controls and renders no phone blocker list', await val(client, `!document.querySelector('.pm-m-blocker') && !!document.querySelector('.cpm-blocked-subbin-resolve')`));
  await setViewport(client, VP.p320);

  // ── J2. Open a project conversation and reply ──────────────────────
  t = t0();
  await fixture('reset-log');
  await go(client, `${APP}/clubpm`);
  await tap(client, '[data-m-opener="projects"]');
  await tap(client, '.pm-m-layer .pm-m-row', { text: 'Orbital Debris' });
  await waitFor(client, '.pm-m-section-btn');
  await tap(client, '.pm-m-section-btn', { text: 'Chat' });
  const composerReady = await waitFor(client, '.cpm-chat-composer-input', 9000);
  u = await url(client);
  R.check('J2 chat: Projects sheet → project → Chat section opens the linked conversation in ≤3 taps', composerReady && /tab=chat/.test(u), u);
  const comp = await rect(client, '.cpm-chat-composer');
  const navTop = (await rect(client, '.pm-m-nav'))?.top;
  R.check('J2 chat: the composer is on screen above the bottom bar', comp && comp.bottom <= navTop + 0.5 && comp.top > 0, { comp, navTop });
  await fill(client, '.cpm-chat-composer-input', 'FIXTURE phase 5 project reply');
  await fixture('state?slowWrites=1');
  await val(client, `(() => { const b=document.querySelector('.cpm-chat-composer-send'); b.click(); b.click(); })()`);
  await sleep(2300);
  await fixture('state?slowWrites=0');
  const posts = await count('POST /api/chat/conversations/C_FIX_GENERAL/messages');
  R.check('J2 chat: reply sends exactly once on a double tap and clears the composer', posts === 1 && (await val(client, `document.querySelector('.cpm-chat-composer-input')?.value`)) === '', posts);
  await R.shot(client, 'j2-project-chat');
  // keyboard proxy on the project conversation
  await val(client, `document.querySelector('.cpm-chat-composer-input')?.focus()`);
  await setViewport(client, { width: 320, height: 380, mobile: true });
  await sleep(600);
  const kb = await val(client, `({ open: document.querySelector('.pm-shell')?.classList.contains('pm-m-keyboard-open'), bottom: Math.round(document.querySelector('.cpm-chat-composer')?.getBoundingClientRect().bottom||0), vh: Math.round(visualViewport?.height||innerHeight) })`);
  R.check('J2 chat: with the viewport contracted (keyboard proxy) the project composer stays visible and the bar hides', kb.open && kb.bottom > 0 && kb.bottom <= kb.vh && !(await navUsable(client)), kb);
  await setViewport(client, VP.p320);
  await sleep(500);
  timings.J2 = Date.now() - t;

  // ── J3. Find an event and RSVP ─────────────────────────────────────
  t = t0();
  await fixture('reset-log');
  await tap(client, '.pm-m-nav-item', { text: 'Calendar' });
  await waitFor(client, '.cpm-cal-agenda-event-row', 9000);
  await tap(client, '.cpm-cal-agenda-event-row');
  await waitFor(client, '.pm-cal-modal-footer button');
  R.check('J3 event: Calendar (bottom bar) → agenda row opens event detail with an RSVP action', /event=e1/.test(await url(client)) && await val(client, `[...document.querySelectorAll('.pm-cal-modal-footer button')].some(b=>b.textContent.trim()==='RSVP')`));
  await fixture('state?slowWrites=1');
  await val(client, `(() => { const b=[...document.querySelectorAll('.pm-cal-modal-footer button')].find(b=>b.textContent.trim()==='RSVP'); b.click(); b.click(); })()`);
  await sleep(2300);
  await fixture('state?slowWrites=0');
  const rsvps = await count('POST /api/events/e1/attendees');
  const rsvpText = await val(client, `document.querySelector('.pm-cal-modal-footer')?.textContent || ''`);
  R.check('J3 event: RSVP completes (state flips to Not attending) and a double tap sends one request', rsvps === 1 && /Not attending/.test(rsvpText), { rsvps, rsvpText });
  const rsvpBtn = await rect(client, '.pm-cal-modal-footer button');
  R.check('J3 event: RSVP control is touch-sized and inside the viewport', rsvpBtn && rsvpBtn.h >= 44 && rsvpBtn.bottom <= 640, rsvpBtn);
  await R.shot(client, 'j3-rsvp');
  await back(client);
  R.check('J3 event: Back closes the event and stays on Calendar', (await url(client)) === '/clubpm/calendar' && !(await visible(client, '.pm-cal-detail')), await url(client));
  timings.J3 = Date.now() - t;

  // ── J4. Retrieve a file ────────────────────────────────────────────
  t = t0();
  await fixture('reset-log');
  const downloads = [];
  client.on('Page.downloadWillBegin', (p) => downloads.push(p.suggestedFilename));
  client.on('Browser.downloadWillBegin', (p) => downloads.push(p.suggestedFilename));
  await client.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: path.join(os.tmpdir(), 'cpm-phase5-downloads'), eventsEnabled: true }).catch(() => {});
  await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: path.join(os.tmpdir(), 'cpm-phase5-downloads') }).catch(() => {});
  await tap(client, '[data-m-opener="projects"]');
  await tap(client, '.pm-m-layer .pm-m-row', { text: 'Orbital Debris' });
  await tap(client, '.pm-m-section-btn', { text: 'Files' });
  await tap(client, '.pm-m-segment--wide button', { text: 'Vault' });
  await waitFor(client, '.cpm-vault-card');
  await tap(client, '.cpm-vault-card');
  await waitFor(client, 'js:[...document.querySelectorAll("button")].some(b => /Download/.test(b.textContent))');
  const beforeUrl = await url(client);
  await tap(client, '.pm-m-layer button', { text: 'Download' });
  await sleep(1500);
  const fileGets = await count('GET /api/vault/fixture-file/vv1');
  R.check('J4 file: Projects → Files → Vault → item → Download retrieves the file (signed-URL fetch, then the file request)',
    (await count('GET /api/vault/versions/vv1/download-url')) === 1 && (fileGets === 1 || downloads.length > 0), { fileGets, downloads });
  R.check('J4 file: the download does not navigate the app away or close the item', (await url(client)) === beforeUrl && !!(await dialogName(client)), { before: beforeUrl, after: await url(client) });
  await R.shot(client, 'j4-vault-download');
  await key(client, 'Escape');
  R.check('J4 file: Escape closes the item and the Vault source is still selected', !(await dialogName(client)) && (await val(client, `sessionStorage.getItem('cpm.files.sub.p1')`)) === 'vault');
  timings.J4 = Date.now() - t;

  // ── J5. Resume and progress through training ───────────────────────
  t = t0();
  await fixture('reset-log');
  await tap(client, '[data-m-opener="more"]');
  await tap(client, '.pm-m-layer .pm-m-row', { text: 'Courses' });
  await waitFor(client, '.cpm-course-card-take');
  const take = await val(client, `document.querySelector('.cpm-course-card-take')?.textContent.trim()`);
  await tap(client, '.cpm-course-card-take');
  await waitFor(client, '.pm-m-course-steps', 9000);
  const resume = await val(client, `({ url: location.pathname, pos: document.querySelector('.pm-m-course-steps-pos')?.textContent.trim(), title: document.querySelector('h1, h2')?.textContent })`);
  R.check('J5 training: More → Courses → Continue resumes at the enrollment\'s last section (2 / 3)', take === 'Continue' && resume.url === '/clubpm/courses/fixture-course/learn' && resume.pos === '2 / 3', { take, ...resume });
  const nextDisabled = await val(client, `[...document.querySelectorAll('.pm-m-course-steps button')].find(b=>/Next/.test(b.textContent))?.disabled`);
  R.check('J5 training: Next is disabled because the only later section is locked', nextDisabled === true);
  await fixture('state?slowWrites=1');
  const completeBtn = await val(client, `(() => { const b=[...document.querySelectorAll('button')].find(b=>/Mark complete/.test(b.textContent)); if(!b) return false; b.scrollIntoView({block:'center'}); b.click(); b.click(); return true; })()`);
  await sleep(2400);
  await fixture('state?slowWrites=0');
  const completes = await count('POST /api/outreach/courses/sections/cs2/complete');
  R.check('J5 training: Mark complete & continue is reachable and a double tap records one completion', completeBtn && completes === 1, { completeBtn, completes });
  await tap(client, '.pm-m-course-steps button', { text: 'Previous' });
  R.check('J5 training: Previous steps back to section 1', (await val(client, `document.querySelector('.pm-m-course-steps-pos')?.textContent.trim()`)) === '1 / 3');
  const stepsVsNav = await val(client, `(() => { const s=document.querySelector('.pm-m-course-steps').getBoundingClientRect(); const n=document.querySelector('.pm-m-nav').getBoundingClientRect(); return { stepsBottom: Math.round(s.bottom), navTop: Math.round(n.top) }; })()`);
  R.check('J5 training: Previous/Next sit above the bottom bar', stepsVsNav.stepsBottom <= stepsVsNav.navTop + 0.5, stepsVsNav);
  await R.shot(client, 'j5-course');
  timings.J5 = Date.now() - t;

  // ── History, refresh and direct links ──────────────────────────────
  await setViewport(client, VP.p390);
  await go(client, `${APP}/clubpm`);
  await tap(client, '[data-m-opener="more"]');
  await reload(client);
  R.check('history: refresh with More open restores the sheet', (await dialogName(client)) === 'More');
  await back(client);
  R.check('history: Back closes the restored sheet without leaving Home', !(await dialogName(client)) && (await url(client)) === '/clubpm');
  await forward(client);
  R.check('history: Forward reopens it', (await dialogName(client)) === 'More');
  await key(client, 'Escape');

  for (const [label, path, probe] of [
    ['task', '/clubpm/projects/p1?tab=tasks&task=t3', `!!document.querySelector('[data-tour-id="task.modal.status"]')`],
    ['thread', '/clubpm/chat/C_FIX_GENERAL?thread=1757700240.000100', `!!document.querySelector('.cpm-chat-drawer') && getComputedStyle(document.querySelector('.cpm-chat-drawer')).display !== 'none'`],
    ['dm', '/clubpm/members?view=dms&dm=D_FIX_JORDAN', `!!document.querySelector('.cpm-dm-panel')`],
    ['event', '/clubpm/calendar?event=e1', `!!document.querySelector('.pm-cal-detail')`],
    ['files source', '/clubpm/projects/p1?tab=files', `!!document.querySelector('.pm-m-source')`],
    ['insights ai', '/clubpm/projects/p1?tab=insights&view=ai', `[...document.querySelectorAll('.pm-m-insights-source button')].find(b=>b.getAttribute('aria-pressed')==='true')?.textContent.trim()==='AI'`],
    ['outreach crm', '/clubpm/outreach?tab=crm', `[...document.querySelectorAll('[aria-pressed="true"]')].some(b=>/CRM/.test(b.textContent))`],
  ]) {
    await go(client, APP + path, { waitMs: 1600 });
    const direct = await val(client, probe);
    await reload(client);
    const refreshed = await val(client, probe);
    R.check(`direct link + refresh: ${label} opens the requested detail both times`, direct && refreshed && (await url(client)) === path, { direct, refreshed, url: await url(client) });
  }
  // A direct deep link has no in-app parent in history: its close/return must stay in the app.
  await go(client, `${APP}/clubpm/chat/C_FIX_GENERAL?thread=1757700240.000100`, { waitMs: 1600 });
  await tap(client, '.pm-m-header button', { text: '' });
  const threadReturn = await url(client);
  R.check('direct link: header Back on a directly opened thread returns to its conversation, not off-site', threadReturn.startsWith('/clubpm/chat/C_FIX_GENERAL') && !threadReturn.includes('thread='), threadReturn);
  // Section switches replace history (contract D4), so Back from a project
  // section returns to the in-app parent that opened the project.
  await go(client, `${APP}/clubpm`);
  await tap(client, '[data-m-opener="projects"]');
  await tap(client, '.pm-m-layer .pm-m-row', { text: 'Orbital Debris' });
  await tap(client, '.pm-m-section-btn', { text: 'Files' });
  await tap(client, '.pm-m-section-btn', { text: 'Insights' });
  await back(client, 1200);
  const sectionBack = await url(client).catch(() => 'left the app');
  R.check('history: Back after switching project sections returns to the screen that opened the project (sections replace, D4)', sectionBack === '/clubpm', sectionBack);

  // ── Keyboard: focus trap, Escape, focus return (real key events) ───
  await go(client, `${APP}/clubpm`);
  await val(client, `document.querySelector('[data-m-opener="more"]').focus()`);
  await key(client, 'Enter');
  await sleep(400);
  const openedByKey = (await dialogName(client)) === 'More';
  const escaped = [];
  for (let i = 0; i < 40; i += 1) {
    await key(client, 'Tab', { shift: i % 7 === 6 });
    if (!(await val(client, `!!document.activeElement?.closest('[role="dialog"]')`))) escaped.push(i);
  }
  R.check('keyboard: Enter on More opens the sheet; 40 Tab/Shift+Tab presses never leave the dialog', openedByKey && escaped.length === 0, { openedByKey, escaped });
  await key(client, 'Escape');
  R.check('keyboard: Escape closes More and returns focus to the More button', !(await dialogName(client)) && (await val(client, `document.activeElement?.getAttribute('data-m-opener')`)) === 'more');
  await val(client, `document.querySelector('.pm-m-nav-item')?.focus()`);
  const navFocusVisible = await val(client, `(() => { const e=document.activeElement; const s=getComputedStyle(e); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 || s.boxShadow !== 'none'; })()`);
  R.check('keyboard: a focused bottom-bar item shows a visible focus indicator', navFocusVisible);
  await go(client, `${APP}/clubpm/projects/p1`);
  await val(client, `document.querySelector('.pm-m-task-main')?.focus()`);
  await key(client, 'Enter');
  await sleep(700);
  const taskByKey = !!(await dialogName(client));
  const taskEsc = [];
  for (let i = 0; i < 30; i += 1) { await key(client, 'Tab'); if (!(await val(client, `!!document.activeElement?.closest('[role="dialog"]')`))) taskEsc.push(i); }
  R.check('keyboard: Enter on a task row opens detail and Tab stays inside it', taskByKey && taskEsc.length === 0, { taskByKey, taskEsc });
  await key(client, 'Escape');
  await sleep(400);
  R.check('keyboard: Escape closes task detail and focus returns to a task row', !(await dialogName(client)) && await val(client, `!!document.activeElement?.closest('.pm-m-task-row')`), await val(client, `document.activeElement?.className`));
  await go(client, `${APP}/clubpm`);
  await key(client, 'k', { mods: 2 });
  await sleep(500);
  R.check('keyboard: Ctrl+K opens full-screen Search on the phone shell (hardware keyboard)', !!(await dialogName(client)) && await val(client, `document.activeElement?.tagName === 'INPUT'`), await dialogName(client));
  await key(client, 'Escape');

  // ── Accessibility tree (automated proxy for a screen-reader pass) ──
  await go(client, `${APP}/clubpm/projects/p1`);
  await client.send('Accessibility.enable');
  let ax = (await client.send('Accessibility.getFullAXTree')).nodes;
  const named = (role, name) => ax.some((n) => n.role?.value === role && (name ? n.name?.value === name : true) && !n.ignored);
  const unnamedButtons = ax.filter((n) => !n.ignored && ['button', 'link'].includes(n.role?.value) && !(n.name?.value || '').trim()).length;
  R.check('a11y tree: Primary navigation landmark and banner/main are exposed', named('navigation', 'Primary') && named('main'), { nav: named('navigation', 'Primary'), main: named('main') });
  // Chrome's AX tree has no aria-current property, so read it from the DOM.
  const current = await val(client, `[...document.querySelectorAll('.pm-m-nav [aria-current]')].map(e => e.textContent.trim() + '=' + e.getAttribute('aria-current'))`);
  R.check('a11y: exactly one current item in the bottom bar (Projects on a project route)', current.length === 1 && /^Projects=/.test(current[0]), current);
  R.check('a11y tree: no unnamed buttons or links on the phone task screen', unnamedButtons === 0, unnamedButtons);
  await tap(client, '[data-m-opener="projects"]');
  ax = (await client.send('Accessibility.getFullAXTree')).nodes;
  const dialogs = ax.filter((n) => !n.ignored && n.role?.value === 'dialog').map((n) => n.name?.value);
  const exposedOutside = ax.filter((n) => !n.ignored && n.role?.value === 'link' && /Home|Chat|Calendar/.test(n.name?.value || '')).length;
  // The opener sits under the inert #root while the sheet is open, so it is out of the AX tree by design; read its state from the DOM.
  const expanded = await val(client, `[...document.querySelectorAll('[aria-expanded="true"]')].map(e => e.getAttribute('aria-label') || e.textContent.trim())`);
  R.check('a11y tree: open Projects sheet is a named dialog, background links are removed from the tree, opener reports expanded', dialogs.length === 1 && dialogs[0] && exposedOutside === 0 && expanded.some((n) => /Projects/.test(n || '')), { dialogs, exposedOutside, expanded });
  await key(client, 'Escape');
  await client.send('Accessibility.disable');

  // ── Drafts across rotation and breakpoint crossing ─────────────────
  await go(client, `${APP}/clubpm/chat/C_FIX_GENERAL`);
  await waitFor(client, '.cpm-chat-composer-input');
  await fill(client, '.cpm-chat-composer-input', 'FIXTURE draft survives rotation');
  for (const vp of [VP.l844, VP.p390, VP.d1280, VP.p390]) { await setViewport(client, vp); await sleep(700); }
  R.check('drafts: chat composer text survives portrait → landscape → desktop width → portrait', (await val(client, `document.querySelector('.cpm-chat-composer-input')?.value`)) === 'FIXTURE draft survives rotation');
  await fill(client, '.cpm-chat-composer-input', '');
  await go(client, `${APP}/clubpm/members?view=dms&dm=D_FIX_JORDAN`);
  await waitFor(client, '.cpm-dm-panel .cpm-chat-composer-input');
  await fill(client, '.cpm-dm-panel .cpm-chat-composer-input', 'FIXTURE DM draft');
  await setViewport(client, VP.l844); await sleep(600); await setViewport(client, VP.p390); await sleep(600);
  R.check('drafts: DM composer text survives rotation', (await val(client, `document.querySelector('.cpm-dm-panel .cpm-chat-composer-input')?.value`)) === 'FIXTURE DM draft');
  await val(client, `document.querySelector('.cpm-dm-panel .cpm-chat-composer-input').focus()`);
  await setViewport(client, { width: 390, height: 480, mobile: true }); await sleep(600);
  const dmKb = await val(client, `({ bottom: Math.round(document.querySelector('.cpm-dm-panel .cpm-chat-composer')?.getBoundingClientRect().bottom||0), vh: Math.round(visualViewport?.height||innerHeight), open: document.querySelector('.pm-shell')?.classList.contains('pm-m-keyboard-open') })`);
  R.check('composer: DM composer stays visible with a keyboard-contracted viewport', dmKb.open && dmKb.bottom > 0 && dmKb.bottom <= dmKb.vh, dmKb);
  await setViewport(client, VP.p390); await sleep(500);
  await go(client, `${APP}/clubpm/chat/C_FIX_GENERAL?thread=1757700240.000100`);
  await waitFor(client, '.cpm-chat-drawer .cpm-chat-composer-input');
  await val(client, `document.querySelector('.cpm-chat-drawer .cpm-chat-composer-input').focus()`);
  await setViewport(client, { width: 390, height: 480, mobile: true }); await sleep(600);
  const thKb = await val(client, `({ bottom: Math.round(document.querySelector('.cpm-chat-drawer .cpm-chat-composer')?.getBoundingClientRect().bottom||0), vh: Math.round(visualViewport?.height||innerHeight) })`);
  R.check('composer: thread composer stays visible with a keyboard-contracted viewport', thKb.bottom > 0 && thKb.bottom <= thKb.vh, thKb);
  await setViewport(client, VP.p390); await sleep(400);

  // ── Duplicate listeners / requests across navigation (prod build) ──
  await fixture('reset-log');
  await go(client, `${APP}/clubpm`, { waitMs: 2500 });
  const steady = await fixture('log');
  const routeHops = ['Chat', 'Calendar', 'Home'];
  for (const label of routeHops) { await tap(client, '.pm-m-nav-item', { text: label }); await sleep(1200); }
  const after = await fixture('log');
  const live = await val(client, `(window.__p5es || []).filter(e => e.readyState !== 2).length`);
  R.check('listeners: exactly one live notification EventSource in the page after three bottom-bar navigations', live === 1, { live, streamsOpenedSinceReset: after.sse.opened });
  R.notes.push({ requestsFirstLoad: steady.log, requestsAfterThreeHops: after.log, sse: after.sse });

  R.write({ timingsMs: timings });
} finally {
  await fixture('state?persona=member&slowWrites=0').catch(() => {});
  await closeAll(close);
}
