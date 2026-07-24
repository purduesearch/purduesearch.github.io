# Blog / Press Kit Editor Overhaul — Layout, Carousel, Typography, Preview

**Date:** 2026-07-23
**Status:** Approved design, ready for implementation planning
**Scope:** The Section Builder editor shared by blog posts (`BlogEditorPage`) and press kits (`PressKitPanel`), the server-side renderer, the public `/blog` index and `/blog/:slug` article page, and the AI section-plan pipeline.

---

## 1. Problem

Seven defects and gaps, reported against the current editor:

1. Sections have no visible boundary and can only be reordered with ↑/↓ buttons — they are not draggable, and column layouts are limited to four fixed presets with no way to resize or mix content freely.
2. The image gallery is a static thumbnail grid with an `alt` field only — no carousel, no captions — and there is no way to place a standalone image without an attached text column.
3. Editor chrome is incoherent: ten header controls mixing icon-only, text-only and icon+text, a bare `datetime-local` input inline, and a destructive Delete styled identically to Archive.
4. Preview does not match the published page.
5. Selecting text and changing the font does nothing.
6. The card shown on the `/blog` index cannot be reviewed or edited as a unit.
7. All of the above must remain compatible with the AI generation features.

### Root causes found during investigation

These were traced in the code, not assumed, and several are worse than the reported symptom:

- **Two independent renderers.** Preview calls the browser's `editor.getHTML()`; publishing calls a hand-written server renderer (`backend/src/services/blogRender.ts`). They already disagree on the table of contents (placeholder vs. generated list), Google-Drive image proxying, empty image placeholders (rendered vs. dropped), and heading anchor ids.
- **Wrong preview shell.** Preview renders on the ClubPM dark canvas under a rule forcing near-white text (`public/search-theme.css`, `.cpm-blog-preview .pm-blog-post-body`), while the live article is a white page inside a 760 px container beneath a cover-image hero.
- **Full-bleed is impossible on the live site.** `src/pages/BlogPost.jsx` wraps the article in `.container` plus an inline `maxWidth: 760`, so `width: fullBleed` sections and the theme's `wide` (1040 px) setting can never take effect. An accurate preview will expose this, so it is in scope.
- **The font system is half-built**, in four separate ways:
  - `syne-dmsans` — the default pair every post starts on — has **no CSS rule at all**; only `oswald-lato` and `montserrat-worksans` are styled.
  - Syne and DM Sans are **never loaded**. `public/index.html` requests Oswald, Montserrat, Ubuntu, Lato and Work Sans.
  - The "pairs" are named display/body but set a **single** `font-family` on the wrapper, so headings never receive the display face.
  - **No `TextStyle` or `FontFamily` extension is installed**, so no per-selection font control exists for a selection to apply to.
- **Card fields exist but are welded together.** The card title is always the post title, the card image is always the article cover, and the description is the excerpt hard-sliced to 180 characters (`src/pages/Blog.jsx`) with no warning; a post with no cover silently renders the campus sky photo.

---

## 2. Decisions

| # | Decision | Chosen |
|---|----------|--------|
| 1 | Section layout model | Resizable 12-column grid with drag-to-reorder |
| 2 | Gallery | Carousel with per-image captions; plus a standalone Image section |
| 3 | Preview | Server-rendered HTML inside an iframe |
| 4 | Fonts | Fix the four bugs **and** add per-selection typography |
| 5 | Card | Panel with live preview over existing fields — **no new database fields** |
| 6 | Chrome | Grouped single-row header with a `Publish ▾` menu |

Explicitly rejected: a free-form absolute-positioned canvas (breaks collaborative editing, markdown round-trip, the AI planner, reading-order accessibility, and responsive layout); a browser-side shared renderer (requires build plumbing between two separate packages); card override columns (the user determined the underlying fields are already reachable); featured/pinned index control (not requested).

---

## 3. Architecture — the schema contract

Five artefacts must agree on the document schema. A node, attribute or mark missing from any one of them causes content to be silently dropped somewhere between editing and publishing.

