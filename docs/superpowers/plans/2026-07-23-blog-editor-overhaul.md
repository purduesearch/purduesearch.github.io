# Blog / Press Kit Editor Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Section Builder resizable 12-column layouts with draggable sections, turn the gallery into a captioned carousel, make Preview byte-identical to the published page, fix and extend the font system, group the card fields behind a live preview, and regroup the editor chrome — all without breaking collaborative editing or the AI section planner.

**Architecture:** The blog document schema lives in five artefacts that must agree (editor nodes, collab schema mirror, server renderer, AI plan builder, markdown round-trip). Task 1 adds a guard test that fails the build when they diverge; every later task extends them together. Preview stops using the browser's `editor.getHTML()` and calls the same `renderJsonToHtml()` the publish path uses, displayed in an iframe so ClubPM's dark theme cannot leak in.

**Tech Stack:** React 19, TipTap 3.27 (ProseMirror), Yjs/Hocuspocus, Express + Prisma, plain CSS custom properties in `public/search-theme.css`. Backend tests are standalone `tsx` scripts with a hand-rolled `check()` helper — **there is no jest/vitest in `backend/`**. Frontend tests use CRA's jest via `npm test`.

**Design spec:** `docs/superpowers/specs/2026-07-23-blog-editor-layout-carousel-typography-design.md`

**Branch:** `feat/blog-editor-overhaul` (already created; the spec is committed there)

---

## File Structure

**Created**

| Path | Responsibility |
|------|----------------|
| `backend/src/services/blogSchemaContract.test.ts` | Guard test: every editor node exists in the collab mirror and the renderer |
| `backend/src/services/sectionPlan.test.ts` | Validation tests for AI plan column spans and gallery captions |
| `src/lib/blogCarousel.js` | Framework-free carousel enhancer, shared by editor / preview / public page |
| `src/lib/blogCarousel.test.js` | Tests for the enhancer's index maths |
| `src/lib/columnSpans.js` | Pure helpers for 12-column span maths (resize, add, remove) |
| `src/lib/columnSpans.test.js` | Tests for those helpers |
| `src/components/clubpm/blog/BlogPreviewFrame.jsx` | Iframe host that reproduces the public article shell |
| `src/components/clubpm/blog/BlogCardPanel.jsx` | Card field group + live `BlogCard` preview |

**Modified**

| Path | Change |
|------|--------|
| `backend/src/services/blogRender.ts` | Column spans, carousel markup, `textStyle`/`highlight` marks with sanitisation |
| `backend/src/services/blogRender.test.ts` | Tests for all of the above |
| `backend/src/collab/blogSchema.ts` | Mirror the new attrs and marks |
| `backend/src/services/sectionPlan.ts` | `span` on plan columns, captions on plan galleries |
| `backend/src/services/aiOutreachService.ts` | Prompt learns about spans and captions |
| `backend/src/api/blog.ts` | `POST /posts/:id/preview` |
| `src/api/clubPmClient.js` | `previewBlogPost()` |
| `src/components/clubpm/blog/BlogColumn.jsx` | `span` attribute |
| `src/components/clubpm/blog/BlogSection.jsx` | Drag handle, column resize, add/remove column |
| `src/components/clubpm/blog/BlogGallery.jsx` | Carousel NodeView with per-slide captions |
| `src/components/clubpm/blog/sectionNodes.js` | Standalone Image preset |
| `src/components/clubpm/blog/BlogCallout.jsx`, `BlogStatBand.jsx`, `BlogCta.jsx`, `BlogHero.jsx` | `draggable: true` |
| `src/components/clubpm/blog/BlogEditor.jsx` | Typography extensions, regrouped toolbar |
| `src/components/clubpm/blog/BlogMetaPanel.jsx` | Mount the card panel at the top |
| `src/pages/ClubPM/BlogEditorPage.jsx` | Iframe preview, regrouped header |
| `src/pages/BlogPost.jsx` | Remove the 760 px wrapper, init carousels |
| `src/pages/Blog.jsx` | Drop the 180-character slice |
| `public/index.html` | Load Syne + DM Sans |
| `public/search-theme.css` | Grid, carousel, font pairs, chrome |
| `package.json` | `@tiptap/extension-text-style`, `@tiptap/extension-highlight` |

**Gate after every task:** `npm run build` (repo root) and `npx tsc --noEmit` (in `backend/`). Fix all errors before moving on.

---

## Task 1: Schema-contract guard test

The five artefacts drift silently today. This test makes drift a failure. It must land **before** any new node or attribute.

**Files:**
- Create: `backend/src/services/blogSchemaContract.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/blogSchemaContract.test.ts`:

```ts
// Guard test: every custom node the editor registers must also exist in the
// collab schema mirror (backend/src/collab/blogSchema.ts) and have a render
// branch in the server renderer (backend/src/services/blogRender.ts).
// A node missing from either place silently loses content between editing and
// publishing, which is the failure this test exists to prevent.
// Run: cd backend && npx tsx src/services/blogSchemaContract.test.ts
import { readFileSync, readdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const editorDir = resolve(here, "../../../src/components/clubpm/blog");
const mirrorSrc = readFileSync(resolve(here, "../collab/blogSchema.ts"), "utf8");
const rendererSrc = readFileSync(resolve(here, "./blogRender.ts"), "utf8");

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => { if (c) passed++; else { failed++; console.error(`  ✗ ${n}`); } };

// Collect node names from `Node.create({ name: 'x' ... })` in the editor files.
const nodeNames = new Set<string>();
for (const file of readdirSync(editorDir).filter((f) => f.endsWith(".jsx"))) {
  const src = readFileSync(join(editorDir, file), "utf8");
  for (const m of src.matchAll(/Node\.create\(\{\s*name:\s*['"]([A-Za-z][A-Za-z0-9]*)['"]/g)) {
    nodeNames.add(m[1]!);
  }
}

check("found the editor's custom nodes", nodeNames.size >= 9);

for (const name of nodeNames) {
  check(`collab mirror defines "${name}"`, new RegExp(`name:\\s*["']${name}["']`).test(mirrorSrc));
  check(`renderer handles "${name}"`, new RegExp(`case\\s+["']${name}["']:`).test(rendererSrc));
}

console.log(`\nblogSchemaContract: ${passed} passed, ${failed} failed (${nodeNames.size} nodes checked)`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run the test**

```bash
cd backend && npx tsx src/services/blogSchemaContract.test.ts
```

Expected: PASS on all counts. If a node fails here, the drift already exists — fix `blogSchema.ts` / `blogRender.ts` to cover it before continuing, and note which node it was.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/blogSchemaContract.test.ts
git commit -m "test: guard that editor nodes exist in the collab mirror and renderer"
```

---

## Task 2: Renderer — column spans

**Files:**
- Modify: `backend/src/services/blogRender.ts` (the `case "column"` branch, ~line 268)
- Modify: `backend/src/services/blogRender.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `backend/src/services/blogRender.test.ts`, before the final `console.log`:

```ts
{
  const doc = { type: "doc", content: [
    { type: "section", attrs: { layout: "cols2" }, content: [
      { type: "column", attrs: { span: 5 }, content: [{ type: "paragraph", content: [{ type: "text", text: "narrow" }] }] },
      { type: "column", attrs: { span: 7 }, content: [{ type: "paragraph", content: [{ type: "text", text: "wide" }] }] },
    ] },
    { type: "section", attrs: { layout: "cols2" }, content: [
      { type: "column", content: [{ type: "paragraph", content: [{ type: "text", text: "auto" }] }] },
    ] },
  ] };
  const html = _render(doc as any);
  check("column span 5 emits grid-column", html.includes('style="grid-column:span 5"'));
  check("column span 7 emits grid-column", html.includes('style="grid-column:span 7"'));
  check("column without span emits no style", html.includes('<div class="cpm-blog-col">auto') || html.includes('<div class="cpm-blog-col"><p>auto</p></div>'));
}

{
  const bad = { type: "doc", content: [
    { type: "section", attrs: { layout: "cols2" }, content: [
      { type: "column", attrs: { span: 99 }, content: [{ type: "paragraph" }] },
      { type: "column", attrs: { span: "6; background:url(x)" }, content: [{ type: "paragraph" }] },
    ] },
  ] };
  const html = _render(bad as any);
  check("out-of-range span is ignored", !html.includes("span 99"));
  check("non-numeric span cannot inject css", !html.includes("background:url"));
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && npx tsx src/services/blogRender.test.ts
```

Expected: FAIL — `column span 5 emits grid-column` and `column span 7 emits grid-column`.

- [ ] **Step 3: Implement**

In `backend/src/services/blogRender.ts`, replace the `case "column":` branch:

```ts
    case "column": {
      // Optional 12-column grid span. Anything not an integer in 1..12 is
      // dropped, so the attribute can never inject arbitrary CSS.
      const rawSpan = node.attrs?.span;
      const span = typeof rawSpan === "number" ? rawSpan : Number.NaN;
      const valid = Number.isInteger(span) && span >= 1 && span <= 12;
      const style = valid ? ` style="grid-column:span ${span}"` : "";
      return `<div class="cpm-blog-col"${style}>${renderChildren(node, headingIds)}</div>`;
    }
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd backend && npx tsx src/services/blogRender.test.ts
```

Expected: PASS, including the two injection checks.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/blogRender.ts backend/src/services/blogRender.test.ts
git commit -m "feat(blog): render optional 12-column span on column nodes"
```

---

## Task 3: Renderer — gallery as carousel

**Files:**
- Modify: `backend/src/services/blogRender.ts` (the `case "gallery"` branch, ~line 233)
- Modify: `backend/src/services/blogRender.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `backend/src/services/blogRender.test.ts`, before the final `console.log`:

```ts
{
  const doc = { type: "doc", content: [
    { type: "gallery", attrs: { images: [
      { src: "https://example.com/a.png", alt: "A", caption: "First <slide>" },
      { src: "https://example.com/b.png", alt: "B" },
      { src: "", alt: "empty" },
    ] } },
  ] };
  const html = _render(doc as any);
  check("carousel wrapper", html.includes('class="cpm-blog-carousel"') && html.includes("data-carousel"));
  check("carousel track", html.includes('class="cpm-blog-carousel-track"'));
  check("slide figure", html.includes('class="cpm-blog-carousel-slide"'));
  check("caption rendered and escaped", html.includes("First &lt;slide&gt;"));
  check("slide without caption has no figcaption text", (html.match(/figcaption/g) ?? []).length === 2);
  check("empty src is skipped", (html.match(/<img /g) ?? []).length === 2);
  check("prev/next controls", html.includes("cpm-blog-carousel-prev") && html.includes("cpm-blog-carousel-next"));
  check("one dot per rendered slide", (html.match(/cpm-blog-carousel-dot"/g) ?? []).length === 2);
}

{
  const empty = { type: "doc", content: [{ type: "gallery", attrs: { images: [] } }] };
  check("empty gallery renders nothing", _render(empty as any).includes("cpm-blog-carousel") === false);
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && npx tsx src/services/blogRender.test.ts
```

Expected: FAIL — `carousel wrapper`, `carousel track`, `slide figure`, and the rest of that block.

- [ ] **Step 3: Implement**

In `backend/src/services/blogRender.ts`, replace the `case "gallery":` branch:

```ts
    case "gallery": {
      const images = Array.isArray(node.attrs?.images) ? (node.attrs!.images as Array<Record<string, unknown>>) : [];
      const usable = images.filter((im) => String(im.src ?? im.url ?? "").trim());
      if (!usable.length) return "";
      const slides = usable.map((im) => {
        const src = escapeAttr(proxyImageSrc(String(im.src ?? im.url ?? ""), IMAGE_BASE_URL));
        const alt = escapeAttr(String(im.alt ?? ""));
        const capText = String(im.caption ?? "").trim();
        const caption = capText
          ? `<figcaption class="cpm-blog-carousel-cap">${escapeHtml(capText)}</figcaption>`
          : "";
        return `<figure class="cpm-blog-carousel-slide"><img src="${src}" alt="${alt}" loading="lazy"/>${caption}</figure>`;
      }).join("");
      const dots = usable.map((_, i) =>
        `<button type="button" class="cpm-blog-carousel-dot" data-index="${i}" aria-label="Go to image ${i + 1}"></button>`
      ).join("");
      return `<div class="cpm-blog-carousel" data-carousel>` +
        `<div class="cpm-blog-carousel-track">${slides}</div>` +
        `<button type="button" class="cpm-blog-carousel-nav cpm-blog-carousel-prev" aria-label="Previous image">&#8249;</button>` +
        `<button type="button" class="cpm-blog-carousel-nav cpm-blog-carousel-next" aria-label="Next image">&#8250;</button>` +
        `<div class="cpm-blog-carousel-dots">${dots}</div>` +
        `</div>`;
    }
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd backend && npx tsx src/services/blogRender.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/blogRender.ts backend/src/services/blogRender.test.ts
git commit -m "feat(blog): render galleries as a captioned carousel"
```

---

## Task 4: Renderer — `textStyle` and `highlight` marks, sanitised

This writes a `style` attribute into HTML served on the public site. The allowlist is the security boundary — do not relax it.

**Files:**
- Modify: `backend/src/services/blogRender.ts` (`wrapMarks`, ~line 119)
- Modify: `backend/src/services/blogRender.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `backend/src/services/blogRender.test.ts`, before the final `console.log`:

