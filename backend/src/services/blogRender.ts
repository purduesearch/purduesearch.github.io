// Pure helpers for the blog editor: TipTap(ProseMirror) JSON <-> HTML/markdown,
// slug generation, and reading-time estimation. No Prisma / IO here.
//
// We render the ProseMirror JSON tree directly instead of pulling the whole
// TipTap stack onto the backend. The renderer understands the same node/mark
// `type` names the client editor produces (including our custom nodes: embed,
// gallery, callout, tableOfContents). Whenever a new node type is added to the
// editor, add a matching branch in `renderNode` below.

import { Lexer, type Token, type Tokens } from "marked";

// ── Types (a minimal ProseMirror document shape) ─────────────

export interface PMMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  marks?: PMMark[];
  text?: string;
}

export interface PMDoc {
  type: "doc";
  content?: PMNode[];
}

export const EMPTY_DOC: PMDoc = { type: "doc", content: [{ type: "paragraph" }] };

// ── HTML escaping ────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

// ── slugify (shared by post slugs and heading anchors) ───────

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "post"
  );
}

// ── Text extraction (reading time, excerpts, TOC) ────────────

export function extractText(node: PMNode | PMDoc): string {
  const anyNode = node as PMNode;
  let out = "";
  if (anyNode.text) out += anyNode.text;
  if (anyNode.content) {
    for (const child of anyNode.content) {
      out += " " + extractText(child);
    }
  }
  return out;
}

export function computeReadingTime(doc: PMDoc | null | undefined): number {
  if (!doc) return 1;
  const words = extractText(doc).trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// Collect { level, text, id } for every heading — used by the TOC node.
export function collectHeadings(
  doc: PMDoc | null | undefined
): Array<{ level: number; text: string; id: string }> {
  const headings: Array<{ level: number; text: string; id: string }> = [];
  const seen = new Map<string, number>();
  const walk = (node: PMNode) => {
    if (node.type === "heading") {
      const text = extractText(node).trim();
      let id = slugify(text);
      const n = seen.get(id) ?? 0;
      seen.set(id, n + 1);
      if (n > 0) id = `${id}-${n}`;
      headings.push({ level: Number(node.attrs?.level ?? 1), text, id });
    }
    node.content?.forEach(walk);
  };
  doc?.content?.forEach(walk);
  return headings;
}

// ── Inline marks ─────────────────────────────────────────────

function wrapMarks(text: string, marks?: PMMark[]): string {
  if (!marks || marks.length === 0) return text;
  let out = text;
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
      case "strong":
        out = `<strong>${out}</strong>`;
        break;
      case "italic":
      case "em":
        out = `<em>${out}</em>`;
        break;
      case "underline":
        out = `<u>${out}</u>`;
        break;
      case "strike":
      case "s":
        out = `<s>${out}</s>`;
        break;
      case "code":
        out = `<code>${out}</code>`;
        break;
      case "link": {
        const href = escapeAttr(String(mark.attrs?.href ?? "#"));
        const target = mark.attrs?.target ? ` target="${escapeAttr(String(mark.attrs.target))}"` : ` target="_blank"`;
        out = `<a href="${href}"${target} rel="noopener noreferrer">${out}</a>`;
        break;
      }
      default:
        break;
    }
  }
  return out;
}

// ── Node rendering ───────────────────────────────────────────

function renderChildren(node: PMNode, headingIds: Map<PMNode, string>): string {
  return (node.content ?? []).map((c) => renderNode(c, headingIds)).join("");
}

// Pre-assign heading anchor ids so headings + TOC agree.
function buildHeadingIdMap(doc: PMDoc): Map<PMNode, string> {
  const map = new Map<PMNode, string>();
  const seen = new Map<string, number>();
  const walk = (node: PMNode) => {
    if (node.type === "heading") {
      let id = slugify(extractText(node).trim());
      const n = seen.get(id) ?? 0;
      seen.set(id, n + 1);
      if (n > 0) id = `${id}-${n}`;
      map.set(node, id);
    }
    node.content?.forEach(walk);
  };
  doc.content?.forEach(walk);
  return map;
}

