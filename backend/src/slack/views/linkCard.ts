import type { KnownBlock, Overflow } from "@slack/types";
import type { Candidate } from "../../services/slackMentionService.js";
import { assertBlockBudget, escapeMrkdwn, LIMITS, statusPill, trunc } from "./common.js";

type OverflowOption = Overflow["options"][number];

export interface LinkCardItem {
  linkId: string;
  kind: Candidate["kind"];
  title: string;
  url?: string | null;
  status?: string | null;
  meta?: string;
  linkedBySlackId?: string | null;
  checkedOutById?: string | null;
}

export function buildLinkCard(items: LinkCardItem[], ctx: { linkedBySlackId?: string | null; githubEmojiAvailable?: boolean } = {}): KnownBlock[] {
  const emoji: Record<string, string> = { TASK: ":white_check_mark:", VAULT_ITEM: ":gear:",
    GITHUB: ctx.githubEmojiAvailable ? ":octocat:" : ":link:", DRIVE_FILE: ":page_facing_up:", MILESTONE: ":dart:" };
  const supported = items.filter(item => Object.hasOwn(emoji, item.kind));
  const blocks: KnownBlock[] = supported.slice(0, LIMITS.messageBlocks - 1).map(item => {
    const option = (label: string, action: string): OverflowOption => ({ text: { type: "plain_text", text: label }, value: JSON.stringify({ l: item.linkId, a: action }) });
    const options: OverflowOption[] = [];
    if (item.url) options.push({ ...option("Open", "open"), url: item.url });
    else options.push(option("Open", "open"));
    if (item.kind === "TASK" && item.status !== "DONE") options.push(option("Mark done", "done"));
    if (item.kind === "VAULT_ITEM" && !item.checkedOutById && item.status !== "CHECKED_OUT") options.push(option("Check out", "checkout"));
    options.push(option("Unlink", "unlink"));
    const title = escapeMrkdwn(trunc(item.title, 500)) || "Untitled";
    const link = item.url ? `<${item.url}|${title}>` : title;
    const facts = [item.status ? escapeMrkdwn(statusPill(item.status)) : "", item.meta ? escapeMrkdwn(trunc(item.meta, 1000)) : ""].filter(Boolean).join(" · ");
    return { type: "section", text: { type: "mrkdwn", text: `${emoji[item.kind]} *${link}*${facts ? `\n${facts}` : ""}` },
      accessory: { type: "overflow", action_id: "lc_item", options } };
  });
  const linker = ctx.linkedBySlackId ?? supported.find(item => item.linkedBySlackId)?.linkedBySlackId;
  const hidden = supported.length - blocks.length;
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `${linker ? `Linked by <@${linker}>` : "Linked items"} · statuses update live${hidden > 0 ? ` · +${hidden} more linked items — open in Constellation` : ""}` }] });
  assertBlockBudget(blocks, LIMITS.messageBlocks);
  return blocks;
}
