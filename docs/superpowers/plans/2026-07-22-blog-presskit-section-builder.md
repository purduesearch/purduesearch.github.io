# Blog / Press Kit — Section Page Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn blog posts and press kits from a single flowing document into a vertical stack of designed, styleable **sections** (Framer/Notion-style) with a per-post theme — responsive and SEO-safe, and fully compatible with the existing Yjs/Hocuspocus co-editing and the server-side renderer.

**Architecture:** New TipTap block nodes — `section` (container: layout/background/padding/width/theme), `column`, and preset leaf nodes `hero`, `statBand`, `ctaButton` — reused inside the existing `BlogEditor`. Sections are ordinary nodes in the shared Yjs doc, so no CRDT/protocol change. The server renderer (`blogRender.ts`) gains branches that emit responsive HTML; the collab schema mirror (`blogSchema.ts`) gains schema-only mirrors. A per-post `theme` (accent, font pair, width) is stored in a new nullable DB column and applied as CSS variables. Legacy section-less documents keep rendering unchanged.

**Tech Stack:** `@tiptap/core` + `@tiptap/react` (`Node.create`, `ReactNodeViewRenderer`, `NodeViewWrapper`, `NodeViewContent`), Prisma/PostgreSQL, Express (ESM, `.js` suffixes), Hocuspocus/Yjs, React 19. Backend pure-logic tests use `npx tsx`.

**Spec:** `docs/superpowers/specs/2026-07-22-blog-presskit-v2-design.md`

**Depends on:** the "Fixes & Exports" plan (`2026-07-22-blog-presskit-v2-fixes.md`) should land first — it heals images and adds `pmDocToMarkdown`'s `section`/`column` fallthrough that this plan relies on. Not strictly required to compile, but recommended order.

**Conventions to honor:**
- Backend ESM: all relative imports end in `.js`.
- **`blogExtensions()` (client, `BlogEditor.jsx`), `blogCollabExtensions()` (server, `blogSchema.ts`), and `renderNode()` (server, `blogRender.ts`) MUST stay in sync** — every new node needs an entry in all three. This is the #1 gotcha.
- New CSS appended to the bottom of `public/search-theme.css` with `cpm-blog-`/`presskit-` prefixes; mirror the section subset into the press-kit print shell (`PRINT_STYLES` in `pressKitService.ts`).
- After every phase: `cd backend && npx tsc --noEmit` AND (repo root) `npm run build` must pass.

---

## Node schema contract (identical across client node defs, `blogSchema.ts`, `blogRender.ts`)

```
section    group:block  content:"(column | block)+"  attrs: { layout, background, padding, width, theme }
             layout:     "single" | "mediaText" | "cols2" | "cols3"   (default "single")
             background: { kind: "none"|"color"|"image", value: string }   (default { kind:"none", value:"" })
             padding:    "s" | "m" | "l" | "xl"        (default "m")
             width:      "contained" | "fullBleed"     (default "contained")
             theme:      "inherit" | "light" | "dark"  (default "inherit")
column     group:block  content:"block+"              attrs: {}          (only meaningful inside a section)
hero       group:block  atom:true                     attrs: { heading, subheading, bgImage, align, overlay }
statBand   group:block  atom:true                     attrs: { stats: [{ label, value }] }
ctaButton  group:block  atom:true                     attrs: { label, href, style ("solid"|"outline"), align }
```

Post theme (stored in the new DB column, applied as CSS vars on the article wrapper):
```
theme = { accent: string /* hex */, fontPair: "syne-dmsans"|"oswald-lato"|"montserrat-worksans", width: "narrow"|"wide" }
```

New frontend files (all under `src/components/clubpm/blog/`): `BlogSection.jsx`, `BlogColumn.jsx`, `BlogHero.jsx`, `BlogStatBand.jsx`, `BlogCta.jsx`, `BlogSectionLibrary.jsx`, `BlogSectionSettings.jsx`, `BlogThemeBar.jsx`, and a shared `sectionNodes.js` (node factories).

---

## Phase 1 — Theme column + migration

### Task 1.1: Add `theme Json?` to BlogPost and ProjectPressKit

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add the column** to `model BlogPost` (near its other optional JSON fields) and `model ProjectPressKit`:

```prisma
  theme Json?   // { accent, fontPair, width } — per-post Section Builder theme
```

(Add the identical line inside each model.)

- [ ] **Step 2: Validate + generate.**

Run: `cd backend && npx prisma validate && npx prisma generate`
Expected: "valid" + "Generated Prisma Client".

- [ ] **Step 3: Create the migration.**

Run: `cd backend && npx prisma migrate dev --name add_blog_presskit_theme`
Expected: a new folder under `backend/prisma/migrations/`. If no DB is reachable locally the connect step fails — that's fine: schema is validated + client generated; deploy auto-runs `prisma migrate`. Note in the commit that the migration folder must be generated with DB access before deploy.

- [ ] **Step 4: Typecheck + commit.**

