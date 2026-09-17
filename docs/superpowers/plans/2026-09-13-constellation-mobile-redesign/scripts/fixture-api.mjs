// FIXTURE-ONLY mock of the Constellation API, for Phase 0 baseline captures.
//
// Why this exists: the real backend cannot be started for evidence capture
// without (a) a running PostgreSQL and (b) the live Slack/GitHub/Google
// credentials in backend/.env, whose Bolt app and cron scheduler act on the
// real workspace. This server answers the endpoints the shell and the five
// primary screens call, with obviously fake data, so the *production React
// components* can be rendered by `npm start` (CRA proxies /api and /auth to
// :3001) and measured in a real browser.
//
// It is not a contract test. Shapes were read from the consuming components,
// and any endpoint not modelled here gets an empty default and is logged.
//
// Usage (repo root):
//   node docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/scripts/fixture-api.mjs
// Switch persona / data volume between captures:
//   GET http://localhost:3001/__fixture/state?persona=admin&projects=many
//   GET http://localhost:3001/__fixture/log      (request counts since last reset)
//   GET http://localhost:3001/__fixture/reset-log
import http from 'node:http';

const PORT = Number(process.env.FIXTURE_PORT || 3001);

const LONG = 'Orbital Debris Tracking Payload — Integration & Environmental Test Campaign (Phase II)';
const state = { persona: 'member', projects: 'few', failTaskCreate: '0', failChatSend: '0', slowWrites: '0', failAuth: '0', slackExpired: '0' };
const log = new Map();
const sse = { opened: 0, open: 0 };

const now = Date.now();
const day = 86400000;
const iso = (offsetDays) => new Date(now + offsetDays * day).toISOString();

function person(id, name, extra = {}) {
  return {
    id, displayName: name, slackHandle: name.toLowerCase().replace(/[^a-z]+/g, '.'),
    slackId: `U_FIXTURE_${id}`, avatarUrl: null, role: 'MEMBER', isAdmin: false,
    title: 'Fixture member', slackCapabilities: { post: true, files: true, read: true, dm: true }, rank: 'CADET', xp: 1840, doubloons: 212, timezone: 'America/Indiana/Indianapolis',
    ...extra,
  };
}

const MEMBER = person('m1', 'Riley Fixture');
const ADMIN = person('m9', 'Avery Admin-Fixture', { isAdmin: true, role: 'ADMIN', rank: 'PIONEER', xp: 9120, doubloons: 1450 });
const OTHERS = [
  person('m2', 'Jordan Q. Placeholder'),
  person('m3', 'Sam Testcase'),
  person('m4', 'Maximilian Alexander Longname-Fixture'),
  person('m5', 'Kai Sample'),
];
const me = () => (state.persona === 'admin' ? ADMIN : MEMBER);
const everyone = () => [me(), ...OTHERS];

const FEW = [
  { id: 'p1', name: LONG, status: 'ACTIVE', type: 'ENGINEERING' },
  { id: 'p2', name: 'Hydroponics Rack', status: 'ACTIVE', type: 'RESEARCH' },
  { id: 'p3', name: 'Outreach Night', status: 'PAUSED', type: 'HYBRID' },
  { id: 'p4', name: 'Empty Fixture Project', status: 'ACTIVE', type: 'RESEARCH' },
];
const MANY = [
  ...FEW,
  ...Array.from({ length: 22 }, (_, i) => ({
    id: `px${i + 1}`,
    name: [`Lunar Rover Wheel Study ${i + 1}`, `Crew Habitat Airlock Mock-up ${i + 1}`, `CubeSat Ground Station ${i + 1}`][i % 3],
    status: ['ACTIVE', 'PAUSED', 'COMPLETED'][i % 3],
    type: ['ENGINEERING', 'RESEARCH', 'HYBRID'][i % 3],
  })),
];
function projects() {
  if (state.projects === 'none') return [];
  const list = state.projects === 'many' ? MANY : FEW;
  return list.map((p) => ({ ...p, tags: [], description: null, targetDate: iso(40), _count: { tasks: 6 } }));
}

const BLOCKER = { id: 'bk1', label: 'FIXTURE Waiting on parts', color: '#f5a623', resolvedAt: null, assignee: null, projectId: 'p1' };

