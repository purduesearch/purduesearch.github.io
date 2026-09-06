// Task.completedAt transition rules. Pure logic — no DB required.
// Run: cd backend && npx tsx src/services/taskService.completedAt.test.ts
//
// Weekly Velocity and the Burndown "Actual" line read Task.completedAt. Before
// this column existed both rendered empty/flat, so the transition rules below
// are the whole contract those charts depend on.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { TaskStatus } from "@prisma/client";
import { resolveCompletedAt } from "./taskService.js";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; } else { failed++; console.error(`  ✗ ${n}`); }
};

const cur = (status: TaskStatus, completedAt: Date | null = null) => ({ status, completedAt });
const NOW = new Date("2026-09-06T12:00:00.000Z");
const ORIGINAL = new Date("2026-05-01T09:30:00.000Z");

// ── TODO → DONE stamps the completion time ───────────────────
{
  const next = resolveCompletedAt("DONE", cur("TODO"), NOW);
  check("TODO → DONE sets a Date", next instanceof Date);
  check("TODO → DONE uses the current time", (next as Date).getTime() === NOW.getTime());
}

// ── DONE → DONE preserves the ORIGINAL stamp ─────────────────
// A second status write (bulk PATCH re-sending DONE, Slack re-completion, a
// GitHub sync replaying a merge) must not slide the task into a later week.
{
  const next = resolveCompletedAt("DONE", cur("DONE", ORIGINAL), NOW);
  check("DONE → DONE preserves the original value", (next as Date).getTime() === ORIGINAL.getTime());
  check("DONE → DONE does not restamp to now", (next as Date).getTime() !== NOW.getTime());
}

// A DONE row that somehow has no stamp (pre-backfill write) still gets one.
{
  const next = resolveCompletedAt("DONE", cur("DONE", null), NOW);
  check("DONE → DONE with a null stamp backfills to now", (next as Date).getTime() === NOW.getTime());
}

// ── Leaving DONE clears it ───────────────────────────────────
{
  const next = resolveCompletedAt("IN_PROGRESS", cur("DONE", ORIGINAL), NOW);
  check("DONE → IN_PROGRESS clears completedAt to null", next === null);
  check("DONE → IN_PROGRESS writes the column (not undefined)", next !== undefined);
  check("DONE → BLOCKED also clears it", resolveCompletedAt("BLOCKED", cur("DONE", ORIGINAL), NOW) === null);
  check("DONE → TODO also clears it", resolveCompletedAt("TODO", cur("DONE", ORIGINAL), NOW) === null);
}

// ── Non-completion transitions leave the column alone ────────
{
  check("TODO → BLOCKED leaves completedAt null (no write)", resolveCompletedAt("BLOCKED", cur("TODO"), NOW) === undefined);
  check("TODO → IN_PROGRESS leaves it alone", resolveCompletedAt("IN_PROGRESS", cur("TODO"), NOW) === undefined);
  check("BLOCKED → TODO leaves it alone", resolveCompletedAt("TODO", cur("BLOCKED"), NOW) === undefined);
}

// ── Unknown prior state (row not found) still stamps on DONE ─
{
  check("→ DONE with no current row stamps now", (resolveCompletedAt("DONE", null, NOW) as Date).getTime() === NOW.getTime());
  check("→ TODO with no current row writes nothing", resolveCompletedAt("TODO", null, NOW) === undefined);
}

// ── Contract: updateTask must route through the helper, and ──
// ── completedAt must not be repurposed as a reward gate. ─────
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "taskService.ts"), "utf8");
check("updateTask calls resolveCompletedAt", src.includes("resolveCompletedAt(data.status, current)"));
check("the status read selects completedAt", /completedAt: true/.test(src));
check(
  "rewardGrantedAt is still the idempotency gate",
  src.includes("rewardGrantedAt") && !/rewardGrantedAt[^\n]*completedAt/.test(src)
);

console.log(`\ntaskService.completedAt: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
