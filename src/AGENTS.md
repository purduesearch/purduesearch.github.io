# AGENTS.md — Frontend (`src/`)

Scope: the React app at the repo root (`src/`, `public/`). Applies together with the
root `AGENTS.md`. If you touch ClubPM navigation, routes, or tab bars, see the root
file's course-sync rules — `docs/courses/` teaches this UI and drifts silently.

---

## Coding Conventions

### Files & Components
- All component files use `.jsx` and **PascalCase** (`Navbar.jsx`, `PageWrapper.jsx`).
- No TypeScript — plain JS/JSX only.
- Hooks only — no class components.

---

### CSS
- **Three stylesheets, split by audience.** No CSS modules, no Tailwind.
  - `public/search-theme.css` — public site. Linked from `index.html`, so **every visitor downloads it**. Keep it lean.
  - `public/clubpm-theme.css` — ClubPM only. Fetched at runtime by `src/clubpm/loadClubPmTheme.js`, which `src/App.js` wraps around every `/clubpm/*` lazy route via `lazyWithClubPmTheme()`. Public pages never request it.
  - `public/ares-theme.css` — ARES only. Fetched at runtime by `src/theme/loadTheme.js` (the same generic `loadTheme(href, marker)` loader `loadClubPmTheme.js` now wraps), gated to every `/ares/*` lazy route. **Every selector must be nested under `.ares-page`** — no bare element selectors, no `:root` block, no unscoped utility classes. This is load-bearing, not stylistic: `ares-theme.css` and `clubpm-theme.css` are both appended to `<head>` at runtime in *visit order*, so `/ares → /clubpm/login` and `/clubpm/login → /ares` produce opposite cascade orders, and `clubpm-theme.css` is a broad verbatim tail slice of the pre-split stylesheet with no scoping of its own. `.ares-page` scoping is what makes that visit-order difference harmless; do not add an ARES rule that skips it.
- **Which file does a new rule go in?** If the styled element can appear outside `/clubpm/*` and outside `/ares/*`, it belongs in `search-theme.css`. If it only ever renders under `/ares/*` (the hub, the two deep-dives, or any `src/components/ares/*` component), it belongs in `ares-theme.css`, scoped under `.ares-page`. Note that `/schedule/:token` and `/rsvp/:eventId` are **public** routes that reuse the ClubPM look (`.clubpm-app`, `.cpm-form-*`, `.pm-poll-*`), and `/blog/:slug` renders stored HTML whose classes come from `backend/src/services/blogRender.ts` (`.cpm-blog-section`, `.cpm-blog-callout--*`, …) — all of that is public.
- **Cascade:** `clubpm-theme.css` is appended to `<head>` after `search-theme.css`, so it still wins over both it and `style.min.css`. It is a verbatim tail slice of the pre-split file, which is what keeps ClubPM's cascade byte-for-byte identical; public rules that live in that tail intentionally appear in both files. `ares-theme.css` loads/unloads the same way on `/ares/*` visits; its `.ares-page` scoping (rather than load order) is what keeps it from colliding with either of the other two.
- `src/index.css` — base reset and font styles only.
- `src/newscarousel.scss` — carousel-specific SCSS (one-off; do not add more SCSS files).
- **Theme tokens — check the file before assuming a name is global.** Only these `--color-*` tokens have a real `:root` declaration in `search-theme.css` and are safe to use anywhere on the public site: `--color-text`, `--color-muted`, `--color-border`, `--color-accent`, `--color-bg-sand` (plus the `--color-bg-*` family — `--color-bg-primary`, `--color-bg-secondary`, `--color-bg-dark`, `--color-bg-footer`, `--color-bg-card`; there is no bare `--color-bg`). **`--color-text-muted` is NOT declared in `search-theme.css`'s `:root`** — it is declared only inside the `.clubpm-app` block there (sourced from `--pm-text-muted`) and silently resolves to nothing for any public page that isn't ClubPM and doesn't declare it itself. This one line being wrong in an earlier revision cost the ARES build invisible SVG strokes; use `rg` against the actual `:root { … }` block before trusting a token name from memory. **Exception: `/ares/*` is safe.** `public/ares-theme.css` declares its own `--color-text-muted` on `.ares-page`. The token independently exists in `.clubpm-app` and `.ares-page` with the same value, which is deliberate.
- Component class names are kebab-case, namespaced by feature (e.g., `astro-diagram-wrap`, `astro-diagram-toolbar`, `astro-key-btn`, `ares-plume-canvas`).
- Append new component CSS to the bottom of whichever of the three files applies; never inline critical styles.
- `scripts/minify-public-css.mjs` carries a **hardcoded `TARGETS` array** (`search-theme.css`, `clubpm-theme.css`, `style.min.css`, `fa-subset.css`, `ares-theme.css`) — any new public stylesheet must be added to it by hand or it silently ships unminified. The script **warns and skips** a target that isn't in `build/` rather than failing the build, so a missing entry will not surface as a build error; check the `[minify-css]` log lines after `npm run build`.

