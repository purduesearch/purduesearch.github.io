import type { KnownBlock, SectionBlock } from "@slack/types";
import { assertBlockBudget, escapeMrkdwn, trunc } from "./common.js";

export interface EventCard {
  id: string; title: string; startsAt: Date | string; location?: string | null;
  going: boolean; count?: number; url: string;
}

export function eventTime(date: Date | string, timezone?: string | null): string {
  const opts: Intl.DateTimeFormatOptions = { timeZone: timezone || "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" };
  try { return new Intl.DateTimeFormat("en-US", opts).format(new Date(date)); }
  catch { return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "America/New_York" }).format(new Date(date)); }
}

export function buildEventRow(event: EventCard, timezone?: string | null): SectionBlock {
  return {
    type: "section",
    text: { type: "mrkdwn", text: `*<${event.url}|${escapeMrkdwn(trunc(event.title, 180))}>*\n${eventTime(event.startsAt, timezone)}${event.location ? ` · ${escapeMrkdwn(trunc(event.location, 180))}` : ""} · ${event.count ?? 0} going` },
    accessory: { type: "button", action_id: "cal_rsvp", text: { type: "plain_text", text: event.going ? "Going ✓ · Cancel" : "RSVP" }, value: JSON.stringify({ e: event.id, g: !event.going }), ...(event.going ? { style: "primary" as const } : {}) },
  };
}

export function buildEventList(events: EventCard[], timezone?: string | null): KnownBlock[] {
  const blocks: KnownBlock[] = [{ type: "section", text: { type: "mrkdwn", text: "*Events · Next 7 days*" } }];
  if (!events.length) blocks.push({ type: "section", text: { type: "mrkdwn", text: "No events in the next 7 days." } });
  for (const event of events.slice(0, 48)) blocks.push(buildEventRow(event, timezone));
  if (events.length > 48) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `+${events.length - 48} more — open the Constellation calendar.` }] });
  assertBlockBudget(blocks, 50);
  return blocks;
}
