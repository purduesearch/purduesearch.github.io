/**
 * Slack mrkdwn → token array. Pure: no Prisma, no Slack client, no I/O.
 *
 * Called on READ, not on ingest. SlackMessage.text stores the raw mrkdwn as the
 * source of truth, so improving this parser never requires backfilling stored
 * rows, and a member who renames themselves renders correctly retroactively.
 */

export type SlackToken =
  | { type: "text"; value: string }
  | { type: "mention"; slackId: string; label: string }
  | { type: "channel"; slackId: string; label: string }
  | { type: "link"; href: string; label: string }
  | { type: "code"; value: string }
  | { type: "codeblock"; value: string }
  | { type: "emoji"; name: string; url?: string }
  | { type: "bold" | "italic" | "strike"; children: SlackToken[] };

export interface FormatContext {
  /** slackId → display name, for <@U123> resolution. */
  memberNames: Record<string, string>;
  channelNames?: Record<string, string>;
  /** Custom emoji name → image url, from the cached emoji.list. */
  emojiUrls?: Record<string, string>;
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">" };

/**
 * Slack escapes &, < and > in message text. This MUST run after angle parsing:
 * unescaping first would turn a literal "&lt;" into "<" and the tokenizer would
 * then read it as the start of a tag.
 */
function unescapeSlack(s: string): string {
  return s.replace(/&(amp|lt|gt);/g, (m) => ENTITIES[m] ?? m);
}

/**
 * Split on a paired delimiter (``` or `). With an odd number of delimiters the
 * last one is unmatched: everything after it is plain text with the delimiter
 * restored, so a stray backtick can never swallow the rest of a message.
 */
function splitPaired(s: string, delim: string): { text: string; delimited: boolean }[] {
  const parts = s.split(delim);
  const delimCount = parts.length - 1;
  const lastPaired = delimCount - (delimCount % 2);
  return parts.map((text, i) => {
    if (i % 2 === 1 && i <= lastPaired) return { text, delimited: true };
    return { text: i > lastPaired && i > 0 ? delim + text : text, delimited: false };
  });
}

function splitOnce(s: string, sep: string): [string, string | undefined] {
  const i = s.indexOf(sep);
  return i === -1 ? [s, undefined] : [s.slice(0, i), s.slice(i + 1)];
}

/** One <...> entity: <@U123|label>, <#C123|name>, <!here>, <url|label>. */
function parseAngle(body: string, ctx: FormatContext): SlackToken {
  const [target, label] = splitOnce(body, "|");

  if (target.startsWith("@")) {
    const slackId = target.slice(1);
    return { type: "mention", slackId, label: label || ctx.memberNames[slackId] || slackId };
  }
  if (target.startsWith("#")) {
    const slackId = target.slice(1);
    return { type: "channel", slackId, label: label || ctx.channelNames?.[slackId] || slackId };
  }
  if (target.startsWith("!")) {
    // Broadcast pseudo-mentions: <!here>, <!channel>, <!everyone>.
    return { type: "mention", slackId: target, label: label || `@${target.slice(1)}` };
  }
  // Slack link entities never contain whitespace. A "<...>" run that does is a
  // literal pair of angle brackets the author typed, not a tag: restore it as
  // text rather than inventing a link out of "a < b > c".
  if (/\s/.test(target)) {
    return { type: "text", value: unescapeSlack(`<${body}>`) };
  }
  const href = unescapeSlack(target);
  return { type: "link", href, label: label ? unescapeSlack(label) : href };
}

