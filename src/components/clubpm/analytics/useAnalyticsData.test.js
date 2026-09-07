import {
  computeAnalytics,
  flattenTasks,
  filterTasks,
  buildBuckets,
  computeKpis,
  computeVelocity,
  computeThroughput,
  computeRisk,
} from './useAnalyticsData';

// Local-noon dates keep every assertion timezone-independent: no fixture date
// can slide across a day boundary on a machine in another offset.
const d = (year, month, day) => new Date(year, month - 1, day, 12, 0, 0);

const NOW = d(2026, 1, 15);

const ada = { id: 'mem-ada', displayName: 'Ada' };
const grace = { id: 'mem-grace', displayName: 'Grace' };

/** Two top-level tasks with subtasks, one blocked task, one archived task. */
function makeProject() {
  return {
    id: 'proj-1',
    startDate: d(2025, 12, 1),
    targetDate: d(2026, 2, 1),
    milestones: [{ id: 'ms-1', title: 'Alpha', dueDate: d(2026, 1, 31) }],
    tasks: [
      {
        id: 't1',
        status: 'DONE',
        priority: 'HIGH',
        createdAt: d(2026, 1, 2),
        completedAt: d(2026, 1, 6),
        updatedAt: d(2026, 1, 6),
        assignees: [ada],
        subtasks: [
          {
            id: 's1',
            status: 'TODO',
            priority: 'LOW',
            createdAt: d(2026, 1, 3),
            updatedAt: d(2026, 1, 3),
            assignees: [],
          },
          {
            id: 's2',
            status: 'DONE',
            priority: 'MEDIUM',
            createdAt: d(2026, 1, 3),
            completedAt: d(2026, 1, 8),
            updatedAt: d(2026, 1, 8),
            assignees: [ada],
          },
        ],
      },
      {
        id: 't2',
        status: 'IN_PROGRESS',
        priority: 'CRITICAL',
        createdAt: d(2026, 1, 5),
        updatedAt: d(2026, 1, 14),
        assignees: [grace],
        subtasks: [],
      },
      {
        id: 't3',
        status: 'BLOCKED',
        priority: 'HIGH',
        createdAt: d(2025, 12, 20),
        dueDate: d(2026, 1, 10),
        updatedAt: d(2026, 1, 11),
        assignees: [],
        subtasks: [],
        blockers: [
          { blocker: { id: 'b1', label: 'Parts', resolvedAt: null, createdAt: d(2026, 1, 4) } },
        ],
      },
      {
        id: 't4',
        status: 'TODO',
        priority: 'LOW',
        createdAt: d(2026, 1, 4),
        updatedAt: d(2026, 1, 9),
        archivedAt: d(2026, 1, 9),
        assignees: [],
        subtasks: [],
      },
    ],
  };
}

const analyze = (project, options) => computeAnalytics(project, { now: NOW, ...options });

// ── flattening ───────────────────────────────────────────────────────────────

describe('flattenTasks', () => {
  test('toggling includeSubtasks changes the count by exactly the subtask count', () => {
    const project = makeProject();
    const subtaskCount = project.tasks.reduce((s, t) => s + t.subtasks.length, 0);

    const withSubs = flattenTasks(project.tasks, true);
    const withoutSubs = flattenTasks(project.tasks, false);

    expect(subtaskCount).toBe(2);
    expect(withSubs.length - withoutSubs.length).toBe(subtaskCount);
    expect(withSubs.map(t => t.id)).toEqual(['t1', 's1', 's2', 't2', 't3', 't4']);
  });

  test('a subtask counts as a full task in the derived analytics', () => {
    const project = makeProject();
    const on = analyze(project, { includeSubtasks: true });
    const off = analyze(project, { includeSubtasks: false });
    expect(on.tasks.length - off.tasks.length).toBe(2);
  });

  test('tolerates a missing or malformed tasks array', () => {
    expect(flattenTasks(undefined)).toEqual([]);
    expect(flattenTasks([{ id: 'a' }])).toHaveLength(1);
  });
});

// ── archive filtering ────────────────────────────────────────────────────────

