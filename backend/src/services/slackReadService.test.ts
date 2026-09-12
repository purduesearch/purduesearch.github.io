// Pure-logic tests for slackReadService. Run: cd backend && npx tsx src/services/slackReadService.test.ts
import { compareTs, idsReadUpTo } from "./slackReadService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

check("equal ts compare 0", compareTs("1725900000.001200", "1725900000.001200") === 0);
check("earlier second sorts first", compareTs("1725900000.999999", "1725900001.000000") < 0);
check("fraction compared by digits", compareTs("1725900000.000200", "1725900000.001000") < 0);
check("short fraction is padded", compareTs("1725900000.1", "1725900000.099999") > 0);
// The reason this function exists: string comparison gets this one wrong.
check("numeric seconds, not string order", compareTs("10.000000", "9.000000") > 0);

const notifs = [
  { id: "a", slackTs: "100.000001" },
  { id: "b", slackTs: "100.000002" },
  { id: "c", slackTs: "100.000003" },
  { id: "d", slackTs: null },
];
check("read up to b covers a and b", JSON.stringify(idsReadUpTo(notifs, "100.000002")) === JSON.stringify(["a", "b"]));
check("rows without a ts are never auto-read", !idsReadUpTo(notifs, "999.0").includes("d"));
check("nothing read before the first", idsReadUpTo(notifs, "99.0").length === 0);

console.log(`\nslackReadService: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