/** :emoji: within a run of plain text. */
function tokenizeEmoji(text: string, ctx: FormatContext): SlackToken[] {
  const out: SlackToken[] = [];
  let last = 0;
  for (const m of text.matchAll(/:([a-z0-9_+'-]+):/g)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ type: "text", value: unescapeSlack(text.slice(last, at)) });
    out.push({ type: "emoji", name: m[1], url: ctx.emojiUrls?.[m[1]] });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: unescapeSlack(text.slice(last)) });
  return out;
}

/** A non-code run: <...> entities first, then emoji in what's left. */
function tokenizePlain(seg: string, ctx: FormatContext): SlackToken[] {
  const out: SlackToken[] = [];
  let last = 0;
  for (const m of seg.matchAll(/<([^<>]+)>/g)) {
    const at = m.index ?? 0;
    if (at > last) out.push(...tokenizeEmoji(seg.slice(last, at), ctx));
    out.push(parseAngle(m[1], ctx));
    last = at + m[0].length;
  }
  if (last < seg.length) out.push(...tokenizeEmoji(seg.slice(last), ctx));
  return out;
}

// ── Emphasis: *bold*, _italic_, ~strike~ ─────────────────────

const EMPHASIS = { "*": "bold", _: "italic", "~": "strike" } as const;
type Delim = keyof typeof EMPHASIS;

/**
 * One unit of the emphasis pass: a single character of plain text, or a whole
 * already-parsed token. Code, links, mentions and emoji are opaque atoms, so a
 * delimiter inside one can never open or close a span — `*` in inline code or
 * `_` in a URL stays literal without any special casing.
 */
type Atom = string | SlackToken;

const isDelim = (a: Atom | undefined): a is Delim => a === "*" || a === "_" || a === "~";
const isSpace = (a: Atom | undefined) => typeof a === "string" && /\s/.test(a);
/** Line start/end, whitespace, punctuation, or an entity token. */
const isEdge = (a: Atom | undefined) => typeof a !== "string" || !/[\p{L}\p{N}]/u.test(a);
/** Spans never cross a line break or a code block, matching Slack. */
const isBarrier = (a: Atom) => a === "\n" || (typeof a !== "string" && a.type === "codeblock");

/**
 * Slack's flanking rules: an opener follows an edge and precedes non-space; a
 * closer follows non-space and precedes an edge. This is what keeps
 * `snake_case_names` and `2*3*4` literal.
 */
function isOpener(atoms: Atom[], k: number): boolean {
  const next = atoms[k + 1];
  return isEdge(atoms[k - 1]) && next !== undefined && !isSpace(next) && next !== atoms[k];
}
function isCloser(atoms: Atom[], k: number): boolean {
  const prev = atoms[k - 1];
  return prev !== undefined && !isSpace(prev) && prev !== atoms[k] && isEdge(atoms[k + 1]);
}

/** Index of the first element of an ascending list greater than x, or -1. */
function firstAfter(sorted: number[], x: number): number {
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= x) lo = mid + 1; else hi = mid;
  }
  return lo < sorted.length ? sorted[lo] : -1;
}

/**
 * Wrap *bold*, _italic_ and ~strike~ spans, nesting as written. Each opener
 * pairs with the first valid closer of the same delimiter; one with no closer
 * stays literal text. Also collapses consecutive text and drops empty text.
 */
function emphasize(tokens: SlackToken[]): SlackToken[] {
  const atoms: Atom[] = [];
  for (const t of tokens) {
    // A loop, not push(...chars): spreading a 40k-char message overflows the stack.
    if (t.type === "text") for (const ch of t.value) atoms.push(ch);
    else atoms.push(t);
  }
  const n = atoms.length;

  // First barrier at or after each index.
  const barrier = new Int32Array(n + 1);
  barrier[n] = n;
  for (let k = n - 1; k >= 0; k--) barrier[k] = isBarrier(atoms[k]) ? k : barrier[k + 1];

  // Closer positions per delimiter, ascending, so each opener finds its closer
  // by binary search — a message of thousands of unmatched `*`s stays fast.
  const closers: Record<Delim, number[]> = { "*": [], _: [], "~": [] };
  for (let k = 0; k < n; k++) {
    const a = atoms[k];
    if (isDelim(a) && isCloser(atoms, k)) closers[a].push(k);
  }

  const build = (from: number, to: number): SlackToken[] => {
    const out: SlackToken[] = [];
    let text = "";
    const flush = () => { if (text) { out.push({ type: "text", value: text }); text = ""; } };

    for (let k = from; k < to; k++) {
      const a = atoms[k];
      if (isDelim(a) && isOpener(atoms, k)) {
        const c = firstAfter(closers[a], k + 1);
        if (c !== -1 && c < to && c < barrier[k]) {
          flush();
          out.push({ type: EMPHASIS[a], children: build(k + 1, c) });
          k = c;
          continue;
        }
      }
      if (typeof a === "string") text += a;
      else { flush(); out.push(a); }
    }
    flush();
    return out;
  };

  return build(0, n);
}

export function formatSlackText(raw: string, ctx: FormatContext): SlackToken[] {
  if (!raw) return [];
  const tokens: SlackToken[] = [];

  for (const fence of splitPaired(raw, "```")) {
    if (fence.delimited) {
      tokens.push({ type: "codeblock", value: unescapeSlack(fence.text.replace(/^\n/, "").replace(/\n$/, "")) });
      continue;
    }
    for (const inline of splitPaired(fence.text, "`")) {
      if (inline.delimited) tokens.push({ type: "code", value: unescapeSlack(inline.text) });
      else tokens.push(...tokenizePlain(inline.text, ctx));
    }
  }

  return emphasize(tokens);
}