describe('filterTasks', () => {
  test('archived tasks are excluded by default and included when toggled', () => {
    const flat = flattenTasks(makeProject().tasks, true);

    const withoutArchived = filterTasks(flat, {});
    const withArchived = filterTasks(flat, { includeArchived: true });

    expect(withoutArchived.map(t => t.id)).not.toContain('t4');
    expect(withArchived.map(t => t.id)).toContain('t4');
    expect(withArchived.length - withoutArchived.length).toBe(1);
  });

  test('assigneeId narrows to that member', () => {
    const flat = flattenTasks(makeProject().tasks, true);
    const adas = filterTasks(flat, { assigneeId: ada.id });
    expect(adas.map(t => t.id)).toEqual(['t1', 's2']);
  });

  test('the default analytics window excludes archived tasks', () => {
    const project = makeProject();
    expect(analyze(project).tasks.map(t => t.id)).not.toContain('t4');
    expect(analyze(project, { includeArchived: true }).tasks.map(t => t.id)).toContain('t4');
  });
});

// ── bucketing ────────────────────────────────────────────────────────────────

describe('buildBuckets', () => {
  test('weekly buckets key on the ISO week start across a Dec -> Jan boundary', () => {
    // ISO week 1 of 2026 begins Mon 2025-12-29, so Dec 31 2025 and Jan 2 2026
    // belong to the same bucket. Keying on the start date makes that fall out
    // for free rather than depending on an (ISO week, ISO week year) pair.
    const buckets = buildBuckets(d(2025, 12, 15), d(2026, 1, 8), 'week');
    expect(buckets.map(b => b.key)).toEqual([
      '2025-12-15', '2025-12-22', '2025-12-29', '2026-01-05',
    ]);

    const tasks = [
      { id: 'a', createdAt: d(2025, 12, 20), completedAt: d(2025, 12, 28) }, // Sun, prior week
      { id: 'b', createdAt: d(2025, 12, 20), completedAt: d(2025, 12, 31) }, // Wed, week of 12-29
      { id: 'c', createdAt: d(2025, 12, 20), completedAt: d(2026, 1, 2) },   // Fri, same week
    ];
    const velocity = computeVelocity(tasks, buckets);

    expect(velocity.map(v => [v.start, v.count])).toEqual([
      ['2025-12-15', 0],
      ['2025-12-22', 1],
      ['2025-12-29', 2],
      ['2026-01-05', 0],
    ]);
  });

  test('empty buckets are present with zero rather than absent', () => {
    const buckets = buildBuckets(d(2025, 12, 15), d(2026, 1, 8), 'week');
    const tasks = [{ id: 'a', createdAt: d(2025, 12, 23), completedAt: d(2025, 12, 24) }];

    const velocity = computeVelocity(tasks, buckets);
    const throughput = computeThroughput(tasks, buckets);

    expect(velocity).toHaveLength(4);
    expect(throughput).toHaveLength(4);
    velocity.forEach(v => {
      expect(typeof v.count).toBe('number');
      expect(Number.isNaN(v.count)).toBe(false);
    });
    expect(velocity[0].count).toBe(0);
    expect(velocity[3].count).toBe(0);
    expect(throughput[0]).toMatchObject({ created: 0, completed: 0, net: 0 });
  });

  test('monthly bucketing keys on the month start', () => {
    const buckets = buildBuckets(d(2025, 11, 20), d(2026, 1, 5), 'month');
    expect(buckets.map(b => b.key)).toEqual(['2025-11-01', '2025-12-01', '2026-01-01']);
  });

  test('an inverted range yields no buckets instead of looping', () => {
    expect(buildBuckets(d(2026, 2, 1), d(2026, 1, 1), 'week')).toEqual([]);
  });
});

// ── KPIs ─────────────────────────────────────────────────────────────────────

