/**
 * Markdown -> TipTap JSON, for installing CONTENT sections from `docs/courses`.
 *
 * WHY THIS EXISTS: `CoursePlayerPage` renders a section's `contentJson` by
 * handing it to `BlogEditor` read-only, and `CourseEditorPage` loads and saves
 * the same shape. Both expect a TipTap document (`{ type: "doc", content: [...] }`).
 * The seed used to write `{ markdownSource: "<raw markdown>" }`, which is not a
 * document — TipTap rendered nothing and every CONTENT section appeared blank.
 *
 * DUPLICATION, DELIBERATE: this is the seed-time counterpart of
 * `src/components/clubpm/blog/blogMarkdown.js` (the editor's Markdown toggle).
 * It cannot import that file — the repo root package.json has no `"type":
 * "module"`, so Node treats its `export` statements as CommonJS syntax errors.
 * The two must stay in agreement, so:
 *
 *   - Node names here must match `blogExtensions()` in `BlogEditor.jsx`.
 *   - `courseMarkdown.test.ts` asserts this produces byte-identical output to
 *     the frontend converter for every file in `docs/courses`. If you change
 *     one implementation, that test fails until you change the other.
 *
 * Scope is the CommonMark subset the course articles actually use: headings,
 * paragraphs, bullet/ordered/task lists, blockquotes, tables, code fences,
 * horizontal rules, and inline bold/italic/code/strike/link.
 */

export type TiptapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
};

export type TiptapDoc = { type: "doc"; content: TiptapNode[] };

function parseInline(text: string): TiptapNode[] | undefined {
  const nodes: TiptapNode[] = [];
  let rest = text;
  const push = (t: string, marks?: TiptapNode["marks"]) => {
    if (t) nodes.push({ type: "text", text: t, ...(marks ? { marks } : {}) });
  };
  // Order matters: images/links before emphasis so URLs aren't mangled.
  const re =
    /(!\[[^\]]*\]\([^)]*\))|(\[[^\]]*\]\([^)]*\))|(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(~~[^~]+~~)|(<u>[^<]*<\/u>)|(_[^_]+_)|(\*[^*]+\*)/;
  while (rest) {
    const m = re.exec(rest);
    if (!m) {
      push(rest);
      break;
    }
    if (m.index > 0) push(rest.slice(0, m.index));
    const tok = m[0];
    if (tok.startsWith("![")) {
      push(tok);
    } else if (tok.startsWith("[")) {
      const lm = /^\[([^\]]*)\]\(([^)]*)\)$/.exec(tok);
      push(lm?.[1] || "", lm ? [{ type: "link", attrs: { href: lm[2] } }] : undefined);
    } else if (tok.startsWith("`")) {
      push(tok.slice(1, -1), [{ type: "code" }]);
    } else if (tok.startsWith("**") || tok.startsWith("__")) {
      push(tok.slice(2, -2), [{ type: "bold" }]);
    } else if (tok.startsWith("~~")) {
      push(tok.slice(2, -2), [{ type: "strike" }]);
    } else if (tok.startsWith("<u>")) {
      push(tok.slice(3, -4), [{ type: "underline" }]);
    } else if (tok.startsWith("_") || tok.startsWith("*")) {
      push(tok.slice(1, -1), [{ type: "italic" }]);
    }
    rest = rest.slice(m.index + tok.length);
  }
  return nodes.length ? nodes : undefined;
}

function paragraph(text: string): TiptapNode {
  return { type: "paragraph", content: text ? parseInline(text) : [] };
}

