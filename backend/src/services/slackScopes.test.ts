// Pure-logic tests for slackScopes. No DB, no Slack.
// Run: cd backend && npx tsx src/services/slackScopes.test.ts
import { SLACK_USER_SCOPES, parseScopes, hasCapability, capabilitiesOf, needsReconnect } from "./slackScopes.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

// The scope set every member had before the portal pass.
const LEGACY = ["users:read", "users:read.email", "channels:read", "groups:read", "mpim:read", "channels:write.invites", "groups:write.invites"];

check("parseScopes splits, trims, dedupes", JSON.stringify(parseScopes(" a,b , a,,c ")) === JSON.stringify(["a", "b", "c"]));
check("parseScopes(null) is []", parseScopes(null).length === 0);
check("SLACK_USER_SCOPES has no duplicates", new Set(SLACK_USER_SCOPES).size === SLACK_USER_SCOPES.length);
check("legacy scopes cannot post", !hasCapability(LEGACY, "post"));
check("legacy scopes cannot read DMs", !hasCapability(LEGACY, "read"));
check("legacy scopes need reconnect", needsReconnect(LEGACY));
check("full scopes need no reconnect", !needsReconnect([...SLACK_USER_SCOPES]));
{
  const caps = capabilitiesOf([...SLACK_USER_SCOPES]);
  check("full scopes grant every capability", Object.values(caps).every(Boolean));
}
{
  const caps = capabilitiesOf(["chat:write"]);
  check("chat:write alone grants post", caps.post === true);
  check("chat:write alone does not grant dm", caps.dm === false);
  check("chat:write alone does not grant files", caps.files === false);
}
check("react needs reactions:write", hasCapability(["reactions:write"], "react"));
check("join needs channels:write", hasCapability(["channels:write"], "join") && !hasCapability([], "join"));

console.log(`\nslackScopes: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