describe('computeKpis', () => {
  const window = { now: NOW, windowStart: d(2025, 12, 17), windowEnd: d(2026, 1, 15), lengthDays: 30 };

  test('avgCycleDays ignores tasks with no completedAt', () => {
    const tasks = [
      { id: 'a', status: 'DONE', createdAt: d(2026, 1, 1), completedAt: d(2026, 1, 5) }, // 4d
      { id: 'b', status: 'DONE', createdAt: d(2026, 1, 1), completedAt: d(2026, 1, 3) }, // 2d
      { id: 'c', status: 'TODO', createdAt: d(2025, 12, 1) },                            // ignored
    ];
    expect(computeKpis(tasks, window).avgCycleDays.value).toBe(3);
  });

  test('avgCycleDays is 0, not NaN, when nothing has completedAt', () => {
    const tasks = [
      { id: 'a', status: 'TODO', createdAt: d(2026, 1, 1) },
      { id: 'b', status: 'IN_PROGRESS', createdAt: d(2026, 1, 2) },
    ];
    const { avgCycleDays } = computeKpis(tasks, window);
    expect(avgCycleDays.value).toBe(0);
    expect(Number.isNaN(avgCycleDays.value)).toBe(false);
    expect(avgCycleDays.delta).toBeNull();
  });

  test('deltas are null when there is no prior window of data', () => {
    const tasks = [{ id: 'a', status: 'DONE', createdAt: d(2026, 1, 2), completedAt: d(2026, 1, 6) }];
    const kpis = computeKpis(tasks, window);
    Object.values(kpis).forEach(k => expect(k.delta).toBeNull());
  });

  test('deltas compare against the immediately preceding window of equal length', () => {
    const tasks = [
      // Created before the window, so a prior window's worth of data exists.
      { id: 'p1', status: 'DONE', createdAt: d(2025, 11, 1), completedAt: d(2025, 12, 1) },
      { id: 'p2', status: 'DONE', createdAt: d(2025, 11, 1), completedAt: d(2026, 1, 4) },
      { id: 'p3', status: 'DONE', createdAt: d(2025, 11, 1), completedAt: d(2026, 1, 9) },
    ];
    const kpis = computeKpis(tasks, window);
    expect(kpis.doneThisPeriod.value).toBe(2); // Jan 4 + Jan 9
    expect(kpis.doneThisPeriod.delta).toBe(1); // prior window had only Dec 1
  });

  test('reflects real completion and overdue counts on the fixture', () => {
    const { kpis } = analyze(makeProject());
    expect(kpis.completionPct.value).toBe(40); // 2 done of 5 unarchived
    expect(kpis.doneThisPeriod.value).toBe(2);
    expect(kpis.overdue.value).toBe(1);        // t3, due Jan 10
    expect(kpis.activeBlockers.value).toBe(1);
  });
});

// ── risk ─────────────────────────────────────────────────────────────────────

describe('computeRisk', () => {
  test('scores 0 and reports every factor for a clean project', () => {
    const tasks = [
      { id: 'a', status: 'DONE', createdAt: d(2026, 1, 10), completedAt: d(2026, 1, 12), assignees: [ada] },
      { id: 'b', status: 'TODO', createdAt: d(2026, 1, 13), updatedAt: d(2026, 1, 14), assignees: [grace] },
    ];
    const risk = computeRisk(tasks, { now: NOW, velocity: [] });

    expect(risk.score).toBe(0);
    expect(risk.band).toBe('healthy');
    expect(risk.factors).toHaveLength(7);
    risk.factors.forEach(f => {
      expect(f.contribution).toBe(0);
      expect(f.severity).toBe('none');
      expect(Array.isArray(f.tasks)).toBe(true);
      expect(typeof f.weight).toBe('number');
    });
    expect(risk.factors.map(f => f.id)).toEqual([
      'blocked', 'overdue', 'aging', 'stale', 'unassigned', 'dependencies', 'velocityTrend',
    ]);
  });

  test('scores above 50 when every factor is tripped', () => {
    const old = d(2025, 11, 1);
    const overdue = d(2026, 1, 1);
    const blockedBy = [{ blockingTask: { id: 'x', title: 'Upstream', status: 'TODO' } }];
    const base = { createdAt: old, updatedAt: old, dueDate: overdue, assignees: [], blockedBy };

    const tasks = [
      { id: 'a', status: 'BLOCKED', ...base },
      { id: 'b', status: 'BLOCKED', ...base },
      { id: 'c', status: 'BLOCKED', ...base },
      { id: 'e', status: 'IN_PROGRESS', ...base },
    ];
    const velocity = [
      { label: 'Wk 1', start: '2025-12-29', count: 5, points: 0, hours: 0, rolling: 5 },
      { label: 'Wk 2', start: '2026-01-05', count: 0, points: 0, hours: 0, rolling: 2.5 },
    ];

    const risk = computeRisk(tasks, { now: NOW, velocity });

    expect(risk.score).toBeGreaterThan(50);
    expect(risk.band).toBe('critical');
    risk.factors.forEach(f => expect(f.contribution).toBeGreaterThan(0));
    expect(risk.factors.find(f => f.id === 'blocked').tasks.map(t => t.id)).toEqual(['a', 'b', 'c']);
    expect(risk.factors.find(f => f.id === 'stale').tasks.map(t => t.id)).toEqual(['e']);
  });

  test('an empty task list scores 0 rather than NaN', () => {
    const risk = computeRisk([], { now: NOW, velocity: [] });
    expect(risk.score).toBe(0);
    expect(Number.isNaN(risk.score)).toBe(false);
  });
});

// ── whole-shape contract ─────────────────────────────────────────────────────