| # | Artefact | Role |
|---|----------|------|
| 1 | `src/components/clubpm/blog/*.jsx` | TipTap node definitions, NodeViews, `renderHTML` |
| 2 | `backend/src/collab/blogSchema.ts` | Schema mirror for the Hocuspocus Yjs ↔ JSON transform |
| 3 | `backend/src/services/blogRender.ts` | Server HTML renderer — publish **and** preview |
| 4 | `backend/src/services/sectionPlan.ts` | AI plan → document builder and validator |
| 5 | `src/components/clubpm/blog/blogMarkdown.js` | Markdown round-trip |

**Guard test (required).** A test asserting that every node name registered by the editor's `blogExtensions()` also (a) exists in `blogCollabExtensions()` and (b) has a matching `case` branch in `renderNode`. This is the single highest-value piece of work in the project: it converts a recurring silent-data-loss class into a build failure. It belongs in the first implementation phase, before any new nodes are added.

Reducing preview to the server renderer (Decision 3) removes artefact-drift risk at the source, since `getHTML()` stops being a publishing-path renderer.

---

## 4. Feature designs

### 4.1 Section layout — 12-column grid

**Schema.** The `column` node gains one optional attribute:

```
span: { default: null }   // null = auto (equal share) | integer 1–12
```

Sections whose children are `column` nodes render as `grid-template-columns: repeat(12, 1fr)`, with each column at `grid-column: span N`. A column with `span: null` receives an equal share of the remaining tracks.

**No migration.** Existing documents carry `layout: 'cols2' | 'cols3' | 'mediaText'` with columns that have no `span`; those keep working via the equal-share fallback. `section.layout` is retained — it still drives padding, theme and width classes, and identifies `mediaText` for its default 6/6 split.

**Responsive.** Below 900 px every column becomes `grid-column: 1 / -1`. Spans are ratios, never pixels, so mobile behaviour is automatic.

**Editor affordances.**
- A dashed 1 px border on every section, scoped to `.cpm-blog-editor-surface` so it never appears in preview or on the published page.
- A grip handle in the section's left gutter, using TipTap `draggable: true` plus `data-drag-handle`, for dragging a whole section to reorder. The existing ↑/↓ buttons stay for keyboard/accessibility parity.
- Drag the gutter between two adjacent columns to resize: snaps to whole columns, preserves the pair's combined span, and writes both columns' attributes in a single transaction so collaborative editing sees one atomic change.
- Add/remove column buttons in the section toolbar. Removing a column merges its content into the previous column rather than deleting it.
- Block-level nodes (`image`, `gallery`, `callout`, `statBand`, `ctaButton`, `hero`) become `draggable: true` so they can be dragged between columns. Paragraphs and headings move by selection, as they do today.

**Risk.** Nested drag sources — the section handle and a block handle within it — need explicit separation so grabbing an image does not drag its whole section.

### 4.2 Gallery → carousel

The `gallery` node renders as a carousel. No display-mode attribute: the grid was not selected, and adding a mode later is a small, additive change.

**Schema.** Each entry in `images` becomes `{ src, alt, caption }`. `caption` is new; existing entries lacking it default to empty.

**One markup contract**, emitted identically by the editor NodeView, `renderHTML`, and `renderNode`:

```html
<div class="cpm-blog-carousel" data-carousel>
  <div class="cpm-blog-carousel-track">
    <figure class="cpm-blog-carousel-slide">
      <img src="…" alt="…"><figcaption>…</figcaption>
    </figure>
  </div>
  <button class="cpm-blog-carousel-prev" aria-label="Previous image">…</button>
  <button class="cpm-blog-carousel-next" aria-label="Next image">…</button>
  <div class="cpm-blog-carousel-dots">…</div>
</div>
```

**Behaviour.** CSS scroll-snap on the track (`scroll-snap-type: x mandatory`, slides `scroll-snap-align: center`) provides swipe and the base experience with no JavaScript. A shared enhancer at `src/lib/blogCarousel.js` — roughly 40 lines, no dependency — wires arrows, dots and arrow-key navigation. It is called from the NodeView in the editor and from a `useEffect` in `BlogPost.jsx` after the HTML is injected. Existing animation libraries (framer-motion, GSAP, anime.js) are deliberately not used: the published page receives a raw HTML string via `dangerouslySetInnerHTML` and the press-kit PDF is rendered by headless Chrome, so no React component can mount in either.

