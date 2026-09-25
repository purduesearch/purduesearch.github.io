// Unit tests for labVisitCore. No DB.
// Run: cd backend && npx tsx src/services/labVisitCore.test.ts
import {
  splitMinutes, visitMinutes, reminderAt, isReminderDue, isAutoCloseDue, parseLocalTime,
  pickSplitTasks, localToInstant, MIN_VISIT_MINUTES, MAX_OPEN_MINUTES,
} from "./labVisitCore.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const TZ = "America/New_York";
const at = (iso: string) => new Date(iso);

console.log("splitMinutes");
{
  check("even split", eq(splitMinutes(90, ["b", "a", "c"]), [
    { taskId: "a", minutes: 30 }, { taskId: "b", minutes: 30 }, { taskId: "c", minutes: 30 },
  ]));
  check("remainder to first ids", eq(splitMinutes(100, ["c", "a", "b"]).map(s => s.minutes), [34, 33, 33]));
  check("no tasks", eq(splitMinutes(60, []), []));
  check("fewer minutes than tasks drops zeros", eq(splitMinutes(2, ["a", "b", "c"]), [{ taskId: "a", minutes: 1 }, { taskId: "b", minutes: 1 }]));
  check("duplicate ids collapse", splitMinutes(60, ["a", "a"]).length === 1);
  check("sum preserved", splitMinutes(301, ["x", "y", "z", "w"]).reduce((s, x) => s + x.minutes, 0) === 301);
}

console.log("visitMinutes");
{
  check("floors", visitMinutes(at("2026-09-28T14:00:00Z"), at("2026-09-28T14:04:59Z")) === 4);
  check("never negative", visitMinutes(at("2026-09-28T14:00:00Z"), at("2026-09-28T13:00:00Z")) === 0);
  check("threshold constant", MIN_VISIT_MINUTES === 5 && MAX_OPEN_MINUTES === 300);
}

console.log("reminders");
{
  const inAt = at("2026-09-28T14:00:00Z");
  check("no shift: in + 5h", reminderAt({ checkedInAt: inAt, expectedEndAt: null }).toISOString() === "2026-09-28T19:00:00.000Z");
  check("shift end + 15", reminderAt({ checkedInAt: inAt, expectedEndAt: at("2026-09-28T16:00:00Z") }).toISOString() === "2026-09-28T16:15:00.000Z");
  check("cap wins over a late shift end", reminderAt({ checkedInAt: inAt, expectedEndAt: at("2026-09-28T22:00:00Z") }).toISOString() === "2026-09-28T19:00:00.000Z");
  const v = { status: "OPEN", checkedInAt: inAt, expectedEndAt: at("2026-09-28T16:00:00Z"), reminderSentAt: null };
  check("not due before", !isReminderDue(v, at("2026-09-28T16:14:00Z")));
  check("due at", isReminderDue(v, at("2026-09-28T16:15:00Z")));
  check("not twice", !isReminderDue({ ...v, reminderSentAt: at("2026-09-28T16:15:00Z") }, at("2026-09-28T17:00:00Z")));
  check("not for closed", !isReminderDue({ ...v, status: "CLOSED" }, at("2026-09-28T17:00:00Z")));
}

console.log("auto-close");
{
  // 11 PM EDT Monday is 03:00Z Tuesday: still Monday locally.
  const v = { status: "OPEN", checkedInAt: at("2026-09-28T22:00:00Z"), expectedEndAt: null };
  check("same local day (UTC already tomorrow)", !isAutoCloseDue(v, at("2026-09-29T03:00:00Z"), TZ));
  check("after local midnight", isAutoCloseDue(v, at("2026-09-29T04:30:00Z"), TZ));
  // DST end: 2026-11-01. Check-in 11 PM EDT Oct 31 (03:00Z Nov 1); 00:30 EDT Nov 1 = 04:30Z.
  const d = { status: "OPEN", checkedInAt: at("2026-11-01T03:00:00Z"), expectedEndAt: null };
  check("DST night: after midnight", isAutoCloseDue(d, at("2026-11-01T04:30:00Z"), TZ));
  check("DST night: before midnight", !isAutoCloseDue(d, at("2026-11-01T03:59:00Z"), TZ));
  check("pending never auto-closes", !isAutoCloseDue({ ...v, status: "PENDING_CONFIRM" }, at("2026-09-30T12:00:00Z"), TZ));
}

console.log("parseLocalTime");
{
  const day = "2026-09-28"; // EDT, UTC-4
  check("4:30pm", parseLocalTime("4:30pm", day, TZ)?.toISOString() === "2026-09-28T20:30:00.000Z");
  check("4pm", parseLocalTime("4pm", day, TZ)?.toISOString() === "2026-09-28T20:00:00.000Z");
  check("4:30 PM", parseLocalTime("4:30 PM", day, TZ)?.toISOString() === "2026-09-28T20:30:00.000Z");
  check("16:30", parseLocalTime("16:30", day, TZ)?.toISOString() === "2026-09-28T20:30:00.000Z");
  check("12am is midnight", parseLocalTime("12am", day, TZ)?.toISOString() === "2026-09-28T04:00:00.000Z");
  check("12:15pm", parseLocalTime("12:15pm", day, TZ)?.toISOString() === "2026-09-28T16:15:00.000Z");
  check("EST day", parseLocalTime("4:30pm", "2026-11-02", TZ)?.toISOString() === "2026-11-02T21:30:00.000Z");
  check("junk", parseLocalTime("soon", day, TZ) === null);
  check("bad minutes", parseLocalTime("4:75pm", day, TZ) === null);
  check("13pm", parseLocalTime("13pm", day, TZ) === null);
  check("25:00", parseLocalTime("25:00", day, TZ) === null);
  check("localToInstant midday", localToInstant(day, 720, TZ).toISOString() === "2026-09-28T16:00:00.000Z");
}

console.log("pickSplitTasks");
{
  const tasks = [{ id: "t3", projectId: "p1" }, { id: "t1", projectId: "p2" }, { id: "t2", projectId: "p1" }];
  check("prefers linked projects", eq(pickSplitTasks(tasks, ["p1"]), ["t2", "t3"]));
  check("no linked projects: all", eq(pickSplitTasks(tasks, []), ["t1", "t2", "t3"]));
  check("linked but none qualify: all", eq(pickSplitTasks(tasks, ["p9"]), ["t1", "t2", "t3"]));
  check("none", eq(pickSplitTasks([], ["p1"]), []));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
