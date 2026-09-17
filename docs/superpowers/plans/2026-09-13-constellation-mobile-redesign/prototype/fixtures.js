/*
 * FIXTURE DATA — Constellation phone prototype (Phase 0).
 *
 * Every name, message, project, and number below is invented for review. Nothing
 * here is read from, or written to, the real Constellation API. Scenario knobs
 * come from the page URL:
 *   ?persona=member|admin     role variation (Admin row, New project, admin badges)
 *   ?projects=few|many|none|error
 *   ?compact=1                force the phone layout (for review frames on a
 *                             mouse-driven desktop; see README)
 */
(function () {
  var DAY = 86400000;
  var now = new Date('2026-09-13T15:00:00');
  function at(days, hour) {
    var d = new Date(now.getTime() + days * DAY);
    if (hour != null) d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  }

  var LONG_PROJECT = 'Orbital Debris Tracking Payload — Integration & Environmental Test Campaign (Phase II)';

  var people = {
    m1: { id: 'm1', name: 'Riley Fixture', handle: 'riley.fixture', initials: 'RF', color: '#8b7cf8' },
    m2: { id: 'm2', name: 'Jordan Q. Placeholder', handle: 'jordan.q', initials: 'JQ', color: '#00b894' },
    m3: { id: 'm3', name: 'Sam Testcase', handle: 'sam.testcase', initials: 'ST', color: '#0984e3' },
    m4: { id: 'm4', name: 'Maximilian Alexander Longname-Fixture', handle: 'max.longname', initials: 'ML', color: '#e17055' },
    m5: { id: 'm5', name: 'Kai Sample', handle: 'kai.sample', initials: 'KS', color: '#f5a623' },
    m9: { id: 'm9', name: 'Avery Admin-Fixture', handle: 'avery.admin', initials: 'AA', color: '#e84393' },
  };

  var personas = {
    member: { memberId: 'm1', isAdmin: false, rank: 'Cadet', rankNext: 'Specialist', xp: 1840, xpNext: 3000, doubloons: 212, streak: 4 },
    admin: { memberId: 'm9', isAdmin: true, rank: 'Pioneer', rankNext: 'Cosmonaut', xp: 9120, xpNext: 12000, doubloons: 1450, streak: 27,
      adminCounts: { rewards: 3, changeRequests: 1, certificates: 2 } },
  };

  var baseProjects = [
    { id: 'p1', name: LONG_PROJECT, status: 'ACTIVE', type: 'ENGINEERING', member: true },
    { id: 'p2', name: 'Hydroponics Rack', status: 'ACTIVE', type: 'RESEARCH', member: true },
    { id: 'p3', name: 'Outreach Night', status: 'PAUSED', type: 'HYBRID', member: true },
    { id: 'p4', name: 'Empty Fixture Project', status: 'ACTIVE', type: 'RESEARCH', member: true },
  ];
  var extraNames = ['Lunar Rover Wheel Study', 'Crew Habitat Airlock Mock-up', 'CubeSat Ground Station', 'Mars Analog Mission Planning', 'Regolith Simulant Sieve'];
  var manyProjects = baseProjects.concat(Array.apply(null, Array(22)).map(function (_, i) {
    return {
      id: 'px' + (i + 1),
      name: extraNames[i % extraNames.length] + ' ' + (Math.floor(i / extraNames.length) + 1),
      status: ['ACTIVE', 'ACTIVE', 'PAUSED', 'COMPLETED'][i % 4],
      type: ['ENGINEERING', 'RESEARCH', 'HYBRID'][i % 3],
      member: i % 2 === 0,
    };
  }));

  var OTHER_TITLES = [
    ['Calibrate pH and EC probes', 'Order LED grow panels', 'Seedling germination log', 'Nutrient schedule draft', 'Waiting on greenhouse access badge', 'Rack frame assembled'],
    ['Book the planetarium for outreach night', 'Volunteer sign-up sheet', 'Telescope checkout list', 'Poster and social copy', 'Waiting on venue insurance form', 'Date confirmed with the department'],
  ];
  function tasksFor(projectId) {
    if (projectId === 'p4') return [];
    var p = projectId;
    if (projectId !== 'p1') {
      var n = projectId === 'p2' ? 0 : 1;
      var T = OTHER_TITLES[n];
      return [
        { id: p + '-t1', title: T[0], status: 'TODO', priority: 'HIGH', due: at(3 + n), assignees: ['m1'] },
        { id: p + '-t2', title: T[1], status: 'TODO', priority: 'MEDIUM', due: at(5), assignees: [] },
        { id: p + '-t3', title: T[2], status: 'IN_PROGRESS', priority: 'LOW', due: at(2 + n), assignees: n ? ['m5'] : ['m1', 'm5'] },
        { id: p + '-t4', title: T[3], status: 'IN_PROGRESS', priority: 'MEDIUM', due: at(8), assignees: ['m3'] },
        { id: p + '-t5', title: T[4], status: 'BLOCKED', priority: 'HIGH', due: at(10), assignees: ['m1'], blocker: 'Facilities' },
        { id: p + '-t6', title: T[5], status: 'DONE', priority: 'LOW', due: at(-4), assignees: ['m2'] },
      ];
    }
    return [
      { id: p + '-t1', title: 'Write the thermal-vacuum test procedure and get sign-off from the faculty advisor before booking chamber time', status: 'TODO', priority: 'HIGH', due: at(-1), assignees: ['m1'] },
      { id: p + '-t2', title: 'Order MLI blanket samples', status: 'TODO', priority: 'MEDIUM', due: at(2), assignees: [] },
      { id: p + '-t3', title: 'Vibration fixture CAD review', status: 'IN_PROGRESS', priority: 'CRITICAL', due: at(1), assignees: ['m1', 'm4'], subtasks: 3 },
      { id: p + '-t4', title: 'Harness continuity check', status: 'IN_PROGRESS', priority: 'LOW', due: at(4), assignees: ['m3'] },
      { id: p + '-t5', title: 'Waiting on sponsor NDA', status: 'BLOCKED', priority: 'HIGH', due: at(6), assignees: ['m1'], blocker: 'Legal review' },
      { id: p + '-t6', title: 'Kickoff meeting notes', status: 'DONE', priority: 'LOW', due: at(-6), assignees: ['m2'] },
    ];
  }

  var channels = [
    { id: 'C1', name: 'general', kind: 'PUBLIC', joined: true, unread: 3, muted: false },
    { id: 'C2', name: 'orbital-debris-tracking-payload-integration-and-environmental-testing', kind: 'PUBLIC', joined: true, unread: 0, muted: false },
    { id: 'C3', name: 'officers-private', kind: 'PRIVATE', joined: true, unread: 12, muted: true },
    { id: 'C4', name: 'hydroponics', kind: 'PUBLIC', joined: true, unread: 0, muted: false },
    { id: 'C5', name: 'random', kind: 'PUBLIC', joined: false, unread: 0, muted: false },
    { id: 'C6', name: 'launch-watch-parties', kind: 'PUBLIC', joined: false, unread: 0, muted: false },
  ];

  var dms = [
    { id: 'D1', with: ['m3'], preview: 'FIXTURE: can you bring the multimeter?', unread: 1, at: at(-0.05) },
    { id: 'D2', with: ['m4'], preview: 'FIXTURE: CAD is uploaded to the Vault.', unread: 0, at: at(-1) },
    { id: 'D3', with: ['m2', 'm5'], preview: 'FIXTURE: group DM about outreach night', unread: 0, at: at(-3) },
  ];

  function messagesFor(conversationId) {
    var authors = ['m2', 'm3', 'm1', 'm4', 'm5'];
    var lines = [
      'FIXTURE: Anyone free to help with the harness test on Thursday?',
      'FIXTURE: I can do after 3pm.',
      'FIXTURE: Uploaded the new bracket drawing.',
      'FIXTURE: a deliberately long unbroken token https://example.invalid/this/is/a/very/long/path/that/must/wrap/without/page/scroll',
      'FIXTURE: Reminder — general meeting tomorrow in ARMS 1010.',
      'FIXTURE: 👍',
      'FIXTURE: Chamber is booked for the 22nd.',
    ];
    return lines.map(function (text, i) {
      return { id: conversationId + '-' + i, author: authors[i % authors.length], text: text, at: at(-(lines.length - i) / 10), replies: i === 2 ? 3 : 0, reactions: i === 1 ? [{ e: '🚀', n: 2 }] : [] };
    });
  }

  var events = [
    { id: 'e1', title: 'FIXTURE General Meeting', start: at(1, 18), end: at(1, 19), where: 'ARMS 1010', project: null, rsvp: null },
    { id: 'e2', title: 'Thermal-vac chamber slot', start: at(9, 9), end: at(9, 17), where: 'Zucrow Labs', project: 'p1', rsvp: 'GOING' },
    { id: 'e3', title: 'Hydroponics harvest', start: at(3, 12), end: at(3, 13), where: 'Greenhouse B', project: 'p2', rsvp: null },
    { id: 'e4', title: 'Task due: Order MLI blanket samples', start: at(2, 23), end: null, where: '', project: 'p1', deadline: true },
  ];

  var notifications = [
    { id: 'n1', text: 'FIXTURE: You were assigned “Harness continuity check”', at: at(-0.1), unread: true, href: '#/clubpm/projects/p1?task=p1-t4' },
    { id: 'n2', text: 'FIXTURE: Sam mentioned you in #general', at: at(-0.9), unread: true, href: '#/clubpm/chat/C1' },
    { id: 'n3', text: 'FIXTURE: “Kickoff meeting notes” was completed', at: at(-2), unread: false, href: '#/clubpm/projects/p1?task=p1-t6' },
  ];

  window.PROTO_FIXTURES = {
    now: now, people: people, personas: personas,
    projectSets: { few: baseProjects, many: manyProjects, none: [] },
    tasksFor: tasksFor, channels: channels, dms: dms, messagesFor: messagesFor,
    events: events, notifications: notifications,
  };
})();
