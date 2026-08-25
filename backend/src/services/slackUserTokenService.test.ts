// Regression guard for the empty "linked Slack channel" picker.
//
// GET /api/slack/channels read the Slack user token from req.session only. Every
// Bearer-authenticated client has no session, and every session expires after 7
// days while GET /auth/me re-issues the Bearer token forever — so the token
// silently became unreachable for everyone and the dropdown rendered empty with
// no error surfaced. Run:
//   cd backend && npx tsx src/services/slackUserTokenService.test.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pickTokenSource, isDeadTokenError, slackErrorCode } from "./slackUserTokenService.js";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; } else { failed++; console.error(`  ✗ ${n}`); }
};

// ── Precedence: the persisted copy is authoritative ──────────
const stored = pickTokenSource("xoxp-stored", undefined);
check("stored token is used", stored.token === "xoxp-stored");
check("stored token needs no backfill", stored.backfill === false);

const both = pickTokenSource("xoxp-stored", "xoxp-session");
check("stored wins over session", both.token === "xoxp-stored");

// THE regression: no session at all (every Bearer client) must still resolve.
const bearerOnly = pickTokenSource("xoxp-stored", null);
check("Bearer client with no session still resolves a token", bearerOnly.token === "xoxp-stored");

// ── Session is a migration path that backfills ───────────────
const legacy = pickTokenSource(null, "xoxp-session");
check("session token is honored when nothing is stored", legacy.token === "xoxp-session");
check("session token is backfilled to the member row", legacy.backfill === true);

// ── Nothing available → null, so callers degrade to the bot ──
const none = pickTokenSource(null, undefined);
check("no token available resolves to null", none.token === null);
check("nothing to backfill when there is no token", none.backfill === false);

// ── Dead-token classification drives the re-auth prompt ──────
check("invalid_auth is a dead token", isDeadTokenError("invalid_auth") === true);
check("token_revoked is a dead token", isDeadTokenError("token_revoked") === true);
check("missing_scope is NOT a dead token", isDeadTokenError("missing_scope") === false);
check("channel_not_found is NOT a dead token", isDeadTokenError("channel_not_found") === false);
check("undefined is NOT a dead token", isDeadTokenError(undefined) === false);

// ── Slack puts the real code at err.data.error, not err.message ──
check(
  "slackErrorCode reads err.data.error",
  slackErrorCode({ data: { error: "missing_scope" }, message: "An API error occurred" }) === "missing_scope"
);
check("slackErrorCode falls back to message", slackErrorCode(new Error("boom")) === "boom");
check("slackErrorCode has a default", slackErrorCode({}) === "unknown_error");

// ── Contract: the route must not read the token off req.session ──
// CLAUDE.md convention: handlers read req.memberId, never req.session. This is
// the file where violating it cost weeks of a silently broken feature.
const here = dirname(fileURLToPath(import.meta.url));
const routeSrc = readFileSync(join(here, "..", "api", "slack.ts"), "utf8");
// Comments in that file explain the rule, so they must not count as violations.
const routeCode = routeSrc
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((l) => !l.trim().startsWith("//"))
  .join("\n");
check(
  "api/slack.ts never touches req.session",
  !/req\.session/.test(routeCode)
);
check(
  "api/slack.ts resolves the token through the service",
  routeSrc.includes("getSlackUserToken(req)")
);

console.log(`\nslackUserTokenService: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
