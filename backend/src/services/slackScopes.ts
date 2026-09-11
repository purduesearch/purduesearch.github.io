/**
 * The Slack USER scopes Constellation requests, and what each unlocks.
 *
 * Pure — no Slack, no Prisma — so the sign-in route (auth.ts), /auth/me, and
 * every write path agree on one definition, and it is unit-testable.
 */
export const SLACK_USER_SCOPES = [
  // Pre-portal: roster, the channel picker, inviting the bot.
  "users:read", "users:read.email",
  "channels:read", "groups:read", "mpim:read", "im:read",
  "channels:write.invites", "groups:write.invites",
  // Portal: read history the bot cannot see (DMs, private channels it isn't in).
  "channels:history", "groups:history", "im:history", "mpim:history",
  // Portal: act as the member.
  "chat:write", "reactions:write", "files:read", "files:write",
  "im:write", "mpim:write",
  // Portal: read cursors (conversations.mark) and joining public channels.
  "channels:write", "groups:write",
] as const;

export type SlackCapability = "read" | "post" | "dm" | "react" | "files" | "mark" | "join";

const REQUIRES: Record<SlackCapability, readonly string[]> = {
  read:  ["channels:history", "groups:history", "im:history", "mpim:history", "im:read", "mpim:read"],
  post:  ["chat:write"],
  dm:    ["chat:write", "im:write", "mpim:write", "im:history", "mpim:history"],
  react: ["reactions:write"],
  files: ["files:read", "files:write"],
  mark:  ["channels:write", "groups:write", "im:write", "mpim:write"],
  join:  ["channels:write"],
};

/** Slack returns granted scopes as one comma-separated string. */
export function parseScopes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
}

export function hasCapability(granted: readonly string[], cap: SlackCapability): boolean {
  const set = new Set(granted);
  return REQUIRES[cap].every((s) => set.has(s));
}

export function capabilitiesOf(granted: readonly string[]): Record<SlackCapability, boolean> {
  const out = {} as Record<SlackCapability, boolean>;
  for (const cap of Object.keys(REQUIRES) as SlackCapability[]) out[cap] = hasCapability(granted, cap);
  return out;
}

/** True when the member must run Slack sign-in again to get the portal scopes. */
export function needsReconnect(granted: readonly string[]): boolean {
  const set = new Set(granted);
  return !SLACK_USER_SCOPES.every((s) => set.has(s));
}
