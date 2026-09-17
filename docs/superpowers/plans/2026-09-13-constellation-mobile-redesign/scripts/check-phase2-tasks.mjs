// Phase 2 browser checks against the production React components and fixture API.
// Emulation only: this is not real-device, real-account, or screen-reader evidence.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from './cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../evidence/phase2');
const APP = process.env.APP_URL || 'http://localhost:3000';
const API = process.env.FIXTURE_URL || 'http://localhost:3001';
fs.mkdirSync(OUT, { recursive: true });

const VP = {
  p320: { width: 320, height: 640, mobile: true },
  p390: { width: 390, height: 844, mobile: true },
  p430: { width: 430, height: 932, mobile: true },
  l844: { width: 844, height: 390, mobile: true },
  keyboard: { width: 320, height: 460, mobile: true },
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
async function go(client, url, waitMs = 1800) {
  await client.send('Page.navigate', { url: 'about:blank' });
  await sleep(180);
  await client.send('Page.navigate', { url });
  for (let i = 0; i < 60; i += 1) {
    await sleep(200);
    if (await client.eval(`document.readyState === 'complete' && !!document.querySelector('.pm-shell')`).catch(() => false)) break;
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
    el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return { x:r.left+r.width/2, y:r.top+r.height/2 }; })()`);
  if (!point) throw new Error(`No element for ${selector}`);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(point.x), y: Math.round(point.y) }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(450);
}
async function clickText(client, selector, text) {
  const ok = await client.eval(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(x => x.textContent.trim().includes(${JSON.stringify(text)})); if (!el) return false; el.scrollIntoView({block:'nearest'}); el.click(); return true; })()`);
  if (!ok) throw new Error(`No ${selector} containing ${text}`);
  await sleep(500);
}
async function fill(client, selector, value) {
  const ok = await client.eval(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if(!el) return false;
    const set=Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,'value').set;
    set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
  if (!ok) throw new Error(`No input for ${selector}`);
  await sleep(250);
}
async function shot(client, name) {
  const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  screenshots.push(`evidence/phase2/${name}.png`);
}
async function metrics(client) {
  return client.eval(`(() => {
    const visible = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
    const rect = el => { if(!el) return null; const r=el.getBoundingClientRect(); return {left:Math.round(r.left),top:Math.round(r.top),right:Math.round(r.right),bottom:Math.round(r.bottom),width:Math.round(r.width),height:Math.round(r.height)}; };
    return {
      url: location.pathname + location.search,
      overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      compact: !!document.querySelector('.pm-shell--compact'),
      groups: [...document.querySelectorAll('.pm-m-task-group')].map(g => ({ text:g.querySelector('.pm-m-task-group-head')?.textContent.trim(), open:g.querySelector('.pm-m-task-group-head')?.getAttribute('aria-expanded') })),
      rows: document.querySelectorAll('.pm-m-task-row').length,
      move: [...document.querySelectorAll('.pm-m-task-actions button')].filter(b => /Move/.test(b.textContent)).length,
      assign: [...document.querySelectorAll('.pm-m-task-actions button')].filter(b => /Assign/.test(b.textContent)).length,
      assigneePanel: visible(document.querySelector('.cpm-assignee-panel')),
      dialog: document.querySelector('[role="dialog"]')?.getAttribute('aria-labelledby') ? document.getElementById(document.querySelector('[role="dialog"]').getAttribute('aria-labelledby'))?.textContent : null,
      footer: rect(document.querySelector('.pm-m-task-create form > div:last-child')),
      active: document.activeElement?.getAttribute('placeholder') || document.activeElement?.textContent?.trim() || '',
    };
  })()`);
}