let seq = 0;
function task(projectId, title, status, extra = {}) {
  seq += 1;
  return {
    id: `t${seq}`, projectId, title, status, priority: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][seq % 4],
    progress: status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'NO_PROGRESS', dueDate: iso((seq % 9) - 2),
    createdAt: iso(-seq), assignees: [me()], subtasks: [], tags: [], parentTaskId: null, archivedAt: null,
    project: { id: projectId, name: projects().find((p) => p.id === projectId)?.name ?? 'Fixture project' },
    createdById: me().id, description: 'FIXTURE task description.', timeLogs: [], comments: [],
    ...extra,
  };
}
function projectTasks(projectId) {
  if (projectId === 'p4') return [];
  seq = projectId === 'p1' ? 0 : 100;
  return [
    task(projectId, 'Write the thermal-vacuum test procedure and get sign-off from the faculty advisor before booking chamber time', 'TODO', { milestoneId: 'ms1' }),
    task(projectId, 'Order MLI blanket samples', 'TODO', { assignees: [] }),
    task(projectId, 'Vibration fixture CAD review', 'IN_PROGRESS', { assignees: [me(), OTHERS[2]] }),
    task(projectId, 'Harness continuity check', 'IN_PROGRESS'),
    // Phase 5: blocked by a category blocker, so phone blocker management has something to act on.
    task(projectId, 'Waiting on sponsor NDA', 'BLOCKED', { blockers: [{ blockerId: 'bk1', reason: null, blocker: BLOCKER }] }),
    task(projectId, 'Kickoff meeting notes', 'DONE'),
  ];
}
function projectDetail(id) {
  const p = projects().find((x) => x.id === id) ?? { ...FEW[0], id };
  return {
    ...p, description: id === 'p1' ? 'FIXTURE — long description to exercise the header. '.repeat(4) : null,
    slackChannelId: null, channelMemberSlackIds: [], driveFolderId: null, driveLink: null,
    tasks: projectTasks(id), milestones: [{ id: 'ms1', title: 'Critical design review', status: 'ON_TRACK', targetDate: iso(14) }], members: everyone().map((m) => ({ memberId: m.id, member: m })),
  };
}

const CHANNELS = [
  { slackChannelId: 'C_FIX_GENERAL', name: 'general', kind: 'CHANNEL', isMember: true, unread: 3, muted: false },
  { slackChannelId: 'C_FIX_LONG', name: 'orbital-debris-tracking-payload-integration-and-environmental-testing', kind: 'CHANNEL', isMember: true, unread: 0, muted: false },
  { slackChannelId: 'C_FIX_PRIV', name: 'officers-private', kind: 'PRIVATE_CHANNEL', isMember: true, unread: 12, muted: true },
  { slackChannelId: 'C_FIX_RANDOM', name: 'random', kind: 'CHANNEL', isMember: false, unread: 0, muted: false },
];
const DMS = [
  { slackChannelId: 'D_FIX_JORDAN', kind: 'IM', participants: [OTHERS[0]], unread: 2, muted: false, lastMessageAt: iso(-0.02), preview: { authorName: OTHERS[0].displayName, text: 'FIXTURE: Can you review the harness notes?' } },
  { slackChannelId: 'D_FIX_GROUP', kind: 'MPIM', participants: [OTHERS[1], OTHERS[2]], unread: 0, muted: true, lastMessageAt: iso(-1), preview: { authorName: OTHERS[1].displayName, text: 'FIXTURE group message' } },
];
function messages(channelId) {
  return Array.from({ length: 36 }, (_, i) => ({
    id: `${channelId}-m${i}`, ts: `${1757700000 + i * 60}.000100`, channelId, authorName: i % 3 ? OTHERS[i % 4].displayName : me().displayName,
    authorSlackId: i % 3 ? OTHERS[i % 4].slackId : me().slackId, authorAvatarUrl: null, isBot: false,
    postedAt: new Date(now - (14 - i) * 3600000).toISOString(),
    tokens: [{ type: 'text', value: i === 5
      ? 'FIXTURE: a deliberately long unbroken token https://example.invalid/this/is/a/very/long/path/that/should/wrap/without/forcing/page/scroll'
      : `FIXTURE message ${i + 1}. Anyone free to help with the harness test on Thursday?` }],
    reactions: i === 2 ? [{ emoji: 'rocket', name: 'rocket', url: null, count: 2, mine: false }] : [], replyCount: i === 4 ? 3 : 0, files: [],
  }));
}

