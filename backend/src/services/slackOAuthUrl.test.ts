// Regression guard for "logged-out users land on Slack's 'Find your workspace'".
//
// GET /auth/slack sent everyone to the generic https://slack.com/oauth/v2/authorize.
// A browser already signed in to Slack carries the workspace in its session, so
// it went straight to the Allow screen — but a signed-out browser gives Slack no
// workspace to offer, and Slack bounced it to /workspace-signin ("Find your
// workspace"), the join/create-a-workspace flow. The `team=` param does NOT fix
// that (verified: Slack carries it through and still shows the finder); serving
// the authorize page from the workspace's own subdomain does — a signed-out
// browser gets "Sign in to <workspace>" and returns to the Allow screen. Run:
//   cd backend && npx tsx src/services/slackOAuthUrl.test.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildSlackAuthorizeUrl, resolveSlackWorkspace } from "./slackOAuthUrl.js";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; } else { failed++; console.error(`  ✗ ${n}`); }
};

const base = {
  clientId: "123.456",
  redirectUri: "https://api.purduesearch.org/auth/slack/callback",
  userScope: "users:read,users:read.email",
};

// ── Host: the workspace subdomain is the whole fix ───────────
const ws = new URL(buildSlackAuthorizeUrl({ ...base, workspaceUrl: "https://search-club.slack.com/" }));
check("authorize page is served from the workspace subdomain", ws.origin === "https://search-club.slack.com");
check("authorize path is oauth/v2/authorize", ws.pathname === "/oauth/v2/authorize");

const noWs = new URL(buildSlackAuthorizeUrl({ ...base, workspaceUrl: null }));
check("unknown workspace falls back to slack.com (today's behaviour)", noWs.origin === "https://slack.com");

// Never redirect a user to a host Slack didn't vouch for.
for (const bad of [
  "https://evil.example/",
  "https://slack.com.evil.example/",
  "https://evilslack.com/",
  "http://search-club.slack.com/",
  "not a url",
]) {
  const u = new URL(buildSlackAuthorizeUrl({ ...base, workspaceUrl: bad }));
  check(`untrusted workspace url rejected: ${bad}`, u.origin === "https://slack.com");
}

// ── Params survive the host change ───────────────────────────
check("client_id kept", ws.searchParams.get("client_id") === "123.456");
check("user_scope kept", ws.searchParams.get("user_scope") === "users:read,users:read.email");
check("redirect_uri kept", ws.searchParams.get("redirect_uri") === base.redirectUri);
check("empty state omitted", !ws.searchParams.has("state"));
check("null team omitted", !ws.searchParams.has("team"));

const full = new URL(buildSlackAuthorizeUrl({ ...base, state: "abc", teamId: "T0123", workspaceUrl: "https://search-club.slack.com/" }));
check("state passed through", full.searchParams.get("state") === "abc");
check("team passed through", full.searchParams.get("team") === "T0123");

// ── Workspace lookup: cache successes only ───────────────────
const realFetch = globalThis.fetch;
let calls = 0;
let reply: unknown = { ok: false, error: "ratelimited" };
globalThis.fetch = (async () => {
  calls++;
  return { json: async () => reply } as Response;
}) as typeof fetch;
process.env.SLACK_BOT_TOKEN = "xoxb-test";

const quietError = console.error;
console.error = () => {};
const miss = await resolveSlackWorkspace();
console.error = quietError;
check("a failed auth.test yields null (caller falls back to slack.com)", miss === null);

reply = { ok: true, url: "https://search-club.slack.com/", team_id: "T0123" };
const hit = await resolveSlackWorkspace();
check("a failure is not cached — the next login retries", calls === 2);
check("auth.test url is returned", hit?.url === "https://search-club.slack.com/");
check("auth.test team_id is returned", hit?.teamId === "T0123");

await resolveSlackWorkspace();
check("a success is cached — no auth.test per login", calls === 2);
globalThis.fetch = realFetch;

// ── The login route actually uses it ────────────────────────
const here = dirname(fileURLToPath(import.meta.url));
const routeSrc = readFileSync(join(here, "../api/auth.ts"), "utf8");
check("api/auth.ts builds the URL through the service", routeSrc.includes("buildSlackAuthorizeUrl("));
check("api/auth.ts resolves the workspace", routeSrc.includes("resolveSlackWorkspace()"));
check(
  "api/auth.ts no longer hardcodes the generic authorize host",
  !routeSrc.includes('"https://slack.com/oauth/v2/authorize"')
);

console.log(`\nslackOAuthUrl: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
