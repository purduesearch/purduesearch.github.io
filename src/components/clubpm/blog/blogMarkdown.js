// Lightweight two-way Markdown <-> TipTap-JSON conversion for the editor's
// power-user "Markdown" toggle. Not intended to be byte-perfect for every
// custom node (embed/gallery/callout/TOC) — those degrade to a readable
// plain-text form on export and re-parse back into the closest matching node.
// Keep node names in sync with blogExtensions() in BlogEditor.jsx.

function escapeText(text) {
  return (text || '').replace(/([\\`*_[\]])/g, '\\$1');
}

function marksWrap(text, marks) {
  let out = escapeText(text);
  const has = (t) => marks?.some((m) => m.type === t);
  if (has('code')) out = `\`${text}\``; // code spans are literal, not escaped
  if (has('bold')) out = `**${out}**`;
  if (has('italic')) out = `_${out}_`;
  if (has('strike')) out = `~~${out}~~`;
  if (has('underline')) out = `<u>${out}</u>`;
  const link = marks?.find((m) => m.type === 'link');
  if (link) out = `[${out}](${link.attrs?.href || ''})`;
  return out;
}

function inlineToMarkdown(content) {
  return (content || []).map((node) => {
    if (node.type === 'text') return marksWrap(node.text || '', node.marks);
    if (node.type === 'hardBreak') return '  \n';
    return '';
  }).join('');
}

function blockToMarkdown(node, depth = 0) {
  const indent = '  '.repeat(depth);
  switch (node.type) {
    case 'paragraph':
      return `${indent}${inlineToMarkdown(node.content)}`;
    case 'heading':
      return `${indent}${'#'.repeat(node.attrs?.level || 1)} ${inlineToMarkdown(node.content)}`;
    case 'blockquote':
      return (node.content || [])
        .map((child) => blockToMarkdown(child, depth))
        .join('\n\n')
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n');
    case 'codeBlock': {
      const lang = node.attrs?.language || '';
      const text = (node.content || []).map((t) => t.text || '').join('');
      return `\`\`\`${lang}\n${text}\n\`\`\``;
    }
    case 'horizontalRule':
      return '---';
    case 'bulletList':
      return (node.content || [])
        .map((li) => listItemToMarkdown(li, depth, '-'))
        .join('\n');
    case 'orderedList':
      return (node.content || [])
        .map((li, i) => listItemToMarkdown(li, depth, `${(node.attrs?.start || 1) + i}.`))
        .join('\n');
    case 'taskList':
      return (node.content || [])
        .map((li) => `${indent}- [${li.attrs?.checked ? 'x' : ' '}] ${inlineFromListItem(li)}`)
        .join('\n');
    case 'image':
      return imageToMarkdown(node);
    case 'gallery':
      return (node.attrs?.images || [])
        .map((im) => `![${im.alt || ''}](${im.src || im.url || ''})`)
        .join('\n');
    case 'embed':
      return `[embed: ${node.attrs?.provider || 'link'}](${node.attrs?.url || ''})`;
    case 'tableOfContents':
      return '[TOC]';
    case 'callout': {
      const variant = (node.attrs?.variant || 'info').toUpperCase();
      const body = (node.content || []).map((child) => blockToMarkdown(child, depth)).join('\n\n');
      return `> [!${variant}]\n${body.split('\n').map((l) => `> ${l}`).join('\n')}`;
    }
    case 'table':
      return tableToMarkdown(node);
    case 'hero': {
      const h = node.attrs?.heading ? `# ${escapeText(node.attrs.heading)}` : '';
      const s = node.attrs?.subheading ? `${h ? '\n' : ''}*${escapeText(node.attrs.subheading)}*` : '';
      return `${h}${s}`.trim();
    }
    case 'statBand':
      return (node.attrs?.stats || [])
        .map((st) => `**${st?.value || ''}** ${st?.label || ''}`.trim())
        .join(' · ');
    case 'ctaButton':
      return `[${node.attrs?.label || 'Learn more'}](${node.attrs?.href || ''})`;
    default:
      if (node.content) return (node.content || []).map((c) => blockToMarkdown(c, depth)).join('\n\n');
      return '';
  }
}

function imageToMarkdown(node) {
  const { src, alt, caption } = node.attrs || {};
  const line = `![${alt || ''}](${src || ''})`;
  return caption ? `${line}\n*${caption}*` : line;
}

function inlineFromListItem(li) {
  const p = (li.content || []).find((c) => c.type === 'paragraph');
  return p ? inlineToMarkdown(p.content) : '';
}

function listItemToMarkdown(li, depth, marker) {
  const indent = '  '.repeat(depth);
  const first = inlineFromListItem(li);
  const rest = (li.content || [])
    .filter((c) => c.type !== 'paragraph')
    .map((c) => blockToMarkdown(c, depth + 1))
    .join('\n');
  return `${indent}${marker} ${first}${rest ? `\n${rest}` : ''}`;
}

function tableToMarkdown(node) {
  const rows = (node.content || []).map((row) =>
    (row.content || []).map((cell) => inlineToMarkdown(cell.content?.[0]?.content).replace(/\|/g, '\\|'))
  );
  if (!rows.length) return '';
  const header = rows[0];
  const sep = header.map(() => '---');
  const lines = [header, sep, ...rows.slice(1)].map((r) => `| ${r.join(' | ')} |`);
  return lines.join('\n');
}

/** TipTap JSON doc -> Markdown string. */
export function docToMarkdown(doc) {
  if (!doc?.content) return '';
  return doc.content.map((n) => blockToMarkdown(n, 0)).join('\n\n');
}

// ---- Markdown -> TipTap JSON -----------------------------------------

function parseInline(text) {
  const nodes = [];
  let rest = text;
  const push = (t, marks) => { if (t) nodes.push({ type: 'text', text: t, ...(marks ? { marks } : {}) }); };
  // Order matters: images/links before emphasis so URLs aren't mangled.
  const re = /(!\[[^\]]*\]\([^)]*\))|(\[[^\]]*\]\([^)]*\))|(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(~~[^~]+~~)|(<u>[^<]*<\/u>)|(_[^_]+_)|(\*[^*]+\*)/;
  while (rest) {
    const m = re.exec(rest);
    if (!m) { push(rest); break; }
    if (m.index > 0) push(rest.slice(0, m.index));
    const tok = m[0];
    if (tok.startsWith('![')) {
      // inline image inside a paragraph is rare here; treat as plain text link
      push(tok);
    } else if (tok.startsWith('[')) {
      const lm = /^\[([^\]]*)\]\(([^)]*)\)$/.exec(tok);
      push(lm?.[1] || '', lm ? [{ type: 'link', attrs: { href: lm[2] } }] : undefined);
    } else if (tok.startsWith('`')) {
      push(tok.slice(1, -1), [{ type: 'code' }]);
    } else if (tok.startsWith('**') || tok.startsWith('__')) {
      push(tok.slice(2, -2), [{ type: 'bold' }]);
    } else if (tok.startsWith('~~')) {
      push(tok.slice(2, -2), [{ type: 'strike' }]);
    } else if (tok.startsWith('<u>')) {
      push(tok.slice(3, -4), [{ type: 'underline' }]);
    } else if (tok.startsWith('_') || tok.startsWith('*')) {
      push(tok.slice(1, -1), [{ type: 'italic' }]);
    }
    rest = rest.slice(m.index + tok.length);
  }
  return nodes.length ? nodes : undefined;
}

