import type { KnownBlock } from "@slack/types";
import { assertBlockBudget, escapeMrkdwn, priorityDot, trunc } from "./common.js";
export type MemberStub = { slackId: string; displayName: string };
export interface TaskDraft {
  key: string; title: string; projectName: string; dueDate?: string; priority?: string;
  assigneeSlackIds: string[]; duplicate?: { title: string; reason?: string };
}
export function buildTaskDraft(draft: TaskDraft): KnownBlock[] {
  const field = (label: string, value: string) => ({ type: "mrkdwn" as const, text: trunc("*" + label + "*\n" + value, 3000) });
  const button = (label: string, id: string) => ({ type: "button" as const, action_id: id, text: { type: "plain_text" as const, text: label }, value: draft.key });
  const blocks: KnownBlock[] = [
    { type: "header", text: { type: "plain_text", text: trunc(draft.title, 150) || "Task draft" } },
    { type: "section", fields: [field("Project", escapeMrkdwn(draft.projectName)), field("Due", escapeMrkdwn(draft.dueDate || "No due date")),
      field("Assignee", draft.assigneeSlackIds.map(id => "<@" + id + ">").join(" ") || "Unassigned"), field("Priority", priorityDot(draft.priority || "MEDIUM") + " " + (draft.priority || "MEDIUM"))] },
    { type: "context", elements: [{ type: "mrkdwn", text: trunc(draft.duplicate ? "Possible duplicate: *" + escapeMrkdwn(draft.duplicate.title) + "*" + (draft.duplicate.reason ? " — " + escapeMrkdwn(draft.duplicate.reason) : "") : "No duplicate found.", 3000) }] },
    { type: "actions", elements: [{ ...button("Create", "qa_create"), style: "primary" }, button("Edit details…", "qa_edit"),
      ...(draft.duplicate ? [button("Use existing", "qa_existing")] : []), button("Cancel", "qa_cancel")] },
  ];
  assertBlockBudget(blocks, 50);
  return blocks;
}

// Escape special regex chars in a literal string
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Strip punctuation used in names/handles for comparison
function normalize(s: string): string {
  return s.toLowerCase().replace(/[.'\-_]/g, "");
}

// Score how well `query` (a handle or fragment) matches a member's name.
// Returns 0 if no meaningful match.
function nameMatchScore(query: string, member: MemberStub): number {
  const q = normalize(query);
  if (q.length < 2) return 0;

  const parts = member.displayName.toLowerCase().split(/\s+/);
  const firstName = normalize(parts[0] ?? "");
  const lastName = normalize(parts[parts.length - 1] ?? "");
  const fullCompact = normalize(member.displayName);

  if (fullCompact === q) return 100;         // exact full name (no spaces)
  if (firstName === q) return 90;            // exact first name
  if (lastName === q && q.length >= 3) return 70; // exact last name
  if (q.length >= 3 && firstName.startsWith(q)) return 60; // first-name prefix
  if (q.length >= 4 && fullCompact.includes(q)) return 40; // substring of full name

  return 0;
}

// Find the single best-matching member for a query string (used for @handle lookups).
// Returns null if no member scores above the minimum threshold.
function bestMatch(query: string, members: MemberStub[]): MemberStub | null {
  let top: { member: MemberStub; score: number } | null = null;
  for (const m of members) {
    const s = nameMatchScore(query, m);
    if (s > 0 && (!top || s > top.score)) top = { member: m, score: s };
  }
  return top && top.score >= 60 ? top.member : null;
}

// Returns whether a member's display name appears naturally in the text.
function nameAppearsInText(member: MemberStub, lowerText: string): boolean {
  const lowerName = member.displayName.toLowerCase();

  // Full display name verbatim
  if (lowerText.includes(lowerName)) return true;

  const parts = lowerName.split(/\s+/).filter(p => p.length >= 3);

  // Every significant name part present as a whole word (handles "First Last" split across text)
  if (parts.length >= 2 && parts.every(p => new RegExp(`\\b${escapeRegex(p)}\\b`).test(lowerText))) {
    return true;
  }

  // First name only — require ≥ 4 chars to cut down false positives
  const first = parts[0];
  if (first && first.length >= 4 && new RegExp(`\\b${escapeRegex(first)}\\b`).test(lowerText)) {
    return true;
  }

  return false;
}

// Returns Slack user IDs for people mentioned in the text, drawn from `members`.
// Handles three forms: <@USERID> Slack tags, @handle plain text, and natural
// language name references ("have Henry fix this", "assign to Sarah").
export function extractSuggestedAssignees(text: string, members: MemberStub[]): string[] {
  if (members.length === 0) return [];
  const found = new Set<string>();

  // 1. Explicit Slack <@USERID> tags
  for (const match of text.matchAll(/<@([A-Z0-9]+)(?:\|[^>]+)?>/g)) {
    const member = members.find(m => m.slackId === match[1]);
    if (member) found.add(member.slackId);
  }

  // Remove Slack tags before further processing
  const noSlackTags = text.replace(/<@[^>]+>/g, " ");

  // 2. Plain @handle mentions — e.g. "@henry", "@john.smith"
  for (const match of noSlackTags.matchAll(/@([\w.']+)/g)) {
    if (found.size >= 5) break;
    const remaining = members.filter(m => !found.has(m.slackId));
    const member = bestMatch(match[1], remaining);
    if (member) found.add(member.slackId);
  }

  // 3. Natural language names in the remaining text
  const plainText = noSlackTags.replace(/@[\w.']+/g, " ").toLowerCase();
  for (const member of members) {
    if (found.has(member.slackId)) continue;
    if (nameAppearsInText(member, plainText)) found.add(member.slackId);
  }

  return [...found];
}

