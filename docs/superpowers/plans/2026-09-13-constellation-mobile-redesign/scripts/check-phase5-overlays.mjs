// Phase 5 — every remaining dialog/secondary action from the Phase 0 overlay
// inventory (inventory.md §5) opened at 320px: does it fit, and are its
// actions reachable? Also the Outreach floating "new submission" button.
// Admin persona (sees every gated trigger). Nothing is submitted.
import {
  VP, makeReport, fixture, start, setViewport, go, tap, key, val, sleep, closeAll, waitFor,
} from './phase5-lib.mjs';

const APP = process.env.APP_URL || 'http://localhost:4002';
const R = makeReport('overlays');

// Measures the top-most dialog-like surface (role=dialog, else a known overlay box).
const FIT = (boxSel) => `(() => {
  const vw = innerWidth, vh = innerHeight;
  const cands = [...document.querySelectorAll(${JSON.stringify(boxSel)})].filter(e => { const b=e.getBoundingClientRect(); return b.width>0 && b.height>0; });
  const box = cands.pop();
  if (!box) return { found: false };
  const b = box.getBoundingClientRect();
  const ctrls = [...box.querySelectorAll('button, a[href], input, select, textarea')].filter(e => { const r=e.getBoundingClientRect(); return r.width>0 && r.height>0; });
  const beyond = ctrls.filter(e => { const r=e.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1; }).map(e => (e.getAttribute('aria-label') || e.textContent || e.name || e.tagName).trim().slice(0, 30));
  const small = ctrls.filter(e => e.matches('button, a[href]')).filter(e => { const r=e.getBoundingClientRect(); return r.height < 32; }).map(e => (e.getAttribute('aria-label') || e.textContent).trim().slice(0, 24));
  const fonts = ctrls.filter(e => e.matches('input:not([type=checkbox]):not([type=radio]):not([type=color]), select, textarea')).map(e => parseFloat(getComputedStyle(e).fontSize)).filter(f => f < 16);
  return { found: true, rect: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)],
    horizontallyInside: b.left >= -1 && b.right <= vw + 1, scrollable: box.scrollHeight > box.clientHeight + 1 || getComputedStyle(box).overflowY !== 'visible',
    tallerThanScreen: b.height > vh + 1, beyond, small, smallFonts: fonts.length, pageOverflow: document.documentElement.scrollWidth - vw };
})()`;