function paragraph(text) {
  return { type: 'paragraph', content: text ? parseInline(text) : [] };
}

/** Markdown string -> TipTap JSON doc. Handles the common CommonMark subset. */
export function markdownToDoc(markdown) {
  const lines = (markdown || '').replace(/\r\n/g, '\n').split('\n');
  const content = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i += 1; continue; }

    // Code fence
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const codeLines = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { codeLines.push(lines[i]); i += 1; }
      i += 1; // closing fence
      content.push({
        type: 'codeBlock',
        attrs: { language: fence[1] || null },
        content: codeLines.length ? [{ type: 'text', text: codeLines.join('\n') }] : [],
      });
      continue;
    }

    // Heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      content.push({ type: 'heading', attrs: { level: heading[1].length }, content: parseInline(heading[2]) });
      i += 1;
      continue;
    }

    // Horizontal rule
    if (/^(---|\*\*\*|___)\s*$/.test(line)) {
      content.push({ type: 'horizontalRule' });
      i += 1;
      continue;
    }

    // Table of contents marker
    if (/^\[TOC\]$/i.test(line.trim())) {
      content.push({ type: 'tableOfContents' });
      i += 1;
      continue;
    }

    // Image (standalone line)
    const img = /^!\[([^\]]*)\]\(([^)]*)\)\s*$/.exec(line.trim());
    if (img) {
      content.push({ type: 'image', attrs: { alt: img[1], src: img[2], align: 'center', width: null, caption: '' } });
      i += 1;
      continue;
    }

    // Blockquote (including "> [!VARIANT]" callouts)
    if (/^>/.test(line)) {
      const quoted = [];
      while (i < lines.length && /^>/.test(lines[i])) { quoted.push(lines[i].replace(/^>\s?/, '')); i += 1; }
      const calloutMatch = /^\[!(\w+)\]$/.exec(quoted[0]?.trim() || '');
      const bodyLines = calloutMatch ? quoted.slice(1) : quoted;
      const inner = markdownToDoc(bodyLines.join('\n')).content;
      if (calloutMatch) {
        content.push({ type: 'callout', attrs: { variant: calloutMatch[1].toLowerCase() }, content: inner.length ? inner : [paragraph('')] });
      } else {
        content.push({ type: 'blockquote', content: inner.length ? inner : [paragraph('')] });
      }
      continue;
    }

    // Task list
    if (/^[-*]\s+\[[ xX]\]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+\[[ xX]\]\s+/.test(lines[i])) {
        const m = /^[-*]\s+\[([ xX])\]\s+(.*)$/.exec(lines[i]);
        items.push({ type: 'taskItem', attrs: { checked: m[1].toLowerCase() === 'x' }, content: [paragraph(m[2])] });
        i += 1;
      }
      content.push({ type: 'taskList', content: items });
      continue;
    }

    // Bullet list
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i]) && !/^[-*]\s+\[[ xX]\]/.test(lines[i])) {
        items.push({ type: 'listItem', content: [paragraph(lines[i].replace(/^[-*]\s+/, ''))] });
        i += 1;
      }
      content.push({ type: 'bulletList', content: items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push({ type: 'listItem', content: [paragraph(lines[i].replace(/^\d+\.\s+/, ''))] });
        i += 1;
      }
      content.push({ type: 'orderedList', content: items });
      continue;
    }

    // Table
    if (/^\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1] || '')) {
      const rowsSrc = [line];
      i += 2; // skip header + separator
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) { rowsSrc.push(lines[i]); i += 1; }
      const cellsOf = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const rows = rowsSrc.map((r, idx) => ({
        type: 'tableRow',
        content: cellsOf(r).map((c) => ({
          type: idx === 0 ? 'tableHeader' : 'tableCell',
          content: [paragraph(c)],
        })),
      }));
      content.push({ type: 'table', content: rows });
      continue;
    }

    // Paragraph (collect until blank line)
    const paraLines = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>|[-*]\s|\d+\.\s|```|---\s*$)/.test(lines[i])) {
      paraLines.push(lines[i]);
      i += 1;
    }
    content.push(paragraph(paraLines.join(' ')));
  }

  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}
