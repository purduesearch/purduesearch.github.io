import type { KnownBlock, ModalView, PlainTextOption } from "@slack/types";
import type { Candidate, Recommendation } from "../../services/slackMentionService.js";
import { assertBlockBudget, LIMITS, trunc } from "./common.js";

export const ATTACH_GROUPS = [
  { kind: "TASK", label: "TASKS", action: "as_tasks" },
  { kind: "VAULT_ITEM", label: "CAD VAULT", action: "as_vault" },
  { kind: "GITHUB", label: "GITHUB", action: "as_github" },
  { kind: "DRIVE_FILE", label: "DRIVE", action: "as_drive" },
  { kind: "MILESTONE", label: "MILESTONES", action: "as_milestones" },
] as const;

function candidateOption(candidate: Candidate, reason?: string): PlainTextOption {
  return { text: { type: "plain_text", text: trunc(`${candidate.title}${candidate.meta ? ` · ${candidate.meta}` : ""}`, LIMITS.optionText) || "Untitled" },
    value: candidate.key,
    ...(reason ? { description: { type: "plain_text" as const, text: trunc(reason, LIMITS.optionDescription) } } : {}) };
}

function groupPicks(picks: Recommendation["picks"], kind: Candidate["kind"], limit: number) {
  const seen = new Set<string>();
  return picks.filter(pick => {
    if (pick.candidate.kind !== kind || seen.has(pick.candidate.key)) return false;
    seen.add(pick.candidate.key);
    return true;
  }).slice(0, limit);
}

export function buildAttachPicker(rec: Recommendation, ctx: { pickerId: string; aiUsed: boolean }): KnownBlock[] {
  const blocks: KnownBlock[] = [{ type: "section", text: { type: "mrkdwn", text: "I read your message. Pick what to attach:" } }];
  if (!ctx.aiUsed) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: "AI was unavailable — showing word matches" }] });
  for (const group of ATTACH_GROUPS) {
    const picks = groupPicks(rec.picks, group.kind, 5);
    if (!picks.length) continue;
    const options = picks.map(pick => candidateOption(pick.candidate, pick.reason));
    const initial = options.filter((_, index) => picks[index].confidence >= 0.5);
    blocks.push({ type: "context", elements: [{ type: "plain_text", text: group.label }] },
      { type: "actions", block_id: `ap_${group.kind}`, elements: [{ type: "checkboxes", action_id: `ap_${group.kind}`, options,
        ...(initial.length ? { initial_options: initial } : {}) }] });
  }
  blocks.push({ type: "actions", elements: [
    { type: "button", action_id: "ap_attach", text: { type: "plain_text", text: "Attach" }, style: "primary", value: ctx.pickerId },
    { type: "button", action_id: "ap_search", text: { type: "plain_text", text: "Search for more…" }, value: ctx.pickerId },
    { type: "button", action_id: "ap_dismiss", text: { type: "plain_text", text: "Dismiss" }, value: ctx.pickerId },
  ] });
  assertBlockBudget(blocks, LIMITS.messageBlocks);
  return blocks;
}

export function buildAttachSearchModal(prefill: Recommendation | Recommendation["picks"], ctx: { pickerId?: string } = {}): ModalView {
  const picks = Array.isArray(prefill) ? prefill : prefill.picks;
  const blocks: KnownBlock[] = ATTACH_GROUPS.map(group => {
    const initial = groupPicks(picks, group.kind, 100).filter(pick => pick.confidence >= 0.5).map(pick => candidateOption(pick.candidate));
    return { type: "input", block_id: group.action, optional: true,
      label: { type: "plain_text", text: group.label },
      element: { type: "multi_external_select", action_id: group.action, min_query_length: 0,
        placeholder: { type: "plain_text", text: "Search for items" },
        ...(initial.length ? { initial_options: initial } : {}) } };
  });
  assertBlockBudget(blocks, LIMITS.viewBlocks);
  return { type: "modal", callback_id: "as_submit", private_metadata: ctx.pickerId ?? "",
    title: { type: "plain_text", text: "Attach items" }, submit: { type: "plain_text", text: "Attach" },
    close: { type: "plain_text", text: "Cancel" }, blocks };
}