const { client, close } = await start(R, { port: 9244 });
try {
  await fixture('state?persona=admin&projects=few&failProjects=0&slowWrites=0&failAuth=0&slackExpired=0');
  await setViewport(client, VP.p320);
  const results = {};
  const record = async (name, sel, extraOk = () => true) => {
    const f = await val(client, FIT(sel));
    results[name] = f;
    const ok = f.found && f.horizontallyInside && f.beyond.length === 0 && f.pageOverflow <= 0 && f.smallFonts === 0 && !f.small.some((t) => /^Close/.test(t)) && extraOk(f);
    R.check(`${name}: opens on a 320px phone inside the screen, no control past the edge, 16px form text, touch-sized close`, ok, f);
    await R.shot(client, `p320-overlay-${name}`);
    return f;
  };

  // Create project (admin) from the Projects sheet.
  await go(client, `${APP}/clubpm`);
  await tap(client, '[data-m-opener="projects"]');
  await tap(client, '.pm-m-layer button', { text: 'New project' });
  await sleep(500);
  await record('create-project', '[role="dialog"], .pm-create-project-modal, form');
  await key(client, 'Escape'); await sleep(300);
  await go(client, `${APP}/clubpm`);

  // Edit project from Project actions.
  await go(client, `${APP}/clubpm/projects/p1`);
  await tap(client, '[data-tour-id="project.actions"]');
  await tap(client, '.pm-m-layer .pm-m-row', { text: 'Edit project' });
  await sleep(600);
  await record('edit-project', '.cpm-proj-edit-overlay > *, [role="dialog"]');
  await key(client, 'Escape');

  // TaskModal overflow menu and its sub-dialogs.
  for (const [label, name] of [['Move Task', 'task-move'], ['Shift Deadlines', 'task-shift'], ['Change Parent Task', 'task-parent']]) {
    await go(client, `${APP}/clubpm/projects/p1?task=t3`);
    await waitFor(client, '[data-tour-id="task.modal.status"]');
    const opened = await val(client, `(() => { const b=document.querySelector('.pm-m-task-detail button[aria-label="More task actions"]'); if(!b) return false; b.click(); return true; })()`);
    await sleep(300);
    const menu = await val(client, `(() => { const items=[...document.querySelectorAll('.pm-m-task-detail button')].filter(b=>/Duplicate|Move Task|Shift Deadlines|Change Parent|Archive/.test(b.textContent)); return items.map(b=>{const r=b.getBoundingClientRect(); return { t:b.textContent.trim(), h:Math.round(r.height), right:Math.round(r.right) }; }); })()`);
    if (name === 'task-move') R.check('task overflow menu: opens on a phone and every item is inside the screen', opened && menu.length >= 4 && menu.every((m) => m.right <= 321), { opened, menu });
    if (name === 'task-move') R.notes.push({ taskMenuItemHeights: menu });
    const clicked = await val(client, `(() => { const b=[...document.querySelectorAll('.pm-m-task-detail button')].find(x=>x.textContent.trim()===${JSON.stringify(label)}); if(!b) return false; b.click(); return true; })()`);
    await sleep(500);
    if (!clicked) { R.check(`${name}: menu item present`, false); continue; }
    await record(name, '[role="dialog"]:not(.pm-m-layer [role="dialog"]), .pm-task-submodal, [style*="z-index: 1000"] > div, [style*="z-index: 1100"] > div');
  }

  // Outreach: floating New submission button + its form.
  await go(client, `${APP}/clubpm/outreach?tab=board`);
  const fab = await val(client, `(() => { const f=document.querySelector('.pm-fab'); const n=document.querySelector('.pm-m-nav'); if(!f||!n) return null; const a=f.getBoundingClientRect(), b=n.getBoundingClientRect();
    const at=document.elementFromPoint(a.left+a.width/2, a.top+a.height/2); return { fab:[Math.round(a.top),Math.round(a.bottom),Math.round(a.width)], navTop: Math.round(b.top), hit: !!at && (at===f||f.contains(at)) }; })()`);
  R.check('outreach: the New submission button sits above the bottom bar and is hit-testable', fab && fab.fab[1] <= fab.navTop && fab.hit && fab.fab[2] >= 44, fab);
  await val(client, `document.querySelector('.pm-fab')?.click()`);
  await sleep(600);
  await record('outreach-new-submission', '[role="dialog"], .pm-modal, .pm-submission-modal');
  await key(client, 'Escape');

  // Blog Generate modal.
  await go(client, `${APP}/clubpm/outreach?tab=blog`);
  const gen = await val(client, `(() => { const b=[...document.querySelectorAll('button')].find(x=>/Generate from text/.test(x.textContent)); if(!b) return false; b.click(); return true; })()`);
  await sleep(500);
  if (gen) await record('blog-generate', '[aria-label="Generate blog post from text"]');
  else R.check('blog-generate: trigger present', false);
  await key(client, 'Escape');

  // Courses progress dashboard + assign modal (admin).
  await go(client, `${APP}/clubpm/courses`);
  const dash = await val(client, `(() => { const b=document.querySelector('[data-tour-id="courses.progress"]'); if(!b) return false; b.click(); return true; })()`);
  await sleep(900);
  R.check('courses: admin Progress dashboard opens without page overflow', dash && (await val(client, 'document.documentElement.scrollWidth - innerWidth')) <= 0, dash);
  const assign = await val(client, `(() => { const b=[...document.querySelectorAll('button')].find(x=>/^\\s*Assign/.test(x.textContent)); if(!b) return false; b.click(); return true; })()`);
  await sleep(600);
  if (assign) await record('course-assign', '[role="dialog"]');
  else R.notes.push({ courseAssign: 'no Assign trigger with fixture data (dashboard needs a selected course)' });
  await key(client, 'Escape');

  // GitHub contributor import (project Members, admin).
  await go(client, `${APP}/clubpm/projects/p1?tab=chat&view=members`);
  const imp = await val(client, `(() => { const b=[...document.querySelectorAll('button')].find(x=>/Import/.test(x.textContent) && /contributor|github/i.test(x.textContent + (x.title||''))); if(!b) return false; b.click(); return true; })()`);
  await sleep(600);
  if (imp) await record('contributor-import', '[aria-label="Import GitHub contributors"]');
  else R.notes.push({ contributorImport: 'trigger not rendered for fixture project (needs a linked repo)' });

  // Keyboard shortcuts from More.
  await go(client, `${APP}/clubpm`);
  await tap(client, '[data-m-opener="more"]');
  await tap(client, '.pm-m-layer .pm-m-row', { text: 'Keyboard shortcuts' });
  await sleep(500);
  await record('shortcuts', '.pm-shortcuts-modal');

  R.write({ results });
} finally {
  await fixture('state?persona=member').catch(() => {});
  await closeAll(close);
}
