// Pure-logic unit tests for slackArchivePolicy. No DB, no Slack.
// Run: cd backend && npx tsx src/services/slackArchivePolicy.test.ts

import { shouldArchive } from "./slackArchivePolicy.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}
const BOT = "U0BOTBOT";
const d = (m: Parameters<typeof shouldArchive>[0]) => shouldArchive(m, BOT) as any;

console.log("shouldArchive");
check("plain human message is archived as human",
  d({ user: "U1", text: "hello", ts: "1.0" }).archive === true && d({ user: "U1", text: "hello", ts: "1.0" }).isBot === false);
// Portal pass (D4): bot messages are archived, flagged, never dropped.
check("bot_id message is archived as bot",
  d({ bot_id: "B123", text: "Standup time!", ts: "1.0" }).isBot === true);
check("our own bot user is archived as bot",
  d({ user: BOT, text: "hi", ts: "1.0" }).isBot === true);
check("bot_message subtype is archived as bot",
  d({ subtype: "bot_message", bot_id: "B1", text: "x", ts: "1.0" }).isBot === true);
check("blocks-only bot message is not empty",
  d({ bot_id: "B1", text: "", ts: "1.0", blocks: [{ type: "section" }] }).archive === true);
check("attachments-only bot message is not empty",
  d({ bot_id: "B1", text: "", ts: "1.0", attachments: [{ text: "x" }] }).archive === true);
check("channel_join is housekeeping",
  d({ subtype: "channel_join", user: "U1", text: "joined", ts: "1.0" }).reason === "housekeeping");
check("channel_topic is housekeeping",
  d({ subtype: "channel_topic", user: "U1", text: "set topic", ts: "1.0" }).reason === "housekeeping");
check("bot_add is housekeeping",
  d({ subtype: "bot_add", user: "U1", text: "added an app", ts: "1.0" }).reason === "housekeeping");
check("file_share with no text is archived",
  d({ subtype: "file_share", user: "U1", text: "", ts: "1.0", files: [{ id: "F1" }] }).kind === "new");
check("no text, files, blocks or attachments is empty",
  d({ user: "U1", text: "", ts: "1.0" }).reason === "empty");
check("thread_broadcast is archived",
  d({ subtype: "thread_broadcast", user: "U1", text: "also here", ts: "2.0", thread_ts: "1.0" }).kind === "new");
check("me_message is archived",
  d({ subtype: "me_message", user: "U1", text: "waves", ts: "1.0" }).kind === "new");
check("message_changed is an edit",
  d({ subtype: "message_changed", message: { user: "U1", text: "edited", ts: "1.0" } }).kind === "edit");
check("edited bot message is an edit flagged as bot",
  d({ subtype: "message_changed", message: { bot_id: "B1", text: "x", ts: "1.0" } }).isBot === true);
check("message_changed without an inner ts is unsupported",
  d({ subtype: "message_changed", message: { user: "U1", text: "x" } }).reason === "unsupported_subtype");
check("message_deleted is a delete",
  d({ subtype: "message_deleted", deleted_ts: "1.0" }).kind === "delete");
check("unknown subtype is skipped",
  d({ subtype: "message_replied", user: "U1", text: "x", ts: "1.0" }).reason === "unsupported_subtype");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