**Print/PDF.** `@media print` converts the track to a two-column grid so the press-kit PDF shows every image rather than only the first slide.

**Editor UI.** Add, remove and reorder images; `alt` and `caption` inputs per slide.

**Note.** Galleries in existing drafts become carousels the next time they render. Already-published posts are unaffected until republished, because `renderedHtml` is a stored snapshot.

### 4.3 Standalone image section

A new **Image** entry in `SECTION_PRESETS` (`src/components/clubpm/blog/sectionNodes.js`): a single `image` node with optional caption, alignment and width, inside a `single`-layout section. The `image` node and the AI planner's `image` plan type already exist; only the Section Library entry is missing.

### 4.4 Preview

**Endpoint.** `POST /api/blog/posts/:id/preview` accepts the current (possibly unsaved) `contentJson` in the request body and returns `{ html, meta }`, where `html` comes from `renderJsonToHtml(contentJson, origin)` — the same function the publish path calls — and `meta` carries title, cover image, byline, date, reading time, tags and theme. Authenticated like the rest of `blogRouter`; handlers read `req.memberId`, never `req.session`.

**Rendering.** An iframe whose `srcDoc` contains:
- an absolute `<link>` to `search-theme.css` (`${window.location.origin}/search-theme.css`) and the site's Google Fonts link — absolute so resolution does not depend on `about:srcdoc` base-URL behaviour;
- the exact DOM `BlogPost.jsx` produces: jumbotron hero with cover image, category, title and byline; `section.bg-white`; container; `.pm-blog-post-body` carrying `data-fontpair`, `data-width` and `--post-accent`; the tags row and closing rule;
- the carousel enhancer, inlined.

Iframe isolation is what fixes the shell problem: ClubPM's dark theme and its `!important` editor overrides cannot reach inside. The `.cpm-blog-preview .pm-blog-post-body { color: #e7ecf3 }` override is deleted.

**Viewport toggles.** Desktop / tablet / mobile width buttons on the preview bar.

**Full-bleed fix (in scope).** Remove the `.container` + `maxWidth: 760` constraint around the article body in `BlogPost.jsx`. Sections constrain themselves via `.cpm-blog-section-inner { max-width: var(--post-max) }`, and full-bleed sections via `max-width: 100%`. To keep legacy posts (bare paragraphs, no section wrappers) readable, add:

```css
.pm-blog-post-body > :not(.cpm-blog-section) { max-width: var(--post-max); margin-inline: auto; }
```

### 4.5 Font system

**Bug fixes.**
- Add Syne and DM Sans to the Google Fonts request in `public/index.html`.
- Add the missing `syne-dmsans` rule.
- Give every pair two custom properties, `--post-display` and `--post-body`; apply `--post-body` to `.pm-blog-post-body` prose and `--post-display` to its headings and hero text. Identical rules apply to `.cpm-blog-editor-surface` so editor and page agree.

**Per-selection typography.** Add the TipTap packages providing the `textStyle` mark with `fontFamily`, `fontSize` and `color`, plus a highlight mark — `@tiptap/extension-text-style` and `@tiptap/extension-highlight`, both new dependencies pinned to the TipTap 3.27 line already installed. The exact export surface of `@tiptap/extension-text-style` at 3.27 (which of `FontFamily` / `FontSize` / `Color` it re-exports versus requiring a separate package) must be confirmed against the installed version in the first implementation phase, before the toolbar is built. Toolbar controls: Font, Size, Text colour, Highlight — all applying to the current selection. Fonts are chosen from the site's list, never free text.

**Sanitisation (required).** `wrapMarks` in `blogRender.ts` must emit a **strict allowlist**, not pass values through: font family must match a known family name, font size must be a number clamped to 10–96 px, colour must match `#RGB`/`#RRGGBB`. This is user-authored content rendered onto the public site; an unvalidated `style` attribute is an injection vector.

