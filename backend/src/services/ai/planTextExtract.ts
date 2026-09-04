// Extract a JSON plan from text a human pasted out of a chat UI.
//
// This is deliberately NOT anthropicAdapter's stripFences: that helper is
// anchored ^...$ and only handles a reply that is nothing but a fenced block.
// A real Claude/ChatGPT chat reply writes prose before the fence ("Here's the
// plan:") and after it ("Let me know if you want me to adjust anything"), so
// the payload has to be found rather than trimmed.

function isParseable(s: string): boolean {
  try { JSON.parse(s); return true; } catch { return false; }
}

/** Widest window from the first `open` to the last `close`, or null. */
function spanBetween(text: string, open: string, close: string): string | null {
  const first = text.indexOf(open);
  const last = text.lastIndexOf(close);
  if (first === -1 || last <= first) return null;
  return text.slice(first, last + 1);
}

/**
 * Return the JSON substring of `raw`, or null if there isn't one.
 *
 * Known limitation: prose containing a stray `{` *before* the payload defeats
 * the brace scan. The fenced-block candidate covers that in practice, because
 * a model that writes braces in prose is also a model that fences its JSON.
 */
export function extractJsonBlock(raw: string): string | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;

  const candidates: string[] = [];

  // A fenced block anywhere in the message wins — it is the model's own signal
  // about which part of the reply is the payload.
  const fence = /```(?:json)?\s*\n?([\s\S]*?)```/i.exec(text);
  if (fence?.[1]) candidates.push(fence[1].trim());

  // Otherwise the widest object span and the widest array span, tried in the
  // order they open. Whichever starts first is the outer structure: a reply
  // that is a bare array ("[{ ... }]") opens its `[` before its first `{`, and
  // trying the object span first would silently yield only the array's first
  // element, which parses cleanly and is therefore never caught downstream.
  const spans = [spanBetween(text, "{", "}"), spanBetween(text, "[", "]")]
    .filter((s): s is string => s !== null)
    .sort((a, b) => text.indexOf(a) - text.indexOf(b));
  candidates.push(...spans);

  for (const candidate of candidates) {
    if (candidate && isParseable(candidate)) return candidate;
  }
  return null;
}

/**
 * Pull the raw action list out of a pasted reply. Returns null when nothing
 * plan-shaped was found — the caller distinguishes that from a valid empty plan.
 */
export function parsePastedPlan(raw: string): unknown[] | null {
  const block = extractJsonBlock(raw);
  if (!block) return null;

  let parsed: unknown;
  try { parsed = JSON.parse(block); } catch { return null; }

  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const actions = (parsed as Record<string, unknown>).actions;
    if (Array.isArray(actions)) return actions;
  }
  return null;
}
