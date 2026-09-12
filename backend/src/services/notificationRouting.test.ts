// Run: cd backend && npx tsx src/services/notificationRouting.test.ts
import { routeFor } from "./notificationRouting.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}
const eq = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);

check("no preference → both", eq(routeFor("TASK_ASSIGNED", undefined), { inApp: true, slack: true }));
check("dashboard → in-app only", eq(routeFor("TASK_ASSIGNED", "dashboard"), { inApp: true, slack: false }));
check("slack → Slack only", eq(routeFor("TASK_ASSIGNED", "slack"), { inApp: false, slack: true }));
check("off → nothing", eq(routeFor("TASK_ASSIGNED", "off"), { inApp: false, slack: false }));
check("garbage preference → both", eq(routeFor("TASK_ASSIGNED", 42), { inApp: true, slack: true }));
// D9 loop guard: a mirrored Slack ping must never be DM'd back to Slack.
check("SLACK_DM default → in-app, never Slack", eq(routeFor("SLACK_DM", undefined), { inApp: true, slack: false }));
check("SLACK_MENTION 'slack' → still never Slack", eq(routeFor("SLACK_MENTION", "slack"), { inApp: true, slack: false }));
check("SLACK_BROADCAST off → nothing", eq(routeFor("SLACK_BROADCAST", "off"), { inApp: false, slack: false }));

console.log(`\nnotificationRouting: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