---

### Animations
- AOS for scroll entrance: `data-aos="fade-up"`, `data-aos-delay="100"` on JSX elements.
- Framer Motion `<AnimatePresence>` in `App.js`; page components wrapped in `<PageWrapper>`.

---

### Routing
- React Router 7 file-per-page pattern. Routes defined in `src/App.js`.
- Program pages have sub-routes (e.g., `/astrousa/overview`, `/sa2tp/crew1`, `/research/rascal`).
- ClubPM routes (`/clubpm/*`) are protected by `ClubPmProtectedPage` wrapper; login at `/clubpm/login`.
- `<ScrollToTop>` component wraps the route tree to reset scroll on navigation.

---

### Icons
- Font Awesome classes only: `<i className="fas fa-wind" aria-hidden="true" />`.
- Never use emoji as icons in JSX.

---

## CSS Architecture

`public/search-theme.css` and `public/clubpm-theme.css` are large. Use `rg` first, then read only the relevant section.

`search-theme.css` section order:
1. CSS custom properties (`:root`) — SEARCH branding tokens
2. Global resets + typography
3. Navbar / Footer
4. Hero + home page sections
5. Program pages (AstroUSA, SA²TP, Research, Software)
6. Blog / News carousel — including the article-body styles the public `/blog/:slug` page needs
7. Public routes that borrow the ClubPM look (`/schedule`, `/rsvp`) plus the trailing global overrides (AOS shim, GSAP, `prefers-reduced-motion`, `:focus-visible` a11y)

`clubpm-theme.css` is the pre-split file from its first ClubPM rule to the end, so the ClubPM section order is unchanged from before the split — just relocated.

ClubPM CSS class prefixes:
- `clubpm-` — Full component names (`clubpm-app`, `clubpm-surface-*`, `clubpm-badge-*`, `clubpm-btn-primary`)
- `pm-` — Layout & panels (`pm-shell`, `pm-sidebar`, `pm-topbar`, `pm-shell-content`, `pm-stats-bar`, `pm-stat-tile`, `pm-work-panel`, `pm-agenda-panel`, `pm-member-card`, `pm-leaderboard-panel`)
- `cpm-` — Compact utilities (`cpm-card`, `cpm-kanban-grid/column/card`, `cpm-progress-bar`, `cpm-tag`, `cpm-spinner`, `cpm-stagger-1` through `-6`, `cpm-members-grid`, `cpm-project-grid`, `cpm-gradient-text`)

