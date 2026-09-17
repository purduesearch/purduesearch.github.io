/*
 * Constellation phone prototype — Phase 0. NOT production code.
 *
 * Purpose: make the proposed phone navigation reviewable and testable before
 * AppShell changes. Dependency-free on purpose so it can be opened from disk or
 * served statically, and so nothing here can leak into the production bundle.
 *
 * What it demonstrates (each is a Phase 0 contract, see ../contracts.md):
 *   - the compact-layout condition (COMPACT_QUERY), re-evaluated live;
 *   - route → current bottom-nav item mapping (currentNavFor);
 *   - one overlay stack with history integration, focus trap/return, Escape;
 *   - project navigation from ProjectNavContext-equivalent descriptors;
 *   - hiding the bottom bar only when a text field is focused AND the visual
 *     viewport has shrunk (software keyboard), never on focus alone.
 * URLs mirror the real /clubpm routes inside the hash so deep links match.
 */
(function () {
  'use strict';

  var F = window.PROTO_FIXTURES;
  var params = new URLSearchParams(location.search);

  // ── Layout condition ────────────────────────────────────────────────────
  var COMPACT_QUERY = '(max-width: 767.98px), (pointer: coarse) and (hover: none) and (max-width: 1023.98px) and (max-height: 499.98px)';
  var mq = window.matchMedia(COMPACT_QUERY);
  var forceCompact = params.get('compact') === '1';
  function isCompact() { return forceCompact || mq.matches; }

  // ── Fixture-backed state ────────────────────────────────────────────────
  var personaKey = params.get('persona') === 'admin' ? 'admin' : 'member';
  var persona = F.personas[personaKey];
  var me = F.people[persona.memberId];
  var projectsMode = params.get('projects') || 'few';

  var S = {
    projectsError: projectsMode === 'error',
    projects: clone(F.projectSets[projectsMode] || F.projectSets.few),
    starred: loadStarred(),
    tasks: {},
    filters: { scope: 'all', sort: 'priority', archived: false, priorities: [] },
    taskQuery: '',
    collapsed: {},
    selectMode: false,
    selected: {},
    channels: clone(F.channels),
    dms: clone(F.dms),
    messages: {},
    drafts: {},
    events: clone(F.events),
    notifications: clone(F.notifications),
    calView: 'agenda',
    showBrowse: false,
    homeShowAll: false,
    idx: 0,
    overlays: [],
    scroll: {},
    kbSim: params.get('kb') === '1',
  };
  if (S.projectsError) S.projects = [];

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function loadStarred() {
    try { return JSON.parse(sessionStorage.getItem('proto-starred') || '["p2"]'); } catch (e) { return ['p2']; }
  }
  function saveStarred() { try { sessionStorage.setItem('proto-starred', JSON.stringify(S.starred)); } catch (e) { /* ignore */ } }
  function tasksOf(pid) {
    if (!S.tasks[pid]) S.tasks[pid] = F.tasksFor(pid).map(function (t) { return Object.assign({ archived: false }, t); });
    return S.tasks[pid];
  }
  function project(pid) { return S.projects.find(function (p) { return p.id === pid; }); }
  function canEditProject() { return true; } // fixture: member of every fixture project
  function person(id) { return F.people[id] || { id: id, name: 'Unknown', initials: '?', color: '#4a5568' }; }

  // ── Small utilities ─────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function icon(name, extra) { return '<i class="fas fa-' + name + (extra ? ' ' + extra : '') + '" aria-hidden="true"></i>'; }
  function avatar(p, lg) {
    return '<span class="m-avatar' + (lg ? ' m-avatar--lg' : '') + '" style="background:' + p.color + '" aria-hidden="true">' + esc(p.initials) + '</span>';
  }
  function fmtDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function fmtTime(iso) { return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  function isLate(iso) { return new Date(iso) < F.now; }
  var STATUS = {
    TODO: { label: 'Not started', color: 'var(--pm-text-secondary)' },
    IN_PROGRESS: { label: 'In progress', color: 'var(--pm-accent-amber)' },
    BLOCKED: { label: 'Blocked', color: 'var(--pm-accent-coral)' },
    DONE: { label: 'Completed', color: 'var(--pm-accent-teal)' },
  };
  var STATUS_ORDER = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'];
  var PRIORITY_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  var PROJECT_STATUS_COLOR = { ACTIVE: 'var(--pm-accent-teal)', PAUSED: 'var(--pm-accent-amber)', COMPLETED: 'var(--pm-accent-violet)' };

  var toastTimer;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  // ── Routing (real /clubpm paths inside the hash) ───────────────────────
  function parseHash() {
    var raw = location.hash.replace(/^#/, '') || '/clubpm';
    var parts = raw.split('?');
    var path = parts[0].replace(/\/+$/, '') || '/clubpm';
    return { path: path, q: new URLSearchParams(parts[1] || ''), raw: raw };
  }
  var STUBS = {
    profile: { title: 'Profile', route: '/clubpm/profile', phase: 'Phase 4 — Profile, Shop, Challenges', parts: ['Rank + XP bar (profile.rank)', 'Avatar editor (profile.avatar)', 'XP history (profile.history)', 'Badges, equipped cosmetics, GitHub connect'] },
    shop: { title: 'Shop', route: '/clubpm/shop', phase: 'Phase 4 — Profile, Shop, Challenges', parts: ['Doubloon balance (shop.balance)', 'Cosmetic grid (shop.grid)', 'Inventory and consumables'] },
    challenges: { title: 'Quests & achievements', route: '/clubpm/challenges', phase: 'Phase 4 — Profile, Shop, Challenges', parts: ['Today / This Week / This Month / Achievements tabs', 'Claim buttons + reward roll', 'Achievement grid'] },
    outreach: { title: 'Outreach Hub', route: '/clubpm/outreach', phase: 'Phase 4 — Outreach', parts: ['Composer', 'Board', 'Calendar', 'Campaigns', 'CRM', 'Blog', 'Insights', 'New submission (floating button today)'] },
    blog: { title: 'Blog', route: '/clubpm/outreach?tab=blog', phase: 'Phase 4 — Blog and course editors', parts: ['Post list + New post (blog.new)', 'Editor: /clubpm/outreach/blog/:id/edit'] },
    courses: { title: 'Courses', route: '/clubpm/courses', phase: 'Phase 4 — Course learning / editors', parts: ['Catalog (courses.list)', 'Player: /clubpm/courses/:slug/learn', 'Editor: /clubpm/courses/:id/edit (authors)', 'Admins: progress dashboard, assign, certificates'] },
    admin: { title: 'Admin', route: '/clubpm/admin', phase: 'Phase 4 — Admin and meeting notes', parts: ['Pending rewards', 'Event reward config', 'Integrations (Drive connect)', 'Slack archive panel', 'Meeting notes generator'], adminOnly: true },
    prefs: { title: 'Notification preferences', route: '/clubpm/notifications/preferences', phase: 'Phase 3 — Notifications', parts: ['Per-type in-app / Slack DM channels (notifications.slack)'] },
    help: { title: 'Keyboard shortcuts & help', route: '(modal today: KeyboardShortcutsModal)', phase: 'Phase 1 — Shell', parts: ['g d / g e / g o / g m / g n navigation shortcuts', '? opens this list', 'Cmd/Ctrl+K opens search'] },
    gantt: { title: 'Timeline (Gantt)', route: '/clubpm/projects/:id/gantt', phase: 'Phase 4 — Insights, AI, Gantt', parts: ['No in-app link exists today (URL only)', 'Phone: agenda/milestone list first, contained pan/zoom timeline'] },
    'files-item': { title: 'File detail', route: '(modal today)', phase: 'Phase 4 — Files, Vault, GitHub', parts: ['Preview / download', 'Versions, check-out, BOM, change requests'] },
  };

  function route() {
    var h = parseHash();
    var m;
    var r = { path: h.path, q: h.q, raw: h.raw };
    if (h.path === '/clubpm') r.name = 'home';
    else if ((m = h.path.match(/^\/clubpm\/projects\/([^/]+)\/gantt$/))) { r.name = 'stub'; r.key = 'gantt'; r.projectId = m[1]; }
    else if ((m = h.path.match(/^\/clubpm\/projects\/([^/]+)$/))) {
      r.name = 'project'; r.projectId = m[1];
      r.tab = h.q.get('tab') || 'tasks'; r.view = h.q.get('view'); r.task = h.q.get('task'); r.channel = h.q.get('channel');
    } else if (h.path === '/clubpm/chat') r.name = 'chatlist';
    else if ((m = h.path.match(/^\/clubpm\/chat\/([^/]+)$/))) { r.name = 'conversation'; r.channelId = m[1]; r.thread = h.q.get('thread'); }
    else if (h.path === '/clubpm/members') { r.name = 'members'; r.dm = h.q.get('dm'); r.view = h.q.get('view') || 'people'; }
    else if (h.path === '/clubpm/calendar') r.name = 'calendar';
    else if (h.path === '/clubpm/notifications') r.name = 'notifications';
    else if (h.path === '/clubpm/notifications/preferences') { r.name = 'stub'; r.key = 'prefs'; }
    else if (h.path === '/clubpm/outreach') { r.name = 'stub'; r.key = h.q.get('tab') === 'blog' ? 'blog' : 'outreach'; }
    else if ((m = h.path.match(/^\/clubpm\/(profile|shop|challenges|courses|admin|help|files-item)$/))) { r.name = 'stub'; r.key = m[1]; }
    else { r.name = 'stub'; r.key = 'unknown'; }
    return r;
  }

  // Which bottom item is "current" for a route. Projects/More are buttons that
  // open sheets; their *expanded* state is separate (aria-expanded).
  function currentNavFor(r) {
    switch (r.name) {
      case 'home': return 'home';
      case 'project': return 'projects';
      case 'chatlist': case 'conversation': case 'members': return 'chat';
      case 'calendar': return 'calendar';
      case 'stub': return r.key === 'gantt' ? 'projects' : 'more';
      default: return 'more';
    }
  }

  function pageKey(r) { return r.path + (r.name === 'project' ? '?tab=' + r.tab : ''); }

  // push: a new history entry (drill-down or primary destination)
  // replace: peer switches (project sections, Insights view), redirects, fallbacks
  function go(path, opts) {
    opts = opts || {};
    rememberScroll();
    // A destination chosen inside a sheet replaces the sheet's history entry,
    // so Back from the destination returns to the page under the sheet.
    var topPushed = S.overlays.length && S.overlays[S.overlays.length - 1].pushed && history.state && history.state.overlay;
    var replace = opts.replace || topPushed;
    dropAllOverlays();
    var state = { idx: replace ? S.idx : S.idx + 1, from: opts.from || null };
    S.idx = state.idx;
    history[replace ? 'replaceState' : 'pushState'](state, '', '#' + path);
    render();
  }

  // Deterministic parent for detail screens reached by a direct link.
  function goBack(parentPath) {
    var st = history.state || {};
    // Came here from another in-app screen: Back returns to exactly that screen
    // (same list, filters and scroll). Direct/external link: deterministic parent.
    if (st.from && S.idx > 0) history.back();
    else go(parentPath, { replace: true });
  }

  window.addEventListener('popstate', function (e) {
    var st = e.state || { idx: 0 };
    var top = S.overlays[S.overlays.length - 1];
    if (top && top.pushed && st.overlay !== top.id) {
      removeOverlay(top, true);
      S.idx = st.idx || 0;
      if (!st.overlay && location.hash === lastRendered) return; // back to the page under the sheet
    }
    if (st.overlay) {
      // Forward into a sheet entry: sheets are transient, so don't reopen; keep the page.
      history.replaceState({ idx: st.idx, from: st.from || null }, '', location.hash);
    }
    S.idx = st.idx || 0;
    dropAllOverlays();
    render();
  });
  window.addEventListener('hashchange', function () {
    // Manual address-bar edits. go()/popstate already rendered the others.
    if (lastRendered !== location.hash) render();
  });

  // ── Overlay stack ───────────────────────────────────────────────────────
  // One stack for sheets and full-screen overlays. Only the top layer is
  // interactive (everything beneath is inert), Escape closes the top, focus
  // returns to the opener, and a pushed history entry makes Back close it.
  function openOverlay(id, html, opts) {
    opts = opts || {};
    var layer = document.getElementById('overlays');
    var wrap = document.createElement('div');
    wrap.className = 'm-overlay';
    wrap.dataset.overlay = id;
    var labelId = 'ov-' + id + '-title';
    if (opts.kind === 'dialog') {
      wrap.innerHTML = '<div class="m-dialog" role="dialog" aria-modal="true" aria-labelledby="' + labelId + '">' + html + '</div>';
    } else {
      wrap.innerHTML = '<div class="m-scrim" data-action="close-overlay"></div>' +
        '<div class="m-sheet" role="dialog" aria-modal="true" aria-labelledby="' + labelId + '"><div class="m-sheet-grip" aria-hidden="true"></div>' + html + '</div>';
    }
    layer.appendChild(wrap);
    var entry = { id: id, el: wrap, openerKey: opts.openerKey || (document.activeElement && document.activeElement.getAttribute('data-focus-key')), onClose: opts.onClose, pushed: opts.history !== false };
    S.overlays.push(entry);
    if (entry.pushed) {
      history.pushState({ idx: S.idx + 1, overlay: id, from: (history.state || {}).from || null }, '', location.hash);
      S.idx += 1;
    }
    syncInert();
    syncNavExpanded();
    // Focus the explicit target, else the sheet heading — never a search field by
    // default, because on a phone that raises the keyboard over the list.
    var first = wrap.querySelector('[data-autofocus]') || wrap.querySelector('#' + labelId);
    if (first) { if (!first.hasAttribute('tabindex') && !/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(first.tagName)) first.setAttribute('tabindex', '-1'); first.focus(); }
    return entry;
  }
  function closeTopOverlay() {
    var top = S.overlays[S.overlays.length - 1];
    if (!top) return false;
    if (top.pushed && history.state && history.state.overlay === top.id) history.back(); // popstate removes it
    else removeOverlay(top, true);
    return true;
  }
  function removeOverlay(entry, restoreFocus) {
    S.overlays = S.overlays.filter(function (o) { return o !== entry; });
    entry.el.remove();
    if (entry.onClose) entry.onClose();
    syncInert();
    syncNavExpanded();
    if (restoreFocus && entry.openerKey) {
      var opener = document.querySelector('[data-focus-key="' + entry.openerKey + '"]');
      if (opener) opener.focus();
    }
  }
  function dropAllOverlays() { S.overlays.slice().reverse().forEach(function (o) { removeOverlay(o, false); }); }
  function syncInert() {
    var app = document.getElementById('app');
    var routeDialog = document.getElementById('route-dialog');
    var hasOverlay = S.overlays.length > 0;
    app.inert = hasOverlay || !!routeDialog.firstElementChild;
    routeDialog.inert = hasOverlay;
    S.overlays.forEach(function (o, i) { o.el.inert = i !== S.overlays.length - 1; });
  }
  function syncNavExpanded() {
    ['projects', 'more'].forEach(function (id) {
      var b = document.querySelector('[data-nav-id="' + id + '"]');
      if (b) b.setAttribute('aria-expanded', String(S.overlays.some(function (o) { return o.id === id; })));
    });
  }
  function topLayer() {
    if (S.overlays.length) return S.overlays[S.overlays.length - 1].el;
    var rd = document.getElementById('route-dialog');
    return rd.firstElementChild ? rd : null;
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (closeTopOverlay()) { e.preventDefault(); return; }
      var rd = document.querySelector('#route-dialog [data-action^="close-"]');
      if (rd) { e.preventDefault(); rd.click(); }
      return;
    }
    if (e.key === 'Tab') {
      var layer = topLayer();
      if (!layer) return;
      var f = [].slice.call(layer.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select, textarea, summary, [tabindex]:not([tabindex="-1"])'))
        .filter(function (el) { return el.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    // Hardware-keyboard shortcut parity with GlobalShortcutsSetup (subset).
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
  });

  // ── Software keyboard heuristic ─────────────────────────────────────────
  function isTextField(el) {
    return !!el && (el.tagName === 'TEXTAREA' || el.isContentEditable ||
      (el.tagName === 'INPUT' && /^(text|search|email|url|tel|number|password|date|)$/.test(el.type || '')));
  }
  function kbCheck() {
    var shrunk = window.visualViewport ? (window.innerHeight - window.visualViewport.height) > 150 : false;
    var open = isTextField(document.activeElement) && (shrunk || S.kbSim);
    document.body.classList.toggle('kb-open', open);
  }
  if (window.visualViewport) window.visualViewport.addEventListener('resize', kbCheck);
  document.addEventListener('focusin', kbCheck);
  document.addEventListener('focusout', function () { setTimeout(kbCheck, 0); });

  // ── Frame rendering ─────────────────────────────────────────────────────
  var lastRendered = null;
  function rememberScroll() {
    var main = document.querySelector('.m-main');
    if (main && lastRendered) S.scroll[lastRendered] = main.scrollTop;
  }

  function render() {
    lastRendered = location.hash;
    var app = document.getElementById('app');
    var routeDialog = document.getElementById('route-dialog');
    if (!isCompact()) {
      routeDialog.innerHTML = '';
      app.innerHTML = desktopNote();
      document.title = 'Constellation — phone prototype (desktop width)';
      return;
    }
    var r = route();
    // Legacy project tabs → merged sections (mirrors ProjectDetail's replace redirect).
    if (r.name === 'project' && ['members', 'reports', 'ai'].indexOf(r.tab) !== -1) {
      var q = new URLSearchParams(r.q);
      if (r.tab === 'members') { q.set('tab', 'chat'); q.set('view', 'members'); }
      else { q.set('tab', 'insights'); if (r.tab === 'ai') q.set('view', 'ai'); else q.delete('view'); }
      go(r.path + '?' + q.toString(), { replace: true });
      return;
    }
    var view = screens[r.name] ? screens[r.name](r) : screens.stub(r);
    app.innerHTML =
      view.header +
      (view.sections || '') +
      '<main class="m-main" id="main" tabindex="-1"><div class="m-main-inner">' + view.body + '</div></main>' +
      (view.footer || '') +
      bottomNav(r);
    routeDialog.innerHTML = view.dialog || '';
    document.title = view.title + ' — Constellation prototype';
    var main = document.querySelector('.m-main');
    if (main) main.scrollTop = S.scroll[location.hash] || 0;
    if (view.after) view.after();
    syncInert();
    syncNavExpanded();
    kbCheck();
    var dialogFocus = routeDialog.querySelector('[data-autofocus]');
    if (dialogFocus && !S.overlays.length && !routeDialog.contains(document.activeElement)) dialogFocus.focus();
  }

  function desktopNote() {
    return '<div class="m-desktop-note"><h1>' + icon('display') + ' Desktop layout unchanged</h1>' +
      '<p>This viewport is outside the compact condition, so production keeps today&rsquo;s sidebar + topbar shell. The prototype only models the phone presentation.</p>' +
      '<p><code>' + esc(COMPACT_QUERY) + '</code></p>' +
      '<p>Narrow the window below 768px, open <a href="review.html">review.html</a>, or add <code>?compact=1</code> to force the phone layout.</p></div>';
  }

  function bottomNav(r) {
    var cur = currentNavFor(r);
    function item(id, iconName, label, href) {
      var attrs = ' data-nav-id="' + id + '" data-focus-key="nav-' + id + '"' + (cur === id ? ' aria-current="page"' : '');
      if (href) return '<a class="m-nav-item" href="#' + href + '" data-nav' + attrs + ' data-tour-id="' + TOUR_IDS[id] + '">' + icon(iconName) + '<span>' + label + '</span></a>';
      return '<button type="button" class="m-nav-item" aria-haspopup="dialog" aria-expanded="false" data-action="open-' + id + '"' + attrs + ' data-tour-id="' + TOUR_IDS[id] + '">' + icon(iconName) + '<span>' + label + '</span></button>';
    }
    return '<nav class="m-nav" aria-label="Primary">' +
      item('home', 'house', 'Home', '/clubpm') +
      item('projects', 'folder-open', 'Projects') +
      item('chat', 'comments', 'Chat', '/clubpm/chat') +
      item('calendar', 'calendar-days', 'Calendar', '/clubpm/calendar') +
      item('more', 'bars', 'More') +
      '</nav>';
  }
  // Proposed tour ids for the phone shell (see ../contracts.md §6). Literal
  // strings in production so scripts/check-tour-anchors.js can see them.
  var TOUR_IDS = { home: 'nav.dashboard', projects: 'nav.projects', chat: 'nav.chat', calendar: 'nav.calendar', more: 'nav.more' };

  function header(title, opts) {
    opts = opts || {};
    var left = '';
    if (opts.back) {
      left = '<button type="button" class="m-icon-btn" data-action="back" data-arg="' + esc(opts.back) + '" aria-label="Back">' + icon('arrow-left') + '</button>';
    }
    var titleHtml = opts.titleHtml || ('<h1 class="m-title">' + esc(title) + (opts.sub ? '<span class="m-title-sub">' + esc(opts.sub) + '</span>' : '') + '</h1>');
    var right = opts.right != null ? opts.right : headerGlobalActions();
    return '<header class="m-header' + (opts.back ? ' m-header--detail' : '') + '">' + left + titleHtml + right + '</header>';
  }
  function headerGlobalActions() {
    var unread = S.notifications.filter(function (n) { return n.unread; }).length;
    return '<button type="button" class="m-icon-btn" data-action="open-search" data-focus-key="hdr-search" aria-label="Search" data-tour-id="topbar.search">' + icon('magnifying-glass') + '</button>' +
      '<a class="m-icon-btn" href="#/clubpm/notifications" data-nav aria-label="Notifications' + (unread ? ', ' + unread + ' unread' : '') + '" data-tour-id="topbar.notifications">' + icon('bell') +
      (unread ? '<span class="m-badge-dot" aria-hidden="true">' + unread + '</span>' : '') + '</a>';
  }

  // ── Shared row renderers ────────────────────────────────────────────────
  function taskRow(t, pid, opts) {
    opts = opts || {};
    var assignees = (t.assignees || []).map(person);
    var sel = S.selectMode && opts.selectable;
    var lead = sel
      ? '<span class="m-select-box" data-on="' + !!S.selected[t.id] + '" aria-hidden="true">' + (S.selected[t.id] ? icon('check') : '') + '</span>'
      : '<button type="button" class="m-task-status m-task-status--' + t.status + '" data-action="status-sheet" data-arg="' + pid + '|' + t.id + '" data-focus-key="st-' + t.id + '" aria-label="Status: ' + STATUS[t.status].label + '. Change status">' +
        (t.status === 'DONE' ? icon('check') : t.status === 'BLOCKED' ? icon('ban') : t.status === 'IN_PROGRESS' ? icon('circle-half-stroke') : '') + '</button>';
    var meta = [];
    if (opts.showProject) meta.push('<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%">' + esc((project(pid) || {}).name || '') + '</span>');
    if (t.due) meta.push('<span class="' + (isLate(t.due) && t.status !== 'DONE' ? 'm-due--late' : '') + '">' + icon('calendar') + ' ' + (isLate(t.due) && t.status !== 'DONE' ? 'Overdue · ' : 'Due ') + fmtDate(t.due) + '</span>');
    if (t.blocker) meta.push('<span>' + icon('tag') + ' ' + esc(t.blocker) + '</span>');
    if (t.subtasks) meta.push('<span>' + icon('list-check') + ' ' + t.subtasks + ' subtasks</span>');
    if (t.archived) meta.push('<span>' + icon('box-archive') + ' Archived</span>');
    var main = '<span class="m-row-main"><span class="m-row-title m-row-title--clamp">' + esc(t.title) + '</span><span class="m-row-meta">' + meta.join('') + '</span></span>' +
      '<span class="m-row-end">' + (assignees.length ? '<span class="m-avatars" aria-label="Assigned to ' + esc(assignees.map(function (a) { return a.name; }).join(', ')) + '">' + assignees.slice(0, 3).map(function (a) { return avatar(a); }).join('') + '</span>' : '<span class="sr-only">Unassigned</span>') + icon('chevron-right') + '</span>';
    if (sel) {
      return '<button type="button" class="m-row" data-action="toggle-select" data-arg="' + t.id + '" aria-pressed="' + !!S.selected[t.id] + '">' + lead + main + '</button>';
    }
    return '<div class="m-row" style="cursor:default">' + lead +
      '<a href="#/clubpm/projects/' + pid + '?task=' + t.id + '" data-nav data-from="current" data-focus-key="task-' + t.id + '" style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;min-height:44px;text-decoration:none">' + main + '</a></div>';
  }
  function projectRow(p, opts) {
    opts = opts || {};
    var starred = S.starred.indexOf(p.id) !== -1;
    var r = route();
    var current = r.projectId === p.id;
    return '<div class="m-row" style="cursor:default">' +
      '<button type="button" class="m-icon-btn" style="width:40px;margin-left:-8px" data-action="star" data-arg="' + p.id + '" aria-pressed="' + starred + '" aria-label="' + (starred ? 'Unstar ' : 'Star ') + esc(p.name) + '">' +
        (starred ? '<i class="fas fa-star" style="color:#f9ca24" aria-hidden="true"></i>' : '<i class="far fa-star" aria-hidden="true"></i>') + '</button>' +
      '<a href="#/clubpm/projects/' + p.id + '" data-nav style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;min-height:44px;text-decoration:none"' + (current ? ' aria-current="page"' : '') + '>' +
        '<span class="m-dot" style="background:' + (PROJECT_STATUS_COLOR[p.status] || 'var(--pm-text-muted)') + '" aria-hidden="true"></span>' +
        '<span class="m-row-main"><span class="m-row-title m-row-title--clamp">' + esc(p.name) + '</span><span class="m-row-meta"><span>' + esc(p.status.toLowerCase()) + '</span><span>' + esc(p.type.toLowerCase()) + '</span>' + (current ? '<span style="color:var(--pm-accent-teal)">Current</span>' : '') + '</span></span>' +
        icon('chevron-right') + '</a></div>';
  }

  // ── Screens ─────────────────────────────────────────────────────────────
  var screens = {};

  screens.home = function () {
    var mine = [];
    S.projects.forEach(function (p) {
      tasksOf(p.id).forEach(function (t) { if (!t.archived && t.status !== 'DONE' && t.assignees.indexOf(me.id) !== -1) mine.push({ t: t, pid: p.id }); });
    });
    mine.sort(function (a, b) { return new Date(a.t.due) - new Date(b.t.due); });
    var shown = S.homeShowAll ? mine : mine.slice(0, 5);
    var next = S.events.filter(function (e) { return !e.deadline && new Date(e.start) > F.now; }).sort(function (a, b) { return new Date(a.start) - new Date(b.start); })[0];
    var myProjects = S.projects.filter(function (p) { return p.member; }).sort(starFirst).slice(0, 5);

    var body =
      '<div class="m-section-title" style="margin-top:4px"><h2 id="h-work" data-tour-id="dash.work">My work <span class="m-count">' + mine.length + '</span></h2>' +
        '<span><button type="button" class="m-link-btn" data-action="work-actions" data-focus-key="work-actions" aria-haspopup="dialog">' + icon('sliders') + ' Actions</button></span></div>' +
      (S.projectsError
        ? '<div class="m-error" role="alert">Couldn&rsquo;t load your work. <button type="button" class="m-btn" data-action="retry-projects">Retry</button></div>'
        : mine.length
          ? '<div class="m-card" aria-labelledby="h-work">' + shown.map(function (x) { return taskRow(x.t, x.pid, { showProject: true }); }).join('') + '</div>' +
            (mine.length > 5 ? '<button type="button" class="m-link-btn" data-action="home-all">' + (S.homeShowAll ? 'Show fewer' : 'Show all ' + mine.length + ' tasks') + '</button>' : '')
          : '<div class="m-card m-empty">' + icon('mug-hot') + 'No tasks assigned to you.<br>Open a project to pick something up.</div>') +

      '<div class="m-section-title"><h2 data-tour-id="dash.agenda">Next up</h2><a class="m-link-btn" href="#/clubpm/calendar" data-nav>Calendar ' + icon('chevron-right') + '</a></div>' +
      (next
        ? '<div class="m-card"><div class="m-row" style="cursor:default"><span class="m-row-icon">' + icon('calendar-day') + '</span><span class="m-row-main"><span class="m-row-title">' + esc(next.title) + '</span><span class="m-row-meta"><span>' + fmtDate(next.start) + ' · ' + fmtTime(next.start) + '</span><span>' + esc(next.where) + '</span></span></span></div>' +
          '<div style="display:flex;gap:8px;padding:0 12px 12px">' + rsvpButtons(next) + '</div></div>'
        : '<div class="m-card m-empty">' + icon('calendar') + 'Nothing scheduled in the next 7 days.</div>') +

      '<div class="m-section-title"><h2>My projects</h2><button type="button" class="m-link-btn" data-action="open-projects" data-focus-key="home-all-projects">All projects ' + icon('chevron-right') + '</button></div>' +
      (S.projectsError
        ? '<div class="m-error" role="alert">Couldn&rsquo;t load projects. <button type="button" class="m-btn" data-action="retry-projects">Retry</button></div>'
        : myProjects.length
          ? '<div class="m-card">' + myProjects.map(function (p) { return projectRow(p); }).join('') + '</div>'
          : '<div class="m-card m-empty">' + icon('rocket') + 'You&rsquo;re not on any projects yet.' + (persona.isAdmin ? '<br><button type="button" class="m-btn m-btn--primary" style="margin-top:10px" data-action="new-project">' + icon('plus') + ' New project</button>' : '') + '</div>') +

      '<div class="m-section-title"><h2>Progress</h2><a class="m-link-btn" href="#/clubpm/challenges" data-nav>Quests ' + icon('chevron-right') + '</a></div>' +
      '<div class="m-card m-progress"><div style="display:flex;justify-content:space-between;gap:8px;font-size:13px"><b>' + esc(persona.rank) + '</b><span style="color:var(--pm-text-secondary)">' + persona.xp.toLocaleString() + ' / ' + persona.xpNext.toLocaleString() + ' XP</span></div>' +
        '<div class="m-xpbar" role="progressbar" aria-label="XP toward ' + esc(persona.rankNext) + '" aria-valuenow="' + persona.xp + '" aria-valuemax="' + persona.xpNext + '"><div style="width:' + Math.round(persona.xp / persona.xpNext * 100) + '%"></div></div>' +
        '<div class="m-stats"><div class="m-stat"><b>' + persona.streak + '</b><small>day streak</small></div><div class="m-stat"><b>' + persona.doubloons.toLocaleString() + '</b><small>doubloons</small></div><div class="m-stat"><b>0/3</b><small>daily quests</small></div></div></div>' +

      '<div class="m-group-label">More on your dashboard</div>' +
      expander('Daily quests', 'bolt', 'The existing DailyQuestsWidget (dash.quests) renders here unchanged, collapsed by default on phones.', 'dash.quests') +
      expander('AI insights', 'wand-magic-sparkles', 'Most blocked · Upcoming deadline · Velocity trend cards (dash.insights).', 'dash.insights') +
      expander('GitHub activity', 'code-branch', 'GithubActivityWidget — recent commits and PRs across your repositories.') +
      expander('Upcoming events', 'calendar-week', 'UpcomingEventsWidget including RSVP and the event QR panel.') +
      expander('Full recap', 'clock-rotate-left', 'FullRecapModal — completed work by day. Also in My work › Actions.');
    return { title: 'Home', header: header('Home'), body: body };
  };

  function expander(title, iconName, text, tourId) {
    return '<details class="m-expander"' + (tourId ? ' data-tour-id="' + tourId + '"' : '') + '><summary><span class="m-row-icon">' + icon(iconName) + '</span>' + esc(title) + '</summary><div class="m-expander-body">' + esc(text) + '</div></details>';
  }
  function starFirst(a, b) {
    var sa = S.starred.indexOf(a.id) !== -1 ? 0 : 1, sb = S.starred.indexOf(b.id) !== -1 ? 0 : 1;
    return sa - sb;
  }
  function rsvpButtons(ev) {
    return '<button type="button" class="m-btn" style="flex:1" data-action="rsvp" data-arg="' + ev.id + '|GOING" aria-pressed="' + (ev.rsvp === 'GOING') + '">' + icon('check') + ' Going</button>' +
      '<button type="button" class="m-btn" style="flex:1" data-action="rsvp" data-arg="' + ev.id + '|NOT_GOING" aria-pressed="' + (ev.rsvp === 'NOT_GOING') + '">' + icon('xmark') + ' Can&rsquo;t go</button>';
  }

  // Project navigation. SECTIONS stands in for ProjectDetail's NAV_TABS as
  // published through ProjectNavContext — same ids, labels and tour ids.
  var SECTIONS = [
    { id: 'tasks', label: 'Tasks', tourId: 'project.tab.tasks' },
    { id: 'files', label: 'Files', tourId: 'project.tab.files' },
    { id: 'chat', label: 'Chat', tourId: 'project.tab.chat' },
    { id: 'insights', label: 'Insights', tourId: 'project.tab.insights' },
  ];

  screens.project = function (r) {
    var p = project(r.projectId);
    if (!p) {
      return { title: 'Project not found', header: header('Project', { back: '/clubpm' }), body: '<div class="m-card m-empty">' + icon('circle-question') + 'This project doesn&rsquo;t exist or you can&rsquo;t see it.<br><button type="button" class="m-btn" style="margin-top:10px" data-action="open-projects">Choose a project</button></div>' };
    }
    var head = header(p.name, {
      titleHtml: '<button type="button" class="m-project-switch" data-action="open-projects" data-focus-key="hdr-project" aria-haspopup="dialog" aria-label="Switch project. Current project: ' + esc(p.name) + '"><h1 class="m-title">' + esc(p.name) + '</h1>' + icon('chevron-down') + '</button>',
    });
    var sections = '<nav class="m-sections" aria-label="Project sections">' + SECTIONS.map(function (s) {
      var q = s.id === 'tasks' ? '' : '?tab=' + s.id;
      return '<a class="m-section-btn" href="#/clubpm/projects/' + p.id + q + '" data-nav data-replace' + (r.tab === s.id ? ' aria-current="page"' : '') + ' data-tour-id="' + s.tourId + '">' + s.label + '</a>';
    }).join('') + '</nav>';
    var body = { tasks: projectTasks, files: projectFiles, chat: projectChat, insights: projectInsights }[r.tab];
    body = body ? body(p, r) : '<div class="m-card m-empty">Unknown section.</div>';
    var dialog = r.task ? taskDialog(p, r) : '';
    return { title: p.name, header: head, sections: sections, body: body, dialog: dialog };
  };

  function projectSummary(p) {
    var tasks = tasksOf(p.id).filter(function (t) { return !t.archived; });
    var done = tasks.filter(function (t) { return t.status === 'DONE'; }).length;
    var pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    return '<div data-tour-id="project.header" style="display:flex;flex-wrap:wrap;align-items:center;gap:8px">' +
      '<span class="m-chip" style="color:' + (PROJECT_STATUS_COLOR[p.status] || 'var(--pm-text-muted)') + '">' + esc(p.status) + '</span>' +
      '<span class="m-count">' + pct + '% complete</span>' +
      '<button type="button" class="m-btn m-btn--ghost" style="margin-left:auto" data-action="project-actions" data-arg="' + p.id + '" data-focus-key="proj-actions" aria-haspopup="dialog" aria-label="Project actions">' + icon('ellipsis') + ' Actions</button></div>';
  }

  function filteredTasks(p) {
    var q = S.taskQuery.trim().toLowerCase();
    return tasksOf(p.id).filter(function (t) {
      if (t.archived && !S.filters.archived) return false;
      if (S.filters.scope === 'mine' && t.assignees.indexOf(me.id) === -1) return false;
      if (S.filters.priorities.length && S.filters.priorities.indexOf(t.priority) === -1) return false;
      if (q && t.title.toLowerCase().indexOf(q) === -1) return false;
      return true;
    }).sort(function (a, b) {
      if (S.filters.sort === 'due') return new Date(a.due) - new Date(b.due);
      if (S.filters.sort === 'title') return a.title.localeCompare(b.title);
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    });
  }
  function filterCount() {
    return (S.filters.sort !== 'priority' ? 1 : 0) + (S.filters.archived ? 1 : 0) + S.filters.priorities.length;
  }

  function projectTasks(p) {
    var all = tasksOf(p.id);
    var fc = filterCount();
    var out = projectSummary(p) +
      '<div class="m-task-toolbar" data-tour-id="board.filters">' +
        '<div class="m-task-toolbar-row"><div class="m-seg" role="group" aria-label="Which tasks">' +
          '<button type="button" data-action="scope" data-arg="mine" aria-pressed="' + (S.filters.scope === 'mine') + '">My tasks</button>' +
          '<button type="button" data-action="scope" data-arg="all" aria-pressed="' + (S.filters.scope === 'all') + '">All tasks</button></div>' +
          (canEditProject() ? '<button type="button" class="m-btn m-btn--primary m-push" data-action="new-task" data-arg="' + p.id + '" data-focus-key="new-task" data-tour-id="board.newtask">' + icon('plus') + ' New task</button>' : '') + '</div>' +
        '<div class="m-task-toolbar-row"><label class="m-search"><span class="sr-only">Search tasks</span>' + icon('magnifying-glass') + '<input class="m-input" type="search" placeholder="Search tasks" value="' + esc(S.taskQuery) + '" data-input="task-query" data-arg="' + p.id + '"></label>' +
          '<button type="button" class="m-btn" data-action="filters" data-arg="' + p.id + '" data-focus-key="filters" aria-haspopup="dialog" aria-label="Filters and sort' + (fc ? ', ' + fc + ' applied' : '') + '">' + icon('sliders') + ' Filters' + (fc ? ' (' + fc + ')' : '') + '</button></div>' +
      '</div>';
    if (!all.length) {
      return out + '<div class="m-card m-empty">' + icon('clipboard-list') + 'No tasks in this project yet.<br>' +
        (canEditProject() ? '<button type="button" class="m-btn m-btn--primary" style="margin-top:10px" data-action="new-task" data-arg="' + p.id + '">' + icon('plus') + ' Create the first task</button>' : 'Ask a project member to add one.') + '</div>';
    }
    if (S.selectMode) {
      out += '<div class="m-card" style="padding:10px 12px;margin-bottom:4px;display:flex;align-items:center;gap:8px"><b style="flex:1">' + Object.keys(S.selected).length + ' selected</b><button type="button" class="m-btn" data-action="select-mode-off">Done</button></div>';
    }
    out += '<div id="task-bins">' + taskBins(p) + '</div>';
    out += '<div class="m-section-title"><h2>Timeline</h2><a class="m-link-btn" href="#/clubpm/projects/' + p.id + '/gantt" data-nav>Open timeline ' + icon('chevron-right') + '</a></div>' +
      '<div class="m-card" style="padding:12px;color:var(--pm-text-secondary);font-size:14px">Milestones and dated tasks as a list; the Gantt chart opens separately (Phase 2/4).</div>';
    if (S.selectMode && Object.keys(S.selected).length) {
      out += '<div class="m-bulkbar" role="toolbar" aria-label="Bulk actions">' +
        ['Status', 'Assign', 'Due date', 'Priority', 'Archive'].map(function (l) { return '<button type="button" class="m-btn" data-action="bulk" data-arg="' + l + '">' + l + '</button>'; }).join('') +
        '<button type="button" class="m-btn m-btn--danger" data-action="bulk" data-arg="Delete">Delete…</button></div>';
    }
    return out;
  }
  function taskBins(p) {
    var list = filteredTasks(p);
    if (!list.length) return '<div class="m-card m-empty">' + icon('filter') + 'No tasks match these filters.<br><button type="button" class="m-btn" style="margin-top:10px" data-action="clear-filters">Clear filters</button></div>';
    var bins = STATUS_ORDER.map(function (st) {
      var ts = list.filter(function (t) { return t.status === st && !t.archived; });
      var key = p.id + ':' + st;
      var open = !S.collapsed[key];
      return '<section class="m-bin" data-tour-id="board.column.' + st + '"><button type="button" class="m-bin-head" data-action="toggle-bin" data-arg="' + key + '" aria-expanded="' + open + '">' +
        icon(open ? 'chevron-down' : 'chevron-right') + '<span style="color:' + STATUS[st].color + '">' + STATUS[st].label + '</span><span class="m-count">' + ts.length + '</span></button>' +
        (open ? '<div class="m-bin-body">' + (ts.length ? ts.map(function (t, i) { return taskRow(t, p.id, { selectable: true, first: st === 'TODO' && i === 0 }); }).join('') : '<div class="m-empty" style="padding:14px">No tasks.</div>') + '</div>' : '') +
        '</section>';
    }).join('');
    var archived = list.filter(function (t) { return t.archived; });
    if (S.filters.archived) {
      bins += '<section class="m-bin"><div class="m-bin-head" style="cursor:default">' + icon('box-archive') + ' Archived <span class="m-count">' + archived.length + '</span></div><div class="m-bin-body">' +
        (archived.length ? archived.map(function (t) { return taskRow(t, p.id, { selectable: true }); }).join('') : '<div class="m-empty" style="padding:14px">No archived tasks.</div>') + '</div></section>';
    }
    return bins;
  }

  function projectFiles(p) {
    var key = 'proto.files.sub.' + p.id;
    var sub;
    try { sub = sessionStorage.getItem(key) || 'drive'; } catch (e) { sub = 'drive'; }
    var rows = {
      drive: [['file-pdf', 'Thermal-vac procedure v3.pdf', 'Drive · 2.1 MB'], ['file-lines', 'Test readiness review notes', 'Google Doc'], ['folder', 'CAD exports', 'Folder · 14 items']],
      github: [['code-branch', 'search-payload-firmware', '3 open PRs · CI passing'], ['code-pull-request', 'PR #41: harness pinout table', 'Open · review requested']],
      vault: [['cube', 'BRK-0012 Mounting bracket', 'Rev C · checked out by Sam Testcase'], ['cube', 'ASM-0003 Payload stack', 'Released · 11 parts'], ['clipboard-check', 'Change requests', '1 open']],
    };
    return projectSummary(p) +
      '<div class="m-toolbar"><label class="m-field" style="margin:0;flex:1"><span>Source</span><select class="m-select" data-input="files-sub" data-arg="' + p.id + '">' +
        [['drive', 'Google Drive'], ['github', 'GitHub'], ['vault', 'Vault (CAD / PDM)']].map(function (o) { return '<option value="' + o[0] + '"' + (sub === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
      '</select></label></div>' +
      '<div class="m-card">' + rows[sub].map(function (x) {
        return '<a class="m-row" href="#/clubpm/projects/' + p.id + '?tab=files" data-action="file-item"><span class="m-row-icon">' + icon(x[0]) + '</span><span class="m-row-main"><span class="m-row-title">' + esc(x[1]) + '</span><span class="m-row-meta">' + esc(x[2]) + '</span></span>' + icon('chevron-right') + '</a>';
      }).join('') + '</div>' +
      '<p style="color:var(--pm-text-secondary);font-size:13px">Source is remembered per project (same sessionStorage idea as FilesTabContent today). Upload, connect, and change-request actions move into a labeled Actions menu in Phase 4.</p>';
  }

  function projectChat(p, r) {
    var view = r.view === 'members' ? 'members' : 'messages';
    var seg = '<div class="m-seg" role="group" aria-label="Project chat view" style="margin:12px 0">' +
      '<button type="button" data-action="project-chat-view" data-arg="' + p.id + '|messages" aria-pressed="' + (view === 'messages') + '">Messages</button>' +
      '<button type="button" data-action="project-chat-view" data-arg="' + p.id + '|members" aria-pressed="' + (view === 'members') + '">Members</button></div>';
    var scope = '<p style="margin:12px 0 0;color:var(--pm-text-secondary);font-size:13px">' + icon('folder-open') + ' Scoped to this project</p>';
    if (view === 'members') {
      return projectSummary(p) + scope + seg + '<div class="m-card">' + Object.keys(F.people).filter(function (id) { return id !== 'm9'; }).map(function (id) {
        var x = person(id);
        return '<div class="m-row" style="cursor:default">' + avatar(x) + '<span class="m-row-main"><span class="m-row-title">' + esc(x.name) + '</span><span class="m-row-meta">@' + esc(x.handle) + '</span></span>' +
          (x.id !== me.id ? '<a class="m-btn" href="#/clubpm/members?dm=D1" data-nav data-from="current" aria-label="Message ' + esc(x.name) + '">' + icon('paper-plane') + '</a>' : '') + '</div>';
      }).join('') + '</div>';
    }
    return projectSummary(p) + scope + seg + '<div class="m-card">' + S.channels.filter(function (c) { return c.joined; }).slice(0, 2).map(channelRow).join('') + '</div>';
  }

  function projectInsights(p, r) {
    var view = ['activity', 'presskit', 'ai'].indexOf(r.view) !== -1 ? r.view : 'charts';
    var text = {
      charts: 'ProjectAnalytics — burndown, status mix, risk radar. Phone: readable labels plus a summary list alternative (Phase 4).',
      activity: 'ProjectActivity — audit feed; rows open the task (same single TaskModal opener).',
      presskit: 'PressKitPanel — collaborative press kit editor (Phase 4 editor slice).',
      ai: 'AiPanel — Ask, Action Plan (goal → review each action → accept/decline → execute), clipboard prompt/import lane. Full-screen review on phones.',
    };
    return projectSummary(p) +
      '<label class="m-field" style="margin-top:12px"><span>Insights section</span><select class="m-select" data-input="insights-view" data-arg="' + p.id + '">' +
      [['charts', 'Charts'], ['activity', 'Activity'], ['presskit', 'Press kit'], ['ai', 'AI']].map(function (o) { return '<option value="' + o[0] + '"' + (view === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
      '</select></label><div class="m-card" style="padding:14px;color:var(--pm-text-secondary)"' + (view === 'ai' ? ' data-tour-id="ai.goal"' : '') + '>' + esc(text[view]) + '</div>';
  }

  // Task detail: full-screen, URL-backed (?task=), dragging never required.
  function taskDialog(p, r) {
    var t = tasksOf(p.id).find(function (x) { return x.id === r.task; });
    var parent = '/clubpm/projects/' + p.id + (r.tab !== 'tasks' ? '?tab=' + r.tab + (r.view ? '&view=' + r.view : '') : '');
    if (!t) {
      return '<div class="m-dialog" role="dialog" aria-modal="true" aria-labelledby="td-title">' + header('Task', { back: parent, right: '', titleHtml: '<h1 class="m-title" id="td-title">Task not found</h1>' }) +
        '<div class="m-dialog-body"><div class="m-card m-empty">That task was deleted, archived, or belongs to another project.</div></div><div></div></div>';
    }
    var assignees = t.assignees.map(person);
    return '<div class="m-dialog" role="dialog" aria-modal="true" aria-labelledby="td-title" data-tour-id="task.modal">' +
      '<header class="m-header m-header--detail"><button type="button" class="m-icon-btn" data-action="close-task" data-arg="' + esc(parent) + '" aria-label="Close task" data-autofocus>' + icon('arrow-left') + '</button>' +
        '<h1 class="m-title" id="td-title">Task<span class="m-title-sub">' + esc(p.name) + '</span></h1>' +
        '<button type="button" class="m-icon-btn" data-action="task-actions" data-arg="' + p.id + '|' + t.id + '" data-focus-key="task-actions" aria-label="Task actions" aria-haspopup="dialog">' + icon('ellipsis-vertical') + '</button></header>' +
      '<div class="m-dialog-body">' +
        '<label class="m-field" data-tour-id="task.modal.title"><span>Title</span><textarea class="m-textarea" style="min-height:64px" data-input="task-title" data-arg="' + p.id + '|' + t.id + '">' + esc(t.title) + '</textarea></label>' +
        '<div class="m-field" data-tour-id="task.modal.status"><span>Status</span><div class="m-seg m-seg--grid" role="group" aria-label="Status">' +
          STATUS_ORDER.map(function (st) { return '<button type="button" data-action="set-status" data-arg="' + p.id + '|' + t.id + '|' + st + '" aria-pressed="' + (t.status === st) + '">' + STATUS[st].label + '</button>'; }).join('') + '</div></div>' +
        '<div class="m-field" data-tour-id="task.modal.assignees"><span>Assignees</span><div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">' +
          (assignees.length ? assignees.map(function (a) { return '<span class="m-chip" style="color:var(--pm-text-primary);border-color:var(--pm-border);padding:4px 10px 4px 4px">' + avatar(a) + ' ' + esc(a.name) + '</span>'; }).join('') : '<span style="color:var(--pm-text-secondary)">Unassigned</span>') +
          '<button type="button" class="m-btn" data-action="assign" data-arg="' + p.id + '|' + t.id + '" data-focus-key="assign" aria-haspopup="dialog">' + icon('user-plus') + ' Assign</button></div></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
          '<label class="m-field" data-tour-id="task.modal.due"><span>Due</span><input class="m-input" type="date" value="' + t.due.slice(0, 10) + '"></label>' +
          '<label class="m-field" data-tour-id="task.modal.priority"><span>Priority</span><select class="m-select">' + ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(function (pr) { return '<option' + (t.priority === pr ? ' selected' : '') + '>' + pr.charAt(0) + pr.slice(1).toLowerCase() + '</option>'; }).join('') + '</select></label></div>' +
        '<label class="m-field" data-tour-id="task.modal.description"><span>Description</span><textarea class="m-textarea">FIXTURE task description.</textarea></label>' +
        '<details class="m-expander" data-tour-id="task.modal.subtasks"><summary><span class="m-row-icon">' + icon('list-check') + '</span>Subtasks <span class="m-count">' + (t.subtasks || 0) + '</span></summary><div class="m-expander-body">Subtask list, add subtask, open subtask (nested TaskModal).</div></details>' +
        '<details class="m-expander" data-tour-id="task.modal.blockers"><summary><span class="m-row-icon">' + icon('ban') + '</span>Blockers &amp; dependencies</summary><div class="m-expander-body" data-tour-id="task.modal.deps">Attach/detach category blocker, add/remove dependency — explicit buttons replace dropping on the Blocked bin.</div></details>' +
        '<details class="m-expander"><summary><span class="m-row-icon">' + icon('paperclip') + '</span>Attachments</summary><div class="m-expander-body">Attachment picker, Drive preview.</div></details>' +
        '<details class="m-expander" data-tour-id="task.modal.timelog"><summary><span class="m-row-icon">' + icon('stopwatch') + '</span>Time log</summary><div class="m-expander-body">Log time (8-hr daily cap; &gt;2 hr queued for admin).</div></details>' +
        '<details class="m-expander" data-tour-id="task.modal.history"><summary><span class="m-row-icon">' + icon('clock-rotate-left') + '</span>History</summary><div class="m-expander-body">Audit trail from GET /api/tasks/:id/history.</div></details>' +
        '<label class="m-field" style="margin-top:14px" data-tour-id="task.modal.comments"><span>Comment</span><textarea class="m-textarea" placeholder="Write a comment — @ to mention" data-input="task-comment" data-arg="' + t.id + '">' + esc(S.drafts['c-' + t.id] || '') + '</textarea></label>' +
      '</div>' +
      '<div class="m-dialog-foot"><button type="button" class="m-btn" data-action="close-task" data-arg="' + esc(parent) + '">Close</button><button type="button" class="m-btn m-btn--primary" data-action="post-comment" data-arg="' + t.id + '">' + icon('paper-plane') + ' Post comment</button></div>' +
    '</div>';
  }

  function channelRow(c) {
    var unread = c.unread > 0 && !c.muted;
    return '<a class="m-row" href="#/clubpm/chat/' + c.id + '" data-nav data-from="/clubpm/chat">' +
      '<span class="m-row-icon">' + icon(c.kind === 'PRIVATE' ? 'lock' : 'hashtag') + '</span>' +
      '<span class="m-row-main"><span class="m-row-title" style="' + (unread ? '' : 'font-weight:500') + '">' + esc(c.name) + '</span>' +
      (c.joined ? '' : '<span class="m-row-meta">Public · preview before joining</span>') + '</span>' +
      '<span class="m-row-end">' + (c.muted ? '<i class="fas fa-bell-slash" aria-label="Muted"></i>' : '') + (unread ? '<span class="m-unread" aria-label="' + c.unread + ' unread">' + c.unread + '</span>' : '') + icon('chevron-right') + '</span></a>';
  }

  screens.chatlist = function () {
    var joined = S.channels.filter(function (c) { return c.joined; });
    var browse = S.channels.filter(function (c) { return !c.joined; });
    var dmUnread = S.dms.reduce(function (n, d) { return n + d.unread; }, 0);
    var body =
      '<a class="m-people-card" href="#/clubpm/members?view=dms" data-nav data-tour-id="chat.people"><span class="m-row-icon">' + icon('user-group') + '</span><span class="m-row-main"><span class="m-row-title">People &amp; direct messages</span><span class="m-row-meta">Roster, DMs and group DMs live on Members</span></span>' +
        (dmUnread ? '<span class="m-unread" aria-label="' + dmUnread + ' unread direct messages">' + dmUnread + '</span>' : '') + icon('chevron-right') + '</a>' +
      '<label class="m-search"><span class="sr-only">Find a channel</span>' + icon('magnifying-glass') + '<input class="m-input" type="search" placeholder="Find a channel" data-input="channel-filter"></label>' +
      '<div id="channel-lists">' + channelLists(joined, browse, '') + '</div>';
    return { title: 'Chat', header: header('Chat'), body: body };
  };
  function channelLists(joined, browse, q) {
    var m = function (c) { return !q || c.name.indexOf(q) !== -1; };
    var j = joined.filter(m), b = browse.filter(m);
    return '<div class="m-group-label">Your channels</div>' +
      (j.length ? '<div class="m-card">' + j.map(channelRow).join('') + '</div>' : '<div class="m-card m-empty">' + (q ? 'No joined channel matches “' + esc(q) + '”.' : 'You haven&rsquo;t joined any channels yet.') + '</div>') +
      '<button type="button" class="m-link-btn" style="margin-top:12px" data-action="toggle-browse" aria-expanded="' + S.showBrowse + '" aria-controls="browse-list">' + icon(S.showBrowse ? 'chevron-down' : 'chevron-right') + ' Browse public channels (' + browse.length + ')</button>' +
      '<div id="browse-list"' + (S.showBrowse ? '' : ' hidden') + '>' + (b.length ? '<div class="m-card">' + b.map(channelRow).join('') + '</div>' : '<div class="m-card m-empty">No public channels to browse.</div>') + '</div>';
  }

  function conversationView(opts) {
    var msgs = S.messages[opts.id] || (S.messages[opts.id] = F.messagesFor(opts.id));
    var body = '<div class="m-convo"><div class="m-messages" id="messages" aria-live="polite">' + msgs.map(function (m) {
      var a = person(m.author);
      return '<article class="m-msg">' + avatar(a) + '<div class="m-msg-body"><div class="m-msg-head"><b class="m-msg-author">' + esc(a.name) + '</b><time class="m-msg-time">' + fmtTime(m.at) + '</time>' +
          '<button type="button" class="m-msg-more" data-action="msg-actions" data-arg="' + m.id + '" aria-label="Message actions: react, reply in thread, edit, delete" aria-haspopup="dialog">' + icon('ellipsis') + '</button></div>' +
        '<div class="m-msg-text">' + esc(m.text) + '</div>' +
        '<div class="m-msg-actions">' + m.reactions.map(function (x) { return '<button type="button" class="m-reaction" aria-label="' + x.n + ' reactions">' + x.e + ' ' + x.n + '</button>'; }).join('') +
          (m.replies ? '<a class="m-link-btn" style="min-height:32px;padding:0" href="#' + opts.threadBase + m.id + '" data-nav data-from="current">' + icon('comments') + ' ' + m.replies + ' replies</a>' : '') +
          '</div></div></article>';
    }).join('') + '</div>';
    var foot;
    if (opts.preview) {
      foot = '<div class="m-preview-banner"><span>You&rsquo;re previewing #' + esc(opts.name) + '.</span><button type="button" class="m-btn m-btn--primary" data-action="join" data-arg="' + opts.id + '">Join channel</button></div>';
    } else {
      foot = '<form class="m-composer" data-action="send" data-arg="' + opts.id + '"><button type="button" class="m-icon-btn" aria-label="Attach a file" data-action="attach">' + icon('paperclip') + '</button>' +
        '<label style="flex:1;min-width:0"><span class="sr-only">' + esc(opts.placeholder) + '</span><textarea class="m-textarea" rows="1" placeholder="' + esc(opts.placeholder) + '" data-input="draft" data-arg="' + opts.id + '">' + esc(S.drafts[opts.id] || '') + '</textarea></label>' +
        '<button type="submit" class="m-icon-btn" style="color:var(--pm-accent-teal)" aria-label="Send">' + icon('paper-plane') + '</button></form>';
    }
    return body + foot + '</div>';
  }

  screens.conversation = function (r) {
    var c = S.channels.find(function (x) { return x.id === r.channelId; });
    if (!c) return { title: 'Channel', header: header('Channel', { back: '/clubpm/chat', right: '' }), body: '<div class="m-card m-empty">That channel isn&rsquo;t available to you.</div>' };
    if (r.thread) {
      return {
        title: 'Thread', header: header('Thread', { back: '/clubpm/chat/' + c.id, sub: '#' + c.name, right: '' }),
        body: '', after: fillConversation(conversationView({ id: c.id + '-thread', placeholder: 'Reply in thread', threadBase: '' })),
      };
    }
    return {
      title: '#' + c.name,
      header: header('#' + c.name, { back: '/clubpm/chat', sub: c.joined ? (c.muted ? 'Muted' : null) : 'Preview', right: '<button type="button" class="m-icon-btn" data-action="convo-actions" data-arg="' + c.id + '" data-focus-key="convo-actions" aria-label="Conversation actions" aria-haspopup="dialog">' + icon('ellipsis-vertical') + '</button>' }),
      body: '', after: fillConversation(conversationView({ id: c.id, name: c.name, preview: !c.joined, placeholder: 'Message #' + c.name, threadBase: '/clubpm/chat/' + c.id + '?thread=' })),
    };
  };
  // Conversations own their scroll: put them in place of the padded main.
  function fillConversation(html) {
    return function () {
      var main = document.getElementById('main');
      main.style.overflow = 'hidden';
      main.innerHTML = html;
      var list = document.getElementById('messages');
      if (list) list.scrollTop = list.scrollHeight;
    };
  }

  screens.members = function (r) {
    if (r.dm) {
      var d = S.dms.find(function (x) { return x.id === r.dm; }) || S.dms[0];
      var names = d.with.map(function (id) { return person(id).name; }).join(', ');
      return { title: names, header: header(names, { back: '/clubpm/members?view=dms', sub: d.with.length > 1 ? 'Group DM' : 'Direct message', right: '' }), body: '', after: fillConversation(conversationView({ id: d.id, placeholder: 'Message ' + names, threadBase: '/clubpm/members?dm=' + d.id + '&thread=' })) };
    }
    var view = r.view === 'dms' ? 'dms' : 'people';
    var seg = '<div class="m-seg" role="group" aria-label="Members view"><button type="button" data-action="members-view" data-arg="people" aria-pressed="' + (view === 'people') + '">People</button><button type="button" data-action="members-view" data-arg="dms" aria-pressed="' + (view === 'dms') + '">Direct messages</button></div>';
    var list = view === 'dms'
      ? '<div class="m-toolbar"><button type="button" class="m-btn m-btn--primary" data-action="new-dm">' + icon('pen-to-square') + ' New message</button></div><div class="m-card">' + S.dms.map(function (d) {
          var ps = d.with.map(person);
          return '<a class="m-row" href="#/clubpm/members?dm=' + d.id + '" data-nav data-from="/clubpm/members?view=dms">' + avatar(ps[0]) + '<span class="m-row-main"><span class="m-row-title">' + esc(ps.map(function (x) { return x.name; }).join(', ')) + '</span><span class="m-row-meta" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(d.preview) + '</span></span>' +
            '<span class="m-row-end">' + (d.unread ? '<span class="m-unread" aria-label="' + d.unread + ' unread">' + d.unread + '</span>' : '') + icon('chevron-right') + '</span></a>';
        }).join('') + '</div>'
      : '<label class="m-search" style="display:block;margin:12px 0"><span class="sr-only">Search members</span>' + icon('magnifying-glass') + '<input class="m-input" type="search" placeholder="Search members"></label><div class="m-card">' +
        Object.keys(F.people).map(function (id) {
          var x = person(id);
          var admin = id === 'm9';
          return '<div class="m-row" style="cursor:default">' + avatar(x) + '<span class="m-row-main"><span class="m-row-title">' + esc(x.name) + '</span><span class="m-row-meta"><span>@' + esc(x.handle) + '</span>' + (admin ? '<span class="m-role-badge">Admin</span>' : '') + '</span></span>' +
            (id !== me.id ? '<a class="m-btn" href="#/clubpm/members?dm=D1" data-nav data-from="current" aria-label="Message ' + esc(x.name) + '">' + icon('paper-plane') + '</a>' : '') + '</div>';
        }).join('') + '</div><p style="color:var(--pm-text-secondary);font-size:13px">Leaderboard (dash.leaderboard), contributor import (admins) and group-DM selection stay on this page.</p>';
    return { title: 'People & DMs', header: header('People & DMs', { back: '/clubpm/chat' }), body: seg + list };
  };

  screens.calendar = function () {
    var evs = S.events.slice().sort(function (a, b) { return new Date(a.start) - new Date(b.start); });
    var toolbar = '<div class="m-toolbar"><div class="m-seg" role="group" aria-label="Calendar view"><button type="button" data-action="cal-view" data-arg="agenda" aria-pressed="' + (S.calView === 'agenda') + '">Agenda</button><button type="button" data-action="cal-view" data-arg="month" aria-pressed="' + (S.calView === 'month') + '">Month</button></div>' +
      '<button type="button" class="m-btn" data-action="cal-filters" data-focus-key="cal-filters" aria-haspopup="dialog">' + icon('filter') + ' Filters</button>' +
      '<button type="button" class="m-btn m-btn--primary" data-action="cal-new" data-focus-key="cal-new" aria-haspopup="dialog">' + icon('plus') + ' New</button></div>';
    var body;
    if (S.calView === 'month') {
      var cells = '<div class="dow">S</div><div class="dow">M</div><div class="dow">T</div><div class="dow">W</div><div class="dow">T</div><div class="dow">F</div><div class="dow">S</div>';
      var first = new Date(F.now.getFullYear(), F.now.getMonth(), 1);
      for (var i = 0; i < first.getDay(); i += 1) cells += '<div></div>';
      var days = new Date(F.now.getFullYear(), F.now.getMonth() + 1, 0).getDate();
      for (var d = 1; d <= days; d += 1) {
        var has = evs.some(function (e) { var s = new Date(e.start); return s.getDate() === d && s.getMonth() === F.now.getMonth(); });
        cells += '<button type="button" class="' + (has ? 'has-events' : '') + (d === F.now.getDate() ? ' is-today' : '') + '" aria-label="' + d + (has ? ', has events' : '') + '">' + d + '</button>';
      }
      body = '<div class="m-card" style="padding:8px" data-tour-id="calendar.grid"><div class="m-month">' + cells + '</div></div>';
    } else {
      var byDay = {};
      evs.forEach(function (e) { var k = new Date(e.start).toDateString(); (byDay[k] = byDay[k] || []).push(e); });
      body = Object.keys(byDay).map(function (k, di) {
        return '<section class="m-day"><h3>' + esc(new Date(k).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })) + '</h3><div class="m-card">' + byDay[k].map(function (e, i) {
          return '<div class="m-row" style="cursor:default;flex-wrap:wrap"' + (di === 0 && i === 0 ? ' data-tour-id="calendar.event"' : '') + '><span class="m-row-icon">' + icon(e.deadline ? 'flag' : 'calendar-day') + '</span><span class="m-row-main"><span class="m-row-title">' + esc(e.title) + '</span><span class="m-row-meta"><span>' + (e.deadline ? 'Deadline' : fmtTime(e.start) + (e.end ? '–' + fmtTime(e.end) : '')) + '</span>' + (e.where ? '<span>' + esc(e.where) + '</span>' : '') + (e.project ? '<span>' + esc((project(e.project) || {}).name || '') + '</span>' : '') + '</span></span>' +
            (e.deadline ? '' : '<div style="display:flex;gap:8px;width:100%;padding-left:44px">' + rsvpButtons(e) + '</div>') + '</div>';
        }).join('') + '</div></section>';
      }).join('');
    }
    return { title: 'Calendar', header: header('Calendar'), body: toolbar + '<div class="m-card" style="padding:10px 12px;font-size:13px;color:var(--pm-text-secondary)">' + icon('square-poll-vertical') + ' 1 open meeting poll · <button type="button" class="m-link-btn" style="min-height:32px;padding:0" data-action="stub-toast" data-arg="Meeting poll board (MeetingPollBoard) opens full-screen">Respond</button></div>' + body };
  };

  screens.notifications = function () {
    var body = '<div class="m-toolbar"><button type="button" class="m-btn" data-action="read-all">' + icon('check-double') + ' Mark all read</button><a class="m-btn m-btn--ghost" href="#/clubpm/notifications/preferences" data-nav data-from="/clubpm/notifications" data-tour-id="notifications.prefs">' + icon('sliders') + ' Preferences</a></div>' +
      '<div class="m-card" data-tour-id="notifications.list">' + S.notifications.map(function (n) {
        return '<a class="m-row" href="' + n.href + '" data-nav data-from="/clubpm/notifications" data-action="read" data-arg="' + n.id + '"><span class="m-dot" style="background:' + (n.unread ? 'var(--pm-accent-coral)' : 'transparent') + '" aria-hidden="true"></span><span class="m-row-main"><span class="m-row-title" style="' + (n.unread ? '' : 'font-weight:500;color:var(--pm-text-secondary)') + '">' + esc(n.text) + '</span><span class="m-row-meta">' + (n.unread ? '<span class="sr-only">Unread. </span>' : '') + fmtDate(n.at) + '</span></span>' + icon('chevron-right') + '</a>';
      }).join('') + '</div>';
    return { title: 'Notifications', header: header('Notifications', { back: '/clubpm' }), body: body };
  };

  screens.stub = function (r) {
    var s = STUBS[r.key] || { title: 'Unknown page', route: r.path, phase: '—', parts: ['No such route in the prototype.'] };
    if (s.adminOnly && !persona.isAdmin) {
      return { title: 'Admin', header: header('Admin', { back: '/clubpm' }), body: '<div class="m-card m-empty">' + icon('lock') + 'Admins only. The real /clubpm/admin redirects members to the dashboard.</div>' };
    }
    var parent = r.key === 'gantt' ? '/clubpm/projects/' + r.projectId : r.key === 'prefs' ? '/clubpm/notifications' : '/clubpm';
    var body = '<div class="m-card" style="padding:14px"><div class="m-group-label" style="margin-top:0">Existing destination</div><code style="overflow-wrap:anywhere">' + esc(s.route) + '</code>' +
      '<div class="m-group-label">Adapted in</div><div>' + esc(s.phase) + '</div>' +
      '<div class="m-group-label">Must remain reachable</div><ul style="margin:0;padding-left:18px;color:var(--pm-text-secondary)">' + s.parts.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' +
      '<p style="color:var(--pm-text-secondary);font-size:13px">Prototype stand-in. In production the existing page renders here inside the phone shell; its dense UI is adapted in the phase above.</p>';
    return { title: s.title, header: header(s.title, { back: parent }), body: body };
  };

  // ── Sheets ──────────────────────────────────────────────────────────────
  function sheetHead(id, title, extra) {
    return '<div class="m-sheet-head"><h2 id="ov-' + id + '-title">' + esc(title) + '</h2>' + (extra || '') + '<button type="button" class="m-icon-btn" data-action="close-overlay" aria-label="Close">' + icon('xmark') + '</button></div>';
  }

  function openProjects() {
    var html = sheetHead('projects', 'Projects') + '<div class="m-sheet-body" data-tour-id="projects.sheet">' +
      (persona.isAdmin ? '<button type="button" class="m-btn m-btn--primary" style="width:100%;margin-bottom:12px" data-action="new-project">' + icon('plus') + ' New project</button>' : '') +
      '<label class="m-search"><span class="sr-only">Search projects</span>' + icon('magnifying-glass') + '<input class="m-input" type="search" placeholder="Search projects" data-input="project-filter"></label>' +
      '<div id="project-list">' + projectListHtml('') + '</div></div>';
    openOverlay('projects', html, { openerKey: document.activeElement && document.activeElement.getAttribute('data-focus-key') || 'nav-projects' });
  }
  function projectListHtml(q) {
    if (S.projectsError) return '<div class="m-error" role="alert" style="margin-top:12px">Couldn&rsquo;t load projects. Your connection may have dropped.<div style="margin-top:10px"><button type="button" class="m-btn" data-action="retry-projects">' + icon('rotate-right') + ' Retry</button></div></div>';
    var list = S.projects.filter(function (p) { return !q || p.name.toLowerCase().indexOf(q.toLowerCase()) !== -1; });
    if (!S.projects.length) return '<div class="m-empty">' + icon('rocket') + 'No projects yet.' + (persona.isAdmin ? '' : ' An admin creates projects.') + '</div>';
    if (!list.length) return '<div class="m-empty">No project matches “' + esc(q) + '”.</div>';
    var starred = list.filter(function (p) { return S.starred.indexOf(p.id) !== -1; });
    var rest = list.filter(function (p) { return S.starred.indexOf(p.id) === -1; });
    return (starred.length ? '<div class="m-group-label">Starred</div><div class="m-card">' + starred.map(function (p) { return projectRow(p); }).join('') + '</div>' : '') +
      '<div class="m-group-label">' + (starred.length ? 'All other projects' : 'All projects') + ' <span class="m-count">(' + rest.length + ')</span></div><div class="m-card">' + rest.map(function (p) { return projectRow(p); }).join('') + '</div>';
  }

  function openMore() {
    var c = persona.adminCounts;
    function row(href, iconName, label, extra, tourId, from) {
      return '<a class="m-row" href="#' + href + '" data-nav' + (from ? ' data-from="' + from + '"' : '') + (tourId ? ' data-tour-id="' + tourId + '"' : '') + '><span class="m-row-icon">' + icon(iconName) + '</span><span class="m-row-main"><span class="m-row-title">' + label + '</span>' + (extra ? '<span class="m-row-meta">' + extra + '</span>' : '') + '</span>' + icon('chevron-right') + '</a>';
    }
    var html = sheetHead('more', 'More') + '<div class="m-sheet-body">' +
      '<div class="m-card"><div class="m-account">' + avatar(me, true) + '<span class="m-row-main"><span class="m-row-title">' + esc(me.name) + '</span><span class="m-row-meta">@' + esc(me.handle) + (persona.isAdmin ? ' <span class="m-role-badge">Admin</span>' : '') + '</span></span>' +
        '<a class="m-btn" href="#/clubpm/profile" data-nav data-tour-id="nav.profile">Profile</a></div></div>' +
      '<div class="m-group-label">Progress &amp; rewards</div>' +
      '<div class="m-card"><div class="m-progress" data-tour-id="nav.xp"><div style="font-size:13px"><b data-tour-id="nav.rank" style="font-size:15px">' + icon('medal') + ' ' + esc(persona.rank) + '</b><div style="color:var(--pm-text-secondary)">' + persona.xp.toLocaleString() + ' / ' + persona.xpNext.toLocaleString() + ' XP · next: ' + esc(persona.rankNext) + '</div></div>' +
        '<div class="m-xpbar" role="progressbar" aria-label="XP toward ' + esc(persona.rankNext) + '" aria-valuenow="' + persona.xp + '" aria-valuemax="' + persona.xpNext + '"><div style="width:' + Math.round(persona.xp / persona.xpNext * 100) + '%"></div></div>' +
        '<div class="m-stats"><div class="m-stat" data-tour-id="topbar.streak"><b>' + icon('fire') + ' ' + persona.streak + '</b><small>day streak</small></div><div class="m-stat"><b>' + icon('coins') + ' ' + persona.doubloons.toLocaleString() + '</b><small>doubloons</small></div><div class="m-stat"><b>' + esc(persona.rank) + '</b><small>rank</small></div></div></div>' +
        row('/clubpm/challenges', 'trophy', 'Quests &amp; achievements', '', 'topbar.challenges') + row('/clubpm/shop', 'store', 'Shop', '', 'nav.shop') + '</div>' +
      '<div class="m-group-label">People &amp; notifications</div><div class="m-card">' +
        row('/clubpm/members', 'user-group', 'People &amp; DMs', '', 'nav.members') +
        row('/clubpm/notifications', 'bell', 'Notifications') +
        row('/clubpm/notifications/preferences', 'sliders', 'Notification preferences') + '</div>' +
      '<div class="m-group-label">Club tools</div><div class="m-card">' +
        row('/clubpm/outreach', 'bullhorn', 'Outreach Hub') +
        row('/clubpm/outreach?tab=blog', 'newspaper', 'Blog') +
        row('/clubpm/courses', 'graduation-cap', 'Courses', '', 'nav.courses') +
        (persona.isAdmin ? row('/clubpm/admin', 'screwdriver-wrench', 'Admin', '<span class="m-role-badges">' +
          (c.rewards ? '<span class="m-role-badge">' + c.rewards + ' rewards</span>' : '') + (c.changeRequests ? '<span class="m-role-badge">' + c.changeRequests + ' change req.</span>' : '') + (c.certificates ? '<span class="m-role-badge">' + c.certificates + ' certificates</span>' : '') + '</span>', 'nav.admin') : '') + '</div>' +
      '<div class="m-group-label">Help</div><div class="m-card">' + row('/clubpm/help', 'keyboard', 'Keyboard shortcuts &amp; help') + '</div>' +
      '<div class="m-group-label">Account</div><div class="m-card"><button type="button" class="m-row" data-action="stub-toast" data-arg="Leaves Constellation for the public site (/)"><span class="m-row-icon">' + icon('house') + '</span><span class="m-row-main"><span class="m-row-title">Main SEARCH site</span></span>' + icon('arrow-up-right-from-square') + '</button></div>' +
      '<div class="m-signout-gap"></div><div class="m-card"><button type="button" class="m-row m-row--danger" data-action="sign-out"><span class="m-row-icon">' + icon('right-from-bracket') + '</span><span class="m-row-main"><span class="m-row-title">Sign out</span></span></button></div>' +
      '</div>';
    openOverlay('more', html, { openerKey: 'nav-more' });
  }

  function openSearch() {
    if (S.overlays.some(function (o) { return o.id === 'search'; })) return;
    var html = '<header class="m-header m-header--detail"><button type="button" class="m-icon-btn" data-action="close-overlay" aria-label="Close search">' + icon('arrow-left') + '</button>' +
      '<h1 class="sr-only" id="ov-search-title">Search</h1><label class="m-search" style="flex:1;margin-right:8px"><span class="sr-only">Search tasks and projects</span>' + icon('magnifying-glass') + '<input class="m-input" type="search" placeholder="Search tasks and projects…" data-input="search" data-autofocus autocomplete="off"></label></header>' +
      '<div class="m-dialog-body" id="search-results"><div class="m-empty">Type to search across your workspace.<br>Start with / for commands.</div></div><div></div>';
    openOverlay('search', html, { kind: 'dialog', openerKey: 'hdr-search' });
  }
  function searchResults(q) {
    q = q.trim().toLowerCase();
    if (!q) return '<div class="m-empty">Type to search across your workspace.<br>Start with / for commands.</div>';
    if (q.charAt(0) === '/') {
      var cmds = [['/new-project', 'Create a new project', '/clubpm'], ['/my-tasks', 'Go to your task dashboard', '/clubpm']].filter(function (c) { return c[0].indexOf(q) === 0; });
      return cmds.length ? '<div class="m-group-label">Commands</div><div class="m-card">' + cmds.map(function (c) { return '<a class="m-row" href="#' + c[2] + '" data-nav><span class="m-row-icon">' + icon('terminal') + '</span><span class="m-row-main"><span class="m-row-title">' + c[0] + '</span><span class="m-row-meta">' + c[1] + '</span></span></a>'; }).join('') + '</div>' : '<div class="m-empty">No commands match “' + esc(q) + '”.</div>';
    }
    var ps = S.projects.filter(function (p) { return p.name.toLowerCase().indexOf(q) !== -1; }).slice(0, 5);
    var ts = [];
    S.projects.slice(0, 4).forEach(function (p) { tasksOf(p.id).forEach(function (t) { if (t.title.toLowerCase().indexOf(q) !== -1) ts.push({ t: t, p: p }); }); });
    ts = ts.slice(0, 8);
    if (!ps.length && !ts.length) return '<div class="m-empty">No results for “' + esc(q) + '”.</div>';
    return (ps.length ? '<div class="m-group-label">Projects</div><div class="m-card">' + ps.map(function (p) { return '<a class="m-row" href="#/clubpm/projects/' + p.id + '" data-nav><span class="m-row-icon">' + icon('folder') + '</span><span class="m-row-main"><span class="m-row-title m-row-title--clamp">' + esc(p.name) + '</span></span></a>'; }).join('') + '</div>' : '') +
      (ts.length ? '<div class="m-group-label">Tasks</div><div class="m-card">' + ts.map(function (x) { return '<a class="m-row" href="#/clubpm/projects/' + x.p.id + '?task=' + x.t.id + '" data-nav><span class="m-row-icon">' + icon('square-check') + '</span><span class="m-row-main"><span class="m-row-title m-row-title--clamp">' + esc(x.t.title) + '</span><span class="m-row-meta" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(x.p.name) + '</span></span></a>'; }).join('') + '</div>' : '');
  }

  function openStatusSheet(pid, tid) {
    var t = tasksOf(pid).find(function (x) { return x.id === tid; });
    var html = sheetHead('status', 'Set status') + '<div class="m-sheet-body"><p style="margin:0 0 10px;color:var(--pm-text-secondary)" class="m-row-title--clamp">' + esc(t.title) + '</p><div class="m-card">' +
      STATUS_ORDER.map(function (st) {
        return '<button type="button" class="m-row" data-action="set-status" data-arg="' + pid + '|' + tid + '|' + st + '" aria-pressed="' + (t.status === st) + '"><span class="m-dot" style="background:' + STATUS[st].color + '" aria-hidden="true"></span><span class="m-row-main"><span class="m-row-title">' + STATUS[st].label + '</span>' +
          (st === 'BLOCKED' ? '<span class="m-row-meta">Asks what is blocking it (category blocker), like dropping on the Blocked bin</span>' : '') + '</span>' + (t.status === st ? icon('check') : '') + '</button>';
      }).join('') + '</div></div>';
    openOverlay('status', html);
  }

  function openAssign(pid, tid) {
    var t = tasksOf(pid).find(function (x) { return x.id === tid; });
    var html = sheetHead('assign', 'Assign') + '<div class="m-sheet-body"><label class="m-search"><span class="sr-only">Search members</span>' + icon('magnifying-glass') + '<input class="m-input" type="search" placeholder="Search members" data-autofocus></label>' +
      '<div class="m-group-label">Members</div><div class="m-card">' + Object.keys(F.people).map(function (id) {
        var x = person(id), on = t.assignees.indexOf(id) !== -1;
        return '<button type="button" class="m-row" data-action="toggle-assignee" data-arg="' + pid + '|' + tid + '|' + id + '" aria-pressed="' + on + '">' + avatar(x) + '<span class="m-row-main"><span class="m-row-title">' + esc(x.name) + '</span></span>' + (on ? icon('check') : '') + '</button>';
      }).join('') + '</div><div style="display:flex;gap:8px;margin-top:12px"><button type="button" class="m-btn" style="flex:1" data-action="assign-everyone" data-arg="' + pid + '|' + tid + '">Everyone</button><button type="button" class="m-btn" style="flex:1" data-action="assign-nobody" data-arg="' + pid + '|' + tid + '">Nobody</button></div>' +
      '<p style="font-size:13px;color:var(--pm-text-secondary)">Replaces dragging member chips from the desktop assignee rail. Changes save immediately.</p></div>';
    openOverlay('assign', html);
  }

  function openFilters(pid) {
    var f = S.filters;
    var html = sheetHead('filters', 'Filters & sort') + '<div class="m-sheet-body">' +
      '<label class="m-field"><span>Sort by</span><select class="m-select" data-input="sort">' + [['priority', 'Priority'], ['due', 'Due date'], ['title', 'Title']].map(function (o) { return '<option value="' + o[0] + '"' + (f.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
      '<div class="m-field"><span>Priority</span><div style="display:flex;flex-wrap:wrap;gap:6px">' + ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(function (p) { return '<button type="button" class="m-btn" data-action="toggle-priority" data-arg="' + p + '" aria-pressed="' + (f.priorities.indexOf(p) !== -1) + '">' + p.charAt(0) + p.slice(1).toLowerCase() + '</button>'; }).join('') + '</div></div>' +
      '<label class="m-row" style="border:1px solid var(--pm-border);border-radius:12px"><span class="m-row-main"><span class="m-row-title">Show archived tasks</span></span><input type="checkbox" style="width:22px;height:22px" data-input="archived"' + (f.archived ? ' checked' : '') + '></label>' +
      '<div style="display:flex;gap:8px;margin-top:14px"><button type="button" class="m-btn" style="flex:1" data-action="clear-filters">Clear</button><button type="button" class="m-btn m-btn--primary" style="flex:1" data-action="close-overlay">Show results</button></div></div>';
    openOverlay('filters', html, { onClose: function () { var el = document.getElementById('task-bins'); if (el) render(); } });
  }

  function openProjectActions(pid) {
    var p = project(pid);
    var starred = S.starred.indexOf(pid) !== -1;
    function b(action, iconName, label, sub) { return '<button type="button" class="m-row" data-action="' + action + '" data-arg="' + pid + '"><span class="m-row-icon">' + icon(iconName) + '</span><span class="m-row-main"><span class="m-row-title">' + label + '</span>' + (sub ? '<span class="m-row-meta">' + sub + '</span>' : '') + '</span></button>'; }
    var html = sheetHead('project-actions', 'Project actions') + '<div class="m-sheet-body"><p class="m-row-title--clamp" style="margin:0 0 10px;color:var(--pm-text-secondary)">' + esc(p.name) + '</p><div class="m-card">' +
      b('select-mode-on', 'square-check', 'Select tasks', 'Bulk status, assign, due date, priority, archive, delete') +
      b('star', starred ? 'star' : 'star', starred ? 'Unpin project' : 'Pin project', 'Pinned projects list first') +
      '<a class="m-row" href="#/clubpm/projects/' + pid + '/gantt" data-nav><span class="m-row-icon">' + icon('chart-gantt') + '</span><span class="m-row-main"><span class="m-row-title">Timeline (Gantt)</span><span class="m-row-meta">Currently reachable only by URL</span></span></a>' +
      (canEditProject() ? b('stub-toast', 'pencil', 'Edit project', 'EditProjectModal — name, status, dates, links') : '') +
      b('stub-toast', 'hashtag', 'Slack channel', 'Link / change the project channel') +
      b('stub-toast', 'folder-tree', 'Drive folder', 'Open, preview or change the folder') +
      (persona.isAdmin ? b('stub-toast', 'align-left', 'Edit description', 'Admins — used by the press kit') : '') +
      '</div></div>';
    openOverlay('project-actions', html);
  }

  function openNewTask(pid, initialStatus) {
    var d = S.newTaskDraft && S.newTaskDraft.pid === pid ? S.newTaskDraft : (S.newTaskDraft = { pid: pid, title: '', status: initialStatus || 'TODO', priority: 'MEDIUM', due: '', error: '' });
    var html = '<header class="m-header m-header--detail"><button type="button" class="m-icon-btn" data-action="close-overlay" aria-label="Cancel new task">' + icon('xmark') + '</button><h1 class="m-title" id="ov-new-task-title">New task</h1></header>' +
      '<div class="m-dialog-body" data-tour-id="task.create.modal"><p style="margin-top:0;color:var(--pm-text-secondary)" class="m-row-title--clamp">' + esc(project(pid).name) + '</p>' +
      '<label class="m-field" data-tour-id="task.create.title"><span>Title (required)</span><input class="m-input" data-input="nt-title" value="' + esc(d.title) + '" data-autofocus aria-describedby="nt-err"></label><div id="nt-err" class="m-field-error" role="alert">' + esc(d.error) + '</div>' +
      '<label class="m-field"><span>Status</span><select class="m-select" data-input="nt-status">' + STATUS_ORDER.map(function (s) { return '<option value="' + s + '"' + (d.status === s ? ' selected' : '') + '>' + STATUS[s].label + '</option>'; }).join('') + '</select></label>' +
      '<label class="m-field"><span>Priority</span><select class="m-select" data-input="nt-priority">' + ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(function (p) { return '<option value="' + p + '"' + (d.priority === p ? ' selected' : '') + '>' + p.charAt(0) + p.slice(1).toLowerCase() + '</option>'; }).join('') + '</select></label>' +
      '<label class="m-field"><span>Due date</span><input class="m-input" type="date" data-input="nt-due" value="' + esc(d.due) + '"></label>' +
      '<p style="font-size:13px;color:var(--pm-text-secondary)">Draft is kept if you close this and come back.</p></div>' +
      '<div class="m-dialog-foot"><button type="button" class="m-btn" data-action="close-overlay">Cancel</button><button type="button" class="m-btn m-btn--primary" data-action="create-task" data-arg="' + pid + '">Create task</button></div>';
    openOverlay('new-task', html, { kind: 'dialog', openerKey: 'new-task' });
  }

  function openNewProject() {
    var html = '<header class="m-header m-header--detail"><button type="button" class="m-icon-btn" data-action="close-overlay" aria-label="Cancel">' + icon('xmark') + '</button><h1 class="m-title" id="ov-new-project-title">New project</h1></header>' +
      '<div class="m-dialog-body"><label class="m-field"><span>Project name (required)</span><input class="m-input" data-input="np-name" data-autofocus placeholder="e.g. Lunar Rover"></label>' +
      '<label class="m-field"><span>Target date</span><input class="m-input" type="date"></label>' +
      '<label class="m-field"><span>Type</span><select class="m-select"><option>Engineering</option><option>Research</option><option>Hybrid</option></select></label>' +
      '<p style="font-size:13px;color:var(--pm-text-secondary)">Shown to admins only — same rule as the sidebar “+” today.</p></div>' +
      '<div class="m-dialog-foot"><button type="button" class="m-btn" data-action="close-overlay">Cancel</button><button type="button" class="m-btn m-btn--primary" data-action="create-project">Create</button></div>';
    openOverlay('new-project', html, { kind: 'dialog' });
  }

  function openSimpleSheet(id, title, rows) {
    var html = sheetHead(id, title) + '<div class="m-sheet-body"><div class="m-card">' + rows.map(function (r) {
      return '<button type="button" class="m-row' + (r.danger ? ' m-row--danger' : '') + '" data-action="' + (r.action || 'stub-toast') + '" data-arg="' + esc(r.arg || r.label) + '"><span class="m-row-icon">' + icon(r.icon) + '</span><span class="m-row-main"><span class="m-row-title">' + esc(r.label) + '</span>' + (r.sub ? '<span class="m-row-meta">' + esc(r.sub) + '</span>' : '') + '</span></button>';
    }).join('') + '</div></div>';
    openOverlay(id, html);
  }

  // ── Event delegation ────────────────────────────────────────────────────
  function updateTask(pid, tid, fn) {
    var t = tasksOf(pid).find(function (x) { return x.id === tid; });
    if (t) fn(t);
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-nav]');
    if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
      var act = a.getAttribute('data-action');
      if (act === 'read') { var n = S.notifications.find(function (x) { return x.id === a.getAttribute('data-arg'); }); if (n) n.unread = false; }
      e.preventDefault();
      var href = a.getAttribute('href').replace(/^#/, '');
      var from = a.getAttribute('data-from');
      go(href, { replace: a.hasAttribute('data-replace'), from: from === 'current' ? parseHash().raw : from });
      return;
    }
    var el = e.target.closest('[data-action]');
    if (!el || el.tagName === 'FORM') return;
    var action = el.getAttribute('data-action');
    var arg = el.getAttribute('data-arg') || '';
    var parts = arg.split('|');
    var focusSel = '[data-action="' + action + '"][data-arg="' + arg.replace(/"/g, '') + '"]';
    switch (action) {
      case 'open-projects': openProjects(); break;
      case 'open-more': openMore(); break;
      case 'open-search': openSearch(); break;
      case 'close-overlay': closeTopOverlay(); break;
      case 'back': goBack(arg); break;
      case 'close-task': goBack(arg); break;
      case 'star': {
        var i = S.starred.indexOf(arg);
        if (i === -1) S.starred.push(arg); else S.starred.splice(i, 1);
        saveStarred();
        var list = document.getElementById('project-list');
        if (list) list.innerHTML = projectListHtml((document.querySelector('[data-input="project-filter"]') || {}).value || '');
        if (S.overlays.some(function (o) { return o.id === 'project-actions'; })) closeTopOverlay();
        toast(i === -1 ? 'Pinned' : 'Unpinned');
        if (!list) render();
        break;
      }
      case 'retry-projects':
        S.projectsError = false; S.projects = clone(F.projectSets.few);
        var pl = document.getElementById('project-list');
        if (pl) pl.innerHTML = projectListHtml('');
        render();
        break;
      case 'home-all': S.homeShowAll = !S.homeShowAll; render(); break;
      case 'scope': S.filters.scope = arg; render(); break;
      case 'filters': openFilters(arg); break;
      case 'toggle-priority': {
        var pi = S.filters.priorities.indexOf(arg);
        if (pi === -1) S.filters.priorities.push(arg); else S.filters.priorities.splice(pi, 1);
        el.setAttribute('aria-pressed', String(pi === -1));
        break;
      }
      case 'clear-filters':
        S.filters = { scope: S.filters.scope, sort: 'priority', archived: false, priorities: [] }; S.taskQuery = '';
        if (S.overlays.length) closeTopOverlay(); else render();
        break;
      case 'toggle-bin': S.collapsed[arg] = !S.collapsed[arg]; render(); break;
      case 'status-sheet': openStatusSheet(parts[0], parts[1]); break;
      case 'set-status':
        updateTask(parts[0], parts[1], function (t) { t.status = parts[2]; if (parts[2] === 'BLOCKED' && !t.blocker) t.blocker = 'Needs a blocker category'; });
        if (S.overlays.some(function (o) { return o.id === 'status'; })) closeTopOverlay();
        render();
        toast('Status set to ' + STATUS[parts[2]].label + ' (fixture — not saved)');
        break;
      case 'assign': openAssign(parts[0], parts[1]); break;
      case 'toggle-assignee':
        updateTask(parts[0], parts[1], function (t) { var k = t.assignees.indexOf(parts[2]); if (k === -1) t.assignees.push(parts[2]); else t.assignees.splice(k, 1); });
        el.setAttribute('aria-pressed', String(el.getAttribute('aria-pressed') !== 'true'));
        el.querySelector('.fa-check') ? el.querySelector('.fa-check').remove() : el.insertAdjacentHTML('beforeend', icon('check'));
        render();
        break;
      case 'assign-everyone': updateTask(parts[0], parts[1], function (t) { t.assignees = Object.keys(F.people); }); closeTopOverlay(); render(); break;
      case 'assign-nobody': updateTask(parts[0], parts[1], function (t) { t.assignees = []; }); closeTopOverlay(); render(); break;
      case 'new-task': openNewTask(arg); break;
      case 'create-task': {
        var d = S.newTaskDraft;
        if (!d.title.trim()) {
          d.error = 'Give the task a title.';
          var err = document.getElementById('nt-err'); if (err) err.textContent = d.error;
          var ti = document.querySelector('[data-input="nt-title"]'); if (ti) { ti.setAttribute('aria-invalid', 'true'); ti.focus(); }
          break;
        }
        tasksOf(arg).push({ id: arg + '-n' + Date.now(), title: d.title.trim(), status: d.status, priority: d.priority, due: d.due ? new Date(d.due).toISOString() : new Date(F.now.getTime() + 7 * 86400000).toISOString(), assignees: [] });
        S.newTaskDraft = null;
        closeTopOverlay();
        setTimeout(function () { render(); toast('Task created (fixture — not saved)'); }, 0);
        break;
      }
      case 'new-project': openNewProject(); break;
      case 'create-project': {
        var nm = (document.querySelector('[data-input="np-name"]') || {}).value || '';
        if (!nm.trim()) { toast('Project name is required'); break; }
        var np = { id: 'pn' + Date.now(), name: nm.trim(), status: 'ACTIVE', type: 'ENGINEERING', member: true };
        S.projects.unshift(np);
        go('/clubpm/projects/' + np.id);
        toast('Project created (fixture — not saved)');
        break;
      }
      case 'project-actions': openProjectActions(arg); break;
      case 'select-mode-on': S.selectMode = true; S.selected = {}; closeTopOverlay(); setTimeout(render, 0); break;
      case 'select-mode-off': S.selectMode = false; S.selected = {}; render(); break;
      case 'toggle-select': if (S.selected[arg]) delete S.selected[arg]; else S.selected[arg] = true; render(); break;
      case 'bulk':
        if (arg === 'Delete') openSimpleSheet('bulk-delete', 'Delete ' + Object.keys(S.selected).length + ' tasks?', [{ icon: 'trash', label: 'Delete permanently', danger: true, sub: 'Creator or admin only; skipped tasks are reported' }, { icon: 'xmark', label: 'Cancel', action: 'close-overlay' }]);
        else toast('Bulk ' + arg + ' (fixture) — same PATCH /api/tasks/bulk as desktop');
        break;
      case 'task-actions': openSimpleSheet('task-actions', 'Task actions', [{ icon: 'expand', label: 'Open in full editor', sub: 'Desktop full-screen toggle equivalent' }, { icon: 'link', label: 'Copy link' }, { icon: 'box-archive', label: 'Archive task' }, { icon: 'trash', label: 'Delete task…', danger: true, sub: 'Creator or admin' }]); break;
      case 'post-comment': {
        var ta = document.querySelector('[data-input="task-comment"]');
        if (!ta || !ta.value.trim()) { toast('Write a comment first'); break; }
        S.drafts['c-' + arg] = ''; ta.value = ''; toast('Comment posted (fixture — not saved)');
        break;
      }
      case 'work-actions': openSimpleSheet('work-actions', 'My work', [{ icon: 'plus', label: 'Add task', sub: 'Pick a project, then title/priority/due' }, { icon: 'filter', label: 'Filters & sort', sub: 'Project, assigned, priority, status, created; sort by tags' }, { icon: 'clock-rotate-left', label: 'Full recap' }]); break;
      case 'project-chat-view': go('/clubpm/projects/' + parts[0] + '?tab=chat' + (parts[1] === 'members' ? '&view=members' : ''), { replace: true }); break;
      case 'members-view': go('/clubpm/members' + (arg === 'dms' ? '?view=dms' : ''), { replace: true }); break;
      case 'toggle-browse': S.showBrowse = !S.showBrowse; render(); break;
      case 'join': { var ch = S.channels.find(function (c) { return c.id === arg; }); ch.joined = true; render(); toast('Joined #' + ch.name + ' (fixture)'); break; }
      case 'convo-actions': {
        var cv = S.channels.find(function (c) { return c.id === arg; });
        openSimpleSheet('convo-actions', '#' + cv.name, [{ icon: 'magnifying-glass', label: 'Search this conversation' }, { icon: cv.muted ? 'bell' : 'bell-slash', label: cv.muted ? 'Unmute' : 'Mute', sub: 'Constellation notifications only' }, { icon: 'folder-open', label: 'Linked project', sub: 'Open the project this channel belongs to' }]);
        break;
      }
      case 'msg-actions': openSimpleSheet('msg-actions', 'Message', [{ icon: 'face-smile', label: 'Add reaction' }, { icon: 'comments', label: 'Reply in thread' }, { icon: 'pen', label: 'Edit (your messages)' }, { icon: 'trash', label: 'Delete (your messages)…', danger: true }]); break;
      case 'attach': toast('File picker (fixture) — upload goes to /api/chat/…/files'); break;
      case 'new-dm': toast('Pick people → opens or finds the DM (POST /api/chat/dms)'); break;
      case 'cal-view': S.calView = arg; render(); break;
      case 'cal-filters': openSimpleSheet('cal-filters', 'Calendar filters', [{ icon: 'folder-open', label: 'Projects', sub: 'All projects' }, { icon: 'user', label: 'My tasks only' }, { icon: 'flag', label: 'Show task deadlines', sub: 'On' }]); break;
      case 'cal-new': openSimpleSheet('cal-new', 'Create', [{ icon: 'calendar-plus', label: 'Event', sub: 'Public-event confirmation step is kept' }, { icon: 'square-poll-vertical', label: 'Meeting poll' }].concat(persona.isAdmin ? [{ icon: 'file-import', label: 'Import calendar (admins)' }] : [])); break;
      case 'rsvp': { var ev = S.events.find(function (x) { return x.id === parts[0]; }); ev.rsvp = ev.rsvp === parts[1] ? null : parts[1]; render(); break; }
      case 'read-all': S.notifications.forEach(function (n) { n.unread = false; }); render(); break;
      case 'sign-out': toast('Sign out (fixture) — nothing happens in the prototype'); break;
      case 'stub-toast': toast(arg + ' (fixture)'); break;
      case 'file-item': e.preventDefault(); go('/clubpm/files-item', { from: parseHash().raw }); break;
      default: break;
    }
    // A re-render replaces the pressed control; put focus back on its twin so
    // keyboard and screen-reader users keep their place.
    if (!document.activeElement || document.activeElement === document.body) {
      var twin = document.querySelector(focusSel);
      if (twin) twin.focus();
    }
  });

  document.addEventListener('submit', function (e) {
    var form = e.target.closest('form[data-action="send"]');
    if (!form) return;
    e.preventDefault();
    var id = form.getAttribute('data-arg');
    var ta = form.querySelector('textarea');
    var text = ta.value.trim();
    if (!text) return;
    var list = S.messages[id] || (S.messages[id] = F.messagesFor(id));
    list.push({ id: id + '-' + Date.now(), author: me.id, text: text, at: F.now.toISOString(), replies: 0, reactions: [] });
    S.drafts[id] = '';
    render();
    var again = document.querySelector('.m-composer textarea');
    if (again) again.focus();
  });

  document.addEventListener('input', function (e) {
    var el = e.target;
    var kind = el.getAttribute('data-input');
    if (!kind) return;
    var arg = el.getAttribute('data-arg');
    switch (kind) {
      case 'task-query': {
        S.taskQuery = el.value;
        var bins = document.getElementById('task-bins');
        if (bins) bins.innerHTML = taskBins(project(arg));
        break;
      }
      case 'channel-filter': {
        var lists = document.getElementById('channel-lists');
        lists.innerHTML = channelLists(S.channels.filter(function (c) { return c.joined; }), S.channels.filter(function (c) { return !c.joined; }), el.value.trim().toLowerCase());
        break;
      }
      case 'project-filter': document.getElementById('project-list').innerHTML = projectListHtml(el.value); break;
      case 'search': document.getElementById('search-results').innerHTML = searchResults(el.value); break;
      case 'draft': S.drafts[arg] = el.value; break;
      case 'task-comment': S.drafts['c-' + arg] = el.value; break;
      case 'nt-title': S.newTaskDraft.title = el.value; if (el.value.trim()) { S.newTaskDraft.error = ''; document.getElementById('nt-err').textContent = ''; el.removeAttribute('aria-invalid'); } break;
      case 'nt-due': S.newTaskDraft.due = el.value; break;
      default: break;
    }
  });
  document.addEventListener('change', function (e) {
    var el = e.target;
    var kind = el.getAttribute('data-input');
    var arg = el.getAttribute('data-arg');
    switch (kind) {
      case 'files-sub': try { sessionStorage.setItem('proto.files.sub.' + arg, el.value); } catch (x) { /* ignore */ } render(); break;
      case 'insights-view': go('/clubpm/projects/' + arg + '?tab=insights' + (el.value === 'charts' ? '' : '&view=' + el.value), { replace: true }); break;
      case 'sort': S.filters.sort = el.value; break;
      case 'archived': S.filters.archived = el.checked; break;
      case 'nt-status': S.newTaskDraft.status = el.value; break;
      case 'nt-priority': S.newTaskDraft.priority = el.value; break;
      default: break;
    }
  });

  // Breakpoint crossing: re-render the presentation only. State (drafts,
  // filters, selection, scroll) lives in S and survives the switch.
  function onLayoutChange() { rememberScroll(); dropAllOverlays(); render(); }
  if (mq.addEventListener) mq.addEventListener('change', onLayoutChange); else mq.addListener(onLayoutChange);

  // Boot
  history.replaceState({ idx: 0, from: null }, '', location.hash || '#/clubpm');
  render();

  // Exposed for the automated checks in ../scripts/check-prototype.mjs only.
  window.__proto = { S: S, isCompact: isCompact, currentNavFor: currentNavFor, route: route, COMPACT_QUERY: COMPACT_QUERY };
})();
