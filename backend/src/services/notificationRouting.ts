/** Pure. How one notification reaches a member. */

export const SLACK_MIRROR_TYPES: ReadonlySet<string> = new Set([
  "SLACK_DM", "SLACK_MENTION", "SLACK_THREAD_REPLY", "SLACK_BROADCAST",
]);

type ChannelPref = "both" | "dashboard" | "slack" | "off";

/**
 * `pref` is Member.notificationChannels[type]; anything missing or unknown is
 * "both" (the preferences UI's default). SLACK_* types NEVER go to Slack —
 * they came from there (D9 loop guard).
 */
export function routeFor(type: string, pref: unknown): { inApp: boolean; slack: boolean } {
  const p: ChannelPref = pref === "dashboard" || pref === "slack" || pref === "off" ? pref : "both";
  if (SLACK_MIRROR_TYPES.has(type)) return { inApp: p !== "off", slack: false };
  return { inApp: p === "both" || p === "dashboard", slack: p === "both" || p === "slack" };
}
