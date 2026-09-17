// Phase 5 — full destination × viewport matrix, enlarged text, safe areas,
// rollback switch, roles, and expired/empty/error states.
//
// Runs against PRODUCTION builds served by serve-build.mjs (no dev server, no
// StrictMode double effects):
//   APP      = working-tree build            (default http://localhost:4002)
//   APP_OFF  = same tree, REACT_APP_CLUBPM_COMPACT=off (default :4003)
//   APP_HEAD = HEAD (pre-redesign) build       (default :4001)
// Emulation only; see phase5-lib.mjs.
import {
  VP, makeReport, fixture, start, setViewport, go, tap, key, val, url, visible,
  back, reload, SHELL, waitFor, sleep, closeAll, fill,
} from './phase5-lib.mjs';

const APP = process.env.APP_URL || 'http://localhost:4002';
const APP_OFF = process.env.APP_OFF_URL || 'http://localhost:4003';
const APP_HEAD = process.env.APP_HEAD_URL || 'http://localhost:4001';
const R = makeReport('matrix');

// Every Phase 0 destination (inventory.md §1–§2) plus the project sub-views and
// legacy redirects. [name, path, expected current bottom item, adminOnly]
const P = '/clubpm/projects/p1';
const ROUTES = [
  ['home', '/clubpm', 'Home'],
  ['tasks', P, 'Projects'],
  ['files', `${P}?tab=files`, 'Projects'],
  ['project-chat', `${P}?tab=chat`, 'Projects'],
  ['project-members', `${P}?tab=chat&view=members`, 'Projects'],
  ['insights', `${P}?tab=insights`, 'Projects'],
  ['activity', `${P}?tab=insights&view=activity`, 'Projects'],
  ['presskit', `${P}?tab=insights&view=presskit`, 'Projects'],
  ['ai', `${P}?tab=insights&view=ai`, 'Projects'],
  ['legacy-members', `${P}?tab=members`, 'Projects'],
  ['legacy-reports', `${P}?tab=reports`, 'Projects'],
  ['legacy-ai', `${P}?tab=ai`, 'Projects'],
  ['task-deeplink', `${P}?task=t3`, 'Projects'],
  ['empty-project', '/clubpm/projects/p4', 'Projects'],
  ['gantt', `${P}/gantt`, 'Projects'],
  ['members', '/clubpm/members', 'Chat'],
  ['dm', '/clubpm/members?view=dms&dm=D_FIX_JORDAN', 'Chat'],
  ['chat', '/clubpm/chat', 'Chat'],
  ['conversation', '/clubpm/chat/C_FIX_GENERAL', 'Chat'],
  ['thread', '/clubpm/chat/C_FIX_GENERAL?thread=1757700240.000100', 'Chat'],
  ['private-channel', '/clubpm/chat/C_FIX_PRIV', 'Chat'],
  ['preview-channel', '/clubpm/chat/C_FIX_RANDOM', 'Chat'],
  ['notifications', '/clubpm/notifications', 'More'],
  ['prefs', '/clubpm/notifications/preferences', 'More'],
  ['calendar', '/clubpm/calendar', 'Calendar'],
  ['event', '/clubpm/calendar?event=e1', 'Calendar'],
  ['admin', '/clubpm/admin', 'More', true],
  ['meeting-notes', '/clubpm/meeting-notes', 'More', true],
  ...['composer', 'board', 'calendar', 'campaigns', 'crm', 'blog', 'insights'].map((t) => [`outreach-${t}`, `/clubpm/outreach?tab=${t}`, 'More']),
  ['blog-editor', '/clubpm/outreach/blog/b1/edit', 'More'],
  ['courses', '/clubpm/courses', 'More'],
  ['course-editor', '/clubpm/courses/co1/edit', 'More', true],
  ['course-learn', '/clubpm/courses/fixture-course/learn', 'More'],
  ['legacy-outreach-courses', '/clubpm/outreach/courses', 'More'],
  ['profile', '/clubpm/profile', 'More'],
  ['profile-other', '/clubpm/profile/m2', 'More'],
  ['shop', '/clubpm/shop', 'More'],
  ['challenges', '/clubpm/challenges', 'More'],
];