ClubPM design tokens (on `.clubpm-app`): `--pm-bg-base`, `--pm-surface`, `--pm-elevated`, `--pm-overlay`, `--pm-accent-teal` (#00e5cc), `--pm-accent-amber` (#f5a623), `--pm-accent-coral`, `--pm-accent-violet`, `--pm-font-display` (Syne), `--pm-font-body` (DM Sans), `--pm-font-mono` (JetBrains Mono).

For example, use `rg "\.pm-shell" public/clubpm-theme.css` or `rg "/\* ===" public/*.css` to find section headers. When hunting a ClubPM class, search `clubpm-theme.css` first, then `search-theme.css` — a few `pm-`/`cpm-` prefixed rules legitimately live in the public file (see the CSS conventions above).

---

## ClubPM Frontend Key Files

- `src/components/clubpm/AppShell.jsx` — Protected layout: `pm-sidebar` + `pm-shell-content`. Provides `useClubPmAuth()` (member, logout) and `useProjectNav()` (project-scoped tabs). Hosts global ClubPM navigation, command palette, engagement feedback, notifications, and admin badges.
- **Phone shell (compact layout).** `AppShell` mounts either the desktop sidebar + topbar or, when `useCompactLayout()` (`src/clubpm/layout/compactLayout.js`) is true, `MobileHeader` + `MobileBottomNav` + the Projects/More sheets (`MobileProjectPicker`, `MobileMoreMenu`) built on `MobileSheet` (focus trap, `inert` background, one overlay stack). Open sheets live in history as `location.state.pmOverlay` via `useShellOverlay()` — Back closes them; a destination chosen in a sheet replaces the entry. Every branch is a fixed-position slot so crossing the breakpoint never remounts the page. The notification feed + its single EventSource is `useNotificationFeed()`, owned by `AppShell` and shared by both bells. Tour steps can carry `compact` overrides (`compact.reveal` opens a sheet first). Contracts: `docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/contracts.md`.
- **A bare `nav { width: 100vw }` lives in `public/style.min.css`**, which `index.html` loads on every page — including ClubPM. Any `<nav>` you add inside the app is 100vw wide until its own rule says `width: auto`, which reads as "this element ignores its container" and is invisible in a page-overflow check (the element overflows its parent, not the document). Give every new `<nav>` an explicit width.
- **`body.pm-m-compact`** is set by `AppShell` for as long as the compact shell is mounted, and removed on unmount. Legacy dialogs portal to `<body>`, outside the shell root, so `.pm-shell--compact` cannot reach them; this marker is the only way compact CSS can size those portals. Prefer moving a dialog that carries a real workflow into `MobileSheet variant="fullscreen"` (focus trap, Escape, `inert`, focus return) and use the marker for the remaining small confirm/preview boxes. **`/clubpm/login` renders outside `AppShell`**, so neither the class nor the marker reaches it — its phone rules are a plain `@media (max-width: 640px)` block beside the other login styles. Under the marker, every `input`/`select`/`textarea` is forced to 16px (iOS zooms the page on focus below that) and `button[aria-label="Close"|"Close modal"|"Close dialog"]` is at least 44px — so give new dialog close buttons one of those labels. Same-tick double activation is only stopped by a ref guard (`useRef` in-flight flag), not by `disabled={busy}`; use one on any new phone submit path.
- `src/pages/ClubPM/ProjectDetail.jsx` — Main PM view. The live taxonomy is the four `NAV_TABS`: **Tasks, Files, Chat, Insights**. Files has Drive / GitHub / Vault (a desktop pill row, a labelled **Source** selector on phones, both remembering `cpm.files.sub.<projectId>` in `sessionStorage`); Chat holds Messages and Members; Insights holds Charts, Activity, Press Kit and AI. `?tab=members|reports|ai` are kept as redirects into those. Drag uses **`@dnd-kit/core`** (not `@hello-pangea/dnd`) with custom collision detection; member chips are draggable onto tasks/blockers. Optimistic updates use rollback; bulk moves go through `PATCH /api/tasks/bulk`.
- `src/pages/ClubPM/Dashboard.jsx` — Personal dashboard containing quests, AI insights, GitHub activity, filterable work, a seven-day agenda, and upcoming events.
- `src/pages/ClubPM/MembersView.jsx` — Member roster and Slack DM surface, including project-filtered member views.
- `src/api/clubPmClient.js` — Fetch wrappers (get/post/patch/del/put). Base URL: `process.env.REACT_APP_API_URL || ""`. Sends session cookie **and** `Authorization: Bearer` from localStorage (`clubpm_auth_token`) on every call. Dispatches engagement/reward custom events from response envelopes. Also exports vault/CR, blog editor, Slack portal, course, and AI action-plan helpers.
- `src/clubpm/ClubPmAuth.jsx` — Auth provider: consumes the `?lt=` login token, stores it, calls `/auth/me` with Bearer + cookie. `src/clubpm/` also holds ShortcutsRegistry, cosmetics registries + styles context, and engagement helpers.
- `src/components/clubpm/ActionPlanReview.jsx` — Renders an `ActionPlan` as editable per-action cards (per-type field config, accept/decline, rationale) for the AiPanel "Action Plan" section in `ProjectDetail.jsx`. See **AI Action Plan** above for the schema.

---

## Workflow Notes & Gotchas

### mxGraph (AstroFlowDiagram.jsx) — critical rules
- **Use the npm package only.** CDN builds (`dist/build.js`, `mxClient.js`) call `document.write()` at runtime which is blocked by async script loading.
- **After factory init, always call `Object.assign(window, mx)`** before any `mxCodec.decode()` call. The decoder looks up cell constructors via `window['mxGraphModel']` etc.; without this, the canvas silently stays blank.
- **Register draw.io named styles** on every new graph instance before decode:
  ```js
  const ss = graph.getStylesheet();
  ss.putCellStyle('ellipse',  { shape: 'ellipse',  perimeter: 'ellipsePerimeter' });
  ss.putCellStyle('rhombus',  { shape: 'rhombus',  perimeter: 'rhombusPerimeter' });
  ss.putCellStyle('swimlane', { shape: 'swimlane', startSize: 23 });
  ss.putCellStyle('text',     { fillColor: 'none', strokeColor: 'none' });
  ```
  mxGraph's default stylesheet only ships `defaultVertex` and `defaultEdge`; any other named prefix silently falls back to rectangle.
- **shape=step / process / parallelogram / umlActor are not built-in.** They must be defined by extending `mxShape` and registered via `mxCellRenderer.registerShape()` at module load time.
- **mxGraph container div must have `position: relative`** in CSS. HTML labels are `position: absolute` and anchor to the nearest positioned ancestor; without this they misalign from SVG geometry.
- **Fit sequence:** call `graph.refresh()`, then `await new Promise(r => setTimeout(r, 0))`, then `graph.fit()`. Calling `fit()` synchronously after decode fires before the browser has finished layout.

---

### SectionProgressRail — a fixed box that is wider than it looks
`.section-rail` (search-theme.css) is `position: fixed` with only `right` set. Its width is therefore
shrink-to-fit resolved against its *static* position at the left edge of the page, so Chrome lays the
`<nav>` out at the **full viewport width** even though every dot inside it hugs the right edge —
measured 1440x159 at a 1440px viewport. It is invisible and `z-index: 40`, so for a long time it
silently swallowed every click in a ~160px horizontal band across the vertical middle of every
program page. On `/ares` that meant all five range sliders were dead whenever they were scrolled to
centre (i.e. whenever you were about to drag one) and the pod markers were unclickable; it read as an
intermittent bug because whether a control worked depended purely on where it sat in the viewport.

Two rules keep it harmless, and both are load-bearing:
1. `.section-rail` is `pointer-events: none`; only `.section-rail-dot` opts back in.
2. `.section-rail-label` is `position: absolute`, out of flow. In flow it sized every dot button to
   its longest label (60-134px), because labels occupy layout even at `opacity: 0`.

If you restyle the rail, re-check with `document.elementFromPoint()` over page content, not by eye.

---

### Images
- `scripts/optimize-images.config.mjs` has a **`figure` tier** (`FIGURE_DIRS = ['ares/']`, q88) on top
  of photo/art/animated. Plotted figures and UI screenshots carry small hard-edged type that the
  default q75 photo profile visibly rings around. Drop a new plotted figure anywhere else under
  `public/` and it gets q75 — put it in `public/ares/` or extend `FIGURE_DIRS`.
- Always `npm run optimize:images -- --report` before the real run.