Run: `cd backend && npx tsc --noEmit` → no errors.

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(sections): add theme JSON column to BlogPost + ProjectPressKit"
```

---

## Phase 2 — Backend: renderer, schema mirror, theme CSS

### Task 2.1: Section renderer branches (TDD)

**Files:**
- Modify: `backend/src/services/blogRender.ts`
- Modify: `backend/src/services/blogRender.test.ts` (created in the fixes plan; if absent, create it with the header from that plan)

- [ ] **Step 1: Add failing tests** to `blogRender.test.ts` (append before the final `console.log`):

```ts
import { renderJsonToHtml as _render } from "./blogRender.js";
{
  const doc = { type: "doc", content: [
    { type: "section", attrs: { layout: "cols2", background: { kind: "color", value: "#111111" }, padding: "l", width: "contained", theme: "dark" },
      content: [
        { type: "column", content: [{ type: "paragraph", content: [{ type: "text", text: "left" }] }] },
        { type: "column", content: [{ type: "paragraph", content: [{ type: "text", text: "right" }] }] },
      ] },
    { type: "hero", attrs: { heading: "Big Title", subheading: "sub", bgImage: "", align: "center", overlay: false } },
    { type: "statBand", attrs: { stats: [{ label: "HOURS", value: "1240" }, { label: "TASKS", value: "37" }] } },
    { type: "ctaButton", attrs: { label: "Sponsor us", href: "https://x/y", style: "solid", align: "center" } },
  ] };
  const html = _render(doc as any);
  check("section wrapper + layout class", html.includes("cpm-blog-section") && html.includes("cpm-blog-section--cols2"));
  check("section background style", html.includes("#111111"));
  check("section theme class", html.includes("cpm-blog-section--dark"));
  check("column wrapper", html.includes("cpm-blog-col") && html.includes("left") && html.includes("right"));
  check("hero heading", html.includes("cpm-blog-hero") && html.includes("Big Title"));
  check("stat band tile", html.includes("cpm-blog-statband") && html.includes("1240") && html.includes("HOURS"));
  check("cta anchor", html.includes("cpm-blog-cta") && html.includes("Sponsor us") && html.includes('href="https://x/y"'));
}
```

- [ ] **Step 2: Run — confirm it fails.**

Run: `cd backend && npx tsx src/services/blogRender.test.ts`
Expected: FAIL (sections render via the default `renderChildren` fallthrough, so layout/theme classes are missing).

- [ ] **Step 3: Add render branches** in `renderNode` (in `blogRender.ts`), before the `default:` case:

```ts
    case "section": {
      const layout = String(node.attrs?.layout ?? "single");
      const pad = String(node.attrs?.padding ?? "m");
      const width = node.attrs?.width === "fullBleed" ? "fullBleed" : "contained";
      const theme = String(node.attrs?.theme ?? "inherit");
      const bg = (node.attrs?.background ?? { kind: "none", value: "" }) as { kind?: string; value?: string };
      const styles: string[] = [];
      if (bg.kind === "color" && bg.value) styles.push(`background-color:${escapeAttr(bg.value)}`);
      if (bg.kind === "image" && bg.value) styles.push(`background-image:url(${escapeAttr(proxyImageSrc(bg.value, IMAGE_BASE_URL))});background-size:cover;background-position:center`);
      const cls = [
        "cpm-blog-section",
        `cpm-blog-section--${escapeAttr(layout)}`,
        `cpm-blog-section--pad-${escapeAttr(pad)}`,
        `cpm-blog-section--${width === "fullBleed" ? "full" : "contained"}`,
        theme !== "inherit" ? `cpm-blog-section--${escapeAttr(theme)}` : "",
      ].filter(Boolean).join(" ");
      const inner = renderChildren(node, headingIds);
      const styleAttr = styles.length ? ` style="${styles.join(";")}"` : "";
      return `<section class="${cls}"${styleAttr}><div class="cpm-blog-section-inner">${inner}</div></section>`;
    }
    case "column":
      return `<div class="cpm-blog-col">${renderChildren(node, headingIds)}</div>`;
    case "hero": {
      const heading = escapeHtml(String(node.attrs?.heading ?? ""));
      const sub = escapeHtml(String(node.attrs?.subheading ?? ""));
      const align = escapeAttr(String(node.attrs?.align ?? "center"));
      const bgImage = String(node.attrs?.bgImage ?? "");
      const overlay = node.attrs?.overlay ? " cpm-blog-hero--overlay" : "";
      const style = bgImage ? ` style="background-image:url(${escapeAttr(proxyImageSrc(bgImage, IMAGE_BASE_URL))})"` : "";
      return `<header class="cpm-blog-hero cpm-blog-hero--${align}${overlay}"${style}>` +
        `<div class="cpm-blog-hero-inner">${heading ? `<h1>${heading}</h1>` : ""}${sub ? `<p>${sub}</p>` : ""}</div></header>`;
    }
    case "statBand": {
      const stats = Array.isArray(node.attrs?.stats) ? (node.attrs!.stats as { label?: string; value?: string }[]) : [];
      const tiles = stats.map((s) =>
        `<div class="cpm-blog-stat"><div class="cpm-blog-stat-value">${escapeHtml(String(s.value ?? ""))}</div>` +
        `<div class="cpm-blog-stat-label">${escapeHtml(String(s.label ?? ""))}</div></div>`).join("");
      return `<div class="cpm-blog-statband">${tiles}</div>`;
    }
    case "ctaButton": {
      const label = escapeHtml(String(node.attrs?.label ?? "Learn more"));
      const href = escapeAttr(String(node.attrs?.href ?? "#"));
      const style = node.attrs?.style === "outline" ? "outline" : "solid";
      const align = escapeAttr(String(node.attrs?.align ?? "center"));
      return `<div class="cpm-blog-cta cpm-blog-cta--${align}">` +
        `<a class="cpm-blog-cta-btn cpm-blog-cta-btn--${style}" href="${href}" target="_blank" rel="noopener noreferrer">${label}</a></div>`;
    }
```

> `proxyImageSrc` and `IMAGE_BASE_URL` come from the fixes plan (Task 4.2). If that plan hasn't landed, add `const IMAGE_BASE_URL = "";` and a passthrough `proxyImageSrc = (s: string) => s` locally, or land the fixes plan first (recommended).

- [ ] **Step 4: Run — expect PASS; typecheck.**

Run: `cd backend && npx tsx src/services/blogRender.test.ts` → all passed.
Run: `cd backend && npx tsc --noEmit` → no errors.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/services/blogRender.ts backend/src/services/blogRender.test.ts
git commit -m "feat(sections): server renderer branches for section/column/hero/statBand/cta"
```

### Task 2.2: Collab schema mirror

**Files:**
- Modify: `backend/src/collab/blogSchema.ts`

- [ ] **Step 1: Add schema-only node mirrors** (name + attrs only; no rendering) after `BlogCalloutNode`:

```ts
const SectionNode = Node.create({
  name: "section",
  group: "block",
  content: "(column | block)+",
  addAttributes() {
    return {
      layout: { default: "single" },
      background: { default: { kind: "none", value: "" } },
      padding: { default: "m" },
      width: { default: "contained" },
      theme: { default: "inherit" },
    };
  },
});

const ColumnNode = Node.create({ name: "column", group: "block", content: "block+" });

const HeroNode = Node.create({
  name: "hero", group: "block", atom: true,
  addAttributes() {
    return { heading: { default: "" }, subheading: { default: "" }, bgImage: { default: "" }, align: { default: "center" }, overlay: { default: false } };
  },
});

const StatBandNode = Node.create({
  name: "statBand", group: "block", atom: true,
  addAttributes() { return { stats: { default: [] } }; },
});

const CtaNode = Node.create({
  name: "ctaButton", group: "block", atom: true,
  addAttributes() {
    return { label: { default: "Learn more" }, href: { default: "" }, style: { default: "solid" }, align: { default: "center" } };
  },
});
```

- [ ] **Step 2: Register them** in `blogCollabExtensions()` return array (after `BlogCalloutNode`):

```ts
    SectionNode, ColumnNode, HeroNode, StatBandNode, CtaNode,
```

- [ ] **Step 3: Typecheck + commit.**

Run: `cd backend && npx tsc --noEmit` → no errors.

```bash
git add backend/src/collab/blogSchema.ts
git commit -m "feat(sections): mirror section nodes in the Hocuspocus collab schema"
```

### Task 2.3: Section + theme CSS (web + print)

**Files:**
- Modify: `public/search-theme.css` (append)
- Modify: `backend/src/services/pressKitService.ts` (`PRINT_STYLES` — mirror the section subset)

- [ ] **Step 1: Append the web CSS** to the bottom of `public/search-theme.css`:

```css
/* ===================== Section Page Builder ===================== */
/* Post theme variables live on the article wrapper (.pm-blog-post-body / .cpm-blog-editor-surface) */
.pm-blog-post-body, .cpm-blog-editor-surface {
  --post-accent: var(--pm-accent-teal, #00e5cc);
  --post-max: 760px;
}
.pm-blog-post-body[data-fontpair="oswald-lato"], .cpm-blog-editor-surface[data-fontpair="oswald-lato"] { font-family: 'Lato', system-ui, sans-serif; }
.pm-blog-post-body[data-fontpair="montserrat-worksans"], .cpm-blog-editor-surface[data-fontpair="montserrat-worksans"] { font-family: 'Work Sans', system-ui, sans-serif; }
.pm-blog-post-body[data-width="wide"], .cpm-blog-editor-surface[data-width="wide"] { --post-max: 1040px; }

.cpm-blog-section { width: 100%; }
.cpm-blog-section-inner { max-width: var(--post-max); margin: 0 auto; }
.cpm-blog-section--full .cpm-blog-section-inner { max-width: 100%; }
.cpm-blog-section--pad-s .cpm-blog-section-inner { padding: 16px 20px; }
.cpm-blog-section--pad-m .cpm-blog-section-inner { padding: 32px 20px; }
.cpm-blog-section--pad-l .cpm-blog-section-inner { padding: 56px 20px; }
.cpm-blog-section--pad-xl .cpm-blog-section-inner { padding: 88px 20px; }
.cpm-blog-section--dark { background-color: #0e1116; color: #e6ebf2; }
.cpm-blog-section--light { background-color: #ffffff; color: #14181f; }
/* Column layouts: grid that collapses to one column on mobile */
.cpm-blog-section--cols2 .cpm-blog-section-inner,
.cpm-blog-section--cols3 .cpm-blog-section-inner,
.cpm-blog-section--mediaText .cpm-blog-section-inner { display: grid; gap: 28px; align-items: start; }
.cpm-blog-section--cols2 .cpm-blog-section-inner { grid-template-columns: 1fr 1fr; }
.cpm-blog-section--cols3 .cpm-blog-section-inner { grid-template-columns: 1fr 1fr 1fr; }
.cpm-blog-section--mediaText .cpm-blog-section-inner { grid-template-columns: 1fr 1fr; }
@media (max-width: 640px) {
  .cpm-blog-section--cols2 .cpm-blog-section-inner,
  .cpm-blog-section--cols3 .cpm-blog-section-inner,
  .cpm-blog-section--mediaText .cpm-blog-section-inner { grid-template-columns: 1fr; }
}
.cpm-blog-hero { position: relative; background-size: cover; background-position: center; padding: 96px 24px; text-align: center; }
.cpm-blog-hero--left { text-align: left; }
.cpm-blog-hero-inner { max-width: var(--post-max); margin: 0 auto; position: relative; z-index: 1; }
.cpm-blog-hero h1 { font-size: 2.6rem; margin: 0 0 8px; }
.cpm-blog-hero--overlay::before { content: ""; position: absolute; inset: 0; background: rgba(0,0,0,0.45); }
.cpm-blog-statband { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 16px; margin: 12px 0; }
.cpm-blog-stat { text-align: center; padding: 14px; border: 1px solid var(--color-border, #2a2f3a); border-radius: 12px; }
.cpm-blog-stat-value { font-size: 2rem; font-weight: 800; color: var(--post-accent); }
.cpm-blog-stat-label { font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.7; }
.cpm-blog-cta { margin: 20px 0; }
.cpm-blog-cta--center { text-align: center; } .cpm-blog-cta--right { text-align: right; }
.cpm-blog-cta-btn { display: inline-block; padding: 12px 26px; border-radius: 10px; font-weight: 700; text-decoration: none; }
.cpm-blog-cta-btn--solid { background: var(--post-accent); color: #06231f; }
.cpm-blog-cta-btn--outline { border: 2px solid var(--post-accent); color: var(--post-accent); }
/* Editor affordances */
.cpm-blog-section { position: relative; }
.cpm-blog-add-section { display: block; width: 100%; border: none; background: none; color: var(--pm-accent-teal, #00e5cc);
  padding: 6px 0; font-size: 12px; cursor: pointer; opacity: 0.55; }
.cpm-blog-add-section:hover { opacity: 1; }
.cpm-blog-section-toolbar { position: absolute; top: 6px; right: 8px; display: flex; gap: 4px; background: #0b0e13;
  border: 1px solid var(--pm-accent-teal, #00e5cc); border-radius: 20px; padding: 3px 7px; z-index: 5; opacity: 0; transition: opacity .12s; }
.cpm-blog-section:hover .cpm-blog-section-toolbar, .cpm-blog-section.is-selected .cpm-blog-section-toolbar { opacity: 1; }
.cpm-blog-section-toolbar button { background: none; border: none; color: var(--pm-accent-teal, #00e5cc); cursor: pointer; padding: 2px 5px; }
```

- [ ] **Step 2: Mirror the print subset** into `PRINT_STYLES` in `pressKitService.ts` (append inside the template string, before the closing backtick). Print exports are single-column and light:

```css
  .cpm-blog-section-inner { max-width: 100%; padding: 10px 0; }
  .cpm-blog-section--cols2 .cpm-blog-section-inner, .cpm-blog-section--cols3 .cpm-blog-section-inner,
  .cpm-blog-section--mediaText .cpm-blog-section-inner { display: grid; gap: 18px; }
  .cpm-blog-section--cols2 .cpm-blog-section-inner, .cpm-blog-section--mediaText .cpm-blog-section-inner { grid-template-columns: 1fr 1fr; }
  .cpm-blog-section--cols3 .cpm-blog-section-inner { grid-template-columns: 1fr 1fr 1fr; }
  .cpm-blog-hero { padding: 40px 10px; text-align: center; }
  .cpm-blog-hero h1 { font-size: 26px; }
  .cpm-blog-statband { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px,1fr)); gap: 12px; }
  .cpm-blog-stat { border: 1px solid #e2e6ea; border-radius: 8px; padding: 10px; text-align: center; }
  .cpm-blog-stat-value { font-size: 20px; font-weight: 800; color: var(--accent); }
  .cpm-blog-stat-label { font-size: 9px; letter-spacing: 1px; text-transform: uppercase; color: #666; }
  .cpm-blog-cta { text-align: center; margin: 14px 0; }
  .cpm-blog-cta-btn { display: inline-block; padding: 8px 18px; border-radius: 6px; background: var(--accent); color: #06231f; font-weight: 700; text-decoration: none; }
  .cpm-blog-section-toolbar, .cpm-blog-add-section { display: none; }
```

- [ ] **Step 3: Build + typecheck + commit.**

Run (repo root): `npm run build` → compiles.
Run: `cd backend && npx tsc --noEmit` → no errors.

```bash
git add public/search-theme.css backend/src/services/pressKitService.ts
git commit -m "feat(sections): web + print CSS for sections, hero, stat band, CTA, theme"
```

---

## Phase 3 — Frontend node definitions

### Task 3.1: Simple nodes — column, hero, statBand, cta

**Files:**
- Create: `src/components/clubpm/blog/BlogColumn.jsx`
- Create: `src/components/clubpm/blog/BlogHero.jsx`
- Create: `src/components/clubpm/blog/BlogStatBand.jsx`
- Create: `src/components/clubpm/blog/BlogCta.jsx`

- [ ] **Step 1: `BlogColumn.jsx`** — a plain content container:

```jsx
import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';

function ColumnView() {
  return (
    <NodeViewWrapper as="div" className="cpm-blog-col">
      <NodeViewContent className="cpm-blog-col-content" />
    </NodeViewWrapper>
  );
}

export const BlogColumn = Node.create({
  name: 'column',
  group: 'block',
  content: 'block+',
  addNodeView() { return ReactNodeViewRenderer(ColumnView); },
});

export default BlogColumn;
```

- [ ] **Step 2: `BlogHero.jsx`** — an atom with inline heading/subheading editing:

```jsx
import React from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';

function HeroView({ node, updateAttributes, editor }) {
  const { heading, subheading, bgImage, align, overlay } = node.attrs;
  const editable = editor.isEditable;
  const style = bgImage ? { backgroundImage: `url(${bgImage})` } : undefined;
  return (
    <NodeViewWrapper as="header" className={`cpm-blog-hero cpm-blog-hero--${align || 'center'}${overlay ? ' cpm-blog-hero--overlay' : ''}`} style={style}>
      <div className="cpm-blog-hero-inner" contentEditable={false}>
        {editable ? (
          <>
            <input className="cpm-blog-hero-h" value={heading || ''} placeholder="Hero heading"
              onChange={(e) => updateAttributes({ heading: e.target.value })} />
            <input className="cpm-blog-hero-s" value={subheading || ''} placeholder="Subheading"
              onChange={(e) => updateAttributes({ subheading: e.target.value })} />
            <div className="cpm-blog-hero-controls">
              <input placeholder="Background image URL" value={bgImage || ''} onChange={(e) => updateAttributes({ bgImage: e.target.value })} />
              <select value={align || 'center'} onChange={(e) => updateAttributes({ align: e.target.value })}>
                <option value="center">Center</option><option value="left">Left</option>
              </select>
              <label><input type="checkbox" checked={!!overlay} onChange={(e) => updateAttributes({ overlay: e.target.checked })} /> Overlay</label>
            </div>
          </>
        ) : (
          <>{heading && <h1>{heading}</h1>}{subheading && <p>{subheading}</p>}</>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const BlogHero = Node.create({
  name: 'hero', group: 'block', atom: true, selectable: true, draggable: true,
  addAttributes() {
    return { heading: { default: '' }, subheading: { default: '' }, bgImage: { default: '' }, align: { default: 'center' }, overlay: { default: false } };
  },
  parseHTML() { return [{ tag: 'header[data-type="blog-hero"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['header', mergeAttributes(HTMLAttributes, { 'data-type': 'blog-hero' })]; },
  addNodeView() { return ReactNodeViewRenderer(HeroView); },
});

export default BlogHero;
```

- [ ] **Step 3: `BlogStatBand.jsx`** — editable list of `{ label, value }` tiles:

```jsx
import React from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';

function StatBandView({ node, updateAttributes, editor }) {
  const stats = Array.isArray(node.attrs.stats) ? node.attrs.stats : [];
  const editable = editor.isEditable;
  const setStat = (i, patch) => updateAttributes({ stats: stats.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const add = () => updateAttributes({ stats: [...stats, { label: 'LABEL', value: '0' }] });
  const remove = (i) => updateAttributes({ stats: stats.filter((_, j) => j !== i) });
  return (
    <NodeViewWrapper as="div" className="cpm-blog-statband" contentEditable={false}>
      {stats.map((s, i) => (
        <div key={i} className="cpm-blog-stat">
          {editable ? (
            <>
              <input className="cpm-blog-stat-value" value={s.value || ''} onChange={(e) => setStat(i, { value: e.target.value })} />
              <input className="cpm-blog-stat-label" value={s.label || ''} onChange={(e) => setStat(i, { label: e.target.value })} />
              <button type="button" className="cpm-blog-stat-x" onClick={() => remove(i)} title="Remove"><i className="fas fa-xmark" /></button>
            </>
          ) : (
            <><div className="cpm-blog-stat-value">{s.value}</div><div className="cpm-blog-stat-label">{s.label}</div></>
          )}
        </div>
      ))}
      {editable && <button type="button" className="cpm-blog-stat-add" onClick={add} title="Add stat"><i className="fas fa-plus" /></button>}
    </NodeViewWrapper>
  );
}

export const BlogStatBand = Node.create({
  name: 'statBand', group: 'block', atom: true, selectable: true, draggable: true,
  addAttributes() { return { stats: { default: [] } }; },
  parseHTML() { return [{ tag: 'div[data-type="blog-statband"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'blog-statband' })]; },
  addNodeView() { return ReactNodeViewRenderer(StatBandView); },
});

export default BlogStatBand;
```

- [ ] **Step 4: `BlogCta.jsx`** — an editable button:

```jsx
import React from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';

function CtaView({ node, updateAttributes, editor }) {
  const { label, href, style, align } = node.attrs;
  const editable = editor.isEditable;
  return (
    <NodeViewWrapper as="div" className={`cpm-blog-cta cpm-blog-cta--${align || 'center'}`} contentEditable={false}>
      {editable ? (
        <div className="cpm-blog-cta-edit">
          <input placeholder="Button label" value={label || ''} onChange={(e) => updateAttributes({ label: e.target.value })} />
          <input placeholder="https://…" value={href || ''} onChange={(e) => updateAttributes({ href: e.target.value })} />
          <select value={style || 'solid'} onChange={(e) => updateAttributes({ style: e.target.value })}>
            <option value="solid">Solid</option><option value="outline">Outline</option>
          </select>
          <select value={align || 'center'} onChange={(e) => updateAttributes({ align: e.target.value })}>
            <option value="center">Center</option><option value="left">Left</option><option value="right">Right</option>
          </select>
        </div>
      ) : (
        <a className={`cpm-blog-cta-btn cpm-blog-cta-btn--${style || 'solid'}`} href={href || '#'}>{label || 'Learn more'}</a>
      )}
    </NodeViewWrapper>
  );
}

export const BlogCta = Node.create({
  name: 'ctaButton', group: 'block', atom: true, selectable: true, draggable: true,
  addAttributes() { return { label: { default: 'Learn more' }, href: { default: '' }, style: { default: 'solid' }, align: { default: 'center' } }; },
  parseHTML() { return [{ tag: 'div[data-type="blog-cta"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'blog-cta' })]; },
  addNodeView() { return ReactNodeViewRenderer(CtaView); },
});

export default BlogCta;
```

- [ ] **Step 5: Add editor styles** for the in-editor form controls (append to `public/search-theme.css`):

```css
.cpm-blog-hero-h, .cpm-blog-hero-s { display:block; width:100%; background:transparent; border:none; text-align:inherit; color:inherit; }
.cpm-blog-hero-h { font-size:2.2rem; font-weight:800; }
.cpm-blog-hero-controls { display:flex; gap:8px; margin-top:8px; flex-wrap:wrap; font-size:12px; }
.cpm-blog-stat-value input, .cpm-blog-stat input { width:100%; background:transparent; border:1px dashed var(--color-border,#2a2f3a); border-radius:6px; text-align:center; color:inherit; }
.cpm-blog-stat-add, .cpm-blog-stat-x { background:none; border:none; color:var(--pm-accent-teal,#00e5cc); cursor:pointer; }
.cpm-blog-cta-edit { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
.cpm-blog-cta-edit input, .cpm-blog-cta-edit select { background:var(--pm-elevated,#1b2130); border:1px solid var(--color-border,#2a2f3a); border-radius:6px; color:inherit; padding:6px 8px; }
```

- [ ] **Step 6: Build + commit.**

Run (repo root): `npm run build` → compiles (nodes exist but aren't registered yet — that's fine).

```bash
git add src/components/clubpm/blog/BlogColumn.jsx src/components/clubpm/blog/BlogHero.jsx src/components/clubpm/blog/BlogStatBand.jsx src/components/clubpm/blog/BlogCta.jsx public/search-theme.css
git commit -m "feat(sections): column/hero/statBand/cta TipTap node views"
```

### Task 3.2: The `section` node + register the set

**Files:**
- Create: `src/components/clubpm/blog/BlogSection.jsx`
- Create: `src/components/clubpm/blog/sectionNodes.js`
- Modify: `src/components/clubpm/blog/BlogEditor.jsx` (`blogExtensions`)

- [ ] **Step 1: `sectionNodes.js`** — factories that build a starter `section` for each library entry (used by the library popover in Phase 4):