// ── Phase 4 fixture data ────────────────────────────────────────────
const VAULT_ITEMS = [
  { id: 'v1', name: 'Mounting bracket', partNumber: 'SRC-0001', currentRevision: 'B', checkedOutById: null, checkedOutBy: null, updatedAt: iso(-2), fileName: 'bracket-rev-b.step' },
  { id: 'v2', name: 'Radiator panel — long fixture name for wrapping', partNumber: null, currentRevision: null, checkedOutById: 'm2', checkedOutBy: { id: 'm2', displayName: 'Jordan Q. Placeholder' }, updatedAt: iso(-5), fileName: 'radiator.sldprt' },
];
const CHANGE_REQUESTS = [
  { id: 'cr1', number: 12, title: 'Raise bracket wall thickness to 3 mm', status: 'OPEN', createdAt: iso(-1), author: { id: 'm2', displayName: 'Jordan Q. Placeholder' }, items: [] },
];
const SUBMISSIONS = [
  { id: 's1', title: 'FIXTURE launch recap post', content: 'Draft copy for the recap.', status: 'DRAFT', type: 'SOCIAL_POST', platform: ['INSTAGRAM'], authorId: 'm1', author: { id: 'm1', displayName: 'Riley Fixture' }, campaignId: null, createdAt: iso(-1) },
  { id: 's2', title: 'FIXTURE sponsor thank-you', content: 'Awaiting review.', status: 'IN_REVIEW', type: 'NEWSLETTER', platform: [], authorId: 'm2', author: { id: 'm2', displayName: 'Jordan Q. Placeholder' }, campaignId: null, createdAt: iso(-3) },
];
const CONTACTS = [
  { id: 'c1', name: 'Ada Fixture', organization: 'Analytical Engines', contactType: 'SPONSOR', stage: 'COLD', tags: [], email: 'ada@example.invalid' },
  { id: 'c2', name: 'Katherine Fixture', organization: 'Flight Dynamics', contactType: 'PARTNER', stage: 'ACTIVE', tags: [], email: null },
];
const CAMPAIGNS = [
  { id: 'cam1', name: 'FIXTURE Spring recruitment', color: '#00e5cc', description: 'Fixture campaign.', startDate: iso(-10), endDate: iso(20), submissionCount: 2, requiredApprovers: [] },
];
const CHALLENGES = [
  { id: 'q1', title: 'FIXTURE: Close two tasks', description: 'Daily quest fixture', type: 'DAILY', metric: 'TASK_COMPLETED', target: 2, progress: 1, claimed: false, xpReward: 40, doubloonReward: 10 },
];
const ACHIEVEMENTS = [
  { id: 'a1', name: 'FIXTURE First light', description: 'Unlocked in the fixture', tier: 'BRONZE', unlocked: true, unlockedAt: iso(-20) },
];
const PENDING_REWARDS = [
  { id: 'pr1', memberId: 'm2', member: { id: 'm2', displayName: 'Jordan Q. Placeholder' }, eventType: 'TASK_COMPLETE_MEMBER_CREATED', xp: 60, doubloons: 15, reason: 'FIXTURE: completed "Harness continuity check"', createdAt: iso(-1) },
];
const shopItem = (id, name, rarity, price, description) => ({
  id, name, rarity, description,
  // Shapes read from ShopCard + CosmeticChip: the price field is
  // `doubloonPrice`, and `category` is dereferenced without a guard.
  doubloonPrice: price,
  category: 'NAME_STYLE',
  iconClass: null,
  cssClass: null,
});
const SHOP_TODAY = {
  balance: 212,
  rank: 'CADET',
  expiresAt: iso(0.4),
  ownedIds: ['sh2'],
  wishlistIds: [],
  slots: {
    common: [shopItem('sh1', 'FIXTURE nebula frame', 'COMMON', 120, 'A cosmetic frame.')],
    uncommon: [shopItem('sh2', 'FIXTURE comet trail', 'UNCOMMON', 260, 'A cosmetic trail with a deliberately long description so the card has to wrap on a phone.')],
    rare: null,
    mythic: null,
  },
};
const COURSE_SUMMARY = { id: 'co1', slug: 'fixture-course', title: 'FIXTURE Constellation basics', status: 'PUBLISHED', summary: 'Fixture course.', moduleCount: 2, sectionCount: 3,
  // Phase 5: an in-progress enrollment, so the catalog offers Continue (resume journey).
  myProgress: { completedSections: 1, totalSections: 3, completedAt: null } };
