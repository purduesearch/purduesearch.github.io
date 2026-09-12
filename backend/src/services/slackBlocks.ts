import { formatSlackText, type FormatContext, type SlackToken } from "./slackMessageFormat.js";

/**
 * Pure. A bot message's raw { blocks, attachments } → a small render tree the
 * UI can draw with ChatRichText. Rendered on READ, like message text, so a
 * better renderer never needs a backfill.
 *
 * Interactive elements (buttons, selects) become inert labels: only the app
 * that owns them receives the click, and that is not us (plan: known limits).
 * Image URLs are dropped (alt text only) so a bot cannot make every viewer
 * fetch a tracking pixel. Links are limited to http(s)/mailto.
 */
export type RenderedBlock =
  | { type: "header"; text: string }
  | { type: "section"; tokens: SlackToken[]; fields: SlackToken[][] }
  | { type: "context"; tokens: SlackToken[] }
  | { type: "divider" }
  | { type: "actions"; labels: string[] }
  | { type: "image"; alt: string };

type Obj = Record<string, any>;
const MAX_BLOCKS = 50;

const safeHref = (href: unknown): string | null =>
  typeof href === "string" && /^(https?:|mailto:)/i.test(href) ? href : null;

function textTokens(t: unknown, ctx: FormatContext): SlackToken[] {
  const o = t as Obj | undefined;
  if (!o || typeof o.text !== "string" || !o.text) return [];
  return o.type === "mrkdwn" ? formatSlackText(o.text, ctx) : [{ type: "text", value: o.text }];
}

function plain(t: unknown): string {
  const o = t as Obj | undefined;
  return typeof o?.text === "string" ? o.text : "";
}

function richElement(el: Obj, ctx: FormatContext): SlackToken[] {
  switch (el?.type) {
    case "text": {
      const value = String(el.text ?? "");
      let tok: SlackToken = el.style?.code ? { type: "code", value } : { type: "text", value };
      if (el.style?.bold) tok = { type: "bold", children: [tok] };
      if (el.style?.italic) tok = { type: "italic", children: [tok] };
      if (el.style?.strike) tok = { type: "strike", children: [tok] };
      return [tok];
    }
    case "link": {
      const href = safeHref(el.url);
      const label = String(el.text ?? el.url ?? "");
      return href ? [{ type: "link", href, label }] : [{ type: "text", value: label }];
    }
    case "user": {
      const id = String(el.user_id ?? "");
      return [{ type: "mention", slackId: id, label: ctx.memberNames[id] ?? id }];
    }
    case "channel": {
      const id = String(el.channel_id ?? "");
      return [{ type: "channel", slackId: id, label: ctx.channelNames?.[id] ?? id }];
    }
    case "emoji": {
      const name = String(el.name ?? "");
      return [{ type: "emoji", name, url: ctx.emojiUrls?.[name] }];
    }
    case "broadcast": return [{ type: "text", value: `@${el.range ?? "channel"}` }];
    default: return [];
  }
}

function richContainer(el: Obj, ctx: FormatContext): SlackToken[] {
  const kids: Obj[] = Array.isArray(el?.elements) ? el.elements : [];
  switch (el?.type) {
    case "rich_text_section":
      return kids.flatMap((k) => richElement(k, ctx));
    case "rich_text_preformatted":
      return [{ type: "codeblock", value: kids.map((k) => String(k.text ?? "")).join("") }];
    case "rich_text_quote":
      return [{ type: "italic", children: kids.flatMap((k) => richElement(k, ctx)) }];
    case "rich_text_list":
      return kids.flatMap((item, i): SlackToken[] => [
        { type: "text", value: `${i ? "\n" : ""}• ` },
        ...richContainer(item, ctx),
      ]);
    default:
      return [];
  }
}

function actionLabel(el: Obj): string {
  return plain(el?.text) || plain(el?.placeholder) || "";
}

function renderBlock(b: Obj, ctx: FormatContext): RenderedBlock[] {
  switch (b?.type) {
    case "header": {
      const text = plain(b.text);
      return text ? [{ type: "header", text }] : [];
    }
    case "section": {
      const out: RenderedBlock[] = [{
        type: "section",
        tokens: textTokens(b.text, ctx),
        fields: Array.isArray(b.fields) ? b.fields.map((f: unknown) => textTokens(f, ctx)) : [],
      }];
      const label = b.accessory ? actionLabel(b.accessory) : "";
      if (label) out.push({ type: "actions", labels: [label] });
      return out;
    }
    case "context": {
      const tokens = (Array.isArray(b.elements) ? b.elements : [])
        .filter((e: Obj) => e?.type === "mrkdwn" || e?.type === "plain_text")
        .flatMap((e: Obj, i: number): SlackToken[] => [
          ...(i ? [{ type: "text", value: " · " } as SlackToken] : []),
          ...textTokens(e, ctx),
        ]);
      return tokens.length ? [{ type: "context", tokens }] : [];
    }
    case "divider":
      return [{ type: "divider" }];
    case "actions": {
      const labels = (Array.isArray(b.elements) ? b.elements : []).map(actionLabel).filter(Boolean);
      return labels.length ? [{ type: "actions", labels }] : [];
    }
    case "image":
      return [{ type: "image", alt: String(b.alt_text ?? plain(b.title) ?? "") }];
    case "rich_text": {
      const tokens = (Array.isArray(b.elements) ? b.elements : []).flatMap((e: Obj) => richContainer(e, ctx));
      return tokens.length ? [{ type: "section", tokens, fields: [] }] : [];
    }
    default:
      return [];
  }
}

function renderAttachment(a: Obj, ctx: FormatContext): RenderedBlock[] {
  const out: RenderedBlock[] = [];
  if (a?.pretext) out.push({ type: "section", tokens: formatSlackText(String(a.pretext), ctx), fields: [] });
  if (a?.title) out.push({ type: "header", text: String(a.title) });
  const fields: SlackToken[][] = (Array.isArray(a?.fields) ? a.fields : []).map((f: Obj): SlackToken[] => [
    { type: "bold", children: [{ type: "text", value: `${f.title ?? ""} ` }] },
    ...formatSlackText(String(f.value ?? ""), ctx),
  ]);
  if (a?.text || fields.length) {
    out.push({ type: "section", tokens: a?.text ? formatSlackText(String(a.text), ctx) : [], fields });
  }
  if (Array.isArray(a?.blocks)) out.push(...a.blocks.flatMap((b: Obj) => renderBlock(b, ctx)));
  const labels = (Array.isArray(a?.actions) ? a.actions : []).map((x: Obj) => String(x.text ?? x.name ?? "")).filter(Boolean);
  if (labels.length) out.push({ type: "actions", labels });
  if (a?.footer) out.push({ type: "context", tokens: [{ type: "text", value: String(a.footer) }] });
  return out;
}

export function renderBotPayload(payload: unknown, ctx: FormatContext): RenderedBlock[] {
  const p = payload as Obj | null;
  if (!p || typeof p !== "object") return [];
  const blocks: Obj[] = Array.isArray(p.blocks) ? p.blocks : [];
  const attachments: Obj[] = Array.isArray(p.attachments) ? p.attachments : [];
  return [
    ...blocks.flatMap((b) => renderBlock(b, ctx)),
    ...attachments.flatMap((a) => renderAttachment(a, ctx)),
  ].slice(0, MAX_BLOCKS);
}