```ts
{
  const mk = (attrs: Record<string, unknown>) => _render({ type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "styled", marks: [{ type: "textStyle", attrs }] }] },
  ] } as any);

  check("allowed font applied", mk({ fontFamily: "Oswald" }).includes("font-family:'Oswald'"));
  check("unknown font dropped", !mk({ fontFamily: "Comic Sans MS" }).includes("font-family"));
  check("font with quotes normalised", mk({ fontFamily: "'Work Sans'" }).includes("font-family:'Work Sans'"));
  check("size clamped low", mk({ fontSize: "2px" }).includes("font-size:10px"));
  check("size clamped high", mk({ fontSize: "400px" }).includes("font-size:96px"));
  check("size in range kept", mk({ fontSize: "22px" }).includes("font-size:22px"));
  check("hex colour kept", mk({ color: "#ff8800" }).includes("color:#ff8800"));
  check("short hex kept", mk({ color: "#f80" }).includes("color:#f80"));
  check("named colour dropped", !mk({ color: "red" }).includes("color:red"));
  check("css injection via colour dropped", !mk({ color: "#fff;background:url(javascript:alert(1))" }).includes("javascript"));
  check("empty textStyle emits no span", !mk({}).includes("<span"));

  const hl = _render({ type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "hi", marks: [{ type: "highlight", attrs: { color: "#ffee00" } }] }] },
  ] } as any);
  check("highlight renders mark tag", hl.includes("<mark") && hl.includes("#ffee00"));

  const hlBad = _render({ type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "hi", marks: [{ type: "highlight", attrs: { color: "expression(x)" } }] }] },
  ] } as any);
  check("highlight rejects non-hex colour", hlBad.includes("<mark>") && !hlBad.includes("expression"));
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && npx tsx src/services/blogRender.test.ts
```

Expected: FAIL — `allowed font applied`, `hex colour kept`, `highlight renders mark tag`, etc.

- [ ] **Step 3: Implement**

In `backend/src/services/blogRender.ts`, add above `wrapMarks`:

```ts
// ── Inline typography allowlist ──────────────────────────────
// textStyle/highlight write a style attribute into HTML served on the public
// site, so values are matched against a fixed allowlist rather than passed
// through. Anything unrecognised is dropped, never sanitised-and-kept.

const ALLOWED_FONTS = new Set(["Syne", "DM Sans", "Oswald", "Lato", "Montserrat", "Work Sans"]);
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function textStyleCss(attrs?: Record<string, unknown>): string {
  const parts: string[] = [];

  const family = String(attrs?.fontFamily ?? "").replace(/["']/g, "").trim();
  if (ALLOWED_FONTS.has(family)) parts.push(`font-family:'${family}', system-ui, sans-serif`);

  const size = Number.parseFloat(String(attrs?.fontSize ?? ""));
  if (Number.isFinite(size)) parts.push(`font-size:${Math.min(96, Math.max(10, Math.round(size)))}px`);

  const color = String(attrs?.color ?? "").trim();
  if (HEX_COLOR.test(color)) parts.push(`color:${color}`);

  return parts.join(";");
}
```

Then add two cases inside `wrapMarks`'s `switch`, before `default:`:

```ts
      case "textStyle": {
        const css = textStyleCss(mark.attrs);
        if (css) out = `<span style="${css}">${out}</span>`;
        break;
      }
      case "highlight": {
        const color = String(mark.attrs?.color ?? "").trim();
        out = HEX_COLOR.test(color)
          ? `<mark style="background-color:${color}">${out}</mark>`
          : `<mark>${out}</mark>`;
        break;
      }
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd backend && npx tsx src/services/blogRender.test.ts
```

Expected: PASS on all 13 new checks.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/blogRender.ts backend/src/services/blogRender.test.ts
git commit -m "feat(blog): render textStyle and highlight marks behind a strict allowlist"
```

---

## Task 5: Collab schema mirror

Without this, the new attributes and marks are stripped whenever the Yjs document is converted back to JSON — content vanishes on save.

**Files:**
- Modify: `backend/src/collab/blogSchema.ts`

- [ ] **Step 1: Add the column span and gallery caption**

In `backend/src/collab/blogSchema.ts`, replace `ColumnNode`:

```ts
const ColumnNode = Node.create({
  name: "column",
  group: "block",
  content: "block+",
  addAttributes() {
    // 12-column grid span; null = equal share. Mirrors BlogColumn.jsx.
    return { span: { default: null } };
  },
});
```

`BlogGalleryNode`'s `images` attribute already carries whatever shape the client stores, so the per-image `caption` needs no schema change — but update its comment so the shape is documented:

```ts
const BlogGalleryNode = Node.create({
  name: "gallery",
  group: "block",
  atom: true,
  addAttributes() {
    // images: { src, alt, caption }[] — rendered as a carousel.
    return { images: { default: [] } };
  },
});
```

- [ ] **Step 2: Add the typography marks**

At the top of `backend/src/collab/blogSchema.ts`, add to the imports:

```ts
import { TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
```

and add them to the array returned by `blogCollabExtensions()`, after `TaskItem.configure({ nested: true }),`:

```ts
    TextStyle.configure({ mergeNestedSpanStyles: true }),
    Highlight.configure({ multicolor: true }),
```

> If `@tiptap/extension-text-style` at the installed version does not export `TextStyle` as a named export, check its `dist/index.d.ts` and use the export it does provide. Task 13 installs these packages — if this task runs first, install them now with the command in Task 13 Step 1.

- [ ] **Step 3: Verify the backend still typechecks and the guard test passes**

```bash
cd backend && npx tsc --noEmit && npx tsx src/services/blogSchemaContract.test.ts
```

Expected: no TypeScript errors; guard test PASSes.

- [ ] **Step 4: Commit**

```bash
git add backend/src/collab/blogSchema.ts
git commit -m "feat(blog): mirror column span and typography marks in the collab schema"
```

---

## Task 6: AI section plan — column spans and gallery captions

**Files:**
- Modify: `backend/src/services/sectionPlan.ts`
- Create: `backend/src/services/sectionPlan.test.ts`
- Modify: `backend/src/services/aiOutreachService.ts` (prompt only)

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/sectionPlan.test.ts`:

```ts
// Validation tests for the AI section plan. The model's output is untrusted:
// every field must be clamped or dropped before it reaches a document.
// Run: cd backend && npx tsx src/services/sectionPlan.test.ts
import { validateSectionPlan, buildDocFromPlan } from "./sectionPlan.js";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => { if (c) passed++; else { failed++; console.error(`  ✗ ${n}`); } };

{
  const plan = validateSectionPlan({ sections: [
    { type: "columns", columns: [{ markdown: "one", span: 5 }, { markdown: "two", span: 7 }] },
  ] });
  check("valid spans survive", plan.sections[0]?.columns?.[0]?.span === 5 && plan.sections[0]?.columns?.[1]?.span === 7);
}

{
  const plan = validateSectionPlan({ sections: [
    { type: "columns", columns: [{ markdown: "a", span: 99 }, { markdown: "b", span: -3 }, { markdown: "c", span: "x" }] },
  ] });
  const spans = plan.sections[0]?.columns?.map((c) => c.span);
  check("out-of-range spans dropped", spans?.every((s) => s === undefined));
}

{
  // 9 + 9 = 18 > 12: normalised, never emitted as-is.
  const plan = validateSectionPlan({ sections: [
    { type: "columns", columns: [{ markdown: "a", span: 9 }, { markdown: "b", span: 9 }] },
  ] });
  const total = (plan.sections[0]?.columns ?? []).reduce((n, c) => n + (c.span ?? 0), 0);
  check("oversized span row normalised to <= 12", total <= 12);
}

{
  const doc = buildDocFromPlan(validateSectionPlan({ sections: [
    { type: "columns", columns: [{ markdown: "left", span: 4 }, { markdown: "right", span: 8 }] },
  ] }));
  const section = doc.content?.[0];
  const cols = section?.content ?? [];
  check("built columns carry span", cols[0]?.attrs?.span === 4 && cols[1]?.attrs?.span === 8);
}

{
  const plan = validateSectionPlan({ sections: [
    { type: "gallery", images: [{ alt: "a", caption: "First" }, { alt: "b", caption: "Second" }] },
  ] });
  check("gallery captions survive validation", plan.sections[0]?.images?.[1]?.caption === "Second");

  const doc = buildDocFromPlan(plan);
  const gallery = doc.content?.[0]?.content?.find((n) => n.type === "gallery");
  const images = (gallery?.attrs?.images ?? []) as Array<Record<string, unknown>>;
  check("built gallery carries caption placeholders", images.length === 2 && images[1]?.caption === "Second");
}

console.log(`\nsectionPlan: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && npx tsx src/services/sectionPlan.test.ts
```

Expected: FAIL on `valid spans survive` and every check after it.

- [ ] **Step 3: Implement the plan-type changes**

In `backend/src/services/sectionPlan.ts`, change the `columns` field on `PlanSection`:

```ts
  // columns
  columns?: { markdown: string; span?: number }[];
```

and add a gallery images field beside `imageCount`:

```ts
  // gallery
  imageCount?: number;
  images?: { alt?: string; caption?: string }[];
```

Add this helper below `clampStr`:

```ts
/** A 12-column span, or undefined when absent/invalid. */
function clampSpan(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  const n = Math.round(v);
  return n >= 1 && n <= 12 ? n : undefined;
}

/**
 * Drop every span in a row when they sum above 12 — a partially-honoured row
 * lays out worse than an evenly-split one, and equal share is the fallback.
 */
function normaliseSpans(cols: { markdown: string; span?: number }[]): { markdown: string; span?: number }[] {
  const total = cols.reduce((n, c) => n + (c.span ?? 0), 0);
  if (total <= 12) return cols;
  return cols.map(({ markdown }) => ({ markdown }));
}
```

Replace the `if (Array.isArray(o.columns))` block in `validateSectionPlan`:

```ts
    if (Array.isArray(o.columns)) {
      sec.columns = normaliseSpans(o.columns.slice(0, 3).map((c) => {
        const rec = (c ?? {}) as Record<string, unknown>;
        const span = clampSpan(rec.span);
        return {
          markdown: clampStr(rec.markdown, 5000) ?? "",
          ...(span !== undefined ? { span } : {}),
        };
      }));
    }
```

Add image-caption validation immediately after the `imageCount` block:

```ts
    if (Array.isArray(o.images)) {
      sec.images = o.images.slice(0, 12).map((x) => {
        const rec = (x ?? {}) as Record<string, unknown>;
        return {
          alt: clampStr(rec.alt, 300) ?? "",
          caption: clampStr(rec.caption, 300) ?? "",
        };
      });
    }
```

- [ ] **Step 4: Implement the document-builder changes**

In `backend/src/services/sectionPlan.ts`, replace `columnNode`:

```ts
/** A column node whose content is parsed from markdown (never empty). */
function columnNode(md: string | undefined, extra: PMNode[] = [], span?: number): PMNode {
  const cb = [...extra, ...blocks(md)];
  return {
    type: "column",
    ...(span !== undefined ? { attrs: { span } } : {}),
    content: cb.length ? cb : [{ type: "paragraph" }],
  };
}
```

In the `case "columns":` branch, replace the two places that build columns. The single-column shortcut is unchanged; replace the final `out.push(...)`:

```ts
        const n = Math.min(filled.length, 3);
        out.push(section(
          withStyle({ layout: n >= 3 ? "cols3" : "cols2", padding: "l" }, s),
          filled.slice(0, n).map((c) => columnNode(c.markdown, [], c.span)),
        ));
        break;
```

and change how `filled` is computed at the top of that branch so spans survive the filter:

```ts
      case "columns": {
        const filled = (s.columns ?? [])
          .filter((c) => (c?.markdown ?? "").trim())
          .map((c) => ({ markdown: c.markdown.trim(), span: c.span }));
        if (!filled.length) break;
        if (filled.length === 1) {
          out.push(section(withStyle({ layout: "single", padding: "l" }, s), blocks(filled[0]!.markdown)));
          break;
        }
        // A heading above a grid can't be a grid cell, so it gets its own band.
        if (s.heading?.trim()) out.push(section({ layout: "single", padding: "s" }, [h2(s.heading.trim())]));
```

In the `case "gallery":` branch, seed the images array from the plan:

```ts
      case "gallery": {
        const inner: PMNode[] = [];
        if (s.heading?.trim()) inner.push(h2(s.heading.trim()));
        // Placeholders with AI-authored alt/caption; src is filled by a human.
        const seeded = (s.images ?? []).map((im) => ({ src: "", alt: im.alt ?? "", caption: im.caption ?? "" }));
        inner.push({ type: "gallery", attrs: { images: seeded } });
        out.push(section(withStyle({ layout: "single", padding: "l" }, s), inner));
        break;
      }
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd backend && npx tsx src/services/sectionPlan.test.ts && npx tsc --noEmit
```

Expected: PASS on all six checks, no TypeScript errors.

- [ ] **Step 6: Teach the prompt about spans and captions**

Find the section-plan prompt in `backend/src/services/aiOutreachService.ts`:

```bash
cd backend && grep -n "columns\|PlanSection\|sections" src/services/aiOutreachService.ts | head -30
```

In the prompt text that documents the `columns` field, add these two lines (match the surrounding prose style):

```
- Each entry in "columns" may include "span": an integer 1-12 on a 12-column grid. The spans in one section must sum to 12 or less; omit them for an even split. Use uneven spans (e.g. 8 and 4) when one column carries an image or a sidebar.
- A "gallery" section may include "images": an array of { "alt", "caption" } placeholders. Write real captions describing what each photo should show — a human uploads the files later.
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/sectionPlan.ts backend/src/services/sectionPlan.test.ts backend/src/services/aiOutreachService.ts
git commit -m "feat(blog): AI plans can specify column spans and gallery captions"
```

---

## Task 7: Preview endpoint

**Files:**
- Modify: `backend/src/api/blog.ts`
- Modify: `src/api/clubPmClient.js`

- [ ] **Step 1: Add the endpoint**

In `backend/src/api/blog.ts`, add after the `PATCH /posts/:id` handler (~line 151):

```ts
// Render the current (possibly unsaved) document exactly as publish would.
// Preview MUST go through renderJsonToHtml so it cannot drift from the
// published page — this is the whole point of the endpoint existing.
blogRouter.post("/posts/:id/preview", async (req: Request, res: Response) => {
  try {
    const post = await requirePostAccess(req, res);
    if (!post) return;

    const { contentJson } = req.body as { contentJson?: PMDoc };
    const doc = (contentJson ?? post.contentJson) as PMDoc;
    const origin = `${req.protocol}://${req.get("host")}`;
    const { renderJsonToHtml } = await import("../services/blogRender.js");

    res.json({
      html: renderJsonToHtml(doc, origin),
      meta: {
        title: post.title,
        coverImageUrl: post.coverImageUrl,
        authorName: post.authorName,
        publishedAt: post.publishedAt,
        readingTimeMin: post.readingTimeMin,
        theme: post.theme,
      },
    });
  } catch (error) {
    console.error("POST /blog/posts/:id/preview error:", error);
    res.status(500).json({ error: "Failed to render preview" });
  }
});
```

- [ ] **Step 2: Add the client helper**

In `src/api/clubPmClient.js`, add after `updateBlogPost` (~line 384):

```js
export const previewBlogPost = (id, contentJson) => post(`/api/blog/posts/${id}/preview`, { contentJson });
```

- [ ] **Step 3: Verify it typechecks and builds**

```bash
cd backend && npx tsc --noEmit
cd .. && npm run build
```

Expected: no errors from either.

- [ ] **Step 4: Commit**

```bash
git add backend/src/api/blog.ts src/api/clubPmClient.js
git commit -m "feat(blog): preview endpoint rendering through the publish renderer"
```

---

## Task 8: Carousel enhancer + CSS

**Files:**
- Create: `src/lib/blogCarousel.js`
- Create: `src/lib/blogCarousel.test.js`
- Modify: `public/search-theme.css` (append at the bottom)

- [ ] **Step 1: Write the failing test**

Create `src/lib/blogCarousel.test.js`:

```js
import { nextIndex } from './blogCarousel';

test('advances forward and stops at the end', () => {
  expect(nextIndex(0, 1, 4)).toBe(1);
  expect(nextIndex(3, 1, 4)).toBe(3);
});

test('advances backward and stops at the start', () => {
  expect(nextIndex(2, -1, 4)).toBe(1);
  expect(nextIndex(0, -1, 4)).toBe(0);
});

test('handles a single slide and an empty carousel', () => {
  expect(nextIndex(0, 1, 1)).toBe(0);
  expect(nextIndex(0, 1, 0)).toBe(0);
});

test('clamps an out-of-range current index', () => {
  expect(nextIndex(99, 1, 3)).toBe(2);
  expect(nextIndex(-5, -1, 3)).toBe(0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
CI=true npx react-scripts test --watchAll=false --testPathPattern="src/lib/blogCarousel"
```

Expected: FAIL — cannot resolve `./blogCarousel`.

- [ ] **Step 3: Implement the enhancer**

Create `src/lib/blogCarousel.js`:

```js
// Framework-free carousel enhancer. The same markup is produced by the editor
// NodeView (BlogGallery.jsx), the server renderer (blogRender.ts) and therefore
// the preview and published page — so one enhancer serves all of them. The
// carousel is fully usable without this script: the track is a scroll-snap
// strip, so swipe and trackpad scrolling work on their own. This adds arrows,
// dots and keyboard support.

/** Clamped index arithmetic; exported so it can be tested without a DOM. */
export function nextIndex(current, delta, count) {
  if (count <= 0) return 0;
  const from = Math.min(Math.max(current, 0), count - 1);
  return Math.min(Math.max(from + delta, 0), count - 1);
}

function enhance(root) {
  if (root.dataset.carouselReady === '1') return;
  const track = root.querySelector('.cpm-blog-carousel-track');
  if (!track) return;
  const slides = Array.from(track.querySelectorAll('.cpm-blog-carousel-slide'));
  if (!slides.length) return;

  const dots = Array.from(root.querySelectorAll('.cpm-blog-carousel-dot'));
  const prev = root.querySelector('.cpm-blog-carousel-prev');
  const next = root.querySelector('.cpm-blog-carousel-next');
  let index = 0;

  const paint = () => {
    dots.forEach((d, i) => d.classList.toggle('is-active', i === index));
    if (prev) prev.disabled = index === 0;
    if (next) next.disabled = index === slides.length - 1;
  };

  const goTo = (i) => {
    index = nextIndex(index, i - index, slides.length);
    slides[index].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    paint();
  };

  prev?.addEventListener('click', () => goTo(nextIndex(index, -1, slides.length)));
  next?.addEventListener('click', () => goTo(nextIndex(index, 1, slides.length)));
  dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));

  root.setAttribute('tabindex', '0');
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    goTo(nextIndex(index, e.key === 'ArrowRight' ? 1 : -1, slides.length));
  });

  // Keep dots in sync when the reader swipes or scrolls the track directly.
  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const i = slides.indexOf(entry.target);
        if (i >= 0) { index = i; paint(); }
      }
    }, { root: track, threshold: 0.6 });
    slides.forEach((s) => io.observe(s));
  }

  root.dataset.carouselReady = '1';
  paint();
}