```js
// Starter content builders for each Section Library entry. Each returns a
// TipTap JSON `section` node inserted via editor.chain().insertContent(...).
const emptyPara = () => ({ type: 'paragraph' });
const col = (text) => ({ type: 'column', content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }] });

export const SECTION_PRESETS = [
  { id: 'hero', label: 'Hero / cover', icon: 'fa-image',
    build: () => ({ type: 'section', attrs: { layout: 'single', padding: 'xl', width: 'fullBleed' },
      content: [{ type: 'hero', attrs: { heading: 'Your headline', subheading: 'A short supporting line', align: 'center', overlay: false, bgImage: '' } }] }) },
  { id: 'text', label: 'Rich text', icon: 'fa-align-left',
    build: () => ({ type: 'section', attrs: { layout: 'single' }, content: [emptyPara()] }) },
  { id: 'mediaText', label: 'Media + text', icon: 'fa-image',
    build: () => ({ type: 'section', attrs: { layout: 'mediaText' }, content: [col(''), col('Describe it here.')] }) },
  { id: 'cols2', label: 'Two columns', icon: 'fa-table-columns',
    build: () => ({ type: 'section', attrs: { layout: 'cols2' }, content: [col('Column one'), col('Column two')] }) },
  { id: 'cols3', label: 'Three columns', icon: 'fa-table-columns',
    build: () => ({ type: 'section', attrs: { layout: 'cols3' }, content: [col('One'), col('Two'), col('Three')] }) },
  { id: 'stats', label: 'Stat band', icon: 'fa-chart-simple',
    build: () => ({ type: 'section', attrs: { layout: 'single' },
      content: [{ type: 'statBand', attrs: { stats: [{ label: 'HOURS', value: '0' }, { label: 'TASKS', value: '0' }, { label: 'MEMBERS', value: '0' }] } }] }) },
  { id: 'quote', label: 'Quote', icon: 'fa-quote-right',
    build: () => ({ type: 'section', attrs: { layout: 'single', padding: 'l' },
      content: [{ type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A memorable quote.' }] }] }] }) },
  { id: 'cta', label: 'Call to action', icon: 'fa-bullhorn',
    build: () => ({ type: 'section', attrs: { layout: 'single', padding: 'l' },
      content: [{ type: 'ctaButton', attrs: { label: 'Get involved', href: '', style: 'solid', align: 'center' } }] }) },
  { id: 'gallery', label: 'Image gallery', icon: 'fa-images',
    build: () => ({ type: 'section', attrs: { layout: 'single' }, content: [{ type: 'gallery', attrs: { images: [] } }] }) },
  { id: 'callout', label: 'Callout', icon: 'fa-circle-info',
    build: () => ({ type: 'section', attrs: { layout: 'single' }, content: [{ type: 'callout', attrs: { variant: 'info' }, content: [emptyPara()] }] }) },
  { id: 'divider', label: 'Divider', icon: 'fa-minus',
    build: () => ({ type: 'section', attrs: { layout: 'single', padding: 's' }, content: [{ type: 'horizontalRule' }] }) },
];
```

- [ ] **Step 2: `BlogSection.jsx`** — the container NodeView with a floating toolbar; it renders its children and, when selected, cooperates with the settings panel via a custom event:

```jsx
import React from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';

function SectionView({ node, editor, getPos, selected }) {
  const { layout, background, padding, width, theme } = node.attrs;
  const editable = editor.isEditable;
  const bgStyle = background?.kind === 'color' && background.value ? { backgroundColor: background.value }
    : background?.kind === 'image' && background.value ? { backgroundImage: `url(${background.value})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : undefined;
  const cls = [
    'cpm-blog-section', `cpm-blog-section--${layout || 'single'}`, `cpm-blog-section--pad-${padding || 'm'}`,
    `cpm-blog-section--${width === 'fullBleed' ? 'full' : 'contained'}`,
    theme && theme !== 'inherit' ? `cpm-blog-section--${theme}` : '', selected ? 'is-selected' : '',
  ].filter(Boolean).join(' ');

  const move = (dir) => {
    if (typeof getPos !== 'function') return;
    const pos = getPos();
    editor.chain().focus().command(({ tr, state }) => {
      const $pos = state.doc.resolve(pos);
      const index = $pos.index();
      const parent = $pos.parent;
      const target = index + dir;
      if (target < 0 || target >= parent.childCount) return false;
      const cur = parent.child(index);
      const other = parent.child(target);
      const from = dir < 0 ? pos - other.nodeSize : pos;
      tr.delete(pos, pos + cur.nodeSize);
      tr.insert(dir < 0 ? from : from - cur.nodeSize + cur.nodeSize, cur); // reinsert
      return true;
    }).run();
  };
  const duplicate = () => {
    if (typeof getPos !== 'function') return;
    const pos = getPos();
    editor.chain().focus().insertContentAt(pos + node.nodeSize, node.toJSON()).run();
  };
  const remove = () => {
    if (typeof getPos !== 'function') return;
    const pos = getPos();
    editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
  };
  const openSettings = () => {
    window.dispatchEvent(new CustomEvent('blog-section-settings', { detail: { pos: getPos?.() } }));
  };

  return (
    <NodeViewWrapper as="section" className={cls} style={bgStyle}>
      {editable && (
        <div className="cpm-blog-section-toolbar" contentEditable={false}>
          <button type="button" title="Move up" onClick={() => move(-1)}><i className="fas fa-arrow-up" /></button>
          <button type="button" title="Move down" onClick={() => move(1)}><i className="fas fa-arrow-down" /></button>
          <button type="button" title="Duplicate" onClick={duplicate}><i className="fas fa-clone" /></button>
          <button type="button" title="Style" onClick={openSettings}><i className="fas fa-palette" /></button>
          <button type="button" title="Delete" onClick={remove}><i className="fas fa-trash" /></button>
        </div>
      )}
      <NodeViewContent className="cpm-blog-section-inner" />
    </NodeViewWrapper>
  );
}

