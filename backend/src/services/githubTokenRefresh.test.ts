// Regression guard for "the GitHub connection breaks and only re-logging fixes it".
//
// api/githubAuth.ts persisted githubRefreshToken + githubTokenExpiresAt from the
// day it was written, but octokitForMember() selected only githubAccessToken, so
// nothing ever read them back. A GitHub App with expiring user tokens kills the
// access token after 8 hours; with no refresh path the connection went dead
// overnight and the UI's "Token expired — click to reconnect" pill was the only
// remedy. Run:
//   cd backend && npx tsx src/services/githubTokenRefresh.test.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { needsRefresh, classifyRefreshResponse } from "./githubService.js";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; } else { failed++; console.error(`  ✗ ${n}`); }
};

const NOW = Date.UTC(2026, 8, 3, 12, 0, 0);
const at = (msFromNow: number) => new Date(NOW + msFromNow);

// ── needsRefresh: when do we go get a new token? ─────────────
// A null expiry is the App-without-token-expiration config. Refreshing there
// would be a pointless round trip on every single GitHub call.
check("null expiry never refreshes", needsRefresh(null, NOW) === false);
check("undefined expiry never refreshes", needsRefresh(undefined, NOW) === false);

// THE regression: a token that expired hours ago was used verbatim and 401'd.
check("expired token refreshes", needsRefresh(at(-3_600_000), NOW) === true);
check("token expiring right now refreshes", needsRefresh(at(0), NOW) === true);

// The skew window — a token with 30s left would die mid-request.
check("token inside the skew window refreshes", needsRefresh(at(30_000), NOW) === true);
check("token outside the skew window does not", needsRefresh(at(120_000), NOW) === false);
check("fresh 8-hour token does not refresh", needsRefresh(at(8 * 3_600_000), NOW) === false);

// ── classifyRefreshResponse: GitHub returns 200 on failure ───
// The status code carries no signal; only the body does. Reading the status
// would treat every dead refresh token as a success.
const ok = classifyRefreshResponse(
  { access_token: "gho_new", refresh_token: "ghr_new", expires_in: 28_800 },
  NOW
);
check("success is classified ok", ok.kind === "ok");
check("success carries the new access token", ok.kind === "ok" && ok.accessToken === "gho_new");
check("success carries the rotated refresh token", ok.kind === "ok" && ok.refreshToken === "ghr_new");
check(
  "expires_in becomes an absolute expiry",
  ok.kind === "ok" && ok.expiresAt?.getTime() === NOW + 28_800_000
);

// A refresh response with no expires_in means non-expiring — must not be
// recorded as "expires at the epoch", which would refresh on every call.
const okNoExpiry = classifyRefreshResponse({ access_token: "gho_new" }, NOW);
check("missing expires_in yields a null expiry", okNoExpiry.kind === "ok" && okNoExpiry.expiresAt === null);
check(
  "a null expiry from a refresh does not re-trigger a refresh",
  okNoExpiry.kind === "ok" && needsRefresh(okNoExpiry.expiresAt, NOW) === false
);

// ── dead vs transient decides whether we log the member out ──
// Only a genuinely revoked/lapsed grant may clear the credential. Clearing on a
// network blip would recreate the exact bug we are fixing.
for (const e of ["bad_refresh_token", "invalid_grant", "unauthorized_client", "access_denied"]) {
  const r = classifyRefreshResponse({ error: e }, NOW);
  check(`${e} is dead`, r.kind === "dead");
}
for (const e of ["server_error", "rate_limited", "temporarily_unavailable"]) {
  const r = classifyRefreshResponse({ error: e }, NOW);
  check(`${e} is transient`, r.kind === "transient");
}
// A 200 with neither a token nor an error is malformed, not proof of revocation.
check("empty body is transient", classifyRefreshResponse({}, NOW).kind === "transient");

// ── Contract: octokitForMember must actually consult the refresh path ──
// The original bug was purely a `select` that omitted two columns, which no
// unit test on pure helpers can catch.
const here = dirname(fileURLToPath(import.meta.url));
const svc = readFileSync(join(here, "githubService.ts"), "utf8");
const octokitForMemberBody = svc.slice(
  svc.indexOf("export async function octokitForMember"),
  svc.indexOf("* Pick the best Octokit for a project's repo")
);
check(
  "octokitForMember selects githubRefreshToken",
  octokitForMemberBody.includes("githubRefreshToken")
);
check(
  "octokitForMember selects githubTokenExpiresAt",
  octokitForMemberBody.includes("githubTokenExpiresAt")
);
check("octokitForMember calls needsRefresh", octokitForMemberBody.includes("needsRefresh("));
check(
  "octokitForMember calls refreshMemberGithubToken",
  octokitForMemberBody.includes("refreshMemberGithubToken(")
);
// Concurrent refreshes would burn the rotated token; the dedupe map is load-bearing.
check("refreshes are deduped per member", svc.includes("inFlightRefresh"));

console.log(`\ngithubTokenRefresh: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
