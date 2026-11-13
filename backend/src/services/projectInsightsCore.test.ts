// Unit tests for projectInsightsCore (pure, no DB).
// Run: cd backend && npx tsx src/services/projectInsightsCore.test.ts
import {
  computeProjectInsights, openHoursFor, weekStartUtc, HOURS_FALLBACK, AGING_BUCKETS,
  type InsightTaskRow,
} from "./projectInsightsCore.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  FAIL ${name}`); }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const at = (s: string) => new Date(s);

// now = Wed 2026-11-11 12:00Z; week start Mon 2026-11-09
const now = at("2026-11-11T12:00:00Z");
const T = (id: string, o: Partial<InsightTaskRow> = {}): InsightTaskRow => ({
  id, status: "TODO", priority: "MEDIUM", createdAt: at("2026-11-10T00:00:00Z"),
  completedAt: null, dueDate: null, updatedAt: at("2026-11-10T00:00:00Z"),
  storyPoints: null, estimatedHours: null, assigneeIds: [], ...o,
});

const tasks: InsightTaskRow[] = [
  T("t1", { status: "TODO", priority: "LOW", estimatedHours: 4, assigneeIds: ["a"], createdAt: at("2026-11-08T00:00:00Z") }),            // age 3 -> <1w
  T("t2", { status: "IN_PROGRESS", priority: "HIGH", storyPoints: 3, assigneeIds: ["a", "b"], dueDate: at("2026-11-01T00:00:00Z"), createdAt: at("2026-10-30T00:00:00Z") }), // 6h each, overdue, age 12 -> 1-2w
  T("t3", { status: "BLOCKED", priority: "CRITICAL", assigneeIds: ["b"], createdAt: at("2026-10-01T00:00:00Z") }),                      // fallback 2h, age 41 -> >1mo
  T("t4", { status: "TODO", priority: "MEDIUM", estimatedHours: 0, storyPoints: 0, assigneeIds: ["z"], createdAt: at("2026-10-20T00:00:00Z"), dueDate: at("2026-11-20T00:00:00Z") }), // 2h, age 22 -> 2-4w, not overdue
  T("t5", { status: "TODO", priority: "LOW", createdAt: at("2026-11-11T00:00:00Z") }),                                                   // unassigned, age 0
  // completions
  T("d1", { status: "DONE", storyPoints: 5, createdAt: at("2026-11-01T00:00:00Z"), completedAt: at("2026-11-03T00:00:00Z"), assigneeIds: ["a"] }),           // week 11-02, cycle 2d
  T("d2", { status: "DONE", storyPoints: 2, createdAt: at("2026-11-01T00:00:00Z"), completedAt: at("2026-11-08T23:59:00Z"), assigneeIds: ["a"] }),           // Sunday 23:59 -> week 11-02, cycle ~7d
  T("d3", { status: "DONE", storyPoints: 1, createdAt: at("2026-11-01T00:00:00Z"), completedAt: at("2026-11-09T00:00:00Z") }),                               // Monday 00:00 -> week 11-09
  T("d4", { status: "DONE", createdAt: at("2026-09-01T00:00:00Z"), completedAt: at("2026-09-02T00:00:00Z") }),                                              // old, outside 2-week window
  T("d5", { status: "DONE", storyPoints: 8, createdAt: at("2026-10-20T00:00:00Z"), completedAt: at("2026-10-27T10:00:00Z") }),                              // week 10-26
];
const roster = [{ id: "a" }, { id: "b" }, { id: "c" }];

console.log("helpers");
check("openHours estimate", openHoursFor({ estimatedHours: 4, storyPoints: 9 }) === 4);
check("openHours points", openHoursFor({ estimatedHours: null, storyPoints: 3 }) === 6);
check("openHours zero est -> points", openHoursFor({ estimatedHours: 0, storyPoints: 2 }) === 4);
check("openHours fallback", openHoursFor({ estimatedHours: 0, storyPoints: 0 }) === HOURS_FALLBACK && HOURS_FALLBACK === 2);
check("weekStart Sunday", weekStartUtc(at("2026-11-08T23:59:00Z")).toISOString() === "2026-11-02T00:00:00.000Z");
check("weekStart Monday", weekStartUtc(at("2026-11-09T00:00:00Z")).toISOString() === "2026-11-09T00:00:00.000Z");
check("aging buckets", eq(AGING_BUCKETS.map((b) => b.key), ["<1w", "1-2w", "2-4w", ">1mo"]));