const LEARNER_COURSE = {
  ...COURSE_SUMMARY,
  preview: false,
  viewerIsAdmin: false,
  enrollment: { id: 'en1', lastSectionId: 'cs1', dueDate: null, completedAt: null },
  modules: [
    { id: 'cm1', title: 'FIXTURE Getting oriented', sectionIds: ['cs1', 'cs2'], locked: false, completed: false, completedCount: 1, sequential: true, isRequired: true, summary: '', estimatedMinutes: 10 },
    { id: 'cm2', title: 'FIXTURE Going further', sectionIds: ['cs3'], locked: true, completed: false, completedCount: 0, sequential: true, isRequired: true, summary: 'Finish module one first.', estimatedMinutes: 15 },
  ],
  sections: [
    { id: 'cs1', title: 'FIXTURE What Constellation is', kind: 'CONTENT', status: 'COMPLETED', locked: false, isRequired: true, contentJson: null, order: 0 },
    { id: 'cs2', title: 'FIXTURE Anatomy of a task', kind: 'CONTENT', status: 'IN_PROGRESS', locked: false, isRequired: true, contentJson: null, order: 1 },
    { id: 'cs3', title: 'FIXTURE Locked section', kind: 'CONTENT', status: 'NOT_STARTED', locked: true, isRequired: true, contentJson: null, order: 2 },
  ],
};