export const BlogSection = Node.create({
  name: 'section',
  group: 'block',
  content: '(column | block)+',
  defining: true,
  addAttributes() {
    return {
      layout: { default: 'single' },
      background: { default: { kind: 'none', value: '' } },
      padding: { default: 'm' },
      width: { default: 'contained' },
      theme: { default: 'inherit' },
    };
  },
  parseHTML() { return [{ tag: 'section[data-type="blog-section"]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ['section', mergeAttributes(HTMLAttributes, { 'data-type': 'blog-section' }), 0];
  },
  addNodeView() { return ReactNodeViewRenderer(SectionView); },
});

export default BlogSection;
```

> The `move()` reorder uses a ProseMirror transaction; if the inline reinsert proves finicky during testing, replace its body with the simpler "cut node JSON, delete, insert at sibling position" approach: read `parent`/`index`, compute the sibling's position, `tr.delete` the current node, then `tr.insert(siblingPos, curNode)`. Keep the public behavior (swap with previous/next sibling) identical.

- [ ] **Step 3: Register all section nodes** in `blogExtensions()` (`BlogEditor.jsx`). Add imports at the top:

```jsx
import BlogSection from './BlogSection';
import BlogColumn from './BlogColumn';
import BlogHero from './BlogHero';
import BlogStatBand from './BlogStatBand';
import BlogCta from './BlogCta';
```

And add them to the returned array (after `BlogCallout`):

```jsx
    BlogSection,
    BlogColumn,
    BlogHero,
    BlogStatBand,
    BlogCta,
```

- [ ] **Step 4: Build + commit.**

Run (repo root): `npm run build` → compiles.

```bash
git add src/components/clubpm/blog/BlogSection.jsx src/components/clubpm/blog/sectionNodes.js src/components/clubpm/blog/BlogEditor.jsx
git commit -m "feat(sections): section container node + register the section node set"
```

---

## Phase 4 — Editor UX: library, settings panel, theme bar

### Task 4.1: Section Library popover + insert affordance

**Files:**
- Create: `src/components/clubpm/blog/BlogSectionLibrary.jsx`
- Modify: `src/components/clubpm/blog/BlogEditor.jsx` (toolbar button + state)

- [ ] **Step 1: `BlogSectionLibrary.jsx`:**

```jsx
import React from 'react';
import { SECTION_PRESETS } from './sectionNodes';

export default function BlogSectionLibrary({ editor, onClose }) {
  if (!editor) return null;
  const insert = (preset) => {
    editor.chain().focus().insertContent(preset.build()).run();
    onClose();
  };
  return (
    <div className="cpm-blog-seclib" role="dialog" aria-label="Add section">
      <div className="cpm-blog-seclib-head">
        <span>Add a section</span>
        <button type="button" className="cpm-blog-tb-btn" onClick={onClose} aria-label="Close"><i className="fas fa-xmark" /></button>
      </div>
      <div className="cpm-blog-seclib-grid">
        {SECTION_PRESETS.map((p) => (
          <button key={p.id} type="button" className="cpm-blog-seclib-item" onClick={() => insert(p)}>
            <i className={`fas ${p.icon}`} aria-hidden="true" />
            <span>{p.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire an "Add section" toolbar button + popover** into `BlogEditor.jsx`. Add state near the other `useState`s:

```jsx
  const [showSecLib, setShowSecLib] = React.useState(false);
```

Import at top:

```jsx
import BlogSectionLibrary from './BlogSectionLibrary';
```

Pass a handler to `Toolbar` (add prop `onAddSection={() => setShowSecLib(true)}`) and add a button in the `Toolbar` component near the Snippets button:

```jsx
      <Btn title="Add section" icon="fa-square-plus" onClick={onAddSection} pinned />
```

Render the popover under the toolbar row (near the `FindBar`):

```jsx
      {showSecLib && <BlogSectionLibrary editor={editor} onClose={() => setShowSecLib(false)} />}
```

- [ ] **Step 3: Library styles** (append to `public/search-theme.css`):

```css
.cpm-blog-seclib { position:absolute; z-index:60; margin-top:6px; background:var(--pm-elevated,#1b2130);
  border:1px solid var(--color-border,#2a2f3a); border-radius:12px; padding:12px; width:min(520px,92vw); box-shadow:0 12px 40px rgba(0,0,0,.4); }
.cpm-blog-seclib-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; color:var(--pm-text,#e6ebf2); }
.cpm-blog-seclib-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(120px,1fr)); gap:8px; }
.cpm-blog-seclib-item { display:flex; flex-direction:column; align-items:center; gap:8px; padding:14px 8px;
  background:var(--pm-surface,#141b26); border:1px solid var(--color-border,#2a2f3a); border-radius:10px; color:var(--pm-text,#c7d0dd); cursor:pointer; }
.cpm-blog-seclib-item:hover { border-color:var(--pm-accent-teal,#00e5cc); color:var(--pm-accent-teal,#00e5cc); }
.cpm-blog-seclib-item i { font-size:18px; }
```

- [ ] **Step 4: Build + commit.**

Run (repo root): `npm run build` → compiles.

```bash
git add src/components/clubpm/blog/BlogSectionLibrary.jsx src/components/clubpm/blog/BlogEditor.jsx public/search-theme.css
git commit -m "feat(sections): section library popover + Add-section toolbar button"
```

### Task 4.2: Section Settings panel

**Files:**
- Create: `src/components/clubpm/blog/BlogSectionSettings.jsx`
- Modify: `src/components/clubpm/blog/BlogEditor.jsx`

- [ ] **Step 1: `BlogSectionSettings.jsx`** — reads/writes the selected section's attrs. It resolves the section at `pos` and updates via a transaction:

```jsx
import React from 'react';

const SEG = (opts, value, onPick) => (
  <div className="cpm-blog-seg">
    {opts.map(([v, label]) => (
      <button key={v} type="button" className={`cpm-blog-seg-b${value === v ? ' on' : ''}`} onClick={() => onPick(v)}>{label}</button>
    ))}
  </div>
);

export default function BlogSectionSettings({ editor, pos, onClose }) {
  const [attrs, setAttrs] = React.useState(null);

  React.useEffect(() => {
    if (!editor || pos == null) return;
    const node = editor.state.doc.nodeAt(pos);
    if (node && node.type.name === 'section') setAttrs({ ...node.attrs });
  }, [editor, pos]);

  if (!attrs) return null;
  const update = (patch) => {
    const next = { ...attrs, ...patch };
    setAttrs(next);
    editor.chain().command(({ tr }) => { tr.setNodeMarkup(pos, undefined, next); return true; }).run();
  };
  const bg = attrs.background || { kind: 'none', value: '' };

  return (
    <div className="cpm-blog-secset" role="dialog" aria-label="Section settings">
      <div className="cpm-blog-secset-head"><span>Section settings</span>
        <button type="button" className="cpm-blog-tb-btn" onClick={onClose}><i className="fas fa-xmark" /></button></div>

      <label className="cpm-blog-secset-lab">Layout</label>
      {SEG([['single','1 col'],['mediaText','Media+text'],['cols2','2 col'],['cols3','3 col']], attrs.layout, (v) => update({ layout: v }))}

      <label className="cpm-blog-secset-lab">Background</label>
      {SEG([['none','None'],['color','Color'],['image','Image']], bg.kind, (v) => update({ background: { kind: v, value: v === 'none' ? '' : bg.value } }))}
      {bg.kind === 'color' && <input type="color" value={bg.value || '#111111'} onChange={(e) => update({ background: { kind: 'color', value: e.target.value } })} />}
      {bg.kind === 'image' && <input placeholder="Image URL" value={bg.value || ''} onChange={(e) => update({ background: { kind: 'image', value: e.target.value } })} />}

      <label className="cpm-blog-secset-lab">Padding</label>
      {SEG([['s','S'],['m','M'],['l','L'],['xl','XL']], attrs.padding, (v) => update({ padding: v }))}

      <label className="cpm-blog-secset-lab">Width</label>
      {SEG([['contained','Contained'],['fullBleed','Full-bleed']], attrs.width, (v) => update({ width: v }))}

      <label className="cpm-blog-secset-lab">Section theme</label>
      {SEG([['inherit','Inherit'],['light','Light'],['dark','Dark']], attrs.theme, (v) => update({ theme: v }))}
    </div>
  );
}
```

- [ ] **Step 2: Host the panel in `BlogEditor.jsx`.** Add state + an effect listening for the `blog-section-settings` event dispatched by `SectionView.openSettings`:

```jsx
  const [settingsPos, setSettingsPos] = React.useState(null);
  React.useEffect(() => {
    const handler = (e) => setSettingsPos(e.detail?.pos ?? null);
    window.addEventListener('blog-section-settings', handler);
    return () => window.removeEventListener('blog-section-settings', handler);
  }, []);
```

Import and render it (near the section library):

```jsx
import BlogSectionSettings from './BlogSectionSettings';
```
```jsx
      {settingsPos != null && (
        <BlogSectionSettings editor={editor} pos={settingsPos} onClose={() => setSettingsPos(null)} />
      )}
```

- [ ] **Step 3: Settings styles** (append to `public/search-theme.css`):

```css
.cpm-blog-secset { position:absolute; right:12px; top:64px; z-index:60; width:230px; background:var(--pm-elevated,#1b2130);
  border:1px solid var(--color-border,#2a2f3a); border-radius:12px; padding:12px; box-shadow:0 12px 40px rgba(0,0,0,.4); }
.cpm-blog-secset-head { display:flex; justify-content:space-between; align-items:center; color:var(--pm-text,#e6ebf2); margin-bottom:8px; }
.cpm-blog-secset-lab { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.05em; opacity:.7; margin:10px 0 5px; }
.cpm-blog-seg { display:flex; gap:4px; flex-wrap:wrap; }
.cpm-blog-seg-b { background:var(--pm-surface,#141b26); border:1px solid var(--color-border,#2a2f3a); border-radius:6px; color:var(--pm-text,#c7d0dd); padding:5px 9px; font-size:11px; cursor:pointer; }
.cpm-blog-seg-b.on { background:rgba(0,229,204,.14); border-color:var(--pm-accent-teal,#00e5cc); color:var(--pm-accent-teal,#00e5cc); }
```

- [ ] **Step 4: Build + commit.**

Run (repo root): `npm run build` → compiles.

```bash
git add src/components/clubpm/blog/BlogSectionSettings.jsx src/components/clubpm/blog/BlogEditor.jsx public/search-theme.css
git commit -m "feat(sections): per-section settings panel (layout/background/padding/width/theme)"
```

### Task 4.3: Theme bar + apply theme to editor and public render

**Files:**
- Create: `src/components/clubpm/blog/BlogThemeBar.jsx`
- Modify: `src/components/clubpm/blog/BlogEditor.jsx` (accept `theme` + `onThemeChange`; set data-attrs on the surface)
- Modify: `src/pages/ClubPM/BlogEditorPage.jsx` (persist theme via `updateBlogPost`)
- Modify: `src/pages/BlogPost.jsx` (apply theme vars on the public article)

- [ ] **Step 1: `BlogThemeBar.jsx`:**

```jsx
import React from 'react';

const FONTS = [['syne-dmsans', 'Syne / DM Sans'], ['oswald-lato', 'Oswald / Lato'], ['montserrat-worksans', 'Montserrat / Work Sans']];

export default function BlogThemeBar({ theme, onChange }) {
  const t = theme || { accent: '#00e5cc', fontPair: 'syne-dmsans', width: 'wide' };
  const set = (patch) => onChange({ ...t, ...patch });
  return (
    <div className="cpm-blog-themebar" contentEditable={false}>
      <span className="cpm-blog-themebar-lab">Theme</span>
      <label title="Accent color"><input type="color" value={t.accent} onChange={(e) => set({ accent: e.target.value })} /></label>
      <select value={t.fontPair} onChange={(e) => set({ fontPair: e.target.value })}>
        {FONTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <select value={t.width} onChange={(e) => set({ width: e.target.value })}>
        <option value="narrow">Narrow</option><option value="wide">Wide</option>
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Accept + apply theme in `BlogEditor.jsx`.** Extend the signature to accept `theme` and `onThemeChange`, render `<BlogThemeBar>` in the toolbar row, and set data-attributes + accent var on the editor surface. Import it, then change the `EditorContent` wrapper:

```jsx
import BlogThemeBar from './BlogThemeBar';
```

Signature:

```jsx
export default function BlogEditor({ content, onChange, editable = true, onEditorReady, postId, collabUser, collabWsUrl, theme, onThemeChange }) {
```

Render the theme bar (only when `onThemeChange` is provided) inside `cpm-blog-toolbar-row`, after `<Toolbar .../>`:

```jsx
        {onThemeChange && <BlogThemeBar theme={theme} onChange={onThemeChange} />}
```

Apply theme to the surface — replace the `<EditorContent .../>` element with a themed wrapper:

```jsx
        <div
          className="cpm-blog-editor-surface-wrap"
          data-fontpair={theme?.fontPair || 'syne-dmsans'}
          data-width={theme?.width || 'wide'}
          style={{ '--post-accent': theme?.accent || 'var(--pm-accent-teal)' }}
        >
          <EditorContent editor={editor} className="cpm-blog-editor-surface" />
        </div>
```

- [ ] **Step 3: Persist theme in `BlogEditorPage.jsx`.** Add `theme` state seeded from the post, pass it + an `onThemeChange` that PATCHes:

```jsx
  const [theme, setTheme] = useState(null);
```

In the load `.then((p) => {...})`, add `setTheme(p.theme ?? null);`. Add a handler:

```jsx
  const handleThemeChange = useCallback((next) => {
    setTheme(next);
    updateBlogPost(id, { theme: next }).catch(() => {});
  }, [id]);
```

Pass to `<BlogEditor>`: `theme={theme} onThemeChange={handleThemeChange}`.

> **Verify** `blogService.updatePost` forwards a `theme` field to `prisma.blogPost.update`. Open `backend/src/services/blogService.ts`; if `updatePost` whitelists specific fields, add `theme` to that set. (Do this in this task's commit.)

- [ ] **Step 4: Apply theme on the public post** (`src/pages/BlogPost.jsx`). Wrap the `pm-blog-post-body` with theme data-attrs + accent var:

```jsx
            <div
              className="pm-blog-post-body"
              data-fontpair={post.theme?.fontPair || 'syne-dmsans'}
              data-width={post.theme?.width || 'wide'}
              style={post.theme?.accent ? { '--post-accent': post.theme.accent } : undefined}
              dangerouslySetInnerHTML={{ __html: post.renderedHtml || '' }}
            />
```

> Confirm the public blog API (`GET /api/public/blog/:slug`) returns `theme`. If it selects explicit fields, add `theme` to that select in `backend/src/api/public.ts` / `blogService`.

- [ ] **Step 5: Theme bar styles** (append to `public/search-theme.css`):

```css
.cpm-blog-themebar { display:flex; align-items:center; gap:8px; padding:4px 8px; border:1px solid var(--color-border,#2a2f3a); border-radius:8px; }
.cpm-blog-themebar-lab { font-size:11px; text-transform:uppercase; letter-spacing:.06em; opacity:.7; }
.cpm-blog-themebar select { background:var(--pm-surface,#141b26); border:1px solid var(--color-border,#2a2f3a); border-radius:6px; color:inherit; font-size:12px; padding:4px 6px; }
```

- [ ] **Step 6: Build + typecheck + commit.**

Run (repo root): `npm run build` → compiles.
Run: `cd backend && npx tsc --noEmit` → no errors (only if blogService/public were touched).

```bash
git add src/components/clubpm/blog/BlogThemeBar.jsx src/components/clubpm/blog/BlogEditor.jsx src/pages/ClubPM/BlogEditorPage.jsx src/pages/BlogPost.jsx public/search-theme.css backend/src/services/blogService.ts backend/src/api/public.ts
git commit -m "feat(sections): post theme bar + apply theme in editor and public render"
```

### Task 4.4: Wire theme into the Press Kit panel

**Files:**
- Modify: `src/components/clubpm/PressKitPanel.jsx`
- Modify: `backend/src/api/pressKit.ts` (accept `theme` on PATCH; return it on GET)

- [ ] **Step 1: Backend — accept + return `theme`.** In `pressKit.ts` GET handler response (the `res.json({...})`), add `theme: kit.theme`. In the PATCH `/press-kit` handler, after computing `config`, also persist a `theme` if present:

```ts
    const theme = (req.body ?? {}).theme;
    await prisma.projectPressKit.update({
      where: { id: kit.id },
      data: { config: config as unknown as Prisma.InputJsonValue, ...(theme !== undefined ? { theme: theme as Prisma.InputJsonValue } : {}) },
    });
    res.json({ config, theme: theme ?? normalizePressKitConfig(kit.config) && kit.theme });
```

> Keep it simple: return `{ config, theme: theme ?? kit.theme }`.

- [ ] **Step 2: Frontend — theme state in `PressKitPanel.jsx`.** Seed `theme` from the kit, pass `theme`/`onThemeChange` to `<BlogEditor>`, persisting via `updatePressKitConfig(projectId, { theme: next })`:

```jsx
  const [theme, setTheme] = useState(null);
```

In the load `.then((k) => {...})` add `setTheme(k.theme ?? null);`. Add:

```jsx
  const handleThemeChange = useCallback((next) => {
    setTheme(next);
    updatePressKitConfig(projectId, { theme: next }).catch(() => {});
  }, [projectId]);
```

Pass to the `<BlogEditor>` in the editor state: `theme={theme} onThemeChange={canEdit ? handleThemeChange : undefined}`.

- [ ] **Step 3: Public press-kit render applies theme.** In `pressKitService.ts` `buildPressKitHtml`, read `kit.theme` and inject the accent var + data-attrs onto the `<body>` (the print shell already sets `--accent` from config; prefer `theme.accent` when present):

```ts
  const theme = (kit.theme ?? null) as { accent?: string; fontPair?: string; width?: string } | null;
  const accentFinal = theme?.accent || config.accentColor;
```

Use `accentFinal` in the `:root{--accent:...}` line, and add `data-fontpair`/`data-width` to `<body>` if you mirror those font rules into `PRINT_STYLES` (optional).

- [ ] **Step 4: Build + typecheck + commit.**

Run (repo root): `npm run build` → compiles.
Run: `cd backend && npx tsc --noEmit` → no errors.

```bash
git add src/components/clubpm/PressKitPanel.jsx backend/src/api/pressKit.ts backend/src/services/pressKitService.ts
git commit -m "feat(sections): press-kit theme (accent/font/width) in editor + public render"
```

---

## Phase 5 — Section-based press-kit generation + polish

### Task 5.1: Seed generation as sections

**Files:**
- Modify: `backend/src/services/pressKitService.ts` (`generatePressKitContent`)

**Context:** Today `generatePressKitContent` builds markdown → `markdownToTiptapJson` (loose blocks). Now wrap the key sections as `section` nodes and use `hero`/`statBand`/`ctaButton` where they fit, so a freshly generated kit already uses the builder.

- [ ] **Step 1: Add a section-wrapping assembler.** Alongside `buildPressKitMarkdown`, add `buildPressKitDoc(ctx, config, prose): PMDoc` that returns a doc of `section` nodes. Minimum viable version — wrap the existing markdown output in a single `section` and prepend a `hero` + `statBand`:

```ts
import type { PMDoc, PMNode } from "./blogRender.js";

export function buildPressKitDoc(ctx: PressKitContext, config: PressKitConfig, prose: PressKitProse): PMDoc {
  const sections: PMNode[] = [];
  const has = (id: string) => config.includedSections.includes(id);

  if (has("masthead")) {
    sections.push({ type: "section", attrs: { layout: "single", padding: "xl", width: "fullBleed" },
      content: [{ type: "hero", attrs: { heading: ctx.project.name, subheading: [ctx.project.type, ctx.project.status].filter(Boolean).join(" · "), align: "center", overlay: false, bgImage: "" } }] });
  }
  if (has("stats")) {
    sections.push({ type: "section", attrs: { layout: "single", padding: "l" },
      content: [{ type: "statBand", attrs: { stats: [
        { label: "TEAM", value: String(ctx.stats.teamSize) },
        { label: "TASKS DONE", value: `${ctx.stats.tasksDone}/${ctx.stats.tasksTotal}` },
        { label: "MILESTONES", value: String(ctx.stats.milestonesHit) },
        { label: "HOURS", value: String(ctx.stats.hoursLogged) },
      ] } }] });
  }
  // Prose + remaining sections: reuse the markdown assembler, minus masthead/stats, wrapped in one section.
  const restConfig = { ...config, includedSections: config.includedSections.filter((s) => s !== "masthead" && s !== "stats") };
  const md = buildPressKitMarkdown(ctx, restConfig, prose);
  const restDoc = markdownToTiptapJson(md);
  if (restDoc.content && restDoc.content.length) {
    sections.push({ type: "section", attrs: { layout: "single", padding: "l" }, content: restDoc.content });
  }
  if (config.audience === "SPONSORS" && has("sponsorship")) {
    sections.push({ type: "section", attrs: { layout: "single", padding: "l" },
      content: [{ type: "ctaButton", attrs: { label: "Become a sponsor", href: config.contactEmail ? `mailto:${config.contactEmail}` : "", style: "solid", align: "center" } }] });
  }
  return { type: "doc", content: sections.length ? sections : [{ type: "paragraph" }] };
}
```

- [ ] **Step 2: Call it from `generatePressKitContent`.** Replace the final `return markdownToTiptapJson(md);` with:

```ts
  return buildPressKitDoc(ctx, config, prose);
```

(Keep `buildPressKitMarkdown` — it's reused inside `buildPressKitDoc` and still unit-tested.)

- [ ] **Step 3: Typecheck + run the press-kit test.**

Run: `cd backend && npx tsc --noEmit` → no errors.
Run: `cd backend && npx tsx src/services/pressKitService.test.ts` → passes (markdown assembler unchanged).

- [ ] **Step 4: Commit.**

```bash
git add backend/src/services/pressKitService.ts
git commit -m "feat(sections): press-kit generation seeds hero + stat band + sections"
```

### Task 5.2: Preview parity + final verification

**Files:**
- Modify: `src/pages/ClubPM/BlogEditorPage.jsx` (preview wrapper gets theme attrs — mirror Task 4.3 Step 4)

- [ ] **Step 1: Theme the preview.** In `BlogEditorPage.jsx`, the preview `pm-blog-post-body` div (~line 341) should carry the same `data-fontpair`/`data-width`/accent as the public page:

```jsx
            <div
              className="pm-blog-post-body"
              data-fontpair={theme?.fontPair || 'syne-dmsans'}
              data-width={theme?.width || 'wide'}
              style={theme?.accent ? { '--post-accent': theme.accent } : undefined}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
```

- [ ] **Step 2: Build + full typecheck.**

Run (repo root): `npm run build` → compiles.
Run: `cd backend && npx tsc --noEmit` → no errors.
Run: `cd backend && npx tsx src/services/blogRender.test.ts` → all passed.

- [ ] **Step 3: Commit.**

```bash
git add src/pages/ClubPM/BlogEditorPage.jsx
git commit -m "feat(sections): themed preview parity in the blog editor"
```

- [ ] **Step 4 (manual — human, needs running stack):** insert every section type; reorder/duplicate/delete; set backgrounds/columns/theme; co-edit in two tabs (presence + convergence); publish a blog post + a press kit and confirm the public pages are responsive on mobile and section-styled; confirm a legacy (section-less) post still renders. Leave unchecked; flag in the final summary.

---

## Self-Review notes (verify before handing off)

- **Sync invariant:** every new node (`section`, `column`, `hero`, `statBand`, `ctaButton`) appears in `blogExtensions()` (Task 3.2), `blogCollabExtensions()` (Task 2.2), and `renderNode()` (Task 2.1). ✅
- **Legacy safety:** `section` is optional at the top level; section-less docs still hit the existing node branches. ✅
- **Theme plumbing:** blog theme via `updateBlogPost({ theme })` + public select (verify steps in 4.3); press-kit theme via `updatePressKitConfig({ theme })` + `buildPressKitHtml` (4.4). Verify `blogService.updatePost` and the public blog select forward `theme`.
- **Collab:** theme lives in the DB column (not the CRDT), so co-editing never fights over it; sections are plain nodes in the Yjs doc.
- **Print/export:** section print CSS mirrored into `PRINT_STYLES` (2.3), so Fixes-plan exports render sections.
