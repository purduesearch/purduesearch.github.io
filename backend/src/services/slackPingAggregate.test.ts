// Run: cd backend && npx tsx src/services/slackPingAggregate.test.ts
import { addPing, removePing, newestPing, pingCount, type PingEntry } from "./slackPingAggregate.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

const m1: PingEntry = { ts: "1700000000.000001", message: "A sent you a message: “hi”", authorName: "A" };
const m2: PingEntry = { ts: "1700000000.000002", message: "A sent you a message: “yo”", authorName: "A" };

{
  const afterM1 = addPing([], m1);
  check("adding to an empty list creates a one-entry list", !!afterM1 && afterM1.length === 1);
  const afterM2 = addPing(afterM1 ?? [], m2);
  check("aggregate m1+m2 -> count 2", !!afterM2 && pingCount(afterM2) === 2);
  check("aggregate m1+m2 -> newest is m2", !!afterM2 && newestPing(afterM2)?.ts === m2.ts);

  const dupe = addPing(afterM2 ?? [], m1);
  check("duplicate m1 (redelivery) -> no change (null)", dupe === null);

  const afterDeleteM2 = removePing(afterM2 ?? [], m2.ts);
  check("delete m2 -> count 1", pingCount(afterDeleteM2) === 1);
  check("delete m2 -> newest is m1", newestPing(afterDeleteM2)?.ts === m1.ts);

  const afterDeleteM1 = removePing(afterM2 ?? [], m1.ts);
  check("delete m1 of [m1,m2] -> count 1", pingCount(afterDeleteM1) === 1);
  check("delete m1 of [m1,m2] -> newest is m2", newestPing(afterDeleteM1)?.ts === m2.ts);

  const afterDeleteBoth = removePing(afterDeleteM1, m2.ts);
  check("delete last -> empty", pingCount(afterDeleteBoth) === 0);
  check("newest of empty -> null", newestPing(afterDeleteBoth) === null);
}

{
  // Slack ts ordering must use compareTs semantics: the microsecond fraction
  // compares as zero-padded digits, not as a float ("...09" < "...010" as a
  // naive string/float compare would get wrong).
  const a: PingEntry = { ts: "1700000000.000009", message: "x", authorName: "A" };
  const b: PingEntry = { ts: "1700000000.000010", message: "y", authorName: "A" };
  const list = addPing(addPing([], a) ?? [], b) ?? [];
  check("newest uses compareTs ordering, not string/float compare", newestPing(list)?.ts === b.ts);
}

console.log(`\nslackPingAggregate: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
