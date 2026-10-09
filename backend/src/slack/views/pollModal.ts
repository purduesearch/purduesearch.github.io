import type { KnownBlock, ModalView, InputBlock } from "@slack/types";
import { assertBlockBudget, escapeMrkdwn, trunc } from "./common.js";

export interface SlackPoll {
  id: string; title: string; timezone: string; publicToken: string;
  slotStarts: Array<Date | string>; organizer?: { displayName: string; slackId?: string | null } | null;
  responseDeadline?: Date | string | null;
}
const frontend = () => (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const key = (d: Date | string) => new Date(d).toISOString();

export function buildPollModal(poll: SlackPoll, selected: Array<Date | string>, revision = "0"): ModalView {
  const chosen = new Set(selected.map(key));
  const days = new Map<string, string[]>();
  const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: poll.timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  const label = new Intl.DateTimeFormat("en-US", { timeZone: poll.timezone, weekday: "short", hour: "numeric", minute: "2-digit" });
  const dayLabel = new Intl.DateTimeFormat("en-US", { timeZone: poll.timezone, weekday: "short", month: "short", day: "numeric" });
  for (const slot of [...new Set(poll.slotStarts.map(key))].sort()) {
    const day = localDay.format(new Date(slot));
    days.set(day, [...(days.get(day) ?? []), slot]);
  }
  const groups: InputBlock[] = [];
  for (const slots of days.values()) {
    const count = Math.ceil(slots.length / 10);
    for (let i = 0; i < count; i++) {
      const options = slots.slice(i * 10, (i + 1) * 10).map(value => ({ text: { type: "plain_text" as const, text: label.format(new Date(value)) }, value }));
      const initial = options.filter(option => chosen.has(option.value));
      groups.push({ type: "input", block_id: `poll_slots_${groups.length}_${revision}`, optional: true,
        label: { type: "plain_text", text: `${dayLabel.format(new Date(slots[0]))}${count > 1 ? ` (${i + 1}/${count})` : ""}` },
        element: { type: "checkboxes", action_id: "poll_slots", options, ...(initial.length ? { initial_options: initial } : {}) } });
    }
  }
  const blocks: KnownBlock[] = [{ type: "section", text: { type: "mrkdwn", text: `*${escapeMrkdwn(trunc(poll.title, 250))}*\nTimes in ${escapeMrkdwn(poll.timezone)}` } }, ...groups.slice(0, 97)];
  if (groups.length > 97) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: "Grid too large for Slack — use the full grid. Slots outside this view keep your saved availability." }] });
  blocks.push({ type: "actions", elements: [
    { type: "button", action_id: "poll_usual", text: { type: "plain_text", text: "Use my usual availability" }, value: poll.id },
    { type: "button", action_id: "poll_grid", text: { type: "plain_text", text: "Open full grid ↗" }, url: `${frontend()}/schedule/${encodeURIComponent(poll.publicToken)}` },
  ] });
  assertBlockBudget(blocks, 100);
  return { type: "modal", callback_id: "poll_submit", private_metadata: poll.id, title: { type: "plain_text", text: "Meeting availability" }, submit: { type: "plain_text", text: "Save" }, close: { type: "plain_text", text: "Cancel" }, blocks };
}

export function buildPollInvite(poll: SlackPoll): KnownBlock[] {
  const organizer = poll.organizer?.slackId ? `<@${poll.organizer.slackId}>` : escapeMrkdwn(poll.organizer?.displayName ?? "Constellation");
  const deadline = poll.responseDeadline ? new Intl.DateTimeFormat("en-US", { timeZone: poll.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(poll.responseDeadline)) : "No deadline";
  const blocks: KnownBlock[] = [
    { type: "header", text: { type: "plain_text", text: trunc(poll.title, 150) } },
    { type: "section", text: { type: "mrkdwn", text: `Organizer: ${organizer}\nDeadline: ${deadline}` } },
    { type: "actions", elements: [{ type: "button", action_id: "poll_open", text: { type: "plain_text", text: "Fill in availability" }, value: JSON.stringify({ p: poll.id }), style: "primary" }] },
  ];
  assertBlockBudget(blocks, 50);
  return blocks;
}