function renderNode(node: PMNode, headingIds: Map<PMNode, string>): string {
  switch (node.type) {
    case "text":
      return wrapMarks(escapeHtml(node.text ?? ""), node.marks);
    case "paragraph":
      return `<p>${renderChildren(node, headingIds)}</p>`;
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)));
      const id = headingIds.get(node) ?? slugify(extractText(node).trim());
      return `<h${level} id="${escapeAttr(id)}">${renderChildren(node, headingIds)}</h${level}>`;
    }
    case "blockquote":
      return `<blockquote>${renderChildren(node, headingIds)}</blockquote>`;
    case "codeBlock": {
      const lang = node.attrs?.language ? ` class="language-${escapeAttr(String(node.attrs.language))}"` : "";
      return `<pre><code${lang}>${escapeHtml(extractText(node))}</code></pre>`;
    }
    case "bulletList":
      return `<ul>${renderChildren(node, headingIds)}</ul>`;
    case "orderedList": {
      const start = node.attrs?.start && Number(node.attrs.start) !== 1 ? ` start="${Number(node.attrs.start)}"` : "";
      return `<ol${start}>${renderChildren(node, headingIds)}</ol>`;
    }
    case "listItem":
      return `<li>${renderChildren(node, headingIds)}</li>`;
    case "taskList":
      return `<ul class="cpm-blog-task-list">${renderChildren(node, headingIds)}</ul>`;
    case "taskItem": {
      const checked = node.attrs?.checked ? "checked" : "";
      return `<li class="cpm-blog-task-item"><input type="checkbox" disabled ${checked}/> <span>${renderChildren(node, headingIds)}</span></li>`;
    }
    case "horizontalRule":
      return `<hr/>`;
    case "hardBreak":
      return `<br/>`;
    case "image": {
      const src = escapeAttr(String(node.attrs?.src ?? ""));
      const alt = escapeAttr(String(node.attrs?.alt ?? ""));
      const align = node.attrs?.align ? ` cpm-blog-img--${escapeAttr(String(node.attrs.align))}` : "";
      const width = node.attrs?.width ? ` style="width:${Number(node.attrs.width)}px"` : "";
      const caption = node.attrs?.caption
        ? `<figcaption>${escapeHtml(String(node.attrs.caption))}</figcaption>`
        : "";
      return `<figure class="cpm-blog-figure${align}"><img src="${src}" alt="${alt}"${width}/>${caption}</figure>`;
    }
    case "embed": {
      const url = String(node.attrs?.url ?? "");
      const html = node.attrs?.html ? String(node.attrs.html) : "";
      if (html) return `<div class="cpm-blog-embed" data-embed-url="${escapeAttr(url)}">${html}</div>`;
      return `<div class="cpm-blog-embed"><a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a></div>`;
    }
    case "gallery": {
      const images = Array.isArray(node.attrs?.images) ? (node.attrs!.images as Array<Record<string, unknown>>) : [];
      const items = images
        .map((im) => `<img src="${escapeAttr(String(im.src ?? im.url ?? ""))}" alt="${escapeAttr(String(im.alt ?? ""))}"/>`)
        .join("");
      return `<div class="cpm-blog-gallery">${items}</div>`;
    }
    case "callout": {
      const variant = escapeAttr(String(node.attrs?.variant ?? "info"));
      return `<div class="cpm-blog-callout cpm-blog-callout--${variant}">${renderChildren(node, headingIds)}</div>`;
    }
    case "tableOfContents": {
      // Rendered at publish time from the document's headings.
      return `<!--TOC-->`;
    }
    case "table":
      return `<table class="cpm-blog-table"><tbody>${renderChildren(node, headingIds)}</tbody></table>`;
    case "tableRow":
      return `<tr>${renderChildren(node, headingIds)}</tr>`;
    case "tableHeader":
      return `<th${node.attrs?.colspan ? ` colspan="${Number(node.attrs.colspan)}"` : ""}>${renderChildren(node, headingIds)}</th>`;
    case "tableCell":
      return `<td${node.attrs?.colspan ? ` colspan="${Number(node.attrs.colspan)}"` : ""}>${renderChildren(node, headingIds)}</td>`;
    default:
      // Unknown node: render its children so content is never silently dropped.
      return renderChildren(node, headingIds);
  }
}

function renderToc(doc: PMDoc, headingIds: Map<PMNode, string>): string {
  const items: string[] = [];
  const walk = (node: PMNode) => {
    if (node.type === "heading") {
      const id = headingIds.get(node) ?? slugify(extractText(node).trim());
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)));
      items.push(
        `<li class="cpm-blog-toc-item cpm-blog-toc-l${level}"><a href="#${escapeAttr(id)}">${escapeHtml(extractText(node).trim())}</a></li>`
      );
    }
    node.content?.forEach(walk);
  };
  doc.content?.forEach(walk);
  if (items.length === 0) return "";
  return `<nav class="cpm-blog-toc"><ul>${items.join("")}</ul></nav>`;
}

