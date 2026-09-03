// Every call here routes through aiRouter, which spends the editing member's own
// linked key when they have one.
import { runJson, runText, todayContext } from "./ai/aiRouter.js";

export type AiEdit = { find: string; replace: string; rationale: string };

type PMNodeish = { type?: string; text?: string; content?: PMNodeish[]; attrs?: Record<string, unknown> };

const BLOCK_TYPES = new Set([
  "paragraph", "heading", "blockquote", "listItem", "taskItem", "codeBlock", "tableCell", "tableHeader",
]);

/**
 * Flatten a TipTap document to plain text, one line per block. Block-level
 * separation matters: the model needs to see paragraph boundaries to quote a
 * whole sentence, and run-together text produces quotes that span blocks and
 * can never be located in the document.
 */
export function docToPlainText(doc: unknown): string {
  const lines: string[] = [];
  let current = "";

  const walk = (node: PMNodeish | undefined) => {
    if (!node) return;
    if (node.type === "text") { current += node.text ?? ""; return; }
    // Atom nodes with useful prose in their attrs.
    if (node.type === "hero") {
      lines.push(String(node.attrs?.heading ?? ""), String(node.attrs?.subheading ?? ""));
      return;
    }
    if (node.type === "ctaButton") { lines.push(String(node.attrs?.label ?? "")); return; }

    const isBlock = !!node.type && BLOCK_TYPES.has(node.type);
    if (isBlock) current = "";
    node.content?.forEach(walk);
    if (isBlock) {
      const text = current.trim();
      if (text) lines.push(text);
      current = "";
    }
  };

  walk(doc as PMNodeish);
  return lines.filter(Boolean).join("\n\n");
}

const MAX_DOC_CHARS = 24_000;

function docContext(title: string, doc: unknown): string {
  const text = docToPlainText(doc);
  const clipped = text.length > MAX_DOC_CHARS
    ? `${text.slice(0, MAX_DOC_CHARS)}\n\n[Post truncated for length]`
    : text;
  return `TITLE: ${title || "(untitled)"}\n\nPOST BODY:\n${clipped}`;
}

export async function askAboutDoc(
  args: { title: string; doc: unknown; question: string; memberId?: string | null }
): Promise<string> {
  const prompt = `${todayContext()}

You are an editorial assistant for the Purdue SEARCH student club's blog. Answer the
question about the draft below. Be concrete and brief — a few sentences unless more is
genuinely needed. If the draft does not contain the answer, say so plainly rather than
inventing facts about the club, its projects, or its people.

${docContext(args.title, args.doc)}

QUESTION: ${args.question}`;

  // runText swallows every failure into "" — the same contract the previous direct
  // complex-lane call had. Left alone that reaches the panel as a 200 with an empty
  // answer, which reads as "the AI ignored me" — the symptom that hid a broken
  // complex-model config. Surface it instead.
  const answer = await runText({ memberId: args.memberId }, "high", { prompt, json: false });
  if (!answer) throw new Error("The AI service did not return an answer");
  return answer;
}

const EDIT_RULES = `Return JSON of the form:
{"edits":[{"find":"...","replace":"...","rationale":"..."}]}

Rules, all mandatory:
- "find" MUST be text copied VERBATIM from the post body, character for character.
  Never paraphrase it, never re-punctuate it, never add or remove whitespace.
- "find" must be long enough to occur exactly once — include surrounding words if a
  short phrase would be ambiguous.
- "find" must stay within a single paragraph. Never span a blank line.
- "replace" is the full replacement for "find". Use an empty string to delete it.
- "rationale" is at most 12 words explaining why.
- Return at most 12 edits, the highest-value ones only.
- Do not invent facts, names, dates or numbers that are not already in the post.
- Return {"edits":[]} if nothing needs changing.`;

export async function suggestEdits(args: {
  title: string;
  doc: unknown;
  instruction: string;
  scope: "selection" | "document";
  selection?: string;
  memberId?: string | null;
}): Promise<AiEdit[]> {
  const isSelection = args.scope === "selection";

  const prompt = isSelection
    ? `${todayContext()}

You are a copy editor for the Purdue SEARCH student club's blog. Apply this instruction
to the SELECTED TEXT only, leaving the rest of the post untouched. The selected text is
quoted from the post body, which is given for context.

INSTRUCTION: ${args.instruction}

SELECTED TEXT:
${args.selection ?? ""}

${docContext(args.title, args.doc)}

${EDIT_RULES}
Every "find" must be inside the SELECTED TEXT above.`
    : `${todayContext()}

You are a copy editor for the Purdue SEARCH student club's blog. Apply this instruction
across the whole draft below, as a set of targeted edits.

INSTRUCTION: ${args.instruction}

${docContext(args.title, args.doc)}

${EDIT_RULES}`;

  // Whole-post edits get the reasoning-class model (it already falls back to the
  // standard model when the daily quota is spent); selection edits are small
  // enough for the standard lane.
  const result = isSelection
    ? await runJson<{ edits?: AiEdit[] }>({ memberId: args.memberId }, "medium", {
        prompt, json: true,
      })
    : await runJson<{ edits?: AiEdit[] }>({ memberId: args.memberId }, "high", {
        prompt, json: true, maxOutputTokens: 4096,
      });

  // null means the call itself failed — a model that genuinely found nothing to
  // change returns {"edits":[]}, which parses to a non-null object. Collapsing
  // the two made a whole-post failure show the success toast "Nothing to change".
  if (result === null) throw new Error("The AI service did not return a usable response");
  if (!Array.isArray(result.edits)) return [];

  return result.edits
    .filter((e) => e && typeof e.find === "string" && e.find.trim().length > 0
                && typeof e.replace === "string")
    .slice(0, 12)
    .map((e) => ({
      find: e.find,
      replace: e.replace,
      rationale: typeof e.rationale === "string" ? e.rationale.slice(0, 120) : "",
    }));
}

export async function completeText(
  args: { title: string; before: string; memberId?: string | null }
): Promise<string> {
  const prompt = `Continue this blog draft for the Purdue SEARCH student club.

Write ONLY the continuation — no preamble, no quotes, no markdown, no explanation.
At most 25 words. Match the existing voice and tense. Stop at a natural break.
If the text already ends a complete thought, continue with the next sentence.
Do not invent specific facts, names, dates or numbers.

TITLE: ${args.title || "(untitled)"}

TEXT SO FAR:
${args.before}`;

  // Tier "low" — the inline autocomplete lane. It fires on every keystroke pause, so
  // it must stay the cheapest model the member has configured, never the high tier.
  const out = await runText({ memberId: args.memberId }, "low", { prompt, json: false });
  // Models sometimes wrap the continuation in quotes or restate the prompt tail.
  return out.replace(/^["'“”]+|["'“”]+$/g, "").trim();
}
