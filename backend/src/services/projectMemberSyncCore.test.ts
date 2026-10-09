// Run: cd backend && npx tsx src/services/projectMemberSyncCore.test.ts
import { planChannelMemberSync } from "./projectMemberSyncCore.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const known = [
  { slackId: "U1", memberId: "m1", isBot: false, inProject: true },
  { slackId: "U2", memberId: "m2", isBot: false, inProject: false },
  { slackId: "B1", memberId: "b1", isBot: true, inProject: false },
];

const plan = planChannelMemberSync(["U1", "U2", "B1", "U9"], known);
check("existing project member → no work", !plan.addMemberIds.includes("m1"));
check("known member outside project → added without Slack call", eq(plan.addMemberIds, ["m2"]));
check("bot → never added", !plan.addMemberIds.includes("b1"));
check("unknown slack id → resolved", eq(plan.resolveSlackIds, ["U9"]));

const steady = planChannelMemberSync(["U1", "U1"], known);
check("steady state → nothing to do", eq(steady, { addMemberIds: [], resolveSlackIds: [] }));

const dup = planChannelMemberSync(["U9", "U9"], []);
check("duplicate ids resolved once", eq(dup.resolveSlackIds, ["U9"]));

console.log(`\nprojectMemberSyncCore: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