/** Enhance every carousel inside `container` (default: the whole document). */
export function initBlogCarousels(container) {
  const scope = container || (typeof document !== 'undefined' ? document : null);
  if (!scope) return;
  scope.querySelectorAll('[data-carousel]').forEach(enhance);
}

export default initBlogCarousels;
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
CI=true npx react-scripts test --watchAll=false --testPathPattern="src/lib/blogCarousel"
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Add the CSS**

Append to the bottom of `public/search-theme.css`:

```css
/* === Blog carousel (gallery) ==========================================
   One markup contract shared by the editor NodeView, the preview iframe and
   the published page. Scroll-snap does the work; src/lib/blogCarousel.js only
   adds arrows, dots and keyboard nav on top. */
.cpm-blog-carousel { position: relative; margin: 1.6em 0; }
.cpm-blog-carousel-track {
  display: flex; gap: 14px; overflow-x: auto; scroll-snap-type: x mandatory;
  scroll-behavior: smooth; scrollbar-width: none; padding-bottom: 4px;
}
.cpm-blog-carousel-track::-webkit-scrollbar { display: none; }
.cpm-blog-carousel-slide {
  flex: 0 0 100%; scroll-snap-align: center; margin: 0; min-width: 0;
}
.cpm-blog-carousel-slide img {
  width: 100%; height: auto; display: block; border-radius: 10px; object-fit: cover;
}
.cpm-blog-carousel-cap {
  margin-top: 8px; font-size: 13px; line-height: 1.5; opacity: .75; text-align: center;
}
.cpm-blog-carousel-nav {
  position: absolute; top: 50%; transform: translateY(-50%); z-index: 2;
  width: 38px; height: 38px; border-radius: 50%; border: none; cursor: pointer;
  background: rgba(0, 0, 0, .55); color: #fff; font-size: 20px; line-height: 1;
  display: grid; place-items: center; transition: opacity .15s ease;
}
.cpm-blog-carousel-nav:hover { background: rgba(0, 0, 0, .75); }
.cpm-blog-carousel-nav:disabled { opacity: .25; cursor: default; }
.cpm-blog-carousel-prev { left: 10px; }
.cpm-blog-carousel-next { right: 10px; }
.cpm-blog-carousel-dots { display: flex; justify-content: center; gap: 7px; margin-top: 12px; }
.cpm-blog-carousel-dot {
  width: 8px; height: 8px; border-radius: 50%; border: none; padding: 0; cursor: pointer;
  background: currentColor; opacity: .28; transition: opacity .15s ease;
}
.cpm-blog-carousel-dot.is-active { opacity: 1; background: var(--post-accent, #00e5cc); }
.cpm-blog-carousel:focus-visible { outline: 2px solid var(--post-accent, #00e5cc); outline-offset: 4px; }

/* The press-kit PDF is rendered by headless Chrome with no JS, so show every
   image as a grid instead of stranding the reader on slide one. */
@media print {
  .cpm-blog-carousel-track { display: grid; grid-template-columns: 1fr 1fr; overflow: visible; }
  .cpm-blog-carousel-nav, .cpm-blog-carousel-dots { display: none; }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/blogCarousel.js src/lib/blogCarousel.test.js public/search-theme.css
git commit -m "feat(blog): shared carousel enhancer and styles"
```

---

## Task 9: Gallery NodeView → carousel editor

**Files:**
- Modify: `src/components/clubpm/blog/BlogGallery.jsx`

- [ ] **Step 1: Replace the NodeView and `renderHTML`**

Replace the whole contents of `src/components/clubpm/blog/BlogGallery.jsx`:

