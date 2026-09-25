// Unit tests for labScheduleCore. No DB.
// Run: cd backend && npx tsx src/services/labScheduleCore.test.ts
import {
  addDays, weekdayOf, mondayOf, weekDates, isYmd, localDateMinutes,
  expandShifts, mergePresence, eventToBand, validateApply, rectToShifts, planErase,
  overlapsFor, formatRange, describeDrafts, describeOverlaps,
  type ShiftRow, type Occurrence,
} from "./labScheduleCore.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const MON = "2026-09-28";
const WEEK = weekDates(MON);
const TZ = "America/New_York";

console.log("date helpers");
{
  check("addDays across months", addDays("2026-09-28", 7) === "2026-10-05");
  check("addDays negative", addDays("2026-10-01", -1) === "2026-09-30");
  check("weekdayOf Monday", weekdayOf(MON) === 1);
  check("mondayOf Sunday goes back", mondayOf("2026-10-04") === MON);
  check("mondayOf Monday is itself", mondayOf(MON) === MON);
  check("weekDates has 7 days ending Sunday", WEEK.length === 7 && WEEK[6] === "2026-10-04");
  check("isYmd accepts a date", isYmd("2026-09-28"));
  check("isYmd rejects junk", !isYmd("2026-9-28") && !isYmd(42) && !isYmd("2026-13-40"));
  check("localDateMinutes EDT", eq(localDateMinutes(new Date("2026-09-28T18:00:00Z"), TZ), { date: MON, minutes: 840 }));
  check("localDateMinutes EST after DST", eq(localDateMinutes(new Date("2026-11-02T19:00:00Z"), TZ), { date: "2026-11-02", minutes: 840 }));
}

const shift = (over: Partial<ShiftRow>): ShiftRow => ({
  id: "s1", memberId: "A", weekday: 1, startMin: 840, endMin: 1020,
  startsOn: "2026-09-14", endsOn: "2026-12-13", buddyWanted: false, ...over,
});

console.log("expandShifts");
{
  const weekly = shift({});
  check("weekly rule appears on its weekday", eq(expandShifts([weekly], [], WEEK).map(o => o.date), [MON]));
  check("skip removes the occurrence", expandShifts([weekly], [{ shiftId: "s1", date: MON }], WEEK).length === 0);
  const oneOff = shift({ id: "o1", weekday: 3, startsOn: "2026-09-30", endsOn: "2026-09-30" });
  check("one-off inside the week appears", expandShifts([oneOff], [], WEEK).length === 1);
  check("one-off next week does not", expandShifts([shift({ id: "o2", weekday: 3, startsOn: "2026-10-07", endsOn: "2026-10-07" })], [], WEEK).length === 0);
  check("rule starting later does not", expandShifts([shift({ startsOn: "2026-10-05" })], [], WEEK).length === 0);
  check("rule ended earlier does not", expandShifts([shift({ endsOn: "2026-09-27" })], [], WEEK).length === 0);
  check("recurring rule is weekly", expandShifts([weekly], [], WEEK)[0].weekly === true);
  check("one-off is not weekly", expandShifts([oneOff], [], WEEK)[0].weekly === false);
}

const occ = (memberId: string, startMin: number, endMin: number, buddyWanted = false, date = MON): Occurrence =>
  ({ shiftId: `x-${memberId}-${startMin}`, memberId, date, startMin, endMin, buddyWanted, weekly: true });

console.log("mergePresence");
{
  const blocks = mergePresence(MON, [occ("A", 840, 1020, true), occ("B", 900, 1080)], []);
  check("three segments", blocks.length === 3);
  check("first is A alone", eq(blocks[0].memberIds, ["A"]) && blocks[0].solo && blocks[0].startMin === 840 && blocks[0].endMin === 900);
  check("middle has both", eq(blocks[1].memberIds, ["A", "B"]) && blocks[1].headcount === 2 && !blocks[1].solo);
  check("buddy flag carried", eq(blocks[1].buddyMemberIds, ["A"]));
  check("last is B alone", eq(blocks[2].memberIds, ["B"]) && blocks[2].endMin === 1080);

  const adjacent = mergePresence(MON, [occ("A", 840, 900), occ("A", 900, 960)], []);
  check("adjacent identical segments merge", adjacent.length === 1 && adjacent[0].endMin === 960);

  const withEvent = mergePresence(MON, [occ("A", 840, 1020)], [
    { eventId: "e1", title: "Run experiment", date: MON, startMin: 960, endMin: 1020, attendeeIds: ["C"] },
  ]);
  check("event splits the block", withEvent.length === 2);
  check("event attendees count", eq(withEvent[1].memberIds, ["A", "C"]) && eq(withEvent[1].eventIds, ["e1"]));
  check("other dates ignored", mergePresence("2026-09-29", [occ("A", 840, 1020)], []).length === 0);
}

