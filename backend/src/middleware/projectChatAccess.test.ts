// Pure-logic unit tests for the chat channel-id union. No DB.
// Run: cd backend && npx tsx src/middleware/projectChatAccess.test.ts

import { unionChannelIds, planRollupChannels } from "./projectChatAccess.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}
const noProject = { slackChannelId: null, slackChannel: null };

console.log("unionChannelIds");
{
  const ids = unionChannelIds([{ slackChannelId: "C1" }, { slackChannelId: "C2" }], noProject);
  check("collects notification targets", ids.length === 2 && ids.includes("C1") && ids.includes("C2"));
}
{
  const ids = unionChannelIds([], { slackChannelId: "C9", slackChannel: null });
  check("includes the legacy slackChannelId", ids.length === 1 && ids[0] === "C9");
}
{
  // The legacy column sometimes holds a channel NAME, which is not an id and
  // must never be treated as one — it would silently widen the read scope.
  const ids = unionChannelIds([], { slackChannelId: null, slackChannel: "proj-ares" });
  check("a legacy channel NAME is not treated as an id", ids.length === 0);
}
{
  const ids = unionChannelIds([], { slackChannelId: null, slackChannel: "C7ABC123" });
  check("a legacy raw id IS accepted", ids.length === 1 && ids[0] === "C7ABC123");
}
{
  const ids = unionChannelIds([], { slackChannelId: null, slackChannel: "GPRIVATE1" });
  check("private-channel ids (G prefix) are accepted", ids.length === 1);
}
{
  const ids = unionChannelIds([{ slackChannelId: "C1" }], { slackChannelId: "C1", slackChannel: "C1" });
  check("the same id from all three sources dedupes", ids.length === 1);
}
{
  check("no links at all yields nothing", unionChannelIds([], noProject).length === 0);
}

console.log("planRollupChannels");
{
  const a = { projectId: "a", projectName: "A", label: "A", color: "#000000", tagEnabled: false };
  const b = { ...a, projectId: "b", projectName: "B", label: "B" };
  const m = planRollupChannels(["C1"], [
    { badge: a, channelIds: ["C1", "C2", "GPRIV"] },
    { badge: b, channelIds: ["C2", "C3"] },
  ]);
  check("channel the parent links stays local", !m.has("C1"));
  check("first child wins a shared id", m.get("C2")?.projectId === "a");
  check("later child keeps its own ids", m.get("C3")?.projectId === "b");
  check("private child id is only a candidate (readability filter runs after)", m.has("GPRIV"));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