function route(method, path, query) {
  const m = (re) => path.match(re);
  // Phase 5: failAuth=1 simulates an expired session — every API call 401s.
  if (state.failAuth === '1') return { __status: 401, error: 'Session expired (fixture)' };
  if (path === '/auth/me') return state.persona === 'anon' ? { __status: 401, error: 'Not signed in (fixture)' } : { ...me(), token: 'fixture-token' };
  // failProjects=1 (Phase 1): exercise the phone project picker's error + Retry state.
  if (path === '/api/projects' && method === 'GET') return state.failProjects === '1' ? { __status: 503, error: 'Projects unavailable (fixture)' } : projects();
  let r;
  if ((r = m(/^\/api\/projects\/([^/]+)\/tasks$/)) && method === 'POST') {
    return state.failTaskCreate === '1'
      ? { __status: 503, error: 'Task save failed (fixture)' }
      : task(r[1], 'Created fixture task', 'TODO');
  }
  if ((r = m(/^\/api\/projects\/([^/]+)$/))) return projectDetail(r[1]);
  // Phase 5: one active category blocker on p1 (phone blocker management).
  if ((r = m(/^\/api\/projects\/([^/]+)\/blockers$/)) && method === 'POST') return { ...BLOCKER, id: 'bk-new', label: 'Created fixture blocker' };
  if ((r = m(/^\/api\/projects\/([^/]+)\/blockers$/))) return r[1] === 'p1' ? [BLOCKER] : [];
  if ((r = m(/^\/api\/projects\/([^/]+)\/tags$/))) return [];
  if (m(/^\/api\/milestones\/project\//)) return [];
  if (path === '/api/members') return everyone();
  if (path === '/api/members/me') return { ...me(), tasks: projectTasks('p1').concat(projectTasks('p2')).filter((t) => t.status !== 'DONE') };
  if (path === '/api/members/me/celebration') return { celebration: null };
  if (m(/^\/api\/members\/[^/]+\/profile$/)) return { ...me(), equippedCosmetics: {} };
  if (m(/^\/api\/members\/[^/]+\/streak$/) || m(/^\/api\/streak/)) return { currentStreak: 4, longestStreak: 9, freezes: 1, lastActiveDate: iso(0) };
  if (path === '/api/members/cosmetic-styles') return {};
  if ((r = m(/^\/api\/tasks\/([^/]+)\/comments$/)) && method === 'POST') return { id: `c-${Date.now()}`, content: 'Fixture comment', createdAt: iso(0), author: me() };
  if ((r = m(/^\/api\/tasks\/([^/]+)$/)) && method === 'PATCH') return { id: r[1], assignees: [me()] };
  if (path === '/api/notifications') return { notifications: [
    { id: 'n1', type: 'TASK_ASSIGNED', message: 'FIXTURE: You were assigned "Harness continuity check"', read: false, createdAt: iso(-0.1), projectId: 'p1', taskId: 't4' },
    { id: 'n2', type: 'SLACK_MENTION', message: 'FIXTURE: Sam mentioned you in #general', read: true, createdAt: iso(-1), metadata: { link: '/clubpm/chat/C_FIX_GENERAL?thread=1757700240.000100' } },
    { id: 'n3', type: 'SYSTEM', message: 'FIXTURE: General Meeting starts tomorrow', read: false, createdAt: iso(-0.2), metadata: { eventId: 'e1' } },
  ], nextCursor: null };
  if (path === '/api/events/upcoming') return [{ id: 'e1', title: 'FIXTURE General Meeting', startAt: iso(1), endAt: iso(1.05), location: 'ARMS 1010', isPublic: false, type: 'MEETING' }];
  if (path === '/api/events' && method === 'GET') return [{ id: 'e1', title: 'FIXTURE General Meeting', startTime: iso(1), endTime: iso(1.05), location: 'ARMS 1010', isPublic: false, type: 'MEETING', organizerId: ADMIN.id, organizer: ADMIN, attendees: [] }];
  if (path === '/api/events/e_far' && method === 'GET') return { id: 'e_far', title: 'FIXTURE Future Review', startTime: iso(90), endTime: iso(90.05), isPublic: false, type: 'MEETING', organizerId: ADMIN.id, organizer: ADMIN, attendees: [] };
  if (m(/^\/api\/events\/[^/]+\/attendees$/) && method === 'POST') return { id: 'e1', title: 'FIXTURE General Meeting', startTime: iso(1), endTime: iso(1.05), location: 'ARMS 1010', isPublic: false, type: 'MEETING', organizerId: ADMIN.id, organizer: ADMIN, attendees: [me()] };
  // Phase 5: project p1 is linked to #general, so the project-conversation journey has a channel.
  if ((r = m(/^\/api\/projects\/([^/]+)\/chat\/channels$/))) return { channels: r[1] === 'p1' ? [CHANNELS[0]] : [] };
  if ((r = m(/^\/api\/vault\/versions\/([^/]+)\/download-url$/))) return { url: `/api/vault/fixture-file/${r[1]}` };
  if (path === '/api/slack/channels') return { channels: [], needsSlackAuth: false, warning: '' };
  if (path === '/api/chat/conversations') return { channels: CHANNELS, dms: DMS };
  if ((r = m(/^\/api\/chat\/conversations\/([^/]+)$/))) {
    const c = [...CHANNELS, ...DMS].find((x) => x.slackChannelId === decodeURIComponent(r[1]));
    return c ? { ...c, name: c.name ?? null, isParticipant: c.isMember ?? true, canPost: c.isMember ?? true } : null;
  }
  if ((r = m(/^\/api\/chat\/conversations\/([^/]+)\/messages$/)) && method === 'GET') return { messages: messages(r[1]), hasMore: false };
  if ((r = m(/^\/api\/chat\/conversations\/([^/]+)\/thread\/([^/]+)$/))) return { messages: messages(r[1]).slice(4, 8).map((msg, i) => ({ ...msg, id: `${r[1]}-thread-${i}`, threadTs: decodeURIComponent(r[2]) })) };
  if (m(/^\/api\/chat\/conversations\/[^/]+\/messages$/) && method === 'POST') return state.slackExpired === '1' ? { __status: 409, error: 'Slack connection expired (fixture)' } : state.failChatSend === '1' ? { __status: 503, error: 'Chat send failed (fixture)' } : { ts: `${Date.now()}.000100` };
  if (m(/^\/api\/rewards\/pending\/count$/)) return { count: 3 };
  if (m(/pending-count$|crs\/pending/)) return { count: 1 };
  if (m(/certificates\/pending/)) return { count: 2, items: [] };
  if (path === '/api/challenges/active') return { daily: CHALLENGES, weekly: [], monthly: [] };
  if (path === '/api/challenges/achievements') return ACHIEVEMENTS;
  if (m(/^\/api\/challenges/)) return [];

  // ── Phase 4 surfaces ──────────────────────────────────────────────
  // Vault, GitHub, Outreach, courses, admin, shop. Same rule as above: shapes
  // read from the consuming components, obviously fake values, nothing persisted.
  if ((r = m(/^\/api\/projects\/([^/]+)\/vault$/))) return { health: { status: 'ok', serviceAccountEmail: 'fixture-bot@example.invalid' }, items: VAULT_ITEMS };
  if ((r = m(/^\/api\/vault\/items\/([^/]+)\/history$/))) return [{ id: 'vh1', at: iso(-2), actor: me(), action: 'CHECKED_IN', changes: [] }];
  if ((r = m(/^\/api\/vault\/items\/([^/]+)$/))) {
    const item = VAULT_ITEMS.find((v) => v.id === r[1]) ?? VAULT_ITEMS[0];
    return { ...item, versions: [{ id: 'vv1', number: 2, fileName: 'bracket-rev-b.step', sizeBytes: 148000, note: 'Fixture check-in', createdAt: iso(-2), createdBy: me() }], bom: [], createdBy: me() };
  }
  if ((r = m(/^\/api\/projects\/([^/]+)\/change-requests$/))) return CHANGE_REQUESTS;
  if (m(/^\/api\/change-requests/)) return CHANGE_REQUESTS;
  if (m(/^\/api\/github\/projects\/[^/]+\/repos$/)) return [{ id: 'gh1', fullName: 'purduesearch/fixture-repo', name: 'fixture-repo', owner: 'purduesearch', defaultBranch: 'main', private: false, openIssues: 3, stars: 7, htmlUrl: 'https://example.invalid/fixture-repo' }];
  if (m(/^\/api\/github\/repos\/[^/]+\/repo$/)) return { id: 'gh1', fullName: 'purduesearch/fixture-repo', description: 'Fixture repository', defaultBranch: 'main', private: false, stargazersCount: 7, openIssuesCount: 3, htmlUrl: 'https://example.invalid/fixture-repo' };
  if (m(/^\/api\/github\/repos\/[^/]+\/(issues|pulls|branches|contents|commits)/)) return [];

  if (path === '/api/outreach/submissions') return SUBMISSIONS;
  if (m(/^\/api\/outreach\/submissions\/[^/]+$/) && method === 'PATCH') return { ok: true };
  if (path === '/api/outreach/contacts') return CONTACTS;
  if (m(/^\/api\/outreach\/contacts\/[^/]+$/) && method === 'PATCH') return { ok: true };
  if (path === '/api/outreach/campaigns') return CAMPAIGNS;
  if (m(/^\/api\/outreach\/(assets|brand-voices|insights)/)) return [];

  if (path === '/api/outreach/courses') return [COURSE_SUMMARY];
  if (m(/^\/api\/outreach\/courses\/[^/]+\/learn$/)) return LEARNER_COURSE;
  if (m(/^\/api\/outreach\/courses\/sections\/[^/]+\/questions/)) return [];

  if (path === '/api/rewards/pending') return PENDING_REWARDS;
  if (path === '/api/event-config') return [];
  if (path === '/api/shop/today') return SHOP_TODAY;
  if (path === '/api/shop/consumables') return { consumables: [] };
  if (path === '/api/inventory') return { inventory: [], effects: [], weeklyBonusSends: 0 };
  return undefined;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const key = `${req.method} ${url.pathname}`;
  if (url.pathname.startsWith('/__fixture/')) {
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/__fixture/state') {
      for (const k of ['persona', 'projects', 'failProjects', 'failTaskCreate', 'failChatSend', 'slowWrites', 'failAuth', 'slackExpired']) if (url.searchParams.get(k)) state[k] = url.searchParams.get(k);
    }
    if (url.pathname === '/__fixture/reset-log') { log.clear(); sse.opened = 0; }
    return res.end(JSON.stringify({ state, sse, log: Object.fromEntries([...log].sort()) }, null, 2));
  }
  log.set(key, (log.get(key) ?? 0) + 1);

  if (url.pathname === '/api/notifications/stream') {
    sse.opened += 1; sse.open += 1;
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': fixture stream\n\n');
    const t = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { clearInterval(t); sse.open -= 1; });
    return undefined;
  }

  // Phase 5: a downloadable fixture file (Content-Disposition: attachment), so
  // "retrieve a file" ends in a real browser download without a real vault.
  if (url.pathname.startsWith('/api/vault/fixture-file/')) {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="fixture-bracket-rev-b.step"' });
    return res.end('FIXTURE STEP FILE\n');
  }

  let body = route(req.method, url.pathname, url.searchParams);
  if (body === undefined) {
    if (req.method === 'GET') { body = []; console.log(`[fixture] default [] for ${key}`); }
    else { body = { ok: true, fixture: true }; console.log(`[fixture] accepted ${key} (not persisted)`); }
  }
  const status = body === null ? 404 : body.__status || 200;
  const finish = () => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body ?? { error: 'Not found (fixture)' }));
  };
  // Phase 5: slowWrites=1 holds every write for 1.5s so duplicate-submission
  // guards are exercised with two real taps while the first is still in flight.
  if (state.slowWrites === '1' && req.method !== 'GET') setTimeout(finish, 1500);
  else finish();
  return undefined;
});

server.listen(PORT, () => console.log(`[fixture] FIXTURE API on http://localhost:${PORT} — persona=${state.persona}`));