console.log("eventToBand");
{
  const ev = (startTime: string, endTime: string | null) =>
    eventToBand({ id: "e", title: "T", startTime: new Date(startTime), endTime: endTime ? new Date(endTime) : null, attendeeIds: [] }, TZ);
  const b = ev("2026-09-30T18:00:00Z", "2026-09-30T20:00:00Z");
  check("band local times", b.date === "2026-09-30" && b.startMin === 840 && b.endMin === 960);
  check("no end means one hour", ev("2026-09-30T18:00:00Z", null).endMin === 900);
  check("past midnight clips to end of day", ev("2026-09-30T18:00:00Z", "2026-10-01T05:00:00Z").endMin === 1440);
}

console.log("validateApply");
{
  const ws = { openStartMin: 480, openEndMin: 1320, defaultEndsOn: "2026-12-13" as string | null };
  const today = "2026-09-25";
  const base = { op: "add", scope: "weekly", dates: ["2026-09-30", MON], startMin: 840, endMin: 1020 };
  const ok = validateApply(base, ws, today);
  check("valid weekly add", ok.ok && eq(ok.value.dates, [MON, "2026-09-30"]) && ok.value.endsOn === "2026-12-13" && ok.value.buddyWanted === false);
  const noTerm = validateApply(base, { ...ws, defaultEndsOn: null }, today);
  check("no term end → 16 weeks", noTerm.ok && noTerm.value.endsOn === "2027-01-18");
  const pastTerm = validateApply(base, { ...ws, defaultEndsOn: "2026-09-01" }, today);
  check("past term end → 16 weeks", pastTerm.ok && pastTerm.value.endsOn === "2027-01-18");
  const erase = validateApply({ ...base, op: "erase" }, ws, today);
  check("erase has no endsOn", erase.ok && erase.value.endsOn === null);
  const bad = (body: Record<string, unknown>) => !validateApply({ ...base, ...body }, ws, today).ok;
  check("rejects bad op", bad({ op: "nope" }));
  check("rejects bad scope", bad({ scope: "monthly" }));
  check("rejects off-grid time", bad({ startMin: 845 }));
  check("rejects start after end", bad({ startMin: 1020, endMin: 840 }));
  check("rejects outside open hours", bad({ startMin: 420 }));
  check("rejects two weeks", bad({ dates: ["2026-09-27", MON] }));
  check("rejects more than 7 days", bad({ dates: [...WEEK, "2026-10-05"] }));
  check("rejects no days", bad({ dates: [] }));
  check("rejects endsOn before start", bad({ endsOn: "2026-09-01" }));
  check("rejects endsOn > 1 year", bad({ endsOn: "2027-12-01" }));
  const buddy = validateApply({ ...base, buddyWanted: true }, ws, today);
  check("buddy flag parsed", buddy.ok && buddy.value.buddyWanted);
}

console.log("rectToShifts");
{
  const input = { op: "add" as const, scope: "weekly" as const, dates: [MON, "2026-09-29"], startMin: 840, endMin: 1020, endsOn: "2026-12-13", buddyWanted: true };
  const weekly = rectToShifts(input);
  check("one weekly row per day", weekly.length === 2 && weekly[0].weekday === 1 && weekly[1].weekday === 2);
  check("weekly rows run to endsOn", weekly.every(d => d.endsOn === "2026-12-13") && weekly[1].startsOn === "2026-09-29");
  check("buddy flag copied", weekly.every(d => d.buddyWanted));
  const dates = rectToShifts({ ...input, scope: "dates", endsOn: null });
  check("dates scope makes one-offs", dates.every(d => d.startsOn === d.endsOn));
  check("days after endsOn are dropped", rectToShifts({ ...input, endsOn: MON }).length === 1);
}

