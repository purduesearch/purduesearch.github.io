// Pure-logic unit tests for slotConflicts. No network, no DB.
// Run: cd backend && npx tsx src/services/slotConflicts.test.ts

import { conflictingSlots } from "./slotConflicts.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

const t = (h: number, m = 0) =>
  new Date(`2026-09-07T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);

console.log("conflictingSlots");
{
  const busy = [{ start: t(10), end: t(11) }];
  const slots = [t(9), t(9, 30), t(10), t(10, 30), t(11), t(11, 30)].map(d => d.toISOString());
  const hit = conflictingSlots(slots, 30, busy);

  check("slot before the block is free", !hit.has(t(9).toISOString()));
  // 09:30–10:00 ends exactly when the block starts.
  check("slot ending at the block start is free", !hit.has(t(9, 30).toISOString()));
  check("slot at the block start conflicts", hit.has(t(10).toISOString()));
  check("slot inside the block conflicts", hit.has(t(10, 30).toISOString()));
  // 11:00–11:30 starts exactly when the block ends — a class ending at 11
  // does not make an 11 o'clock meeting impossible.
  check("slot starting at the block end is free", !hit.has(t(11).toISOString()));
  check("slot after the block is free", !hit.has(t(11, 30).toISOString()));
  check("exactly two slots conflict", hit.size === 2);
}

console.log("conflictingSlots — partial overlaps");
{
  // A 15-minute block inside a 30-minute slot still blocks that slot.
  const busy = [{ start: t(10, 5), end: t(10, 20) }];
  const hit = conflictingSlots([t(10).toISOString()], 30, busy);
  check("a slot fully containing a short block conflicts", hit.size === 1);
}

console.log("conflictingSlots — degenerate input");
{
  check("no busy intervals means no conflicts",
    conflictingSlots([t(10).toISOString()], 30, []).size === 0);
  check("no slots means no conflicts",
    conflictingSlots([], 30, [{ start: t(10), end: t(11) }]).size === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