**Propagation.** The new marks are added to `blogSchema.ts`, handled in `blogRender.ts`, and ignored by `blogMarkdown.js`. Markdown has no representation for inline styling, so switching to Markdown mode is lossy for these marks — the editor states this where the mode is toggled.

### 4.6 Card panel

A **Card** group pinned to the top of `BlogMetaPanel`, grouping the fields that already drive the card — cover image, title, excerpt, category, byline, link URL — beside a live preview rendered with the real `BlogCard` component and the real CSS. No schema change; editing the card title edits the post title.

Two behaviour fixes:
- Replace the hard `.slice(0, 180)` in `src/pages/Blog.jsx` with a CSS line-clamp, so descriptions are never chopped mid-word, and show a length counter in the panel at the point where clamping begins.
- When no cover image is set, show an explicit warning in the card panel stating that the index will fall back to the default campus photo, instead of substituting it silently.

### 4.7 Editor chrome

**Header.** One row: back, status chip and save state on the left; on the right, a segmented group for the three panel toggles (history, metadata, review), then Preview, then Save draft, then a primary `Publish ▾`. The menu holds Schedule…, Unpublish, Archive and Delete, with destructive items visually separated and confirmed. The `datetime-local` input moves inside the Schedule popover and out of the toolbar.

**Formatting toolbar.** Regrouped into **Text** (font, size, format, colour, highlight) | **Paragraph** (heading, lists, alignment) | **Insert** | **Section** | **Tools** (find, undo/redo, markdown, shortcuts). Theme controls (accent, font pair, width) move from the inline theme bar into a **Design** popover. Presence dots stay right-aligned.

**Consistency pass.** One button primitive per role — icon-only, icon+label, secondary, primary — replacing the current mix, and removal of ad-hoc inline styles such as `style={{ marginRight: 6 }}`.

### 4.8 AI compatibility

- `PlanSection.columns` entries become `{ markdown, span? }`, with `span` validated to 1–12 and normalised when a row's spans exceed 12.
- `PlanSection` gallery entries carry optional per-image `caption` and `alt`.
- `buildDocFromPlan` emits `span` on column nodes and caption fields on gallery images.
- The generation prompt in `aiOutreachService.generateBlogFromText` learns about column spans and carousel captions.
- `validateSectionPlan` clamps every new field, consistent with its existing behaviour of dropping unknown types and fields.
- The AI never emits inline typography marks. Documents are valid without them, so no planner change is needed for §4.5.

---

## 5. Testing

- Extend `backend/src/services/blogRender.test.ts`: column spans, carousel markup, standalone image, `textStyle` sanitisation (including rejection of a hostile font family, out-of-range size and non-hex colour).
- Add the schema-contract guard test described in §3.
- Add `validateSectionPlan` cases for spans that are out of range, non-numeric, or sum above 12.
- Per project convention, run `npm run build` (repo root) and `npx tsc --noEmit` (`backend/`) after each phase, fixing all errors before continuing.
- Manual verification: a post containing a full-bleed section, an asymmetric three-column row, a captioned carousel and per-selection font styling must render identically in the editor, in preview, and on the published page.

---

## 6. Risks

| Risk | Mitigation |
|------|------------|
| Schema drift across the five artefacts | Guard test in phase 1, before any new node is added |
| Unvalidated `style` attributes reaching the public site | Strict allowlist in `wrapMarks`; explicit negative tests |
| Removing the 760 px wrapper regresses legacy posts | Fallback rule constraining non-section children; manual check against an existing published post |
| Nested drag sources (section vs. block) conflict | Explicit `data-drag-handle` separation; verified with a section containing an image |
| Column resize transactions conflicting under collaborative editing | Both columns updated in one transaction |
| Existing galleries silently becoming carousels | Accepted and intended; published snapshots are unaffected until republished |

---

## 7. Out of scope

Free-form canvas layout; card override columns; featured/pinned control on the blog index; a grid display mode for the gallery; a carousel dependency; replacing the metadata/review slide-overs with a docked sidebar.