console.log("weeks = 2");
{
  const r = computeProjectInsights({ tasks, roster, now, weeks: 2 });
  // window = 2026-10-28T12:00Z .. now: d1, d2, d3 (d5 on 10-27 is outside)
  check("kpis", eq(r.kpis, { open: 5, done: 5, overdue: 1, blocked: 1, completedInWindow: 3, meanCycleDays: 6 }));
  check("weekly", eq(r.weekly, [
    { weekStart: "2026-11-02", completed: 2, completedPoints: 7 },
    { weekStart: "2026-11-09", completed: 1, completedPoints: 1 },
  ]));
  check("workload", eq(r.workload, [
    { memberId: "b", openTasks: 2, openHours: 8, openPoints: 3, overdue: 1, inProgress: 1 },
    { memberId: "a", openTasks: 2, openHours: 10, openPoints: 3, overdue: 1, inProgress: 1 },
    { memberId: "z", openTasks: 1, openHours: 2, openPoints: 0, overdue: 0, inProgress: 0 },
    { memberId: "c", openTasks: 0, openHours: 0, openPoints: 0, overdue: 0, inProgress: 0 },
  ].sort((x, y) => y.openHours - x.openHours || (x.memberId < y.memberId ? -1 : 1))));
  check("aging", eq(r.aging, [
    { bucket: "<1w", priority: "LOW", count: 2 },
    { bucket: "1-2w", priority: "HIGH", count: 1 },
    { bucket: "2-4w", priority: "MEDIUM", count: 1 },
    { bucket: ">1mo", priority: "CRITICAL", count: 1 },
  ]));
  // roster a=10, b=8, c=0 -> median 8 (z excluded)
  check("median odd roster", r.rosterMedianOpenHours === 8);
}

console.log("weeks = 1 and 26");
{
  const r1 = computeProjectInsights({ tasks, roster, now, weeks: 1 });
  check("w1 weekly length", r1.weekly.length === 1 && r1.weekly[0].weekStart === "2026-11-09");
  check("w1 window", r1.kpis.completedInWindow === 2 && r1.kpis.meanCycleDays !== null); // d2 (11-08 23:59 >= 11-04 12:00) and d3
  const r26 = computeProjectInsights({ tasks, roster, now, weeks: 26 });
  check("w26 length", r26.weekly.length === 26 && r26.weekly[25].weekStart === "2026-11-09" && r26.weekly[0].weekStart === "2026-05-18");
  check("w26 window all", r26.kpis.completedInWindow === 5);
  check("w26 sum", r26.weekly.reduce((s, w) => s + w.completed, 0) === 5);
}

console.log("even roster median / empty");
{
  const r = computeProjectInsights({ tasks, roster: [{ id: "a" }, { id: "b" }], now, weeks: 2 });
  check("median even", r.rosterMedianOpenHours === 9);
  const e = computeProjectInsights({ tasks: [], roster: [], now, weeks: 3 });
  check("empty", eq(e.kpis, { open: 0, done: 0, overdue: 0, blocked: 0, completedInWindow: 0, meanCycleDays: null })
    && e.workload.length === 0 && e.aging.length === 0 && e.rosterMedianOpenHours === 0
    && e.weekly.length === 3 && e.weekly.every((w) => w.completed === 0));
  const eo = computeProjectInsights({ tasks: [], roster: [{ id: "x" }], now, weeks: 1 });
  check("roster-only row", eq(eo.workload, [{ memberId: "x", openTasks: 0, openHours: 0, openPoints: 0, overdue: 0, inProgress: 0 }]));
}

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
