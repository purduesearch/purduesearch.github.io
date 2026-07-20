// Pure-logic unit tests for pollService. No DB required.
// Run: npx tsx src/services/pollService.test.ts
//
// Excluded from the production build (tsconfig `exclude`). Uses a tiny inline
// assertion harness so no test framework dependency is needed.

import { aggregate, canRespond, canManage, buildIcs, slotKey } from "./pollService.js";
import type { PollAccessShape } from "./pollService.js";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean) {
  if (cond) { passed++; }
  else { failed++; console.error(`  ✗ ${name}`); }
}

function eq(name: string, a: unknown, b: unknown) {
  check(name, JSON.stringify(a) === JSON.stringify(b));
}

// ── Fixtures ─────────────────────────────────────────────────
const s = (h: number) => `2026-07-21T${String(h).padStart(2, "0")}:00:00.000Z`;
const slots = [s(9), s(10), s(11)];

// ── aggregate / best-slot ────────────────────────────────────
{
  const agg = aggregate(slots, [
    { memberId: "m1", name: "Ana",  slots: [s(9), s(10)] },
    { memberId: "m2", name: "Ben",  slots: [s(10), s(11)] },
    { memberId: null, name: "Guest", slots: [s(10)] },
  ]);
  eq("totalResponders", agg.totalResponders, 3);
  eq("count @9",  agg.counts[slotKey(s(9))],  1);
  eq("count @10", agg.counts[slotKey(s(10))], 3);
  eq("count @11", agg.counts[slotKey(s(11))], 1);
  eq("perSlot @10 names", agg.perSlot[slotKey(s(10))].sort(), ["Ana", "Ben", "Guest"]);
  eq("maxCount", agg.maxCount, 3);
  eq("bestSlot is 10", agg.bestSlotStarts, [slotKey(s(10))]);
}

// best-slot tie broken by earliest start
{
  const agg = aggregate(slots, [
    { memberId: "m1", name: "Ana", slots: [s(9)] },
    { memberId: "m2", name: "Ben", slots: [s(11)] },
  ]);
  eq("tie → earliest first", agg.bestSlotStarts, [slotKey(s(9)), slotKey(s(11))]);
}

// slots outside the candidate grid are ignored (grid-edit safety)
{
  const agg = aggregate(slots, [
    { memberId: "m1", name: "Ana", slots: [s(9), s(23) /* not a candidate */] },
  ]);
  eq("stray slot ignored in count", agg.counts[slotKey(s(9))], 1);
  eq("no bogus key", Object.keys(agg.counts).includes(slotKey(s(23))), false);
}

// no responders → empty best
{
  const agg = aggregate(slots, []);
  eq("empty maxCount", agg.maxCount, 0);
  eq("empty best", agg.bestSlotStarts, []);
}

// ── canManage ────────────────────────────────────────────────
{
  const poll: PollAccessShape = { audience: "INVITED", organizerId: "org1", invitedMemberIds: ["a"] };
  check("organizer manages",        canManage(poll, { memberId: "org1" }));
  check("admin manages",            canManage(poll, { memberId: "x", isAdmin: true }));
  check("stranger cannot manage",  !canManage(poll, { memberId: "x" }));
  check("guest cannot manage",     !canManage(poll, { memberId: null }));
}

// ── canRespond: INVITED ──────────────────────────────────────
{
  const poll: PollAccessShape = { audience: "INVITED", organizerId: "org1", invitedMemberIds: ["a", "b"] };
  check("invited member responds",     canRespond(poll, { memberId: "a" }).ok);
  check("organizer responds",          canRespond(poll, { memberId: "org1" }).ok);
  check("admin responds",              canRespond(poll, { memberId: "z", isAdmin: true }).ok);
  check("uninvited member blocked",   !canRespond(poll, { memberId: "z" }).ok);
  check("guest blocked on INVITED",   !canRespond(poll, { memberId: null }).ok);
}

// ── canRespond: PROJECT ──────────────────────────────────────
{
  const poll: PollAccessShape = { audience: "PROJECT", organizerId: "org1", invitedMemberIds: [] };
  check("project member responds",     canRespond(poll, { memberId: "a", isProjectMember: true }).ok);
  check("non-project member blocked", !canRespond(poll, { memberId: "a", isProjectMember: false }).ok);
  check("guest blocked on PROJECT",   !canRespond(poll, { memberId: null }).ok);
}

// ── canRespond: ANYONE (guest link) ──────────────────────────
{
  const poll: PollAccessShape = { audience: "ANYONE", organizerId: "org1", invitedMemberIds: [] };
  const guest = canRespond(poll, { memberId: null });
  check("guest allowed on ANYONE", guest.ok);
  check("guest flagged asGuest",   guest.asGuest);
  const mem = canRespond(poll, { memberId: "a" });
  check("member allowed on ANYONE", mem.ok);
  check("member not asGuest",      !mem.asGuest);
}

// ── buildIcs ─────────────────────────────────────────────────
{
  const ics = buildIcs({
    uid: "poll1",
    title: "Design; sync, v2",
    description: "line1\nline2",
    location: "Zoom",
    start: new Date("2026-07-21T14:00:00Z"),
    end:   new Date("2026-07-21T15:00:00Z"),
  });
  check("ics has VEVENT",   ics.includes("BEGIN:VEVENT"));
  check("ics DTSTART",      ics.includes("DTSTART:20260721T140000Z"));
  check("ics DTEND",        ics.includes("DTEND:20260721T150000Z"));
  check("ics escapes ; ,",  ics.includes("SUMMARY:Design\\; sync\\, v2"));
  check("ics escapes \\n",  ics.includes("DESCRIPTION:line1\\nline2"));
  check("ics CRLF",         ics.includes("\r\n"));
}

// ── Summary ──────────────────────────────────────────────────
console.log(`\npollService: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
