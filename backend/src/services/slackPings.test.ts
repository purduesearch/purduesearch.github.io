// Run: cd backend && npx tsx src/services/slackPings.test.ts
import { computePings, type PingInput } from "./slackPings.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

const base: PingInput = {
  convKind: "CHANNEL", authorSlackId: "UA", isOwnBot: false, text: "",
  threadTs: null, conversationMemberIds: ["UA", "U1", "U2", "U3"],
  threadParticipantIds: [], userGroupMembers: {},
};
const pings = (over: Partial<PingInput>) => computePings({ ...base, ...over });
const typeFor = (ps: ReturnType<typeof computePings>, id: string) => ps.find((p) => p.slackUserId === id)?.type;

{
  const ps = pings({ convKind: "IM", conversationMemberIds: ["UA", "U1"], text: "hey" });
  check("DM pings the other participant", typeFor(ps, "U1") === "SLACK_DM");
  check("DM never pings its author", !typeFor(ps, "UA"));
}
check("group DM pings every other participant",
  pings({ convKind: "MPIM", conversationMemberIds: ["UA", "U1", "U2"], text: "x" }).length === 2);
check("our own bot never pings (D9)",
  pings({ convKind: "IM", conversationMemberIds: ["UBOT", "U1"], authorSlackId: "UBOT", isOwnBot: true, text: "<@U1>" }).length === 0);
check("another app's DM does ping",
  typeFor(pings({ convKind: "IM", conversationMemberIds: ["UAPP", "U1"], authorSlackId: "UAPP", text: "build done" }), "U1") === "SLACK_DM");
check("plain channel message pings nobody", pings({ text: "hello all" }).length === 0);
check("channel mention of a member", typeFor(pings({ text: "hi <@U1>" }), "U1") === "SLACK_MENTION");
check("labelled mention form", typeFor(pings({ text: "hi <@U1|ann>" }), "U1") === "SLACK_MENTION");
check("mention of a non-member pings nobody", pings({ text: "hi <@U9>" }).length === 0);
check("mention inside inline code is inert", pings({ text: "run `<@U1>`" }).length === 0);
check("mention inside a code block is inert", pings({ text: "```\n<@U1>\n```" }).length === 0);
check("author mentioning themselves", pings({ text: "note to <@UA>" }).length === 0);
{
  const ps = pings({ text: "<!channel> standup" });
  check("@channel pings every member but the author", ps.length === 3 && ps.every((p) => p.type === "SLACK_BROADCAST"));
}
check("@here is a broadcast too", pings({ text: "<!here>" }).length === 3);
check("direct mention beats broadcast", typeFor(pings({ text: "<!channel> esp. <@U1>" }), "U1") === "SLACK_MENTION");
{
  const ps = pings({ threadTs: "1.0", threadParticipantIds: ["U1", "UA", "U9"], text: "reply" });
  check("thread reply pings participants", typeFor(ps, "U1") === "SLACK_THREAD_REPLY");
  check("thread reply skips its author", !typeFor(ps, "UA"));
  check("thread participant who left the channel is skipped", !typeFor(ps, "U9"));
}
check("mention beats thread reply",
  typeFor(pings({ threadTs: "1.0", threadParticipantIds: ["U1"], text: "<@U1> ok" }), "U1") === "SLACK_MENTION");
{
  const ps = pings({ text: "<!subteam^S1|@leads> look", userGroupMembers: { S1: ["U2", "U9"] } });
  check("user-group mention reaches its members in the channel", typeFor(ps, "U2") === "SLACK_MENTION" && !typeFor(ps, "U9"));
}

console.log(`\nslackPings: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