// Insights › Activity and Press Kit hit the ErrorBoundary on the HEAD build too
// (fixture data shape: 'audience' / activity rows). Recorded, not a regression.
const FIXTURE_BOUNDARY = new Set(['activity', 'presskit']);

const { client, close } = await start(R, { port: 9241 });
const matrix = {};
try {
  await fixture('state?persona=admin&projects=few&failProjects=0&failTaskCreate=0&failChatSend=0&slowWrites=0&failAuth=0&slackExpired=0');

  // ── 1. Every destination at every phone viewport ─────────────────
  for (const vpName of ['p320', 'p360', 'p390', 'p430', 'l667', 'l844']) {
    await setViewport(client, VP[vpName]);
    const bad = [];
    for (const [name, path, current] of ROUTES) {
      await go(client, APP + path, { waitMs: 1100 });
      const s = await val(client, SHELL);
      matrix[`${vpName}:${name}`] = s;
      const problems = [];
      if (!s.compact || !s.bodyMarker) problems.push('not compact');
      if (s.sidebar || s.topbar) problems.push('desktop chrome visible');
      if (s.overflowX > 0) problems.push(`overflowX ${s.overflowX}`);
      if (s.navCount !== 5 || (!s.modal && !s.navHit) || !s.navInView) problems.push(`nav ${s.navCount} hit=${s.navHit} inView=${s.navInView}`);
      if (s.navTruncated.length) problems.push(`truncated ${s.navTruncated}`);
      if (s.navCurrent.length !== 1 || s.navCurrent[0] !== current) problems.push(`current ${JSON.stringify(s.navCurrent)} != ${current}`);
      if (!s.headerTitle) problems.push('no header title');
      if (!s.modal && !s.headerHit) problems.push('header control covered');
      if (s.small.length) problems.push(`small ${s.small}`);
      if (s.duplicateTourIds.length) problems.push(`dup ids ${s.duplicateTourIds}`);
      if (s.errorBoundary && !FIXTURE_BOUNDARY.has(name)) problems.push('error boundary');
      if (problems.length) bad.push({ name, url: s.url, problems });
      if (vpName === 'p320' && ['home', 'tasks', 'conversation', 'calendar', 'course-learn', 'outreach-board', 'admin'].includes(name)) await R.shot(client, `${vpName}-${name}`);
      if (vpName === 'l667' && ['home', 'tasks', 'conversation'].includes(name)) await R.shot(client, `${vpName}-${name}`);
    }
    R.check(`${vpName}: all ${ROUTES.length} destinations mount the phone shell with 5 hit-testable untruncated nav items, one correct current item, a title, ≥44px chrome, no page overflow, no duplicate anchors, no error boundary`,
      bad.length === 0, bad);
  }

  // ── 2. Boundary and wide layouts keep the desktop shell ───────────
  const DESKTOP_SET = ROUTES.filter(([n]) => ['home', 'tasks', 'files', 'insights', 'chat', 'conversation', 'members', 'calendar', 'notifications', 'admin', 'outreach-board', 'course-learn', 'gantt', 'shop', 'profile'].includes(n));
  for (const vpName of ['x767', 'x768', 't1024', 'd1280', 'd1440']) {
    await setViewport(client, VP[vpName]);
    const expectCompact = vpName === 'x767';
    const bad = [];
    for (const [name, path] of (vpName === 'd1280' ? ROUTES : DESKTOP_SET)) {
      await go(client, APP + path, { waitMs: 1000 });
      const s = await val(client, SHELL);
      matrix[`${vpName}:${name}`] = s;
      const problems = [];
      if (s.compact !== expectCompact || s.bodyMarker !== expectCompact) problems.push(`compact=${s.compact} marker=${s.bodyMarker}`);
      if (!expectCompact && (!s.sidebar || !s.topbar || s.navCount)) problems.push('desktop chrome missing / phone nav present');
      if (s.overflowX > 0) problems.push(`overflowX ${s.overflowX}`);
      if (s.errorBoundary && !FIXTURE_BOUNDARY.has(name)) problems.push('error boundary');
      if (s.duplicateTourIds.length) problems.push(`dup ids ${s.duplicateTourIds}`);
      if (problems.length) bad.push({ name, problems });
    }
    R.check(`${vpName}: ${expectCompact ? 'narrow mouse window gets the phone shell' : 'desktop shell'} on ${vpName === 'd1280' ? 'every' : 'representative'} destination, no page overflow`, bad.length === 0, bad);
  }

  // ── 3. Enlarged text (Android font-scale / iOS text-size proxy) ───
  // Every element's computed font size is multiplied in place. This is a
  // proxy, not the OS setting; it catches clipped labels and overflow.
  const scaleText = (f) => `(() => { for (const el of document.querySelectorAll('body *')) { const s = parseFloat(getComputedStyle(el).fontSize); if (s) el.style.setProperty('font-size', (s * ${f}) + 'px', 'important'); } })()`;
  for (const [vpName, factor] of [['p390', 1.3], ['p390', 2], ['p320', 1.3]]) {
    await setViewport(client, VP[vpName]);
    const bad = [];
    for (const [name, path] of ROUTES.filter(([n]) => ['home', 'tasks', 'chat', 'conversation', 'calendar', 'notifications', 'course-learn', 'files'].includes(n))) {
      await go(client, APP + path, { waitMs: 1100 });
      await val(client, scaleText(factor));
      await sleep(300);
      const s = await val(client, SHELL);
      const moreLabel = await val(client, `(() => { const i=[...document.querySelectorAll('.pm-m-nav-item')]; return i.map(e => { const b=e.getBoundingClientRect(); const l=[...e.childNodes].map(c=>c.getBoundingClientRect?.()).filter(Boolean); return { t:e.textContent.trim(), clipped: l.some(x => x.right > b.right + 1 || x.left < b.left - 1) }; }); })()`);
      const problems = [];
      if (s.overflowX > 0) problems.push(`overflowX ${s.overflowX}`);
      if (!s.navHit || !s.navInView) problems.push('nav not hit/in view');
      const clipped = moreLabel.filter((x) => x.clipped).map((x) => x.t);
      if (clipped.length) problems.push(`nav labels spill: ${clipped}`);
      if (s.errorBoundary && !FIXTURE_BOUNDARY.has(name)) problems.push('error boundary');
      if (problems.length) bad.push({ name, problems });
      if (factor === 2 && ['home', 'tasks'].includes(name)) await R.shot(client, `${vpName}-text200-${name}`);
    }
    R.check(`${vpName}: text scaled ×${factor} keeps nav reachable and the page free of horizontal overflow`, bad.length === 0, bad);
    if (bad.length) R.notes.push({ textScale: `${vpName}×${factor}`, bad });
  }

  // ── 4. Safe-area insets ───────────────────────────────────────────
  await setViewport(client, VP.p390);
  let safeSupported = true;
  try {
    await client.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34, left: 0, right: 0 } });
  } catch (err) { safeSupported = false; R.notes.push({ safeArea: `Emulation.setSafeAreaInsetsOverride unavailable: ${err.message.slice(0, 120)}` }); }
  if (safeSupported) {
    await go(client, `${APP}/clubpm/chat/C_FIX_GENERAL`);
    const sa = await val(client, `(() => { const n=document.querySelector('.pm-m-nav'), h=document.querySelector('.pm-m-header'); const ns=getComputedStyle(n), hs=getComputedStyle(h);
      const items=[...n.querySelectorAll('.pm-m-nav-item')].map(e=>e.getBoundingClientRect());
      const comp=document.querySelector('.cpm-chat-composer')?.getBoundingClientRect();
      return { navPadBottom: ns.paddingBottom, headerPadTop: hs.paddingTop, itemsBottom: Math.max(...items.map(b=>b.bottom)), vh: innerHeight, navTop: n.getBoundingClientRect().top, composerBottom: comp?.bottom ?? null,
        headerCtlTop: Math.min(...[...h.querySelectorAll('button,a')].map(e=>e.getBoundingClientRect().top)) }; })()`);
    R.check('safe area: bottom nav pads the home-indicator inset and keeps items above it', parseFloat(sa.navPadBottom) >= 34 && sa.itemsBottom <= sa.vh - 34 + 0.5, sa);
    R.check('safe area: header controls sit below the top inset', parseFloat(sa.headerPadTop) >= 47 && sa.headerCtlTop >= 47, sa);
    R.check('safe area: conversation composer stays above the bottom nav', sa.composerBottom !== null && sa.composerBottom <= sa.navTop + 0.5, sa);
    await R.shot(client, 'p390-safe-area-conversation');
    await client.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 21, left: 47, right: 47 } });
    await setViewport(client, VP.l844);
    await go(client, `${APP}/clubpm/projects/p1`);
    const sl = await val(client, `(() => { const n=document.querySelector('.pm-m-nav'); const items=[...n.querySelectorAll('.pm-m-nav-item')].map(e=>e.getBoundingClientRect());
      const h=[...document.querySelectorAll('.pm-m-header button, .pm-m-header a')].map(e=>e.getBoundingClientRect());
      return { navFirstLeft: Math.min(...items.map(b=>b.left)), navLastRight: Math.max(...items.map(b=>b.right)), headLeft: Math.min(...h.map(b=>b.left)), headRight: Math.max(...h.map(b=>b.right)), vw: document.documentElement.clientWidth }; })()`);
    R.check('safe area (landscape notch): nav items and header controls clear the side insets', sl.navFirstLeft >= 47 && sl.navLastRight <= sl.vw - 47 && sl.headLeft >= 47 && sl.headRight <= sl.vw - 47, sl);
    await R.shot(client, 'l844-safe-area-tasks');
    await client.send('Emulation.setSafeAreaInsetsOverride', { insets: {} }).catch(() => {});
  }

  // ── 5. Roles ──────────────────────────────────────────────────────
  await fixture('state?persona=member');
  await setViewport(client, VP.p360);
  // The course editor route has never been client-gated (the API authorizes
  // authors); HEAD behaves the same, so it is recorded, not asserted.
  for (const [name, path] of ROUTES.filter((r) => r[3] && r[0] !== 'course-editor')) {
    await go(client, APP + path, { waitMs: 1200 });
    const u = await url(client);
    R.check(`member: ${name} does not render for a member (redirects away)`, !u.startsWith('/clubpm/admin') && !u.startsWith('/clubpm/meeting-notes'), u);
  }
  R.notes.push({ courseEditorForMember: '/clubpm/courses/:id/edit renders the editor shell for a member on both HEAD and this build (fixture API answers the GET); authorization is server-side. Members reach courses only through /learn links. Pre-existing, not a phone change.' });
  await go(client, `${APP}/clubpm/courses`);
  const memberCourse = await val(client, `document.querySelector('.cpm-course-card-take')?.textContent.trim()`);
  R.check('member: the course catalog offers Continue (learn), not the editor', memberCourse === 'Continue', memberCourse);
  await go(client, `${APP}/clubpm`);
  await tap(client, '[data-m-opener="more"]');
  const memberMore = await val(client, `[...document.querySelectorAll('.pm-m-layer .pm-m-row')].map(e=>e.textContent.trim())`);
  R.check('member: More has no Admin row or admin badges', !memberMore.some((t) => /^Admin/.test(t)), memberMore);
  await key(client, 'Escape');
  await tap(client, '[data-m-opener="projects"]');
  const memberNew = await val(client, `[...document.querySelectorAll('.pm-m-layer button, .pm-m-layer a')].some(e=>/New project/.test(e.textContent))`);
  R.check('member: Projects sheet has no New project action', !memberNew);
  await key(client, 'Escape');
  await fixture('state?persona=admin');
  await go(client, `${APP}/clubpm`);
  await tap(client, '[data-m-opener="more"]');
  const adminMore = await val(client, `[...document.querySelectorAll('.pm-m-layer .pm-m-row')].map(e=>e.textContent.trim())`);
  R.check('admin: More lists Admin with its badges', adminMore.some((t) => /Admin/.test(t)), adminMore);
  await key(client, 'Escape');

  // ── 6. Empty, error and expired states ────────────────────────────
  await fixture('state?projects=none');
  await setViewport(client, VP.p320);
  await go(client, `${APP}/clubpm`);
  let s = await val(client, SHELL);
  const emptyHome = await val(client, `document.querySelector('.pm-m-home-projects')?.innerText || ''`);
  R.check('empty: Home with no projects renders a phone shell and an explanatory empty projects block', s.compact && s.overflowX === 0 && emptyHome.length > 0, emptyHome.slice(0, 120));
  await tap(client, '[data-m-opener="projects"]');
  const emptyPicker = await val(client, `document.querySelector('.pm-m-layer')?.innerText || ''`);
  R.check('empty: Projects sheet explains there are no projects and still offers New project to an admin', /no projects|not a member|nothing/i.test(emptyPicker) && /New project/.test(emptyPicker), emptyPicker.slice(0, 160));
  await key(client, 'Escape');
  await R.shot(client, 'p320-empty-home');
  await fixture('state?projects=few&failProjects=1');
  await go(client, `${APP}/clubpm`);
  await tap(client, '[data-m-opener="projects"]');
  const errPicker = await val(client, `({ text: document.querySelector('.pm-m-layer')?.innerText || '', retry: [...document.querySelectorAll('.pm-m-layer button')].some(b=>/Retry/.test(b.textContent)) })`);
  R.check('error: project load failure shows a message and Retry', errPicker.retry, errPicker.text.slice(0, 160));
  await key(client, 'Escape');
  await fixture('state?failProjects=0');

  await fixture('state?persona=member&slackExpired=1');
  await setViewport(client, VP.p390);
  await go(client, `${APP}/clubpm/chat/C_FIX_GENERAL`);
  await waitFor(client, '.cpm-chat-composer-input');
  await fill(client, '.cpm-chat-composer-input', 'FIXTURE expired-connection draft');
  await tap(client, '.cpm-chat-composer-send');
  await sleep(600);
  const recon = await val(client, `(() => { const r=document.querySelector('.cpm-chat-reconnect'); if(!r) return null; const b=r.getBoundingClientRect(); const a=r.querySelector('a'); const ab=a?.getBoundingClientRect(); const nav=document.querySelector('.pm-m-nav')?.getBoundingClientRect();
    const at = ab && document.elementFromPoint(ab.left+ab.width/2, ab.top+ab.height/2);
    return { text:r.innerText.slice(0,120), href:a?.getAttribute('href'), btnH: ab?.height, hit: !!at && (at===a||a.contains(at)), aboveNav: ab && nav ? ab.bottom <= nav.top + 0.5 : null }; })()`);
  R.check('expired Slack connection: HTTP 409 on send shows the reconnect prompt with a reachable ≥44px action above the nav', recon && recon.href && recon.btnH >= 44 && recon.hit && recon.aboveNav, recon);
  await R.shot(client, 'p390-slack-reconnect');
  await fixture('state?slackExpired=0');

  await go(client, `${APP}/clubpm/projects/p1?tab=files`);
  await fixture('state?failAuth=1');
  await tap(client, '.pm-m-nav-item', { text: 'Calendar' });
  await sleep(1500);
  const expiredNav = await url(client);
  await reload(client, 0).catch(() => {});
  await sleep(2000);
  const expiredReload = await url(client);
  const loginFits = await val(client, `({ overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth), signIn: !!document.querySelector('.pm-slack-btn') })`);
  R.check('expired session: reloading a protected phone route lands on a sign-in page that fits', expiredReload.startsWith('/clubpm/login') && loginFits.signIn && loginFits.overflow === 0, { expiredNav, expiredReload, ...loginFits });
  R.notes.push({ expiredSessionInSpaNavigation: expiredNav, detail: 'URL after tapping Calendar once every API call returns 401 (no reload).' });
  await fixture('state?failAuth=0&persona=admin');

  // ── 7. Rollback switch: build flag, per-browser override, live toggle ──
  await setViewport(client, VP.p390);
  const offShell = async (base) => { await go(client, `${base}/clubpm/projects/p1`, { waitMs: 1300 }); return val(client, `(() => { const q=(s)=>document.querySelector(s); const r=(e)=>{ if(!e) return null; const b=e.getBoundingClientRect(); return [Math.round(b.left),Math.round(b.top),Math.round(b.width),Math.round(b.height)]; };
    return { compact: !!q('.pm-shell--compact'), marker: document.body.classList.contains('pm-m-compact'), phoneNodes: document.querySelectorAll('.pm-m-nav, .pm-m-header, .pm-m-layer').length,
      sidebar: r(q('.pm-sidebar')), topbar: r(q('.pm-topbar')), main: r(q('.pm-shell-main')), assignee: r(q('.cpm-assignee-panel')), scrollWidth: document.documentElement.scrollWidth }; })()`); };
  const offBuild = await offShell(APP_OFF);
  const headBuild = await offShell(APP_HEAD);
  R.check('rollback (build flag off): phone viewport gets the desktop shell, no compact class, no body marker, no phone nodes',
    !offBuild.compact && !offBuild.marker && offBuild.phoneNodes === 0 && !!offBuild.sidebar, offBuild);
  const sameAsHead = JSON.stringify([offBuild.sidebar, offBuild.topbar, offBuild.main, offBuild.assignee, offBuild.scrollWidth]) === JSON.stringify([headBuild.sidebar, headBuild.topbar, headBuild.main, headBuild.assignee, headBuild.scrollWidth]);
  R.check('rollback (build flag off): phone layout geometry equals the pre-redesign HEAD build (shell, main, assignee rail, page width)', sameAsHead, { off: offBuild, head: headBuild });
  await R.shot(client, 'p390-rollback-off-build');
  await go(client, `${APP_OFF}/clubpm`, { waitMs: 300 });
  await val(client, `localStorage.setItem('pm-compact','on')`);
  const onOverride = await offShell(APP_OFF);
  R.check('rollback: localStorage pm-compact=on previews the phone shell on an off build', onOverride.compact && onOverride.marker, onOverride);
  await val(client, `localStorage.removeItem('pm-compact')`);

  await go(client, `${APP}/clubpm/projects/p1`);
  await val(client, `localStorage.setItem('pm-compact','off'); window.dispatchEvent(new Event('pm-compact-changed'))`);
  await sleep(900);
  const liveOff = await val(client, `({ compact: !!document.querySelector('.pm-shell--compact'), marker: document.body.classList.contains('pm-m-compact'), phoneNodes: document.querySelectorAll('.pm-m-nav, .pm-m-header, .pm-m-layer').length, sidebar: !!document.querySelector('.pm-sidebar'), url: location.pathname })`);
  R.check('rollback: switching pm-compact off live removes the phone shell, body marker and phone nodes without a reload', !liveOff.compact && !liveOff.marker && liveOff.phoneNodes === 0 && liveOff.sidebar, liveOff);
  const offHead = await val(client, `(() => { const any=[...document.querySelectorAll('.pm-shell *')].slice(0,4000); return any.filter(e => [...e.classList].some(c => c.startsWith('pm-m-'))).map(e=>e.className).slice(0,10); })()`);
  R.notes.push({ phoneClassesRenderedWithSwitchOffAtPhoneWidth: offHead });
  await reload(client);
  const offReload = await val(client, `({ compact: !!document.querySelector('.pm-shell--compact'), sidebar: !!document.querySelector('.pm-sidebar') })`);
  R.check('rollback: pm-compact=off survives a reload', !offReload.compact && offReload.sidebar, offReload);
  await val(client, `localStorage.removeItem('pm-compact'); window.dispatchEvent(new Event('pm-compact-changed'))`);
  await sleep(900);
  const liveOn = await val(client, `({ compact: !!document.querySelector('.pm-shell--compact'), marker: document.body.classList.contains('pm-m-compact') })`);
  R.check('rollback: clearing the override restores the phone shell live', liveOn.compact && liveOn.marker, liveOn);
  await setViewport(client, VP.d1280);
  await val(client, `localStorage.setItem('pm-compact','on'); window.dispatchEvent(new Event('pm-compact-changed'))`);
  await go(client, `${APP}/clubpm`);
  const forced = await val(client, `({ compact: !!document.querySelector('.pm-shell--compact'), sidebar: !!document.querySelector('.pm-sidebar') })`);
  R.check('rollback: pm-compact=on never forces the phone shell onto a desktop viewport', !forced.compact && forced.sidebar, forced);
  await val(client, `localStorage.removeItem('pm-compact')`);

  R.write({ matrix });
} finally {
  await fixture('state?persona=member&projects=few&failProjects=0&failAuth=0&slackExpired=0&slowWrites=0').catch(() => {});
  await closeAll(close);
}
