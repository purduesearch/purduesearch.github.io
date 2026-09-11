// Pure-logic tests for slackConversationAccess, plus a static guard.
// Run: cd backend && npx tsx src/services/slackConversationAccess.test.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  canReadConversation, canPostToConversation,
  kindFromChannelType, kindFromConversation, kindFromChannelId,
} from "./slackConversationAccess.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

check("public channel: non-participant may read", canReadConversation({ kind: "CHANNEL", isParticipant: false }));
check("private channel: non-participant may NOT read", !canReadConversation({ kind: "PRIVATE_CHANNEL", isParticipant: false }));
check("DM: non-participant may NOT read", !canReadConversation({ kind: "IM", isParticipant: false }));
check("group DM: non-participant may NOT read", !canReadConversation({ kind: "MPIM", isParticipant: false }));
check("DM: participant may read", canReadConversation({ kind: "IM", isParticipant: true }));
check("public channel: posting needs membership", !canPostToConversation({ kind: "CHANNEL", isParticipant: false }));
check("public channel: member may post", canPostToConversation({ kind: "CHANNEL", isParticipant: true }));

check("channel_type im → IM", kindFromChannelType("im") === "IM");
check("channel_type mpim → MPIM", kindFromChannelType("mpim") === "MPIM");
check("channel_type group → PRIVATE_CHANNEL", kindFromChannelType("group") === "PRIVATE_CHANNEL");
check("channel_type channel → CHANNEL", kindFromChannelType("channel") === "CHANNEL");
check("unknown channel_type fails closed", kindFromChannelType("weird") === "PRIVATE_CHANNEL");
check("undefined channel_type fails closed", kindFromChannelType(undefined) === "PRIVATE_CHANNEL");

check("info is_im → IM", kindFromConversation({ is_im: true }) === "IM");
check("info is_mpim → MPIM", kindFromConversation({ is_mpim: true, is_private: true }) === "MPIM");
check("info is_private → PRIVATE_CHANNEL", kindFromConversation({ is_private: true }) === "PRIVATE_CHANNEL");
check("info plain → CHANNEL", kindFromConversation({ is_channel: true }) === "CHANNEL");

check("D… id → IM", kindFromChannelId("D0123") === "IM");
// New workspaces issue C… ids for private channels too, so a bare C… id is
// NOT evidence of a public channel. Unknown must never widen access.
check("C… id alone fails closed", kindFromChannelId("C0123") === "PRIVATE_CHANNEL");

// Static guard: an admin bypass must be impossible to add by accident.
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "slackConversationAccess.ts"), "utf8");
check("access module never mentions isAdmin", !/isAdmin/.test(src));

console.log(`\nslackConversationAccess: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