const RETURN_KEYS = [
  'tasks', 'kpis', 'burndown', 'cumulativeFlow', 'velocity', 'throughput',
  'statusBreakdown', 'priorityBreakdown', 'assigneeBreakdown', 'workload',
  'aging', 'risk',
];

/** Walks the result and fails on any NaN or undefined value anywhere in it. */
function assertNoNaN(value, path = 'result') {
  if (value === null) return;
  expect(value).toBeDefined();
  if (typeof value === 'number') {
    if (Number.isNaN(value)) throw new Error(`NaN at ${path}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoNaN(v, `${path}[${i}]`));
    return;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error(`Invalid Date at ${path}`);
    return;
  }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([k, v]) => assertNoNaN(v, `${path}.${k}`));
  }
}

describe('computeAnalytics', () => {
  test('returns exactly the documented keys', () => {
    expect(Object.keys(analyze(makeProject())).sort()).toEqual([...RETURN_KEYS].sort());
  });

  test('a project with zero tasks returns defined, non-NaN values for every key', () => {
    const empty = { id: 'p', tasks: [], milestones: [] };
    const result = analyze(empty);

    RETURN_KEYS.forEach(key => expect(result[key]).toBeDefined());
    assertNoNaN(result);

    expect(result.tasks).toEqual([]);
    expect(result.kpis.completionPct.value).toBe(0);
    expect(result.kpis.avgCycleDays.value).toBe(0);
    expect(result.risk.score).toBe(0);
    expect(result.risk.band).toBe('healthy');
    expect(result.aging).toHaveLength(4);
    expect(result.statusBreakdown).toHaveLength(4);
    expect(result.priorityBreakdown).toHaveLength(4);
    expect(result.workload).toEqual([]);
    expect(result.burndown.length).toBeGreaterThan(0);
    expect(result.cumulativeFlow.length).toBeGreaterThan(0);
    expect(result.velocity.length).toBeGreaterThan(0);
  });

  test('a null project behaves like an empty one', () => {
    const result = analyze(null);
    RETURN_KEYS.forEach(key => expect(result[key]).toBeDefined());
    assertNoNaN(result);
  });

  test('burndown anchors its ideal line to startDate -> targetDate', () => {
    const result = analyze(makeProject());
    // Dec 1 2025 -> Feb 1 2026; the window opens Dec 17, part-way down the ramp,
    // and the series runs out to the target date so the ideal line completes.
    expect(result.burndown[0].ideal).toBeLessThan(result.tasks.length);
    expect(result.burndown[result.burndown.length - 1].date).toBe('2026-02-01');
    expect(result.burndown[result.burndown.length - 1].ideal).toBe(0);
  });

  test('burndown separates actual (past) from projected (future) at today', () => {
    const result = analyze(makeProject());
    const today = result.burndown.find(p => p.date === '2026-01-15');
    const future = result.burndown.find(p => p.date === '2026-01-20');
    expect(today.actual).not.toBeNull();
    expect(today.projected).not.toBeNull();
    expect(future.actual).toBeNull();
    expect(future.projected).not.toBeNull();
  });

  test('cumulative flow bands sum to the tasks that existed on each day', () => {
    const result = analyze(makeProject());
    const jan10 = result.cumulativeFlow.find(r => r.date === '2026-01-10');
    expect(jan10.TODO + jan10.IN_PROGRESS + jan10.BLOCKED + jan10.DONE).toBe(5);
    expect(jan10.DONE).toBe(2); // t1 (Jan 6) and s2 (Jan 8)
  });

  test('workload includes a synthetic Unassigned row', () => {
    const result = analyze(makeProject());
    const unassigned = result.workload.find(r => r.memberId === '__unassigned__');
    expect(unassigned).toBeDefined();
    expect(unassigned.total).toBe(2); // s1 and t3
  });

  test('aging buckets open tasks by age and priority', () => {
    const result = analyze(makeProject());
    const byBucket = Object.fromEntries(result.aging.map(r => [r.bucket, r]));

    // t3 was created Dec 20, 26 days before NOW — the 2-4w bucket, not >1mo.
    expect(byBucket['2-4w'].HIGH).toBe(1);
    expect(byBucket['>1mo'].total).toBe(0);
    // s1 (Jan 3) and t2 (Jan 5) are both 10-12 days old.
    expect(byBucket['1-2w'].LOW).toBe(1);
    expect(byBucket['1-2w'].CRITICAL).toBe(1);
    expect(result.aging.reduce((s, r) => s + r.total, 0)).toBe(3); // s1, t2, t3
  });
});