/** Render a full TipTap doc to the HTML snapshot served on the public site. */
export function renderJsonToHtml(doc: PMDoc | null | undefined): string {
  if (!doc || !doc.content) return "";
  const headingIds = buildHeadingIdMap(doc);
  const body = doc.content.map((n) => renderNode(n, headingIds)).join("\n");
  // Replace the TOC placeholder(s) with the generated navigation.
  const toc = renderToc(doc, headingIds);
  return body.replace(/<!--TOC-->/g, toc);
}

// ── Markdown -> TipTap JSON (for the AI expand-to-blog flow) ──

function inlineTokensToNodes(tokens: Token[] | undefined, marks: PMMark[] = []): PMNode[] {
  if (!tokens) return [];
  const out: PMNode[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case "text": {
        const tok = t as Tokens.Text;
        if (tok.tokens && tok.tokens.length) {
          out.push(...inlineTokensToNodes(tok.tokens, marks));
        } else if (tok.text) {
          out.push({ type: "text", text: tok.text, ...(marks.length ? { marks } : {}) });
        }
        break;
      }
      case "strong":
        out.push(...inlineTokensToNodes((t as Tokens.Strong).tokens, [...marks, { type: "bold" }]));
        break;
      case "em":
        out.push(...inlineTokensToNodes((t as Tokens.Em).tokens, [...marks, { type: "italic" }]));
        break;
      case "del":
        out.push(...inlineTokensToNodes((t as Tokens.Del).tokens, [...marks, { type: "strike" }]));
        break;
      case "codespan":
        out.push({ type: "text", text: (t as Tokens.Codespan).text, marks: [...marks, { type: "code" }] });
        break;
      case "link": {
        const tok = t as Tokens.Link;
        out.push(...inlineTokensToNodes(tok.tokens, [...marks, { type: "link", attrs: { href: tok.href } }]));
        break;
      }
      case "br":
        out.push({ type: "hardBreak" });
        break;
      case "escape":
        out.push({ type: "text", text: (t as Tokens.Escape).text, ...(marks.length ? { marks } : {}) });
        break;
      default: {
        const anyTok = t as { text?: string };
        if (anyTok.text) out.push({ type: "text", text: anyTok.text, ...(marks.length ? { marks } : {}) });
        break;
      }
    }
  }
  return out;
}

function listItemsToNodes(items: Tokens.ListItem[]): PMNode[] {
  return items.map((item) => {
    const children: PMNode[] = [];
    for (const tok of item.tokens) {
      if (tok.type === "list") {
        children.push(blockTokenToNode(tok) as PMNode);
      } else if (tok.type === "text") {
        const textTok = tok as Tokens.Text;
        children.push({ type: "paragraph", content: inlineTokensToNodes(textTok.tokens ?? [{ type: "text", raw: textTok.text, text: textTok.text } as Token]) });
      } else {
        const node = blockTokenToNode(tok);
        if (node) children.push(node);
      }
    }
    if (children.length === 0) children.push({ type: "paragraph" });
    return { type: "listItem", content: children };
  });
}

function blockTokenToNode(token: Token): PMNode | null {
  switch (token.type) {
    case "heading": {
      const t = token as Tokens.Heading;
      return { type: "heading", attrs: { level: t.depth }, content: inlineTokensToNodes(t.tokens) };
    }
    case "paragraph": {
      const t = token as Tokens.Paragraph;
      return { type: "paragraph", content: inlineTokensToNodes(t.tokens) };
    }
    case "blockquote": {
      const t = token as Tokens.Blockquote;
      return { type: "blockquote", content: (t.tokens.map(blockTokenToNode).filter(Boolean) as PMNode[]) };
    }
    case "code": {
      const t = token as Tokens.Code;
      return {
        type: "codeBlock",
        attrs: t.lang ? { language: t.lang } : {},
        content: t.text ? [{ type: "text", text: t.text }] : [],
      };
    }
    case "list": {
      const t = token as Tokens.List;
      return {
        type: t.ordered ? "orderedList" : "bulletList",
        ...(t.ordered && t.start && t.start !== 1 ? { attrs: { start: t.start } } : {}),
        content: listItemsToNodes(t.items),
      };
    }
    case "hr":
      return { type: "horizontalRule" };
    case "space":
      return null;
    default: {
      const anyTok = token as { text?: string };
      if (anyTok.text?.trim()) {
        return { type: "paragraph", content: [{ type: "text", text: anyTok.text }] };
      }
      return null;
    }
  }
}

/** Convert markdown (e.g. Gemini's expand-to-blog output) into a TipTap doc. */
export function markdownToTiptapJson(markdown: string): PMDoc {
  const tokens = new Lexer().lex(markdown ?? "");
  const content = tokens.map(blockTokenToNode).filter(Boolean) as PMNode[];
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}
