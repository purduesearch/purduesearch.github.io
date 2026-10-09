import type { Button, KnownBlock } from "@slack/types";
import type { EntityRef } from "../../services/slackUnfurlCore.js";
import { assertBlockBudget, escapeMrkdwn, LIMITS, trunc } from "./common.js";

export interface UnfurlPreview {
  title: string;
  pill: string;
  facts: string[];
  action?: { label: string; actionId: string; value: object };
}

const labels: Partial<Record<EntityRef["type"], string>> = {
  TASK: "Task", VAULT_ITEM: "CAD vault item", CHANGE_REQUEST: "Change request", EVENT: "Event", PROJECT: "Project",
};
const safe = (text: string, limit: number) => escapeMrkdwn(trunc(text, Math.floor(limit / 5)));

/** Only pass a preview after checking the entity's actual project/channel linkage. */
export function buildUnfurlBlocks(ref: EntityRef, url: string, preview?: UnfurlPreview | null): KnownBlock[] {
  const open: Button = { type: "button", action_id: "uf_open", text: { type: "plain_text", text: "Open" }, url };
  const blocks: KnownBlock[] = preview ? [
    { type: "header", text: { type: "plain_text", text: trunc(preview.title, LIMITS.headerText) || "Constellation" } },
    { type: "section", text: { type: "mrkdwn", text: [safe(preview.pill, 500), ...preview.facts.slice(0, 3).map(f => safe(f, 700))].join("\n") } },
  ] : [{ type: "section", text: { type: "plain_text", text: `Constellation · ${labels[ref.type] ?? "Item"}` } }];
  const elements: Button[] = [open];
  if (preview?.action) elements.push({ type: "button", action_id: preview.action.actionId,
    text: { type: "plain_text", text: trunc(preview.action.label, LIMITS.buttonText) }, value: JSON.stringify(preview.action.value) });
  blocks.push({ type: "actions", elements });
  assertBlockBudget(blocks, LIMITS.messageBlocks);
  return blocks;
}
