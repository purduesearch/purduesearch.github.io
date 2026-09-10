// Builds the "Sign in with Slack" authorize URL on the workspace's own subdomain.
//
// The generic https://slack.com/oauth/v2/authorize only works for browsers that
// are already signed in to Slack. A signed-out browser gives Slack no workspace
// to offer, so Slack sends it to /workspace-signin ("Find your workspace") — the
// join/create-a-workspace flow — and `team=` does not change that. Served from
// https://<workspace>.slack.com instead, a signed-out user gets "Sign in to
// <workspace>" and is returned to the Allow screen afterwards.

export interface SlackWorkspace {
  url: string;
  teamId: string | null;
}

// Only an https *.slack.com origin is trusted as the authorize host — this value
// becomes a redirect target for every login.
function workspaceOrigin(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    if (u.hostname !== "slack.com" && !u.hostname.endsWith(".slack.com")) return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function buildSlackAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  userScope: string;
  state?: string;
  teamId?: string | null;
  workspaceUrl?: string | null;
}): string {
  const origin = workspaceOrigin(opts.workspaceUrl) ?? "https://slack.com";
  const url = new URL("/oauth/v2/authorize", origin);
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("user_scope", opts.userScope);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  if (opts.state) url.searchParams.set("state", opts.state);
  if (opts.teamId) url.searchParams.set("team", opts.teamId);
  return url.toString();
}

// Cached after the first success — the bot token's workspace never changes at
// runtime. Failures are not cached, so a Slack blip at the first login doesn't
// pin every later login to the generic page until the next restart.
let _workspace: SlackWorkspace | null = null;

export async function resolveSlackWorkspace(): Promise<SlackWorkspace | null> {
  if (_workspace) return _workspace;
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch("https://slack.com/api/auth.test", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      // A hung Slack API must not hang the login redirect; slack.com still works.
      signal: AbortSignal.timeout(3000),
    });
    const data = (await res.json()) as { ok: boolean; url?: string; team_id?: string; error?: string };
    if (!data.ok || !data.url) {
      console.error("resolveSlackWorkspace: auth.test failed:", data.error ?? "no url");
      return null;
    }
    _workspace = { url: data.url, teamId: data.team_id ?? null };
    return _workspace;
  } catch (err) {
    console.error("resolveSlackWorkspace: auth.test failed:", err);
    return null;
  }
}
