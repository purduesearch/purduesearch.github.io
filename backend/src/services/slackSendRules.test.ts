// Run: cd backend && npx tsx src/services/slackSendRules.test.ts
import {
  mapSlackError, validateOutgoingText, validateDmTargets, normalizeEmojiName, MAX_TEXT,
} from "./slackSendRules.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

check("dead token → 409 reconnect", mapSlackError("token_revoked").status === 409 && mapSlackError("token_revoked").code === "reconnect");
check("missing_scope → 409 reconnect", mapSlackError("missing_scope").status === 409);
check("not_in_channel → 403", mapSlackError("not_in_channel").status === 403);
check("ratelimited → 429", mapSlackError("ratelimited").status === 429);
check("already_reacted is a no-op", mapSlackError("already_reacted").code === "noop");
check("unknown → 502", mapSlackError("something_new").status === 502);
check("only reconnect uses 409", ["not_in_channel", "is_archived", "msg_too_long", "cant_delete_message", "x"].every((c) => mapSlackError(c).status !== 409));

check("empty text rejected", !validateOutgoingText("   ").ok);
check("non-string text rejected", !validateOutgoingText(42).ok);
check("text trimmed", (validateOutgoingText("  hi  ") as any).text === "hi");
check("over-long text rejected", !validateOutgoingText("x".repeat(MAX_TEXT + 1)).ok);

check("DM targets dedupe and drop self", JSON.stringify((validateDmTargets("me", ["a", "a", "me", "b"]) as any).ids) === JSON.stringify(["a", "b"]));
check("DM with only self rejected", !validateDmTargets("me", ["me"]).ok);
check("DM to 8 others allowed", validateDmTargets("me", ["1", "2", "3", "4", "5", "6", "7", "8"]).ok);
check("DM to 9 others rejected", !validateDmTargets("me", ["1", "2", "3", "4", "5", "6", "7", "8", "9"]).ok);
check("DM targets must be an array", !validateDmTargets("me", "a").ok);

check("emoji colons stripped", normalizeEmojiName(":tada:") === "tada");
check("skin tone kept", normalizeEmojiName("+1::skin-tone-3") === "+1::skin-tone-3");
check("junk emoji rejected", normalizeEmojiName("<script>") === null);

console.log(`\nslackSendRules: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