console.log("planErase");
{
  const s1 = shift({});
  const mid = { dates: [MON], startMin: 900, endMin: 960 };

  const a = planErase([s1], [], { ...mid, scope: "weekly" });
  check("weekly erase ends the old rule the day before", eq(a.updates, [{ id: "s1", data: { endsOn: "2026-09-27" } }]));
  check("weekly erase recreates both remaining pieces from that day", a.creates.length === 2
    && a.creates[0].startMin === 840 && a.creates[0].endMin === 900 && a.creates[0].startsOn === MON && a.creates[0].endsOn === "2026-12-13"
    && a.creates[1].startMin === 960 && a.creates[1].endMin === 1020);

  const s2 = shift({ id: "s2", startsOn: MON });
  check("full weekly erase deletes a rule starting that day",
    eq(planErase([s2], [], { dates: [MON], startMin: 840, endMin: 1020, scope: "weekly" }).deletes, ["s2"]));
  const trim = planErase([s2], [], { dates: [MON], startMin: 840, endMin: 900, scope: "weekly" });
  check("trim moves the start", eq(trim.updates, [{ id: "s2", data: { startMin: 900, endMin: 1020 } }]) && trim.creates.length === 0);
  const split = planErase([s2], [], { ...mid, scope: "weekly" });
  check("split keeps the first piece and creates the second",
    eq(split.updates, [{ id: "s2", data: { startMin: 840, endMin: 900 } }]) && split.creates.length === 1 && split.creates[0].startMin === 960);

  const e = planErase([s1], [], { ...mid, scope: "dates" });
  check("dates erase skips the occurrence", eq(e.skips, [{ shiftId: "s1", date: MON }]));
  check("dates erase keeps the remainder as one-offs", e.creates.length === 2 && e.creates.every(c => c.startsOn === MON && c.endsOn === MON));
  check("dates erase leaves the rule alone", e.updates.length === 0 && e.deletes.length === 0);

  const o = shift({ id: "o", weekday: 3, startsOn: "2026-09-30", endsOn: "2026-09-30" });
  check("dates erase deletes a covered one-off",
    eq(planErase([o], [], { dates: ["2026-09-30"], startMin: 840, endMin: 1020, scope: "dates" }).deletes, ["o"]));

  const none = planErase([s1], [], { dates: [MON], startMin: 480, endMin: 600, scope: "weekly" });
  check("non-overlapping erase is empty", none.updates.length + none.creates.length + none.deletes.length + none.skips.length === 0);
  const later = planErase([shift({ startsOn: "2026-10-05" })], [], { ...mid, scope: "dates" });
  check("dates erase ignores a rule that has not started", later.skips.length === 0 && later.creates.length === 0);
  const already = planErase([s1], [{ shiftId: "s1", date: MON }], { ...mid, scope: "dates" });
  check("dates erase ignores an already-skipped day", already.skips.length === 0 && already.creates.length === 0);
}

console.log("overlapsFor");
{
  const mine = [occ("A", 840, 1020)];
  const hits = overlapsFor(mine, [occ("B", 900, 1080), occ("C", 1020, 1080), occ("A", 840, 900)]);
  check("B overlaps 900–1020", eq(hits.get("B"), [{ date: MON, startMin: 900, endMin: 1020 }]));
  check("touching end is not overlap", !hits.has("C"));
  check("self excluded", !hits.has("A"));
}

console.log("formatting");
{
  check("same meridiem", formatRange(840, 1020) === "2:00–5:00 PM");
  check("cross meridiem", formatRange(660, 780) === "11:00 AM–1:00 PM");
  const weekly = { weekday: 1, startMin: 840, endMin: 1020, startsOn: MON, endsOn: "2026-12-13", buddyWanted: false };
  check("weekly description", describeDrafts([weekly]) === "Mondays 2:00–5:00 PM");
  check("one-off description", describeDrafts([{ ...weekly, endsOn: MON }]) === "Mon Sep 28, 2:00–5:00 PM");
  check("more count", describeDrafts([weekly, { ...weekly, weekday: 2, startsOn: "2026-09-29" }]) === "Mondays 2:00–5:00 PM (+1 more)");
  check("overlap description", describeOverlaps([{ date: MON, startMin: 900, endMin: 1020 }]) === "Mon Sep 28, 3:00–5:00 PM");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