/** Markdown string -> TipTap JSON doc. Handles the common CommonMark subset. */
export function markdownToDoc(markdown: string): TiptapDoc {
  const lines = (markdown || "").replace(/\r\n/g, "\n").split("\n");
  const content: TiptapNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] as string;

    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Code fence
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i] as string)) {
        codeLines.push(lines[i] as string);
        i += 1;
      }
      i += 1; // closing fence
      content.push({
        type: "codeBlock",
        attrs: { language: fence[1] || null },
        content: codeLines.length ? [{ type: "text", text: codeLines.join("\n") }] : [],
      });
      continue;
    }

    // Heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      content.push({
        type: "heading",
        attrs: { level: (heading[1] as string).length },
        content: parseInline(heading[2] as string),
      });
      i += 1;
      continue;
    }

    // Horizontal rule
    if (/^(---|\*\*\*|___)\s*$/.test(line)) {
      content.push({ type: "horizontalRule" });
      i += 1;
      continue;
    }

    // Table of contents marker
    if (/^\[TOC\]$/i.test(line.trim())) {
      content.push({ type: "tableOfContents" });
      i += 1;
      continue;
    }

    // Image (standalone line)
    const img = /^!\[([^\]]*)\]\(([^)]*)\)\s*$/.exec(line.trim());
    if (img) {
      content.push({
        type: "image",
        attrs: { alt: img[1], src: img[2], align: "center", width: null, caption: "" },
      });
      i += 1;
      continue;
    }

    // Blockquote (including "> [!VARIANT]" callouts)
    if (/^>/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^>/.test(lines[i] as string)) {
        quoted.push((lines[i] as string).replace(/^>\s?/, ""));
        i += 1;
      }
      const calloutMatch = /^\[!(\w+)\]$/.exec(quoted[0]?.trim() || "");
      const bodyLines = calloutMatch ? quoted.slice(1) : quoted;
      const inner = markdownToDoc(bodyLines.join("\n")).content;
      if (calloutMatch) {
        content.push({
          type: "callout",
          attrs: { variant: (calloutMatch[1] as string).toLowerCase() },
          content: inner.length ? inner : [paragraph("")],
        });
      } else {
        content.push({ type: "blockquote", content: inner.length ? inner : [paragraph("")] });
      }
      continue;
    }

    // Task list
    if (/^[-*]\s+\[[ xX]\]\s+/.test(line)) {
      const items: TiptapNode[] = [];
      while (i < lines.length && /^[-*]\s+\[[ xX]\]\s+/.test(lines[i] as string)) {
        const m = /^[-*]\s+\[([ xX])\]\s+(.*)$/.exec(lines[i] as string);
        items.push({
          type: "taskItem",
          attrs: { checked: (m?.[1] as string).toLowerCase() === "x" },
          content: [paragraph(m?.[2] as string)],
        });
        i += 1;
      }
      content.push({ type: "taskList", content: items });
      continue;
    }

    // Bullet list
    if (/^[-*]\s+/.test(line)) {
      const items: TiptapNode[] = [];
      while (
        i < lines.length &&
        /^[-*]\s+/.test(lines[i] as string) &&
        !/^[-*]\s+\[[ xX]\]/.test(lines[i] as string)
      ) {
        items.push({
          type: "listItem",
          content: [paragraph((lines[i] as string).replace(/^[-*]\s+/, ""))],
        });
        i += 1;
      }
      content.push({ type: "bulletList", content: items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: TiptapNode[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i] as string)) {
        items.push({
          type: "listItem",
          content: [paragraph((lines[i] as string).replace(/^\d+\.\s+/, ""))],
        });
        i += 1;
      }
      content.push({ type: "orderedList", content: items });
      continue;
    }

    // Table
    if (
      /^\|.*\|\s*$/.test(line) &&
      /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test((lines[i + 1] as string) || "")
    ) {
      const rowsSrc = [line];
      i += 2; // skip header + separator
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i] as string)) {
        rowsSrc.push(lines[i] as string);
        i += 1;
      }
      const cellsOf = (l: string) =>
        l
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());
      const rows: TiptapNode[] = rowsSrc.map((r, idx) => ({
        type: "tableRow",
        content: cellsOf(r).map((c) => ({
          type: idx === 0 ? "tableHeader" : "tableCell",
          content: [paragraph(c)],
        })),
      }));
      content.push({ type: "table", content: rows });
      continue;
    }

    // Paragraph (collect until blank line)
    const paraLines = [line];
    i += 1;
    while (
      i < lines.length &&
      (lines[i] as string).trim() &&
      !/^(#{1,6}\s|>|[-*]\s|\d+\.\s|```|---\s*$)/.test(lines[i] as string)
    ) {
      paraLines.push(lines[i] as string);
      i += 1;
    }
    content.push(paragraph(paraLines.join(" ")));
  }

  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/**
 * Drop the authoring header from a `docs/courses` CONTENT file.
 *
 * Every article opens with an `# Cnn — Title` heading and a blockquote of notes
 * addressed to whoever maintains the curriculum ("CONTENT section · 101 · M3 ·
 * ~3 min read"), then a `---` rule. None of that is for the learner: the player
 * already renders the section title above the body, and the editorial notes are
 * repo metadata. Seeding them verbatim puts a duplicate title and a maintenance
 * memo at the top of the page a member reads.
 *
 * Only strips the header when it matches that exact shape — H1, optional
 * blockquote, `---` — so a body that happens to start with a heading or a quote
 * is left alone.
 */
export function stripAuthoringHeader(markdown: string): string {
  const lines = (markdown || "").replace(/\r\n/g, "\n").split("\n");
  let i = 0;

  const skipBlank = () => {
    while (i < lines.length && !(lines[i] as string).trim()) i += 1;
  };

  skipBlank();
  if (i >= lines.length || !/^#\s+/.test(lines[i] as string)) return markdown;
  i += 1; // the H1

  skipBlank();
  while (i < lines.length && /^>/.test(lines[i] as string)) i += 1; // metadata blockquote

  skipBlank();
  if (i >= lines.length || !/^(---|\*\*\*|___)\s*$/.test(lines[i] as string)) return markdown;
  i += 1; // the rule

  return lines.slice(i).join("\n").replace(/^\n+/, "");
}

/** Read-to-install: strip the authoring header, then convert to a TipTap doc. */
export function courseBodyToDoc(markdown: string): TiptapDoc {
  return markdownToDoc(stripAuthoringHeader(markdown));
}
