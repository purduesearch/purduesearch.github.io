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
  | { type: "emoji"; name: string; url?: string };

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

/** Collapse consecutive text tokens and drop empty ones. */
function mergeText(tokens: SlackToken[]): SlackToken[] {
  const out: SlackToken[] = [];
  for (const t of tokens) {
    if (t.type !== "text") { out.push(t); continue; }
    if (t.value === "") continue;
    const prev = out[out.length - 1];
    if (prev && prev.type === "text") prev.value += t.value;
    else out.push({ ...t });
  }
  return out;
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

  return mergeText(tokens);
}