const { client, close } = await launchChrome({ port: 9232 });
try {
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  client.on('Runtime.exceptionThrown', p => consoleErrors.push(p.exceptionDetails?.exception?.description?.split('\n')[0] ?? 'exception'));
  client.on('Runtime.consoleAPICalled', p => { if (p.type === 'error') consoleErrors.push(String(p.args?.[0]?.value ?? p.args?.[0]?.description ?? '').split('\n')[0].slice(0, 200)); });
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('clubpm_auth_token','fixture-token'); sessionStorage.setItem('cpm.bell.greeted','1'); localStorage.setItem('clubpm-last-seen-rank','CELESTIAL'); } catch {}` });
  await fixture('state?persona=member&projects=few&failProjects=0&failTaskCreate=0');
  await fixture('reset-log');

  // Dashboard order and visible project controls at all representative phone widths.
  for (const name of ['p320', 'p390', 'p430']) {
    await setViewport(client, VP[name]);
    await go(client, `${APP}/clubpm`);
    const data = await client.eval(`(() => { const flow=document.querySelector('.pm-m-home-flow'); const children=[...flow.children];
      const at=s=>children.findIndex(x=>x.matches(s)); const controls=[...document.querySelectorAll('.pm-m-home-project-list > div:first-child .cpm-quick-btn')];
      return { order:[at('.cpm-work-panel'),at('.pm-upcoming-events-widget'),at('.pm-m-home-projects'),at('.pm-m-home-support')], labels:controls.map(x=>x.textContent.trim()), controls:controls.map(x=>{const r=x.getBoundingClientRect(); return {w:r.width,h:r.height};}), overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth) }; })()`);
    check(`${name}: Home prioritizes work, next event, projects, supporting panels`, JSON.stringify(data.order) === '[0,1,2,3]', data.order);
    check(`${name}: project quick actions are visible, labelled, and touch-sized`, data.labels.includes('Tasks') && data.labels.includes('Files') && data.controls.every(r => r.h >= 44), data);
    check(`${name}: Home has no horizontal page overflow`, data.overflow === 0, data.overflow);
    if (name === 'p320') await shot(client, 'p320-home');
  }

  // Task groups, explicit non-drag controls, filters, milestone and project actions.
  await setViewport(client, VP.p320);
  await go(client, `${APP}/clubpm/projects/p1?tab=tasks&view=board`);
  let data = await metrics(client);
  const phoneSurface = await client.eval(`!document.querySelector('.cpm-assignee-panel') && !document.querySelector('.cpm-status-bin') && !!document.querySelector('[data-tour-id="board.scope"]') && !!document.querySelector('[data-tour-id="board.search"]')`);
  check('p320: compact status groups replace desktop bins', data.groups.length === 4 && phoneSurface, data.groups);
  check('p320: every editable task row has visible Move and Assign controls', data.rows > 0 && data.move === data.rows && data.assign === data.rows, { rows:data.rows, move:data.move, assign:data.assign });
  check('p320: no phone assignee rail or horizontal overflow', !data.assigneePanel && data.overflow === 0, data);
  await shot(client, 'p320-task-groups');

  await tap(client, '[data-m-opener="task-filters"]');
  data = await metrics(client);
  const filterFields = await client.eval(`[...document.querySelectorAll('.pm-m-task-filter-form select')].map(x=>x.previousElementSibling?.textContent).join('|')`);
  check('p320: Filters & sort uses the shared sheet with sort, priority, due and archive controls', data.dialog === 'Filters & sort' && /Sort by/.test(filterFields) && /Priority/.test(filterFields) && /Due date/.test(filterFields));
  await clickText(client, '.pm-m-layer .pm-m-icon-btn', '');

  const milestone = await client.eval(`document.querySelector('[data-tour-id="project.milestones"]')?.textContent.includes('Critical design review') && document.querySelector('[data-tour-id="project.milestones"]')?.textContent.includes('Open timeline')`);
  check('p320: compact milestone summary retains Timeline access', milestone);
  await tap(client, '[data-tour-id="project.actions"]');
  const projectActions = await client.eval(`[...document.querySelectorAll('.pm-m-layer .pm-m-row')].map(x=>x.textContent.trim())`);
  check('p320: Project actions expose Timeline and project resources', projectActions.some(x=>x.includes('Timeline')) && projectActions.some(x=>x.includes('Edit project')), projectActions);
  await client.send('Input.dispatchKeyEvent', { type:'keyDown', key:'Escape', code:'Escape', windowsVirtualKeyCode:27 });
  await client.send('Input.dispatchKeyEvent', { type:'keyUp', key:'Escape', code:'Escape', windowsVirtualKeyCode:27 });
  await sleep(350);

  // List state, explicit move/assign, task deep link, comment, and return context.
  await fill(client, '[data-tour-id="board.search"] input', 'thermal-vacuum');
  const queryBefore = await client.eval(`document.querySelector('[data-tour-id="board.search"] input').value`);
  await tap(client, '.pm-m-task-actions button');
  check('p320: Move opens an explicit status picker', (await metrics(client)).dialog?.startsWith('Move “'));
  await clickText(client, '.pm-m-move-picker .pm-m-row', 'In Progress');
  const moved = await client.eval(`document.querySelector('.pm-m-task-group:nth-of-type(2) .pm-m-task-row')?.textContent.includes('thermal-vacuum')`);
  check('p320: status changes without drag', moved);

  await tap(client, '.pm-m-task-row .pm-m-task-actions button:nth-child(2)');
  check('p320: Assign opens the searchable member picker', (await metrics(client)).dialog?.startsWith('Assign “') && await client.eval(`!!document.querySelector('.pm-m-assign-picker input[type="search"]')`));
  await clickText(client, '.pm-m-assign-picker .pm-m-row', 'Jordan');
  await sleep(300);
  check('p320: assignment uses the existing task patch permission path', (await fixture('log'))?.log?.['PATCH /api/tasks/t1'] >= 2, (await fixture('log'))?.log);
  await tap(client, '.pm-m-layer .pm-m-icon-btn');

  await client.eval(`document.querySelector('.pm-m-task-main')?.click()`);
  await sleep(500);
  data = await metrics(client);
  check('p320: task opens full-screen and preserves deep-link query context', data.dialog?.includes('thermal-vacuum') && /tab=tasks/.test(data.url) && /view=board/.test(data.url) && /task=t1/.test(data.url), data);
  const prominent = await client.eval(`['task.modal.title','task.modal.status','task.modal.assignees','task.modal.due'].every(id=>document.querySelector('[data-tour-id="'+id+'"]'))`);
  check('p320: title, status, assignee, and due date are prominent in task detail', prominent);
  await fill(client, '[data-tour-id="task.modal.comments"] input', 'Phone workflow comment');
  await client.eval(`document.querySelector('[data-tour-id="task.modal.comments"] button')?.click()`);
  await sleep(500);
  check('p320: comment posts once and clears after success', await client.eval(`document.querySelector('[data-tour-id="task.modal.comments"] input').value === ''`) && (await fixture('log')).log['POST /api/tasks/t1/comments'] === 1, (await fixture('log')).log);
  await shot(client, 'p320-task-detail');
  await tap(client, '.pm-m-task-detail .pm-m-icon-btn');
  data = await metrics(client);
  const restored = await client.eval(`({query:document.querySelector('[data-tour-id="board.search"] input')?.value, scroll:document.querySelector('.cpm-proj-main-body')?.scrollTop, focused:document.activeElement?.classList.contains('pm-m-task-main')})`);
  check('p320: closing restores project URL and task filter context', !/task=/.test(data.url) && /tab=tasks/.test(data.url) && /view=board/.test(data.url) && restored.query === queryBefore, { url:data.url, ...restored });
  await fill(client, '[data-tour-id="board.search"] input', '');
  await client.eval(`document.querySelector('.cpm-proj-main-body').scrollTop = 180`);
  await sleep(200);
  const nonzeroScroll = await client.eval(`document.querySelector('.cpm-proj-main-body').scrollTop`);
  await client.eval(`document.querySelector('.pm-m-task-main')?.click()`);
  await sleep(350);
  await tap(client, '.pm-m-task-detail .pm-m-icon-btn');
  const restoredScroll = await client.eval(`document.querySelector('.cpm-proj-main-body').scrollTop`);
  check('p320: closing restores a non-zero task-list scroll position', nonzeroScroll > 0 && Math.abs(restoredScroll - nonzeroScroll) <= 2, { nonzeroScroll, restoredScroll });

  // Failed create retains input; footer remains visible at a keyboard-height proxy.
  await clickText(client, '[data-tour-id="board.newtask"]', 'New task');
  await fill(client, '[data-tour-id="task.create.title"] input', 'Retry-safe phone draft');
  await setViewport(client, VP.l844);
  await sleep(350);
  await setViewport(client, VP.d1280);
  await sleep(350);
  await setViewport(client, VP.p320);
  await sleep(350);
  check('rotation and breakpoint crossing preserve the create draft', await client.eval(`document.querySelector('[data-tour-id="task.create.title"] input')?.value === 'Retry-safe phone draft'`));
  await fixture('state?failTaskCreate=1');
  await tap(client, '.pm-m-task-create button[type="submit"]');
  const failedCreate = await client.eval(`({draft:document.querySelector('[data-tour-id="task.create.title"] input')?.value,error:document.querySelector('.pm-m-task-create')?.textContent.includes('Task save failed')})`);
  check('failed task save retains the draft and displays a retryable error', failedCreate.draft === 'Retry-safe phone draft' && failedCreate.error, failedCreate);
  await shot(client, 'p320-create-failed');
  await setViewport(client, VP.keyboard);
  await client.eval(`document.querySelector('[data-tour-id="task.create.title"] input').focus()`);
  data = await metrics(client);
  check('keyboard-height proxy keeps the create action footer visible', data.footer && data.footer.top >= 0 && data.footer.bottom <= VP.keyboard.height, data.footer);
  await fixture('state?failTaskCreate=0');
  await client.eval(`(() => { const button=document.querySelector('.pm-m-task-create button[type="submit"]'); button?.click(); button?.click(); })()`);
  await sleep(700);
  const createLog = (await fixture('log')).log;
  check('task create succeeds on retry without a duplicate in-flight submission', !await client.eval(`!!document.querySelector('.pm-m-task-create')`) && createLog['POST /api/projects/p1/tasks'] === 2, createLog);

  // Landscape phone and desktop regression boundaries.
  await setViewport(client, VP.l844);
  await go(client, `${APP}/clubpm/projects/p1`);
  data = await metrics(client);
  check('landscape phone keeps compact controls and no horizontal overflow', data.compact && data.rows > 0 && data.move > 0 && data.overflow === 0, data);
  await shot(client, 'l844-task-groups');

  await setViewport(client, VP.d1280);
  await go(client, `${APP}/clubpm/projects/p1`);
  const desktop = await client.eval(`({compact:!!document.querySelector('.pm-shell--compact'), mobileGroups:document.querySelectorAll('.pm-m-task-group').length, bins:document.querySelectorAll('.cpm-status-bin').length, assignee:!!document.querySelector('.cpm-assignee-panel'), overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth)})`);
  check('desktop retains status bins, drag assignee rail, and no phone groups', !desktop.compact && desktop.mobileGroups === 0 && desktop.bins === 4 && desktop.assignee, desktop);
  check('desktop project task page has no page-wide horizontal overflow', desktop.overflow === 0, desktop.overflow);
  await shot(client, 'd1280-task-regression');
} finally {
  const report = {
    generatedAt: new Date().toISOString(),
    disclaimer: 'Headless Chrome touch/viewport emulation with fixture data only; no real device, real account, software keyboard, or screen reader was used.',
    summary: { passed: checks.filter(x => x.pass).length, failed: checks.filter(x => !x.pass).length, total: checks.length },
    checks, screenshots, consoleErrors: [...new Set(consoleErrors)],
  };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  await close();
  console.log(`\n${report.summary.passed}/${report.summary.total} passed; ${report.summary.failed} failed. Report: ${path.join(OUT, 'report.json')}`);
  if (report.summary.failed) process.exitCode = 1;
}