```jsx
import React from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { uploadBlogImage } from '../../../api/clubPmClient';
import { initBlogCarousels } from '../../../lib/blogCarousel';

function GalleryView({ node, updateAttributes, editor }) {
  const images = Array.isArray(node.attrs.images) ? node.attrs.images : [];
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef(null);
  const rootRef = React.useRef(null);
  const editable = editor.isEditable;

  // Re-run the enhancer whenever the slide count changes so arrows and dots
  // stay wired to the current DOM.
  React.useEffect(() => {
    if (rootRef.current) {
      rootRef.current.querySelectorAll('[data-carousel]').forEach((el) => { delete el.dataset.carouselReady; });
      initBlogCarousels(rootRef.current);
    }
  }, [images.length]);

  const addFiles = async (list) => {
    const files = Array.from(list || []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    setBusy(true);
    try {
      const uploaded = [];
      for (const file of files) {
        try {
          const { url } = await uploadBlogImage(file);
          uploaded.push({ src: url, alt: '', caption: '' });
        } catch (err) {
          console.error('[BlogGallery] upload failed:', err);
        }
      }
      if (uploaded.length) updateAttributes({ images: [...images, ...uploaded] });
    } finally {
      setBusy(false);
    }
  };

  const removeAt = (i) => updateAttributes({ images: images.filter((_, idx) => idx !== i) });
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= images.length) return;
    const next = images.slice();
    [next[i], next[j]] = [next[j], next[i]];
    updateAttributes({ images: next });
  };
  const setField = (i, field, value) => {
    const next = images.slice();
    next[i] = { ...next[i], [field]: value };
    updateAttributes({ images: next });
  };

  return (
    <NodeViewWrapper className="cpm-blog-gallery-node" as="div" ref={rootRef}>
      {editable && (
        <div className="cpm-blog-gallery-bar" contentEditable={false}>
          <i className="fas fa-images" aria-hidden="true" />
          <span>Carousel · {images.length} image{images.length === 1 ? '' : 's'}</span>
          <button type="button" className="clubpm-btn-secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? 'Uploading…' : 'Add images'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        </div>
      )}

      <div className="cpm-blog-carousel" data-carousel>
        <div className="cpm-blog-carousel-track">
          {images.map((im, i) => (
            <figure key={`${im.src}-${i}`} className="cpm-blog-carousel-slide">
              {im.src ? <img src={im.src} alt={im.alt || ''} /> : <div className="cpm-blog-carousel-empty-slide" />}
              {im.caption ? <figcaption className="cpm-blog-carousel-cap">{im.caption}</figcaption> : null}
            </figure>
          ))}
        </div>
        {images.length > 1 && (
          <>
            <button type="button" className="cpm-blog-carousel-nav cpm-blog-carousel-prev" aria-label="Previous image">&#8249;</button>
            <button type="button" className="cpm-blog-carousel-nav cpm-blog-carousel-next" aria-label="Next image">&#8250;</button>
          </>
        )}
        <div className="cpm-blog-carousel-dots">
          {images.map((im, i) => (
            <button key={`dot-${im.src}-${i}`} type="button" className="cpm-blog-carousel-dot" data-index={i} aria-label={`Go to image ${i + 1}`} />
          ))}
        </div>
      </div>

      {editable && (
        <div className="cpm-blog-carousel-edit" contentEditable={false}>
          {images.map((im, i) => (
            <div key={`edit-${im.src}-${i}`} className="cpm-blog-carousel-edit-row">
              {im.src ? <img src={im.src} alt="" className="cpm-blog-carousel-edit-thumb" /> : <div className="cpm-blog-carousel-edit-thumb" />}
              <input
                className="cpm-blog-carousel-edit-input"
                placeholder="Caption (shown to readers)"
                value={im.caption || ''}
                onChange={(e) => setField(i, 'caption', e.target.value)}
              />
              <input
                className="cpm-blog-carousel-edit-input"
                placeholder="Alt text (screen readers)"
                value={im.alt || ''}
                onChange={(e) => setField(i, 'alt', e.target.value)}
              />
              <button type="button" className="cpm-blog-tb-btn" title="Move earlier" onClick={() => move(i, -1)}><i className="fas fa-chevron-up" aria-hidden="true" /></button>
              <button type="button" className="cpm-blog-tb-btn" title="Move later" onClick={() => move(i, 1)}><i className="fas fa-chevron-down" aria-hidden="true" /></button>
              <button type="button" className="cpm-blog-tb-btn" title="Remove" onClick={() => removeAt(i)}><i className="fas fa-trash" aria-hidden="true" /></button>
            </div>
          ))}
          {!images.length && <div className="cpm-blog-gallery-empty">No images yet — use “Add images”.</div>}
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const BlogGallery = Node.create({
  name: 'gallery',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    // images: { src, alt, caption }[]
    return { images: { default: [] } };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="blog-gallery"]' }];
  },

  // Mirrors the `gallery` branch of backend/src/services/blogRender.ts.
  renderHTML({ node, HTMLAttributes }) {
    const images = (Array.isArray(node.attrs.images) ? node.attrs.images : [])
      .filter((im) => String(im.src || im.url || '').trim());
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'blog-gallery', class: 'cpm-blog-carousel', 'data-carousel': '' }),
      ['div', { class: 'cpm-blog-carousel-track' },
        ...images.map((im) => [
          'figure', { class: 'cpm-blog-carousel-slide' },
          ['img', { src: im.src || im.url || '', alt: im.alt || '', loading: 'lazy' }],
          ...(im.caption ? [['figcaption', { class: 'cpm-blog-carousel-cap' }, im.caption]] : []),
        ]),
      ],
      ['div', { class: 'cpm-blog-carousel-dots' },
        ...images.map((_, i) => ['button', { type: 'button', class: 'cpm-blog-carousel-dot', 'data-index': String(i), 'aria-label': `Go to image ${i + 1}` }]),
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(GalleryView);
  },
});

export default BlogGallery;
```

- [ ] **Step 2: Add the editor-only styles**

Append to the bottom of `public/search-theme.css`:

```css
/* Carousel editing rows — editor only, never published. */
.cpm-blog-carousel-empty-slide {
  width: 100%; aspect-ratio: 16 / 9; border-radius: 10px;
  border: 1px dashed rgba(255, 255, 255, .25); background: rgba(255, 255, 255, .04);
}
.cpm-blog-carousel-edit { margin-top: 12px; display: grid; gap: 6px; }
.cpm-blog-carousel-edit-row { display: flex; align-items: center; gap: 7px; }
.cpm-blog-carousel-edit-thumb {
  width: 44px; height: 32px; object-fit: cover; border-radius: 4px; flex: 0 0 auto;
  background: rgba(255, 255, 255, .07);
}
.cpm-blog-carousel-edit-input {
  flex: 1 1 0; min-width: 0; font-size: 12px; padding: 5px 8px; border-radius: 5px;
  border: 1px solid var(--pm-overlay, #2a2f3a); background: rgba(0, 0, 0, .25); color: #eef2f8;
}
```

- [ ] **Step 3: Carry captions through the markdown export**

`blogMarkdown.js` is the fifth schema artefact — without this, captions vanish for anyone who round-trips a post through Markdown mode. In `src/components/clubpm/blog/blogMarkdown.js`, replace the `case 'gallery':` branch (~line 67):

```js
    case 'gallery':
      // Markdown has no carousel; each slide degrades to an image whose title
      // attribute carries the caption, which markdownToTiptapJson reads back.
      return (node.attrs?.images || [])
        .map((im) => {
          const src = im.src || im.url || '';
          const cap = (im.caption || '').replace(/"/g, "'");
          return cap ? `![${im.alt || ''}](${src} "${cap}")` : `![${im.alt || ''}](${src})`;
        })
        .join('\n');
```

- [ ] **Step 4: Verify the build and the schema guard**

```bash
npm run build
cd backend && npx tsx src/services/blogSchemaContract.test.ts
```

Expected: build succeeds; guard test PASSes.

- [ ] **Step 5: Commit**

```bash
git add src/components/clubpm/blog/BlogGallery.jsx src/components/clubpm/blog/blogMarkdown.js public/search-theme.css
git commit -m "feat(blog): gallery edits as a captioned carousel"
```

---

## Task 10: Column spans + section grid resize

**Files:**
- Create: `src/lib/columnSpans.js`
- Create: `src/lib/columnSpans.test.js`
- Modify: `src/components/clubpm/blog/BlogColumn.jsx`
- Modify: `public/search-theme.css`

- [ ] **Step 1: Write the failing test**

Create `src/lib/columnSpans.test.js`:

```js
import { defaultSpans, resizePair, spansAfterAdd, spansAfterRemove } from './columnSpans';

test('defaultSpans splits 12 as evenly as possible', () => {
  expect(defaultSpans(1)).toEqual([12]);
  expect(defaultSpans(2)).toEqual([6, 6]);
  expect(defaultSpans(3)).toEqual([4, 4, 4]);
  expect(defaultSpans(4)).toEqual([3, 3, 3, 3]);
  expect(defaultSpans(5)).toEqual([3, 3, 2, 2, 2]);
});

test('resizePair moves one column from right to left and preserves the total', () => {
  expect(resizePair([6, 6], 0, 1)).toEqual([7, 5]);
  expect(resizePair([6, 6], 0, -1)).toEqual([5, 7]);
  expect(resizePair([4, 4, 4], 1, 1)).toEqual([4, 5, 3]);
});

test('resizePair refuses to shrink a column below 1', () => {
  expect(resizePair([11, 1], 0, 1)).toEqual([11, 1]);
  expect(resizePair([1, 11], 0, -1)).toEqual([1, 11]);
});

test('spansAfterAdd appends a column and rebalances', () => {
  expect(spansAfterAdd([6, 6])).toEqual([4, 4, 4]);
  expect(spansAfterAdd([12])).toEqual([6, 6]);
});

test('spansAfterRemove drops the column and rebalances', () => {
  expect(spansAfterRemove([4, 4, 4], 1)).toEqual([6, 6]);
  expect(spansAfterRemove([6, 6], 0)).toEqual([12]);
  expect(spansAfterRemove([12], 0)).toEqual([12]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
CI=true npx react-scripts test --watchAll=false --testPathPattern="src/lib/columnSpans"
```

Expected: FAIL — cannot resolve `./columnSpans`.

- [ ] **Step 3: Implement**

Create `src/lib/columnSpans.js`:

```js
// Pure 12-column span maths for the Section Builder grid. Kept free of
// ProseMirror so the rules can be tested without an editor instance.

const TOTAL = 12;

/** Split 12 tracks across `count` columns, giving the remainder to the left. */
export function defaultSpans(count) {
  const n = Math.max(1, Math.min(TOTAL, Math.round(count)));
  const base = Math.floor(TOTAL / n);
  const extra = TOTAL - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Move `delta` tracks across the gutter between column `index` and the one
 * after it. Returns the spans unchanged when the move would leave either
 * column below one track.
 */
export function resizePair(spans, index, delta) {
  const next = spans.slice();
  const left = next[index];
  const right = next[index + 1];
  if (left == null || right == null) return spans;
  const newLeft = left + delta;
  const newRight = right - delta;
  if (newLeft < 1 || newRight < 1) return spans;
  next[index] = newLeft;
  next[index + 1] = newRight;
  return next;
}

/** Append a column, rebalancing every column evenly. */
export function spansAfterAdd(spans) {
  return defaultSpans(Math.min(TOTAL, spans.length + 1));
}

/** Remove a column, rebalancing the rest. Never removes the last column. */
export function spansAfterRemove(spans, index) {
  if (spans.length <= 1) return spans;
  const kept = spans.filter((_, i) => i !== index);
  return defaultSpans(kept.length);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
CI=true npx react-scripts test --watchAll=false --testPathPattern="src/lib/columnSpans"
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Add the `span` attribute to the column node**

Replace `src/components/clubpm/blog/BlogColumn.jsx`:

```jsx
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';

function ColumnView({ node }) {
  const span = node.attrs.span;
  const style = Number.isInteger(span) && span >= 1 && span <= 12
    ? { gridColumn: `span ${span}` }
    : undefined;
  return (
    <NodeViewWrapper as="div" className="cpm-blog-col" style={style}>
      <NodeViewContent className="cpm-blog-col-content" />
    </NodeViewWrapper>
  );
}

export const BlogColumn = Node.create({
  name: 'column',
  group: 'block',
  content: 'block+',

  addAttributes() {
    // 12-column grid span; null = equal share of the section's tracks.
    // Mirrored in backend/src/collab/blogSchema.ts and rendered by
    // the `column` branch of backend/src/services/blogRender.ts.
    return {
      span: {
        default: null,
        parseHTML: (el) => {
          const n = Number(el.getAttribute('data-span'));
          return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
        },
        renderHTML: (attrs) => {
          const n = attrs.span;
          if (!Number.isInteger(n) || n < 1 || n > 12) return {};
          return { 'data-span': String(n), style: `grid-column:span ${n}` };
        },
      },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="blog-column"]' }]; },
  // A content hole (0) is required so HTML serialization (preview / copy) has a
  // toDOM; without renderHTML the ProseMirror serializer throws on `column`.
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'blog-column', class: 'cpm-blog-col' }), 0];
  },
  addNodeView() { return ReactNodeViewRenderer(ColumnView); },
});

export default BlogColumn;
```

- [ ] **Step 6: Switch grid sections to a 12-track grid**

In `public/search-theme.css`, replace the existing grid rules (search for `.cpm-blog-section--cols2 .cpm-blog-section-inner`, around line 23627):

```css
.cpm-blog-section--cols2 .cpm-blog-section-inner,
.cpm-blog-section--cols3 .cpm-blog-section-inner,
.cpm-blog-section--mediaText .cpm-blog-section-inner {
  display: grid; gap: 28px; align-items: start;
  grid-template-columns: repeat(12, 1fr);
}
/* Defaults when a column carries no explicit span. An inline
   `grid-column:span N` from the column node overrides these. */
.cpm-blog-section--cols2 .cpm-blog-col,
.cpm-blog-section--mediaText .cpm-blog-col { grid-column: span 6; }
.cpm-blog-section--cols3 .cpm-blog-col { grid-column: span 4; }

