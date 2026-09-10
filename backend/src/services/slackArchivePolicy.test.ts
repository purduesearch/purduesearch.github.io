// Pure-logic unit tests for slackArchivePolicy. No DB, no Slack.
// Run: cd backend && npx tsx src/services/slackArchivePolicy.test.ts

import { shouldArchive } from "./slackArchivePolicy.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}
const BOT = "U0BOTBOT";

console.log("shouldArchive");
{
  const d = shouldArchive({ user: "U1", text: "hello", ts: "1.0" }, BOT);
  check("plain human message is archived", d.archive === true && (d as any).kind === "new");
}
{
  // The whole reason this predicate exists: bot text can look human.
  const d = shouldArchive({ bot_id: "B123", text: "Standup time!", ts: "1.0" }, BOT);
  check("bot_id is skipped", d.archive === false && (d as any).reason === "bot");
}
{
  const d = shouldArchive({ user: BOT, text: "hi", ts: "1.0" }, BOT);
  check("our own bot user is skipped", d.archive === false && (d as any).reason === "bot");
}
{
  const d = shouldArchive({ subtype: "channel_join", user: "U1", text: "joined", ts: "1.0" }, BOT);
  check("channel_join is housekeeping", d.archive === false && (d as any).reason === "housekeeping");
}
{
  const d = shouldArchive({ subtype: "channel_topic", user: "U1", text: "set topic", ts: "1.0" }, BOT);
  check("channel_topic is housekeeping", d.archive === false && (d as any).reason === "housekeeping");
}
{
  // Text is empty but a screenshot was shared — this is NOT an empty message.
  const d = shouldArchive({ subtype: "file_share", user: "U1", text: "", ts: "1.0", files: [{ id: "F1" }] }, BOT);
  check("file_share with no text is archived", d.archive === true && (d as any).kind === "new");
}
{
  const d = shouldArchive({ user: "U1", text: "", ts: "1.0" }, BOT);
  check("no text and no files is empty", d.archive === false && (d as any).reason === "empty");
}
{
  const d = shouldArchive({ subtype: "thread_broadcast", user: "U1", text: "also here", ts: "2.0", thread_ts: "1.0" }, BOT);
  check("thread_broadcast is archived", d.archive === true && (d as any).kind === "new");
}
{
  const d = shouldArchive({ subtype: "message_changed", message: { user: "U1", text: "edited", ts: "1.0" } }, BOT);
  check("message_changed is an edit", d.archive === true && (d as any).kind === "edit");
}
{
  // The bot_id lives on the INNER message for edits, not the outer envelope.
  const d = shouldArchive({ subtype: "message_changed", message: { bot_id: "B1", text: "x", ts: "1.0" } }, BOT);
  check("edited bot message is still skipped", d.archive === false && (d as any).reason === "bot");
}
{
  const d = shouldArchive({ subtype: "message_deleted", deleted_ts: "1.0" }, BOT);
  check("message_deleted is a delete", d.archive === true && (d as any).kind === "delete");
}
{
  const d = shouldArchive({ subtype: "message_replied", user: "U1", text: "x", ts: "1.0" }, BOT);
  check("unknown subtype is skipped", d.archive === false && (d as any).reason === "unsupported_subtype");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
