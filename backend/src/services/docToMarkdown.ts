import type { PMDoc, PMNode, PMMark } from "./blogRender.js";

function marksWrap(text: string, marks?: PMMark[]): string {
  let out = text;
  const has = (t: string) => marks?.some((m) => m.type === t);
  if (has("code")) out = `\`${text}\``;
  if (has("bold")) out = `**${out}**`;
  if (has("italic")) out = `_${out}_`;
  if (has("strike")) out = `~~${out}~~`;
  const link = marks?.find((m) => m.type === "link");
  if (link) out = `[${out}](${String((link.attrs as { href?: string })?.href ?? "")})`;
  return out;
}

function inlineToMarkdown(content?: PMNode[]): string {
  return (content ?? []).map((n) => {
    if (n.type === "text") return marksWrap(n.text ?? "", n.marks);
    if (n.type === "hardBreak") return "  \n";
    return "";
  }).join("");
}

function firstParagraph(li: PMNode): string {
  const p = (li.content ?? []).find((c) => c.type === "paragraph");
  return p ? inlineToMarkdown(p.content) : "";
}

function tableToMarkdown(node: PMNode): string {
  const rows = (node.content ?? []).map((row) =>
    (row.content ?? []).map((cell) => inlineToMarkdown(cell.content?.[0]?.content).replace(/\|/g, "\\|")));
  if (!rows.length) return "";
  const header = rows[0];
  const sep = header.map(() => "---");
  return [header, sep, ...rows.slice(1)].map((r) => `| ${r.join(" | ")} |`).join("\n");
}

function blockToMarkdown(node: PMNode): string {
  switch (node.type) {
    case "paragraph": return inlineToMarkdown(node.content);
    case "heading": return `${"#".repeat(Number(node.attrs?.level ?? 1))} ${inlineToMarkdown(node.content)}`;
    case "blockquote":
      return (node.content ?? []).map(blockToMarkdown).join("\n\n").split("\n").map((l) => `> ${l}`).join("\n");
    case "codeBlock": {
      const lang = String(node.attrs?.language ?? "");
      const text = (node.content ?? []).map((t) => t.text ?? "").join("");
      return `\`\`\`${lang}\n${text}\n\`\`\``;
    }
    case "horizontalRule": return "---";
    case "bulletList": return (node.content ?? []).map((li) => `- ${firstParagraph(li)}`).join("\n");
    case "orderedList": return (node.content ?? []).map((li, i) => `${i + 1}. ${firstParagraph(li)}`).join("\n");
    case "taskList": return (node.content ?? []).map((li) => `- [${li.attrs?.checked ? "x" : " "}] ${firstParagraph(li)}`).join("\n");
    case "image": return `![${String(node.attrs?.alt ?? "")}](${String(node.attrs?.src ?? "")})`;
    case "gallery":
      return ((node.attrs?.images as { src?: string; url?: string; alt?: string }[]) ?? [])
        .map((im) => `![${im.alt ?? ""}](${im.src ?? im.url ?? ""})`).join("\n");
    case "embed": return `[embed](${String(node.attrs?.url ?? "")})`;
    case "callout":
      return (node.content ?? []).map(blockToMarkdown).join("\n\n").split("\n").map((l) => `> ${l}`).join("\n");
    case "table": return tableToMarkdown(node);
    // Section Builder nodes (present once the section plan lands) — flatten children.
    case "section":
    case "column":
      return (node.content ?? []).map(blockToMarkdown).join("\n\n");
    default:
      return node.content ? (node.content ?? []).map(blockToMarkdown).join("\n\n") : "";
  }
}

/** TipTap JSON doc -> Markdown string. Returns "" for null/empty docs. */
export function pmDocToMarkdown(doc: PMDoc | null | undefined): string {
  if (!doc || !doc.content) return "";
  return doc.content.map(blockToMarkdown).join("\n\n");
}