@media (max-width: 900px) {
  .cpm-blog-section--cols2 .cpm-blog-section-inner,
  .cpm-blog-section--cols3 .cpm-blog-section-inner,
  .cpm-blog-section--mediaText .cpm-blog-section-inner { grid-template-columns: 1fr; }
  /* !important is required: it has to beat the inline span written by the
     column node, which is otherwise higher specificity than any selector. */
  .cpm-blog-col { grid-column: 1 / -1 !important; }
}
```

Delete the old `@media (max-width: …)` block that previously reset these three grids to `1fr` (immediately below the rules you replaced), so the rule is not defined twice.

- [ ] **Step 7: Verify**

```bash
npm run build
```

Expected: build succeeds. Open an existing multi-column post in the editor and confirm the columns still sit side by side (they have no `span`, so the class defaults apply).

- [ ] **Step 8: Commit**

```bash
git add src/lib/columnSpans.js src/lib/columnSpans.test.js src/components/clubpm/blog/BlogColumn.jsx public/search-theme.css
git commit -m "feat(blog): 12-column grid with per-column spans"
```

---

## Task 11: Section border, drag handle, and column controls

**Files:**
- Modify: `src/components/clubpm/blog/BlogSection.jsx`
- Modify: `public/search-theme.css`

- [ ] **Step 1: Make the section draggable and add column controls**

In `src/components/clubpm/blog/BlogSection.jsx`, add the import at the top:

```jsx
import { defaultSpans, resizePair, spansAfterAdd, spansAfterRemove } from '../../../lib/columnSpans';
```

Inside `SectionView`, add these helpers after the existing `remove` function:

```jsx
  // Column children of this section, with their current or default spans.
  const columnCount = (() => {
    let n = 0;
    node.forEach((child) => { if (child.type.name === 'column') n += 1; });
    return n;
  })();

  const currentSpans = (() => {
    if (!columnCount) return [];
    const explicit = [];
    node.forEach((child) => { if (child.type.name === 'column') explicit.push(child.attrs.span); });
    return explicit.every((s) => Number.isInteger(s)) ? explicit : defaultSpans(columnCount);
  })();

  // Write a full set of spans onto the section's column children in one
  // transaction, so collaborators see a single atomic change.
  const applySpans = (spans) => {
    if (typeof getPos !== 'function') return;
    const base = getPos();
    editor.chain().focus().command(({ tr }) => {
      let offset = base + 1;
      let i = 0;
      node.forEach((child) => {
        if (child.type.name === 'column') {
          tr.setNodeMarkup(tr.mapping.map(offset), undefined, { ...child.attrs, span: spans[i] ?? null });
          i += 1;
        }
        offset += child.nodeSize;
      });
      return true;
    }).run();
  };

  const nudge = (index, delta) => applySpans(resizePair(currentSpans, index, delta));

  const addColumn = () => {
    if (typeof getPos !== 'function' || columnCount >= 4) return;
    const pos = getPos();
    const spans = spansAfterAdd(currentSpans.length ? currentSpans : defaultSpans(1));
    editor.chain().focus()
      .insertContentAt(pos + node.nodeSize - 1, { type: 'column', content: [{ type: 'paragraph' }] })
      .run();
    // Re-read after insertion so the new child is included.
    setTimeout(() => applySpans(spans), 0);
  };

  const removeColumn = () => {
    if (columnCount <= 1) return;
    const spans = spansAfterRemove(currentSpans, currentSpans.length - 1);
    if (typeof getPos !== 'function') return;
    const base = getPos();
    let offset = base + 1;
    let lastColumnStart = null;
    let lastColumnSize = 0;
    node.forEach((child) => {
      if (child.type.name === 'column') { lastColumnStart = offset; lastColumnSize = child.nodeSize; }
      offset += child.nodeSize;
    });
    if (lastColumnStart == null) return;
    editor.chain().focus().deleteRange({ from: lastColumnStart, to: lastColumnStart + lastColumnSize }).run();
    setTimeout(() => applySpans(spans), 0);
  };
```

Replace the returned JSX so the wrapper carries a drag handle, gutter buttons and the column controls:

```jsx
  return (
    <NodeViewWrapper as="section" className={cls} style={bgStyle}>
      {editable && (
        <>
          <div className="cpm-blog-section-grip" contentEditable={false} data-drag-handle title="Drag to reorder this section">
            <i className="fas fa-grip-vertical" aria-hidden="true" />
          </div>
          <div className="cpm-blog-section-toolbar" contentEditable={false}>
            <button type="button" title="Move up" onClick={() => move(-1)}><i className="fas fa-arrow-up" /></button>
            <button type="button" title="Move down" onClick={() => move(1)}><i className="fas fa-arrow-down" /></button>
            {columnCount > 0 && (
              <>
                <button type="button" title="Add column" onClick={addColumn} disabled={columnCount >= 4}><i className="fas fa-table-columns" /></button>
                <button type="button" title="Remove last column" onClick={removeColumn} disabled={columnCount <= 1}><i className="fas fa-minus" /></button>
              </>
            )}
            <button type="button" title="Duplicate" onClick={duplicate}><i className="fas fa-clone" /></button>
            <button type="button" title="Style" onClick={openSettings}><i className="fas fa-palette" /></button>
            <button type="button" title="Delete" onClick={remove}><i className="fas fa-trash" /></button>
          </div>
          {columnCount > 1 && (
            <div className="cpm-blog-section-gutters" contentEditable={false}>
              {currentSpans.slice(0, -1).map((_, i) => (
                <span key={`gutter-${i}`} className="cpm-blog-section-gutter">
                  <button type="button" title="Narrow the left column" onClick={() => nudge(i, -1)}>‹</button>
                  <span className="cpm-blog-section-gutter-read">{currentSpans[i]} / {currentSpans[i + 1]}</span>
                  <button type="button" title="Widen the left column" onClick={() => nudge(i, 1)}>›</button>
                </span>
              ))}
            </div>
          )}
        </>
      )}
      <NodeViewContent className="cpm-blog-section-inner" />
    </NodeViewWrapper>
  );
```

Finally, add `draggable: true` to the node definition, immediately after `defining: true,`:

```jsx
  draggable: true,
```

- [ ] **Step 2: Add the editor-only chrome styles**

Append to the bottom of `public/search-theme.css`:

```css
/* === Section Builder: editor-only affordances =========================
   Scoped to .cpm-blog-editor-surface so borders, grips and gutter controls
   never reach the preview iframe or the published page. */
