// Unit tests for the pure half of timeInsightsService. No DB.
// Run: cd backend && npx tsx src/services/timeInsightsService.test.ts
import { buildTimeInsights, activeDays, type InsightLog, type InsightTask } from "./timeInsightsService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const at = (iso: string) => new Date(iso);

const ana = { displayName: "Ana", avatarUrl: null };
const ben = { displayName: "Ben", avatarUrl: null };
const log = (taskId: string, memberId: string, minutes: number, iso: string, labVisitId: string | null = null): InsightLog =>
  ({ taskId, memberId, minutes, loggedAt: at(iso), labVisitId, member: memberId === "a" ? ana : ben });
const task = (id: string, over: Partial<InsightTask> = {}): InsightTask =>
  ({ id, title: `Task ${id}`, status: "IN_PROGRESS", completedAt: null, firstLoggedAt: null, assignees: [], ...over });

console.log("activeDays");
{
  check("null without logs", activeDays(null, null, at("2026-09-25T00:00:00Z")) === null);
  check("rounds up", activeDays(at("2026-09-01T12:00:00Z"), at("2026-09-03T13:00:00Z"), at("2026-09-25T00:00:00Z")) === 3);
  check("open task runs to now", activeDays(at("2026-09-20T00:00:00Z"), null, at("2026-09-25T00:00:00Z")) === 5);
  check("minimum 1", activeDays(at("2026-09-20T00:00:00Z"), at("2026-09-20T00:30:00Z"), at("2026-09-25T00:00:00Z")) === 1);
}

console.log("buildTimeInsights");
{
  const from = at("2026-09-14T00:00:00Z");   // Monday
  const to = at("2026-09-27T23:59:00Z");     // Sunday
  const r = buildTimeInsights({
    logs: [
      log("t1", "a", 60, "2026-09-15T15:00:00Z"),
      log("t1", "b", 90, "2026-09-22T15:00:00Z", "v1"),
      log("t2", "a", 30, "2026-09-23T15:00:00Z", "v2"),
      log("t2", "a", 999, "2026-08-01T15:00:00Z"),   // outside range
    ],
    tasks: [
      task("t1", { firstLoggedAt: at("2026-09-10T00:00:00Z"), completedAt: at("2026-09-24T00:00:00Z"), status: "DONE" }),
      task("t2", { firstLoggedAt: at("2026-08-01T15:00:00Z") }),
      task("t3"),
    ],
    unallocated: 42, from, to, now: at("2026-09-25T00:00:00Z"),
  });
  check("totals", eq(r.totals, { minutes: 180, manualMinutes: 60, labMinutes: 120, unallocatedLabMinutes: 42 }));
  check("two weeks, zero-filled", eq(r.byWeek, [
    { weekStart: "2026-09-14", manualMinutes: 60, labMinutes: 0 },
    { weekStart: "2026-09-21", manualMinutes: 0, labMinutes: 120 },
  ]));
  check("members sorted by minutes, ties by name", eq(r.byMember.map(m => [m.memberId, m.minutes, m.labMinutes]), [["a", 90, 30], ["b", 90, 90]]));
  check("tasks sorted desc, untouched task dropped", eq(r.tasks.map(t => [t.id, t.minutes, t.labMinutes]), [["t1", 150, 90], ["t2", 30, 30]]));
  check("active days to completion", r.tasks[0].activeDays === 14);
  check("active days use first log ever", r.tasks[1].activeDays === 55);
}

console.log("empty range");
{
  const r = buildTimeInsights({ logs: [], tasks: [], unallocated: 0, from: at("2026-09-16T00:00:00Z"), to: at("2026-09-16T12:00:00Z") });
  check("one week bucket", r.byWeek.length === 1 && r.byWeek[0].weekStart === "2026-09-14");
  check("zero totals", r.totals.minutes === 0 && r.tasks.length === 0 && r.byMember.length === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