.cpm-blog-editor-surface .cpm-blog-section {
  border: 1px dashed rgba(120, 180, 255, .35);
  border-radius: 8px;
  margin: 10px 0;
  transition: border-color .15s ease;
}
.cpm-blog-editor-surface .cpm-blog-section:hover { border-color: rgba(120, 180, 255, .65); }
.cpm-blog-editor-surface .cpm-blog-section.is-selected { border-color: var(--pm-accent-teal, #00e5cc); border-style: solid; }

.cpm-blog-section-grip {
  position: absolute; left: -22px; top: 10px; width: 18px; height: 26px;
  display: grid; place-items: center; cursor: grab; opacity: 0;
  color: rgba(160, 200, 255, .85); transition: opacity .15s ease;
}
.cpm-blog-editor-surface .cpm-blog-section:hover .cpm-blog-section-grip { opacity: 1; }
.cpm-blog-section-grip:active { cursor: grabbing; }

.cpm-blog-section-gutters {
  position: absolute; left: 0; right: 0; bottom: 4px;
  display: flex; justify-content: center; gap: 12px;
  opacity: 0; transition: opacity .15s ease; pointer-events: none;
}
.cpm-blog-editor-surface .cpm-blog-section:hover .cpm-blog-section-gutters { opacity: 1; pointer-events: auto; }
.cpm-blog-section-gutter {
  display: inline-flex; align-items: center; gap: 4px; font-size: 10px;
  background: #0b0e13; border: 1px solid var(--pm-overlay, #2a2f3a);
  border-radius: 999px; padding: 2px 6px;
}
.cpm-blog-section-gutter button {
  background: none; border: none; color: var(--pm-accent-teal, #00e5cc);
  cursor: pointer; font-size: 13px; line-height: 1; padding: 0 3px;
}
.cpm-blog-section-gutter-read { color: var(--pm-text-muted, #97a3b6); font-variant-numeric: tabular-nums; }
```

- [ ] **Step 3: Make the remaining block nodes draggable**

Add `draggable: true,` immediately after the `atom: true,` (or `content:` line where there is no `atom`) in each of these node definitions, so they can be dragged between columns:

- `src/components/clubpm/blog/BlogCallout.jsx`
- `src/components/clubpm/blog/BlogStatBand.jsx`
- `src/components/clubpm/blog/BlogCta.jsx`
- `src/components/clubpm/blog/BlogHero.jsx`

(`BlogImage.jsx` and `BlogGallery.jsx` already declare it.)

- [ ] **Step 4: Verify**

```bash
npm run build
```

Expected: build succeeds.

Manual check in the editor: a section shows a dashed border, the grip appears on hover and drags the whole section, the gutter pills adjust the split, and dragging an image out of one column and into another works without dragging its section.

- [ ] **Step 5: Commit**

```bash
git add src/components/clubpm/blog/BlogSection.jsx src/components/clubpm/blog/BlogCallout.jsx src/components/clubpm/blog/BlogStatBand.jsx src/components/clubpm/blog/BlogCta.jsx src/components/clubpm/blog/BlogHero.jsx public/search-theme.css
git commit -m "feat(blog): section borders, drag handle and column controls"
```

---

## Task 12: Standalone image section preset

**Files:**
- Modify: `src/components/clubpm/blog/sectionNodes.js`

- [ ] **Step 1: Add the preset**

In `src/components/clubpm/blog/sectionNodes.js`, insert this entry immediately after the `mediaText` entry:

```js
  { id: 'image', label: 'Image', icon: 'fa-image',
    build: () => ({ type: 'section', attrs: { layout: 'single', padding: 'm' },
      content: [{ type: 'image', attrs: { src: null, alt: '', align: 'center', width: null, widthUnit: 'px', caption: '' } }] }) },
```

- [ ] **Step 2: Verify**

```bash
npm run build
```

Expected: build succeeds. In the editor, "Add Section" now lists **Image**, and choosing it inserts a single image placeholder with no text column.

- [ ] **Step 3: Commit**

```bash
git add src/components/clubpm/blog/sectionNodes.js
git commit -m "feat(blog): standalone image section preset"
```

---

## Task 13: Font loading and pair CSS

**Files:**
- Modify: `public/index.html`
- Modify: `public/search-theme.css`
- Modify: `package.json` (dependency install only)

- [ ] **Step 1: Install the typography extensions**

```bash
npm install @tiptap/extension-text-style@^3.27.1 @tiptap/extension-highlight@^3.27.1
```

Then confirm what the text-style package actually exports — Task 14 depends on it:

```bash
node -e "console.log(Object.keys(require('./node_modules/@tiptap/extension-text-style/dist/index.cjs')))"
```

Note the names it prints (expected to include `TextStyle`, and likely `FontFamily`, `FontSize`, `Color`). If `FontFamily`/`FontSize`/`Color` are **not** listed, install them as separate packages before Task 14 and adjust that task's imports.

- [ ] **Step 2: Load Syne and DM Sans**

In `public/index.html`, replace the Google Fonts `<link>` on line 82 with one that also requests Syne and DM Sans:

```html
    <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Montserrat:wght@400;500;700;900&family=Ubuntu:wght@400;500;700&family=Lato:wght@300;400&family=Work+Sans:wght@300;400;700&family=Syne:wght@600;700;800&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
```

- [ ] **Step 3: Replace the font-pair rules**

In `public/search-theme.css`, replace the two `data-fontpair` rules (around lines 23613–23614) and extend the block above them:

```css
.pm-blog-post-body, .cpm-blog-editor-surface {
  --post-accent: var(--pm-accent-teal, #00e5cc);
  --post-max: 760px;
  /* Every pair sets BOTH faces: display for headings/hero, body for prose.
     Previously a single font-family landed on the wrapper, so headings never
     received the display face and the default pair had no rule at all. */
  --post-display: 'Syne', system-ui, sans-serif;
  --post-body: 'DM Sans', system-ui, sans-serif;
}
.pm-blog-post-body[data-fontpair="syne-dmsans"], .cpm-blog-editor-surface[data-fontpair="syne-dmsans"] {
  --post-display: 'Syne', system-ui, sans-serif;
  --post-body: 'DM Sans', system-ui, sans-serif;
}
.pm-blog-post-body[data-fontpair="oswald-lato"], .cpm-blog-editor-surface[data-fontpair="oswald-lato"] {
  --post-display: 'Oswald', system-ui, sans-serif;
  --post-body: 'Lato', system-ui, sans-serif;
}
.pm-blog-post-body[data-fontpair="montserrat-worksans"], .cpm-blog-editor-surface[data-fontpair="montserrat-worksans"] {
  --post-display: 'Montserrat', system-ui, sans-serif;
  --post-body: 'Work Sans', system-ui, sans-serif;
}

.pm-blog-post-body, .cpm-blog-editor-surface .ProseMirror { font-family: var(--post-body); }
.pm-blog-post-body h1, .pm-blog-post-body h2, .pm-blog-post-body h3,
.pm-blog-post-body h4, .pm-blog-post-body h5, .pm-blog-post-body h6,
.pm-blog-post-body .cpm-blog-hero h1, .pm-blog-post-body .cpm-blog-stat-value,
.cpm-blog-editor-surface .ProseMirror h1, .cpm-blog-editor-surface .ProseMirror h2,
.cpm-blog-editor-surface .ProseMirror h3, .cpm-blog-editor-surface .ProseMirror h4,
.cpm-blog-editor-surface .ProseMirror h5, .cpm-blog-editor-surface .ProseMirror h6,
.cpm-blog-editor-surface .cpm-blog-hero h1, .cpm-blog-editor-surface .cpm-blog-hero-h {
  font-family: var(--post-display);
}
```

Keep the existing `[data-width="wide"]` rule as-is.

- [ ] **Step 4: Verify**

```bash
npm run build
```

Expected: build succeeds. In the editor, switching the pair in the theme bar visibly changes both headings and body text, including the default Syne/DM Sans.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/search-theme.css package.json package-lock.json
git commit -m "fix(blog): load and apply both faces of every font pair"
```

---

## Task 14: Per-selection typography controls

**Files:**
- Modify: `src/components/clubpm/blog/BlogEditor.jsx`
- Modify: `public/search-theme.css`

- [ ] **Step 1: Register the marks**

In `src/components/clubpm/blog/BlogEditor.jsx`, add to the imports (adjust the named imports to match what Task 13 Step 1 reported):

```jsx
import { TextStyle, FontFamily, FontSize, Color } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
```

In `blogExtensions()`, add after `TaskItem.configure({ nested: true }),`:

```jsx
    TextStyle,
    FontFamily.configure({ types: ['textStyle'] }),
    FontSize.configure({ types: ['textStyle'] }),
    Color.configure({ types: ['textStyle'] }),
    Highlight.configure({ multicolor: true }),
```

- [ ] **Step 2: Add the font list and the controls**

Near the top of `src/components/clubpm/blog/BlogEditor.jsx`, below the `CURSOR_COLORS` block, add:

```jsx
// Restricted to the faces the site actually loads (public/index.html) and that
// the server renderer allowlists (blogRender.ts ALLOWED_FONTS). Keep the three
// lists in sync — a font missing from any of them silently drops on publish.
const POST_FONTS = ['Syne', 'DM Sans', 'Oswald', 'Lato', 'Montserrat', 'Work Sans'];
const POST_SIZES = [12, 14, 16, 18, 20, 24, 30, 36, 48];
```

Inside `Toolbar`, add above the `return`:

```jsx
  const activeFont = editor.getAttributes('textStyle').fontFamily ?? '';
  const activeSize = String(editor.getAttributes('textStyle').fontSize ?? '').replace('px', '');
```

and add these controls into the toolbar JSX, immediately after the `<ToolbarMenu label="Format" … />` element:

```jsx
      <select
        className="cpm-blog-tb-select"
        value={activeFont}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) editor.chain().focus().unsetFontFamily().run();
          else editor.chain().focus().setFontFamily(v).run();
        }}
        title="Font for the selected text"
      >
        <option value="">Post font</option>
        {POST_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      <select
        className="cpm-blog-tb-select"
        value={activeSize}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) editor.chain().focus().unsetFontSize().run();
          else editor.chain().focus().setFontSize(`${v}px`).run();
        }}
        title="Size of the selected text"
      >
        <option value="">Size</option>
        {POST_SIZES.map((s) => <option key={s} value={s}>{s}px</option>)}
      </select>
      <label className="cpm-blog-tb-color" title="Text colour">
        <i className="fas fa-a" aria-hidden="true" />
        <input
          type="color"
          value={editor.getAttributes('textStyle').color ?? '#ffffff'}
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
        />
      </label>
      <label className="cpm-blog-tb-color" title="Highlight">
        <i className="fas fa-highlighter" aria-hidden="true" />
        <input
          type="color"
          value={editor.getAttributes('highlight').color ?? '#f5a623'}
          onChange={(e) => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()}
        />
      </label>
```

- [ ] **Step 3: Warn that Markdown mode is lossy**

In `src/components/clubpm/blog/BlogEditor.jsx`, replace the markdown hint in the footer:

```jsx
        {markdownMode && <span className="cpm-blog-markdown-hint">Editing raw Markdown — switch back to rich text to continue formatting. Fonts, sizes, colours and highlights are not represented in Markdown and will be lost on switching back.</span>}
```

- [ ] **Step 4: Style the colour controls**

Append to the bottom of `public/search-theme.css`:

```css
.cpm-blog-tb-color {
  display: inline-flex; align-items: center; gap: 4px; cursor: pointer;
  padding: 3px 6px; border-radius: 5px; border: 1px solid var(--pm-overlay, #2a2f3a);
  background: rgba(255, 255, 255, .04); color: #cfd7e3; font-size: 12px;
}
.cpm-blog-tb-color input[type="color"] {
  width: 18px; height: 18px; padding: 0; border: none; background: none; cursor: pointer;
}
.pm-blog-post-body mark, .cpm-blog-editor-surface .ProseMirror mark {
  background-color: rgba(245, 166, 35, .4); color: inherit; padding: 0 2px; border-radius: 2px;
}
```

- [ ] **Step 5: Verify end to end**

```bash
npm run build
cd backend && npx tsx src/services/blogRender.test.ts && npx tsx src/services/blogSchemaContract.test.ts
```

Expected: build succeeds; both backend tests PASS.

Manual check: select a word, pick Oswald at 24px in orange, save, and confirm the styling survives a reload (it round-trips through the collab schema) and appears in Preview after Task 15.

- [ ] **Step 6: Commit**

```bash
git add src/components/clubpm/blog/BlogEditor.jsx public/search-theme.css
git commit -m "feat(blog): per-selection font, size, colour and highlight"
```

---

## Task 15: Preview iframe

**Files:**
- Create: `src/components/clubpm/blog/BlogPreviewFrame.jsx`
- Modify: `src/pages/ClubPM/BlogEditorPage.jsx`
- Modify: `public/search-theme.css`

- [ ] **Step 1: Build the iframe host**

Create `src/components/clubpm/blog/BlogPreviewFrame.jsx`:

```jsx
import React from 'react';
import { previewBlogPost } from '../../../api/clubPmClient';

// Renders the post exactly as the public article page will. Two things make
// this accurate, and both matter:
//   1. The HTML comes from the server's renderJsonToHtml() — the same function
//      the publish path calls — not from the editor's getHTML().
//   2. It lives in an iframe, so ClubPM's dark theme and its !important editor
//      overrides cannot reach inside.
// The markup below must mirror src/pages/BlogPost.jsx.

const WIDTHS = [
  { id: 'desktop', label: 'Desktop', icon: 'fa-desktop', width: '100%' },
  { id: 'tablet', label: 'Tablet', icon: 'fa-tablet-screen-button', width: '820px' },
  { id: 'mobile', label: 'Mobile', icon: 'fa-mobile-screen', width: '414px' },
];

// The enhancer runs inside the iframe, where module imports aren't available —
// so the same behaviour is inlined here. Keep in sync with src/lib/blogCarousel.js.
const CAROUSEL_INLINE = `
document.querySelectorAll('[data-carousel]').forEach(function (root) {
  var track = root.querySelector('.cpm-blog-carousel-track');
  if (!track) return;
  var slides = Array.prototype.slice.call(track.querySelectorAll('.cpm-blog-carousel-slide'));
  if (!slides.length) return;
  var dots = Array.prototype.slice.call(root.querySelectorAll('.cpm-blog-carousel-dot'));
  var prev = root.querySelector('.cpm-blog-carousel-prev');
  var next = root.querySelector('.cpm-blog-carousel-next');
  var i = 0;
  function clamp(n) { return Math.min(Math.max(n, 0), slides.length - 1); }
  function paint() {
    dots.forEach(function (d, k) { d.classList.toggle('is-active', k === i); });
    if (prev) prev.disabled = i === 0;
    if (next) next.disabled = i === slides.length - 1;
  }
  function go(n) { i = clamp(n); slides[i].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); paint(); }
  if (prev) prev.addEventListener('click', function () { go(i - 1); });
  if (next) next.addEventListener('click', function () { go(i + 1); });
  dots.forEach(function (d, k) { d.addEventListener('click', function () { go(k); }); });
  paint();
});`;

function buildSrcDoc({ html, meta, title, origin }) {
  const theme = meta?.theme ?? {};
  const cover = meta?.coverImageUrl || '/Purdue_Sky.webp';
  const date = meta?.publishedAt
    ? new Date(meta.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';
  const byline = [meta?.authorName, date, meta?.readingTimeMin ? `${meta.readingTimeMin} min read` : '']
    .filter(Boolean).join(' · ');
  const accent = theme.accent ? `--post-accent:${theme.accent};` : '';

  return `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<link rel="stylesheet" href="${origin}/search-theme.css"/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Montserrat:wght@400;500;700;900&family=Ubuntu:wght@400;500;700&family=Lato:wght@300;400&family=Work+Sans:wght@300;400;700&family=Syne:wght@600;700;800&family=DM+Sans:wght@400;500;700&display=swap"/>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"/>
<style>body{margin:0;background:#fff;}</style>
</head><body>
<div class="jumbotron jumbotron-single d-flex align-items-center" style="background-image:url(${cover})">
  <div class="container text-center">
    <h1 class="display-3 mb-3">${title || 'Untitled post'}</h1>
    ${byline ? `<p class="header-sub-title">${byline}</p>` : ''}
  </div>
</div>
<section class="bg-white"><div class="container"><div class="section-content">
  <div class="pm-blog-post-body" data-fontpair="${theme.fontPair || 'syne-dmsans'}" data-width="${theme.width || 'wide'}" style="${accent}">${html}</div>
</div></div></section>
<script>
${CAROUSEL_INLINE}
</script>
</body></html>`;
}

export default function BlogPreviewFrame({ postId, title, contentJson }) {
  const [srcDoc, setSrcDoc] = React.useState('');
  const [state, setState] = React.useState('loading');
  const [device, setDevice] = React.useState('desktop');

  React.useEffect(() => {
    let cancelled = false;
    setState('loading');
    previewBlogPost(postId, contentJson)
      .then(({ html, meta }) => {
        if (cancelled) return;
        setSrcDoc(buildSrcDoc({ html, meta, title, origin: window.location.origin }));
        setState('ready');
      })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, [postId, contentJson, title]);

  const active = WIDTHS.find((w) => w.id === device) ?? WIDTHS[0];

  return (
    <div className="cpm-blog-previewframe">
      <div className="cpm-blog-previewframe-bar">
        <span className="cpm-blog-previewframe-lab">Exactly as it will publish</span>
        <div className="cpm-blog-seg">
          {WIDTHS.map((w) => (
            <button
              key={w.id}
              type="button"
              className={`cpm-blog-seg-b${device === w.id ? ' on' : ''}`}
              onClick={() => setDevice(w.id)}
              title={w.label}
            >
              <i className={`fas ${w.icon}`} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
      {state === 'error' ? (
        <p className="cpm-blog-previewframe-error">Could not render the preview. Check that the backend is reachable.</p>
      ) : (
        <iframe
          title="Post preview"
          className="cpm-blog-previewframe-frame"
          style={{ width: active.width }}
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-same-origin"
        />
      )}
    </div>
  );
}
```

> `CAROUSEL_INLINE` is referenced by `buildSrcDoc` before its `const` declaration is evaluated. Move the `const CAROUSEL_INLINE = …` block **above** `buildSrcDoc` when you create the file — it is written after it here only for readability.

- [ ] **Step 2: Swap the preview implementation in the editor page**

In `src/pages/ClubPM/BlogEditorPage.jsx`, add the import:

```jsx
import BlogPreviewFrame from '../../components/clubpm/blog/BlogPreviewFrame';
```

Delete the `previewHtml` `useMemo` block (lines 52–58) and the now-unused `useMemo` import if nothing else uses it.

Replace the preview branch inside `.cpm-blog-editor-body`:

```jsx
        {previewMode ? (
          <BlogPreviewFrame postId={id} title={title} contentJson={contentJson} />
        ) : (
          <input
            className="cpm-blog-title-input"
            value={title}
            onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
            placeholder="Post title"
          />
        )}
```

- [ ] **Step 3: Delete the stale preview overrides and add frame styles**

In `public/search-theme.css`, delete these two lines (around 21827–21828), which exist only to fight the dark canvas that the iframe now isolates:

```css
.cpm-blog-preview .pm-blog-post-body { color: #e7ecf3; }
.cpm-blog-preview .pm-blog-post-body a { color: var(--pm-accent-teal, #00e5cc); }
```

Append to the bottom of `public/search-theme.css`:

```css
/* === Preview iframe ==================================================== */
.cpm-blog-previewframe { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.cpm-blog-previewframe-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  width: 100%; padding: 8px 4px;
}
.cpm-blog-previewframe-lab {
  font-size: 11px; text-transform: uppercase; letter-spacing: .09em;
  color: var(--pm-text-muted, #97a3b6);
}
.cpm-blog-previewframe-frame {
  border: 1px solid var(--pm-overlay, #2a2f3a); border-radius: 10px;
  background: #fff; height: calc(100vh - 260px); min-height: 480px;
  max-width: 100%; transition: width .18s ease;
}
.cpm-blog-previewframe-error { color: var(--pm-accent-coral, #ff6b6b); padding: 24px; }
```

- [ ] **Step 4: Verify**

```bash
npm run build
```

Expected: build succeeds. Open a post, click Preview, and confirm the article renders on a white page with the hero, in the site's fonts, with a working carousel — and that the device buttons resize it.

- [ ] **Step 5: Commit**

```bash
git add src/components/clubpm/blog/BlogPreviewFrame.jsx src/pages/ClubPM/BlogEditorPage.jsx public/search-theme.css
git commit -m "feat(blog): preview renders the published HTML in an isolated iframe"
```

---

## Task 16: Public article page — full-bleed fix and carousel init

**Files:**
- Modify: `src/pages/BlogPost.jsx`
- Modify: `public/search-theme.css`

- [ ] **Step 1: Remove the 760 px wrapper and initialise carousels**

In `src/pages/BlogPost.jsx`, add the import:

```jsx
import { initBlogCarousels } from '../lib/blogCarousel';
```

Add a ref and an effect above the `if (loading)` guard:

```jsx
  const bodyRef = useRef(null);

  // The body is injected as raw HTML, so React never mounts the carousel —
  // enhance it after each render of a new post.
  useEffect(() => {
    if (bodyRef.current) initBlogCarousels(bodyRef.current);
  }, [post]);
```

and extend the React import to include `useRef`:

```jsx
import React, { useState, useEffect, useRef } from 'react';
```

Replace the article `<section>` so sections can reach full width:

```jsx
      <section className="bg-white">
        <div className="pm-blog-article">
          <div
            ref={bodyRef}
            className="pm-blog-post-body"
            data-fontpair={post.theme?.fontPair || 'syne-dmsans'}
            data-width={post.theme?.width || 'wide'}
            style={post.theme?.accent ? { '--post-accent': post.theme.accent } : undefined}
            dangerouslySetInnerHTML={{ __html: post.renderedHtml || '' }}
          />

          <div className="pm-blog-article-foot">
            {post.tags?.length > 0 && (
              <div style={{ marginTop: 32, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {post.tags.map(t => (
                  <span key={t.slug} className="cpm-tag" style={{ fontSize: 12 }}>#{t.name}</span>
                ))}
              </div>
            )}

            <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 16 }}>
              <Link to="/blog" className="btn-slide-outline">
                <span>← All posts</span>
              </Link>
              {primaryCategory && (
                <span style={{ color: 'var(--color-muted)', fontSize: 13 }}>
                  Filed under: {primaryCategory}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>
```

- [ ] **Step 2: Add the article wrapper styles**

Append to the bottom of `public/search-theme.css`:

```css
/* === Public article wrapper ===========================================
   The article is NOT width-constrained here: each section constrains itself
   via .cpm-blog-section-inner { max-width: var(--post-max) }, which is what
   lets width:fullBleed sections and the theme's "wide" setting work at all.
   Legacy posts whose content is bare blocks (no section wrappers) still need
   a readable measure, so those are constrained individually. */
.pm-blog-article { width: 100%; padding: 0; }
.pm-blog-post-body > :not(.cpm-blog-section) {
  max-width: var(--post-max, 760px);
  margin-left: auto;
  margin-right: auto;
}
.pm-blog-article-foot {
  max-width: var(--post-max, 760px);
  margin: 0 auto;
  padding: 0 20px 8px;
}
```

- [ ] **Step 3: Verify**

```bash
npm run build
```

Expected: build succeeds.

Manual check against a **previously published** post (one written before this branch): the text still sits in a readable column and nothing runs edge to edge. Then check a post containing a `fullBleed` section: that band now spans the viewport.

- [ ] **Step 4: Commit**

```bash
git add src/pages/BlogPost.jsx public/search-theme.css
git commit -m "fix(blog): let full-bleed sections reach full width; init carousels on the public page"
```

---

## Task 17: Card panel with live preview

**Files:**
- Create: `src/components/clubpm/blog/BlogCardPanel.jsx`
- Modify: `src/components/clubpm/blog/BlogMetaPanel.jsx`
- Modify: `src/pages/Blog.jsx`
- Modify: `public/search-theme.css`

- [ ] **Step 1: Build the panel**

Create `src/components/clubpm/blog/BlogCardPanel.jsx`:

```jsx
import React from 'react';
import BlogCard from '../../BlogCard';

// Groups the fields that assemble the card on /blog behind a live preview.
// There are no card-specific database fields: this panel edits the post's own
// cover image, title, excerpt, byline and category. The preview uses the real
// BlogCard component so what you see is what the index renders.

const CLAMP_HINT = 180;

export default function BlogCardPanel({
  title, coverImageUrl, excerpt, authorName, categoryName, publishedAt, linkUrl, slug,
}) {
  const over = (excerpt ?? '').length > CLAMP_HINT;
  const date = publishedAt
    ? new Date(publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <div className="cpm-blog-cardpanel">
      <div className="cpm-blog-meta-divider">Blog card</div>

      <div className="cpm-blog-cardpanel-preview">
        <BlogCard
          image={coverImageUrl || '/Purdue_Sky.webp'}
          imageAlt={title}
          tag={categoryName || 'Update'}
          title={title || 'Untitled post'}
          href={linkUrl || `/blog/${slug || 'post-slug'}`}
          date={date}
          excerpt={excerpt || ''}
          author={authorName || 'SEARCH Team'}
        />
      </div>

      {!coverImageUrl && (
        <p className="cpm-blog-cardpanel-warn">
          <i className="fas fa-triangle-exclamation" aria-hidden="true" />{' '}
          No cover image set — the blog index will show the default campus photo.
          Set one under <strong>Cover image</strong> below.
        </p>
      )}
      {over && (
        <p className="cpm-blog-cardpanel-hint">
          This excerpt is {(excerpt ?? '').length} characters. The card shows about {CLAMP_HINT}
          {' '}before it clamps — the rest is still used for search and social previews.
        </p>
      )}
      <p className="cpm-blog-cardpanel-hint">
        The card is built from the fields below: cover image, post title, excerpt, byline,
        first category, and link URL.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Mount it at the top of the metadata panel**

In `src/components/clubpm/blog/BlogMetaPanel.jsx`, add the import:

```jsx
import BlogCardPanel from './BlogCardPanel';
```

and insert the panel as the first child of `.cpm-blog-meta-panel-body`, immediately before the `{post?.readingTimeMin != null && (` block:

```jsx
        <BlogCardPanel
          title={title}
          coverImageUrl={coverImageUrl}
          excerpt={excerpt}
          authorName={authorName}
          categoryName={allCategories.find((c) => selectedCategoryIds.has(c.id))?.name}
          publishedAt={post?.publishedAt}
          linkUrl={linkUrl}
          slug={slug}
        />
```

- [ ] **Step 3: Stop chopping the excerpt mid-word**

In `src/pages/Blog.jsx`, replace the `excerpt` prop on `BlogCard` (line 104):

```jsx
                              excerpt={p.excerpt ?? ''}
```

- [ ] **Step 4: Add the styles**

Append to the bottom of `public/search-theme.css`:

```css
/* === Blog card panel =================================================== */
.cpm-blog-cardpanel { margin-bottom: 18px; }
.cpm-blog-cardpanel-preview {
  background: #f4f5f7; border-radius: 10px; padding: 10px; margin-bottom: 10px;
}
.cpm-blog-cardpanel-preview .blog-item { margin: 0; }
.cpm-blog-cardpanel-warn {
  font-size: 11.5px; line-height: 1.5; color: var(--pm-accent-amber, #f5a623);
  margin: 0 0 8px; border-left: 2px solid currentColor; padding-left: 9px;
}
.cpm-blog-cardpanel-hint {
  font-size: 11px; line-height: 1.5; color: var(--pm-text-muted, #97a3b6); margin: 0 0 6px;
}

/* Clamp the card description instead of slicing the string, so descriptions
   are never cut mid-word. */
.blog-desc p {
  display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical;
  overflow: hidden;
}
```

- [ ] **Step 5: Verify**

```bash
npm run build
```

Expected: build succeeds. Open the metadata panel: the card preview sits at the top and updates as you edit the title, excerpt and cover image; a post with no cover shows the amber warning.

- [ ] **Step 6: Commit**

```bash
git add src/components/clubpm/blog/BlogCardPanel.jsx src/components/clubpm/blog/BlogMetaPanel.jsx src/pages/Blog.jsx public/search-theme.css
git commit -m "feat(blog): card panel with live preview; clamp instead of slicing excerpts"
```

---

## Task 18: Editor header chrome

**Files:**
- Modify: `src/pages/ClubPM/BlogEditorPage.jsx`
- Modify: `public/search-theme.css`

- [ ] **Step 1: Add a publish menu component**

In `src/pages/ClubPM/BlogEditorPage.jsx`, add above `export default function BlogEditorPage()`:

```jsx
// Publish is the single primary action; every other workflow verb lives in its
// menu, with destructive items separated and confirmed.
function PublishMenu({ status, disabled, onPublish, onSchedule, onUnpublish, onArchive, onDelete, approvalPending }) {
  const [open, setOpen] = React.useState(false);
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [when, setWhen] = React.useState('');
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open && !scheduleOpen) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setScheduleOpen(false); } };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); setScheduleOpen(false); } };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open, scheduleOpen]);

  return (
    <span className="cpm-blog-publish-wrap" ref={ref}>
      {status !== 'PUBLISHED' && (
        <button
          type="button"
          className="clubpm-btn-primary cpm-blog-publish-main"
          onClick={onPublish}
          disabled={disabled || approvalPending}
          title={approvalPending ? 'Awaiting approval' : 'Publish now'}
        >
          Publish
        </button>
      )}
      <button
        type="button"
        className={`clubpm-btn-primary cpm-blog-publish-caret${status === 'PUBLISHED' ? ' is-solo' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More publishing actions"
      >
        <i className="fas fa-chevron-down" aria-hidden="true" />
      </button>

      {open && (
        <div className="cpm-blog-publish-pop" role="menu">
          <button type="button" role="menuitem" onClick={() => { setScheduleOpen(true); setOpen(false); }} disabled={approvalPending}>
            <i className="fas fa-calendar-days" aria-hidden="true" /> Schedule…
          </button>
          {status === 'PUBLISHED' && (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onUnpublish(); }}>
              <i className="fas fa-pause" aria-hidden="true" /> Unpublish
            </button>
          )}
          {status !== 'ARCHIVED' && (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onArchive(); }}>
              <i className="fas fa-box-archive" aria-hidden="true" /> Archive
            </button>
          )}
          <div className="cpm-blog-publish-sep" />
          <button type="button" role="menuitem" className="is-danger" onClick={() => { setOpen(false); onDelete(); }}>
            <i className="fas fa-trash" aria-hidden="true" /> Delete post
          </button>
        </div>
      )}

      {scheduleOpen && (
        <div className="cpm-blog-publish-pop cpm-blog-schedule-pop" role="dialog" aria-label="Schedule this post">
          <label className="cpm-form-label">Publish at</label>
          <input type="datetime-local" className="cpm-form-input" value={when} onChange={(e) => setWhen(e.target.value)} />
          <div className="cpm-blog-schedule-pop-actions">
            <button type="button" className="clubpm-btn-secondary" onClick={() => setScheduleOpen(false)}>Cancel</button>
            <button type="button" className="clubpm-btn-primary" disabled={!when} onClick={() => { setScheduleOpen(false); onSchedule(when); }}>
              Schedule
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Take the schedule time as an argument**

In `BlogEditorPage`, delete the `scheduledAtInput` state (line 37) and change `handleSchedule` to accept the value:

```jsx
  const handleSchedule = useCallback(async (whenValue) => {
    if (approvalPending) { toast.error('Awaiting approval before this post can be scheduled'); return; }
    if (!whenValue) { toast.error('Pick a date and time first'); return; }
    const ok = await handleSave();
    if (!ok) return;
    setBusyAction(true);
    try {
      const updated = await scheduleBlogPost(id, new Date(whenValue).toISOString());
      setPost(updated);
      toast.success('Scheduled');
    } catch {
      toast.error('Scheduling failed');
    } finally {
      setBusyAction(false);
    }
  }, [id, handleSave, approvalPending]);
```

- [ ] **Step 3: Replace the header actions**

Replace the whole `<div className="cpm-blog-editor-header-actions">` block:

```jsx
        <div className="cpm-blog-editor-header-actions">
          <div className="cpm-blog-tool-group" role="group" aria-label="Panels">
            <button
              type="button"
              className="cpm-blog-tool-btn"
              onClick={() => setHistoryOpen(true)}
              title="Revision history"
              aria-label="Revision history"
            >
              <i className="fas fa-clock-rotate-left" aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`cpm-blog-tool-btn${metaPanelOpen ? ' is-active' : ''}`}
              onClick={() => setMetaPanelOpen((v) => !v)}
              title="Card, metadata & SEO"
              aria-label="Card, metadata and SEO"
            >
              <i className="fas fa-sliders-h" aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`cpm-blog-tool-btn${reviewPanelOpen ? ' is-active' : ''}`}
              onClick={() => setReviewPanelOpen((v) => !v)}
              title="Review notes & authors"
              aria-label="Review notes and authors"
            >
              <i className="fas fa-users-viewfinder" aria-hidden="true" />
            </button>
          </div>

          <span className="cpm-blog-header-sep" />

          <button
            type="button"
            className={`clubpm-btn-secondary${previewMode ? ' is-active' : ''}`}
            onClick={() => setPreviewMode((v) => !v)}
            title="Preview as it will appear on the public site"
          >
            <i className={`fas ${previewMode ? 'fa-pen' : 'fa-eye'}`} aria-hidden="true" />
            <span>{previewMode ? 'Edit' : 'Preview'}</span>
          </button>

          <button type="button" className="clubpm-btn-secondary" onClick={() => handleSave()} disabled={saving}>
            <i className="fas fa-floppy-disk" aria-hidden="true" />
            <span>{saving ? 'Saving…' : 'Save draft'}</span>
          </button>

          <PublishMenu
            status={post?.status}
            disabled={saving || busyAction}
            approvalPending={approvalPending}
            onPublish={handlePublish}
            onSchedule={handleSchedule}
            onUnpublish={handleUnpublish}
            onArchive={handleArchive}
            onDelete={handleDelete}
          />
        </div>
```

- [ ] **Step 4: Add the chrome styles**

Append to the bottom of `public/search-theme.css`:

```css
/* === Blog editor header: one primary action, everything else grouped === */
.cpm-blog-editor-header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cpm-blog-editor-header-actions .clubpm-btn-secondary,
.cpm-blog-editor-header-actions .clubpm-btn-primary {
  display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;
}
.cpm-blog-header-sep { width: 1px; align-self: stretch; background: var(--pm-overlay, #2a2f3a); margin: 0 2px; }

.cpm-blog-tool-group {
  display: inline-flex; gap: 2px; padding: 2px;
  border: 1px solid var(--pm-overlay, #2a2f3a); border-radius: 8px; background: rgba(0, 0, 0, .18);
}
.cpm-blog-tool-btn {
  width: 30px; height: 28px; display: grid; place-items: center;
  border: none; border-radius: 6px; background: none; cursor: pointer;
  color: var(--pm-text-muted, #97a3b6); font-size: 13px;
}
.cpm-blog-tool-btn:hover { background: var(--pm-overlay, #2a2f3a); color: #eef2f8; }
.cpm-blog-tool-btn.is-active { background: rgba(0, 229, 204, .15); color: var(--pm-accent-teal, #00e5cc); }

.cpm-blog-publish-wrap { position: relative; display: inline-flex; }
.cpm-blog-publish-main { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.cpm-blog-publish-caret { border-top-left-radius: 0; border-bottom-left-radius: 0; padding-left: 9px; padding-right: 9px; }
.cpm-blog-publish-caret.is-solo { border-radius: 8px; }

.cpm-blog-publish-pop {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 40; min-width: 208px;
  background: var(--pm-elevated, #1e2430); border: 1px solid var(--pm-overlay, #2a2f3a);
  border-radius: 9px; padding: 5px; box-shadow: 0 12px 34px rgba(0, 0, 0, .45);
}
.cpm-blog-publish-pop button[role="menuitem"] {
  display: flex; align-items: center; gap: 9px; width: 100%; text-align: left;
  background: none; border: none; cursor: pointer; color: #dfe6f0;
  font-size: 13px; padding: 8px 10px; border-radius: 6px;
}
.cpm-blog-publish-pop button[role="menuitem"]:hover { background: var(--pm-overlay, #2a2f3a); }
.cpm-blog-publish-pop button[role="menuitem"]:disabled { opacity: .45; cursor: default; }
.cpm-blog-publish-pop button.is-danger { color: var(--pm-accent-coral, #ff6b6b); }
.cpm-blog-publish-sep { height: 1px; background: var(--pm-overlay, #2a2f3a); margin: 5px 4px; }

.cpm-blog-schedule-pop { padding: 12px; min-width: 250px; }
.cpm-blog-schedule-pop-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
```

- [ ] **Step 5: Verify**

```bash
npm run build
```

Expected: build succeeds, and no unused-variable warnings for `scheduledAtInput`.

Manual check: the header is one row; Schedule opens a popover containing the date picker; Delete sits below a divider in red and still confirms before deleting.

- [ ] **Step 6: Commit**

```bash
git add src/pages/ClubPM/BlogEditorPage.jsx public/search-theme.css
git commit -m "refactor(blog): group editor header behind one primary publish action"
```

---

## Task 19: Formatting toolbar regroup

**Files:**
- Modify: `src/components/clubpm/blog/BlogEditor.jsx`
- Modify: `public/search-theme.css`

- [ ] **Step 1: Move the theme controls into a Design popover**

In `src/components/clubpm/blog/BlogEditor.jsx`, replace the theme bar usage in the returned JSX. Delete this line from `.cpm-blog-toolbar-row`:

```jsx
        {onThemeChange && <BlogThemeBar theme={theme} onChange={onThemeChange} />}
```

and pass the theme props into `Toolbar` instead:

```jsx
        <Toolbar
          editor={editor}
          onToggleFind={() => setShowFind((s) => !s)}
          onToggleSnippets={() => setShowSnippets(true)}
          onAddSection={() => setShowSecLib(true)}
          onToggleMarkdown={toggleMarkdown}
          markdownMode={markdownMode}
          onShowShortcuts={() => shortcutsRegistry?.setShowHelp(true)}
          toolbarOpen={toolbarOpen}
          onToggleToolbarOpen={() => setToolbarOpen((v) => !v)}
          theme={theme}
          onThemeChange={onThemeChange}
        />
```

Add `theme, onThemeChange` to the `Toolbar` signature, and add this component above `Toolbar`:

```jsx
// Post-level design controls (accent, font pair, width). These apply to the
// whole post — per-selection typography lives in the Text group instead.
function DesignMenu({ theme, onChange }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <span className="cpm-blog-tb-menu" ref={ref}>
      <button
        type="button"
        className={`cpm-blog-tb-menu-trigger${open ? ' is-open' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        title="Post design"
      >
        <i className="fas fa-palette" aria-hidden="true" />
        <span className="cpm-blog-tb-menu-label">Design</span>
        <i className="fas fa-chevron-down cpm-blog-tb-menu-caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="cpm-blog-tb-menu-pop cpm-blog-design-pop">
          <BlogThemeBar theme={theme} onChange={onChange} />
          <p className="cpm-blog-design-hint">Applies to the whole post.</p>
        </div>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Regroup the toolbar into five bands**

Replace the returned JSX of `Toolbar` with this ordering. Keep the existing `formatItems`, `listItems`, `insertItems`, `fileRef`, `inTable` table controls and `Btn` usages exactly as they are — only their grouping and the separators change:

```jsx
  return (
    <div
      className={`cpm-blog-toolbar${toolbarOpen ? '' : ' is-collapsed'}${markdownMode ? ' is-markdown-mode' : ''}`}
      role="toolbar"
      aria-label="Formatting"
    >
      <span className="cpm-blog-tb-toggle-wrap">
        <Btn
          title={toolbarOpen ? 'Collapse toolbar' : 'Expand toolbar'}
          icon={toolbarOpen ? 'fa-chevron-up' : 'fa-chevron-down'}
          onClick={onToggleToolbarOpen}
          pinned
        />
      </span>

      {/* Text */}
      <span className="cpm-blog-tb-band">
        <ToolbarMenu label="Format" icon="fa-font" title="Text formatting" items={formatItems} closeOnSelect={false} />
        <select
          className="cpm-blog-tb-select"
          value={activeFont}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) editor.chain().focus().unsetFontFamily().run();
            else editor.chain().focus().setFontFamily(v).run();
          }}
          title="Font for the selected text"
        >
          <option value="">Post font</option>
          {POST_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select
          className="cpm-blog-tb-select"
          value={activeSize}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) editor.chain().focus().unsetFontSize().run();
            else editor.chain().focus().setFontSize(`${v}px`).run();
          }}
          title="Size of the selected text"
        >
          <option value="">Size</option>
          {POST_SIZES.map((s) => <option key={s} value={s}>{s}px</option>)}
        </select>
        <label className="cpm-blog-tb-color" title="Text colour">
          <i className="fas fa-a" aria-hidden="true" />
          <input
            type="color"
            value={editor.getAttributes('textStyle').color ?? '#ffffff'}
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          />
        </label>
        <label className="cpm-blog-tb-color" title="Highlight">
          <i className="fas fa-highlighter" aria-hidden="true" />
          <input
            type="color"
            value={editor.getAttributes('highlight').color ?? '#f5a623'}
            onChange={(e) => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()}
          />
        </label>
      </span>

      {/* Paragraph */}
      <span className="cpm-blog-tb-band">
        <select
          className="cpm-blog-tb-select"
          value={heading}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) editor.chain().focus().setParagraph().run();
            else editor.chain().focus().toggleHeading({ level: Number(v) }).run();
          }}
          title="Paragraph style"
        >
          <option value="">Paragraph</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
          <option value="4">Heading 4</option>
          <option value="5">Heading 5</option>
          <option value="6">Heading 6</option>
        </select>
        <ToolbarMenu label="Lists" icon="fa-list" title="Lists" items={listItems} />
      </span>

      {/* Insert + Section */}
      <span className="cpm-blog-tb-band">
        <button
          type="button"
          className="cpm-blog-add-section-btn cpm-blog-tb-btn--pinned"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onAddSection}
          title="Add a section"
        >
          <i className="fas fa-plus" aria-hidden="true" />
          <span>Add Section</span>
        </button>
        <ToolbarMenu label="Insert" icon="fa-square-plus" title="Insert content" items={insertItems} />
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={pickImage} />
      </span>

      {inTable && (
        <span className="cpm-blog-tb-band">
          <Btn title="Add column" icon="fa-table-columns" onClick={() => editor.chain().focus().addColumnAfter().run()} />
          <Btn title="Delete column" label="−col" onClick={() => editor.chain().focus().deleteColumn().run()} />
          <Btn title="Add row" label="+row" onClick={() => editor.chain().focus().addRowAfter().run()} />
          <Btn title="Delete row" label="−row" onClick={() => editor.chain().focus().deleteRow().run()} />
          <Btn title="Delete table" icon="fa-trash" onClick={() => editor.chain().focus().deleteTable().run()} />
        </span>
      )}

      {/* Design */}
      {onThemeChange && (
        <span className="cpm-blog-tb-band">
          <DesignMenu theme={theme} onChange={onThemeChange} />
        </span>
      )}

      {/* Tools */}
      <span className="cpm-blog-tb-band cpm-blog-tb-band--end">
        <Btn title="Find & replace" icon="fa-magnifying-glass" onClick={onToggleFind} />
        <Btn title="Undo (Ctrl+Z)" icon="fa-rotate-left" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} />
        <Btn title="Redo (Ctrl+Y)" icon="fa-rotate-right" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} />
        <Btn title={markdownMode ? 'Switch back to rich text' : 'Edit as Markdown'} icon="fa-file-code" active={markdownMode} onClick={onToggleMarkdown} pinned />
        <Btn title="Keyboard shortcuts" icon="fa-keyboard" onClick={onShowShortcuts} pinned />
      </span>
    </div>
  );
```

The four typography controls are written out in full above — delete the copies Task 14 placed after the Format menu so they exist only inside the Text band. `activeFont`, `activeSize`, `POST_FONTS` and `POST_SIZES` are unchanged from Task 14.

- [ ] **Step 3: Style the bands**

Append to the bottom of `public/search-theme.css`:

```css
/* Toolbar bands — related controls sit in one pill, so the bar reads as
   groups rather than a run of loose buttons. */
.cpm-blog-tb-band {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 5px; border-radius: 8px;
  background: rgba(255, 255, 255, .03); border: 1px solid transparent;
}
.cpm-blog-tb-band + .cpm-blog-tb-band { margin-left: 6px; }
.cpm-blog-tb-band--end { margin-left: auto; }
.cpm-blog-design-pop { padding: 10px; min-width: 230px; }
.cpm-blog-design-pop .cpm-blog-themebar { display: flex; flex-wrap: wrap; gap: 8px; }
.cpm-blog-design-hint {
  font-size: 11px; color: var(--pm-text-muted, #97a3b6); margin: 8px 0 0;
}
```

- [ ] **Step 4: Verify**

```bash
npm run build
CI=true npx react-scripts test --watchAll=false --testPathPattern="src/lib"
cd backend && npx tsc --noEmit && npx tsx src/services/blogRender.test.ts && npx tsx src/services/sectionPlan.test.ts && npx tsx src/services/blogSchemaContract.test.ts
```

Expected: build succeeds, all frontend `src/lib` tests PASS, no TypeScript errors, all three backend test scripts PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/clubpm/blog/BlogEditor.jsx public/search-theme.css
git commit -m "refactor(blog): regroup the formatting toolbar into bands"
```

---

## Task 20: Full-system verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole gate**

```bash
npm run build
CI=true npx react-scripts test --watchAll=false --testPathPattern="src/lib"
cd backend && npx tsc --noEmit
cd backend && npx tsx src/services/blogRender.test.ts
cd backend && npx tsx src/services/sectionPlan.test.ts
cd backend && npx tsx src/services/blogSchemaContract.test.ts
```

Expected: every command exits 0.

- [ ] **Step 2: Manual end-to-end check**

Create one post containing all of the following, then Preview it and publish it, confirming the editor, the preview iframe and the published page agree:

1. A full-bleed hero section.
2. A three-column section with uneven spans (e.g. 5 / 4 / 3), one column holding an image.
3. A carousel with at least three images and captions on two of them.
4. A standalone Image section.
5. A paragraph with a per-selection font, size, colour and highlight applied.
6. A table of contents node (verifies the preview now builds the real list rather than a placeholder).

Then narrow the browser below 900 px and confirm every multi-column section collapses to a single column.

- [ ] **Step 3: Verify the AI path still works**

From the Outreach → Blog tab, use **Generate from text** with a brief that would suit columns, and confirm the generated draft opens with valid sections and no console errors.

- [ ] **Step 4: Commit any fixes and push the branch**

```bash
git push -u origin feat/blog-editor-overhaul
```
