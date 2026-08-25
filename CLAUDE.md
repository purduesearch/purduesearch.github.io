<!-- last synced: 2026-08-05 -->
# CLAUDE.md — SEARCH Club Website

## Project Overview

Static SPA for the Purdue SEARCH club, deployed to GitHub Pages and served at the custom domain **`purduesearch.org`** (`public/CNAME`; the old `purduesearch.github.io` URL 301-redirects to it). The backend is reached at **`api.purduesearch.org`**. The React app lives at the **repo root** (`src/`, `public/`, `package.json`). Pages are per-program (AstroUSA, SA²TP, etc.) with shared layout components and a global CSS file. A separate **ClubPM** subsystem (protected routes under `/clubpm`) provides project-management dashboards backed by a `backend/` Node.js/Express/Prisma/Slack service. A standalone Vite+TypeScript admin app lives in `frontend/` (separate build, not deployed to GitHub Pages).

**Stack:** React 19, React Router 7, Framer Motion (page transitions), Font Awesome (icons), mxGraph 4.2.2 (interactive diagrams), Three.js (3D model viewer), `@lottiefiles/react-lottie-player` (Lottie animations), `@dnd-kit/core` (ProjectDetail kanban + CrmTab pipeline board), `@hello-pangea/dnd` (OutreachHub BoardTab only — legacy, migrate on next touch), Fuse.js (fuzzy search), GSAP (scroll/flow animations), recharts (analytics charts), react-hot-toast (notifications), plain CSS custom properties.

---

## File Structure

```
(repo root)
├── public/
│   ├── index.html                  # HTML shell; Font Awesome CDN link here
│   ├── search-theme.css            # Public site CSS (linked from index.html on every page)
│   ├── clubpm-theme.css            # ClubPM-only CSS, fetched on demand by /clubpm/* routes
│   ├── ares-theme.css              # ARES-only CSS, fetched on demand by /ares/* routes — every selector scoped under .ares-page
│   ├── ares/                       # ARES photography + CFD figures (webp). Two are ARES's own
│   │                               # (headset-assembly, pod-interior), four are companion-app
│   │                               # screenshots, and three are published Dutta et al. figures that
│   │                               # MUST keep their visible credit string — see spec §1/§7.
│   └── <program>/                  # Static assets per program
│       └── interactive diagrams/   # mxGraph XML source files (.xml)
├── src/
│   ├── index.js                    # React DOM entry point
│   ├── index.css                   # Base reset / font styles
│   ├── App.js                      # Router config + AnimatePresence wrapper
│   ├── newscarousel.scss           # Carousel-specific styles (SCSS)
│   ├── api/
│   │   └── clubPmClient.js         # ClubPM REST API client
│   ├── clubpm/
│   │   ├── ClubPmAuth.jsx          # Auth provider + useClubPmAuth hook
│   │   └── ProjectNavContext.js    # Project navigation context
│   ├── hooks/
│   │   ├── useFlowAnimations.js
│   │   └── useSearch.js
│   ├── theme/
│   │   └── loadTheme.js            # Generic runtime <link> loader (href, marker) — ares-theme.css and clubpm-theme.css both go through it
│   ├── lib/
│   │   └── ares/                   # Pure physics/model helpers backing the ARES interactives (stepResponseModel, beerLambert, breathModel, exposureModel, plumeModel, noisyDifference — each with a test file)
│   ├── pages/                      # One file (or folder) per route
│   │   ├── Home.jsx
│   │   ├── About.jsx
│   │   ├── Blog.jsx
│   │   ├── Business.jsx
│   │   ├── Contact.jsx
│   │   ├── Outreach.jsx
│   │   ├── NotFound.jsx
│   │   ├── SearchResults.jsx
│   │   ├── AstroUSA.jsx + AstroUSA/   # Overview, Architecture, Hydroponics
│   │   ├── Research.jsx + Research/   # Rascal
│   │   ├── SA2TP.jsx + SA2TP/         # Crew1, RodInterview
│   │   ├── Software.jsx + Software/   # Suits
│   │   ├── Ares.jsx + Ares/           # TheScience, TheHeadset — public ARES subteam page; see docs/superpowers/specs/2026-08-22-ares-public-subteam-page-design.md §1 for the publication-clearance rule before editing any prose here
│   │   └── ClubPM/                    # Protected PM dashboards
│   │       ├── Dashboard.jsx
│   │       ├── ProjectDetail.jsx      # Main PM view (kanban/milestones/files/vault/ai)
│   │       ├── MembersView.jsx
│   │       ├── GanttView.jsx
│   │       ├── Login.jsx
│   │       ├── AdminView.jsx          # Pending rewards, reward config, admin tools
│   │       ├── CalendarPage.jsx
│   │       ├── ChallengesPage.jsx     # Quests + achievements
│   │       ├── MeetingNotesView.jsx
│   │       ├── OutreachHub.jsx        # 981 lines — outreach composer/CRM/campaigns
│   │       ├── Profile.jsx            # Member profile + avatar editor entry
│   │       ├── Shop.jsx               # Cosmetic shop (doubloons)
│   │       └── BlogEditorPage.jsx     # Collaborative blog editor (Hocuspocus WS)
│   └── components/
│       ├── SectionProgressRail.jsx # Fixed right-edge section dots — see gotchas before restyling
│       ├── AstroFlowDiagram.jsx    # mxGraph interactive diagram (complex — see gotchas)
│       ├── AstroSubsystem3D.jsx    # Three.js 3D model viewer
│       ├── Footer.jsx
│       ├── HeroSection.jsx
│       ├── Navbar.jsx              # Note: lowercase 'b'
│       ├── PageWrapper.jsx         # Framer Motion page transition wrapper
│       ├── ReadingProgress.jsx
│       ├── ScrollToTop.jsx
│       ├── SearchBar.jsx
│       ├── SEOHead.jsx
│       ├── STLViewer.jsx
│       ├── ares/                   # ARES interactives (PlumeSimulator, PodReadout, ExposureDial, DelayVsT90, RegimePlayground, NdirBeam, SystemDiagram, PodDisagreement, AresStat, AresTerm) + aresPhysics.js (single source of truth for every physical constant on /ares)
│       │                           #   Static figures: AresFigure (shared image slot + placeholder; all three pages),
│       │                           #   AresHeadProfile (head schematic; exports HEAD_PATH etc. so PlumeAnatomy draws the same person),
│       │                           #   PlumeAnatomy + CandleComparison (original explanatory SVGs, no external assets)
│       └── clubpm/                 # ClubPM UI components
│           ├── AppShell.jsx        # Protected layout shell
│           ├── GanttChart.jsx
│           ├── TaskModal.jsx       # 2,625 lines — task detail/comments/deps/time
│           ├── KanbanBoard.jsx     # DEAD CODE — nothing imports it; the live board is in ProjectDetail.jsx (@dnd-kit)
│           ├── MilestonePanel.jsx
│           ├── vault/              # Constellation Vault CAD/PDM UI (VaultTab + friends)
│           └── ...
├── backend/                        # Node.js / Express / Prisma / Slack Bolt
│   ├── src/
│   │   ├── api/                    # REST route handlers
│   │   ├── services/               # Business logic
│   │   ├── slack/                  # Slack Bolt event/action/command handlers
│   │   └── utils/
│   └── prisma/                     # DB schema + migrations
├── frontend/                       # Standalone Vite + TypeScript admin app (not GH Pages)
└── package.json
```

---

## Coding Conventions

### Files & Components
- All component files use `.jsx` and **PascalCase** (`NavBar.jsx`, `PageWrapper.jsx`).
- No TypeScript — plain JS/JSX only.
- Hooks only — no class components.

### CSS
- **Three stylesheets, split by audience.** No CSS modules, no Tailwind.
  - `public/search-theme.css` — public site. Linked from `index.html`, so **every visitor downloads it**. Keep it lean.
  - `public/clubpm-theme.css` — ClubPM only. Fetched at runtime by `src/clubpm/loadClubPmTheme.js`, which `src/App.js` wraps around every `/clubpm/*` lazy route via `lazyWithClubPmTheme()`. Public pages never request it.
  - `public/ares-theme.css` — ARES only. Fetched at runtime by `src/theme/loadTheme.js` (the same generic `loadTheme(href, marker)` loader `loadClubPmTheme.js` now wraps), gated to every `/ares/*` lazy route. **Every selector must be nested under `.ares-page`** — no bare element selectors, no `:root` block, no unscoped utility classes. This is load-bearing, not stylistic: `ares-theme.css` and `clubpm-theme.css` are both appended to `<head>` at runtime in *visit order*, so `/ares → /clubpm/login` and `/clubpm/login → /ares` produce opposite cascade orders, and `clubpm-theme.css` is a broad verbatim tail slice of the pre-split stylesheet with no scoping of its own. `.ares-page` scoping is what makes that visit-order difference harmless; do not add an ARES rule that skips it.
- **Which file does a new rule go in?** If the styled element can appear outside `/clubpm/*` and outside `/ares/*`, it belongs in `search-theme.css`. If it only ever renders under `/ares/*` (the hub, the two deep-dives, or any `src/components/ares/*` component), it belongs in `ares-theme.css`, scoped under `.ares-page`. Note that `/schedule/:token` and `/rsvp/:eventId` are **public** routes that reuse the ClubPM look (`.clubpm-app`, `.cpm-form-*`, `.pm-poll-*`), and `/blog/:slug` renders stored HTML whose classes come from `backend/src/services/blogRender.ts` (`.cpm-blog-section`, `.cpm-blog-callout--*`, …) — all of that is public.
- **Cascade:** `clubpm-theme.css` is appended to `<head>` after `search-theme.css`, so it still wins over both it and `style.min.css`. It is a verbatim tail slice of the pre-split file, which is what keeps ClubPM's cascade byte-for-byte identical; public rules that live in that tail intentionally appear in both files. `ares-theme.css` loads/unloads the same way on `/ares/*` visits; its `.ares-page` scoping (rather than load order) is what keeps it from colliding with either of the other two.
- `src/index.css` — base reset and font styles only.
- `src/newscarousel.scss` — carousel-specific SCSS (one-off; do not add more SCSS files).
- **Theme tokens — check the file before assuming a name is global.** Only these `--color-*` tokens have a real `:root` declaration in `search-theme.css` and are safe to use anywhere on the public site: `--color-text`, `--color-muted`, `--color-border`, `--color-accent`, `--color-bg-sand` (plus the `--color-bg-*` family — `--color-bg-primary`, `--color-bg-secondary`, `--color-bg-dark`, `--color-bg-footer`, `--color-bg-card`; there is no bare `--color-bg`). **`--color-text-muted` is NOT declared in `search-theme.css`'s `:root`** — it is declared only inside the `.clubpm-app` block there (`public/search-theme.css` ~line 4296, sourced from `--pm-text-muted`) and silently resolves to nothing (transparent/inherit, not an error) for any public page that isn't ClubPM and doesn't declare it itself. This one line being wrong in an earlier revision of this file cost the ARES build two invisible SVG strokes across six independent agent passes before it was caught — grep the actual `:root { … }` block of the stylesheet in play before trusting a token name from memory, here or anywhere else. **Exception: `/ares/*` is now safe.** `public/ares-theme.css` declares its own `--color-text-muted` on `.ares-page` (~line 42) specifically so ARES's own uses resolve — added after the incident above. The token is still not global; it now independently exists in two places (`.clubpm-app` and `.ares-page`) with the same value, which is deliberate, not drift to "fix" by deleting either.
- Component class names are kebab-case, namespaced by feature (e.g., `astro-diagram-wrap`, `astro-diagram-toolbar`, `astro-key-btn`, `ares-plume-canvas`).
- Append new component CSS to the bottom of whichever of the three files applies; never inline critical styles.
- `scripts/minify-public-css.mjs` carries a **hardcoded `TARGETS` array** (`search-theme.css`, `clubpm-theme.css`, `style.min.css`, `fa-subset.css`, `ares-theme.css`) — any new public stylesheet must be added to it by hand or it silently ships unminified. The script **warns and skips** a target that isn't in `build/` rather than failing the build, so a missing entry will not surface as a build error; check the `[minify-css]` log lines after `npm run build`.

### Animations
- AOS for scroll entrance: `data-aos="fade-up"`, `data-aos-delay="100"` on JSX elements.
- Framer Motion `<AnimatePresence>` in `App.jsx`; page components wrapped in `<PageWrapper>`.

### Routing
- React Router 7 file-per-page pattern. Routes defined in `src/App.js`.
- Program pages have sub-routes (e.g., `/astrousa/overview`, `/sa2tp/crew1`, `/research/rascal`).
- ClubPM routes (`/clubpm/*`) are protected by `ClubPmProtectedPage` wrapper; login at `/clubpm/login`.
- `<ScrollToTop>` component wraps the route tree to reset scroll on navigation.

### Icons
- Font Awesome classes only: `<i className="fas fa-wind" aria-hidden="true" />`.
- Never use emoji as icons in JSX.

---

## Commands

All frontend commands run from the **repo root**.

```bash
npm start          # Dev server → http://localhost:3000
npm run build      # Production build → build/
npm test           # Jest test runner (minimal test coverage currently)
```

Backend (separate):

```bash
cd backend
npm run dev        # ts-node-dev watch mode
npm run build      # tsc compile
```

Deploy is manual push to the `main` branch; GitHub Pages serves from root at `purduesearch.org`. The bundle's backend URL comes from the `REACT_APP_API_URL` repo secret and is **baked in at build time** — changing the secret does nothing until the Pages workflow re-runs.

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

### Domain / hostnames
- **Never hardcode `https://purduesearch.org` in JS.** Import `SITE_URL` from `src/seo/siteUrl.js`. The non-JS assets that can't import it (`public/sitemap.xml`, `robots.txt`, `llms.txt`, `index.html`, `legal/*.html`, `constellation/index.html`) carry the literal and must be updated alongside it.
- **The Google OAuth "application home page" is `/clubpm/login`**, not `/constellation/` — the standalone page was merged into the React login route, and `public/constellation/index.html` is now only a redirect stub. That route renders the scope-justification table and Limited Use language a Google reviewer reads, so don't trim the `.pm-login-doc` sections in `src/pages/ClubPM/Login.jsx` for visual tidiness. Caveat: as an SPA route it is served via the `404.html` fallback, so it returns **HTTP 404** with a JS-only body to non-browser fetchers.
- **Set the custom domain in Settings → Pages *and* keep `public/CNAME`.** Neither alone works: the Settings field is what triggers GitHub's certificate issuance, while the file is what reaches the served site (deploys go through `actions/upload-pages-artifact`, which publishes `build/`, so the CNAME the Settings UI writes to the default branch is never read). The field does **not** self-populate from the artifact — set it by hand or the domain serves a `*.github.io` cert and every browser shows a privacy error.
- **`FRONTEND_URL` must stay single-valued** — ~10 backend modules read it to build outbound links (Slack deep links, OAuth redirects), so a comma-separated value breaks all of them. Extra CORS-only origins go in `CORS_EXTRA_ORIGINS` (`backend/src/app.ts`).
- Session cookies are `sameSite: "none"` and **must stay that way** while `CORS_EXTRA_ORIGINS` still carries `https://purduesearch.github.io`. Once that is cleared (see pending cleanup below), `purduesearch.org` ↔ `api.purduesearch.org` are same-site and the cookie can drop to `"lax"` — restoring real cookie auth in Brave/Safari and demoting the `auth.ts` Bearer-token fallback. Worth its own PR with auth testing.
- `pollService.ts`'s iCal `UID:...@purduesearch.github.io` is **deliberately not migrated**. Changing an iCalendar UID duplicates events on already-subscribed calendars.
- **Cutover completed 2026-08-05, with cleanup deliberately deferred ~2 weeks.** Still live and still to be removed: `CORS_EXTRA_ORIGINS`, the DuckDNS nginx vhost + cert (`search-constellation.duckdns.org`), and the old OAuth redirect URLs in the Slack/GitHub apps. They are the rollback path — don't remove them opportunistically. Checklist in `docs/DOMAIN-CUTOVER-RUNBOOK.md` Phase 8.
- `provision-domain.yml` (Actions tab) adds an nginx vhost + certbot cert for a hostname alongside the existing ones. Run `diagnose` first; `apply` refuses to call certbot until DNS resolves to the box, because Let's Encrypt allows only 5 validation failures per hostname per hour. Design rationale: `docs/superpowers/specs/2026-08-05-purduesearch-org-migration-design.md`.

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

### Images
- `scripts/optimize-images.config.mjs` has a **`figure` tier** (`FIGURE_DIRS = ['ares/']`, q88) on top
  of photo/art/animated. Plotted figures and UI screenshots carry small hard-edged type that the
  default q75 photo profile visibly rings around. Drop a new plotted figure anywhere else under
  `public/` and it gets q75 — put it in `public/ares/` or extend `FIGURE_DIRS`.
- Always `npm run optimize:images -- --report` before the real run.

### General
- `public/` assets are served at `/` in dev and in the GitHub Pages build. Paths in JSX must start with `/` (e.g., `/astrousa/fig1.jpg`).
- No `.env` is needed for frontend dev or build. `REACT_APP_API_URL` is optional locally (CRA's `proxy` field forwards to `localhost:3001`) and is supplied as a repo secret in CI.
- `mxgraph` is an npm dependency in `package.json`; do not remove it or switch to a CDN reference.

---

## ClubPM Backend Architecture

**Entry:** `backend/src/app.ts` — Express setup, session (PostgreSQL-backed), Helmet, 30 route mounts.

### API Routes (`backend/src/api/`)
- `tasks.ts` — Core task CRUD + comments, subtasks, dependencies, time logs, AI enrichment. See **Task API Quick Reference** below.
- `members.ts` — Member profile, XP history, rank. Rank is a Prisma enum on `Member`. Also serves `GET /api/members/cosmetic-styles` — memberId → equipped css slugs; MUST stay registered above `GET /:id`.
- `auth.ts` / `githubAuth.ts` — Dual auth: session cookie (express-session + Slack OAuth) **plus** an HMAC-signed Bearer token (7-day TTL, `tokenVersion` revocation) delivered via `?lt=` redirect and stored in localStorage — the fallback for browsers that block cross-origin cookies (Brave etc.). `requireAuth` accepts either and sets `req.memberId`. **CONVENTION: always read `req.memberId` in handlers, never `req.session.memberId`** — session reads are `undefined` for Bearer users and silently break them (this bug class existed in 12 API files; see `~/.claude/plans/clubpm-review-fixes-dappled-heron.md`). Only `auth.ts` itself may touch `req.session`. **The rule covers anything stored in the session, not just `memberId`.** `slack.ts` was a 13th instance found in Aug 2026: it read the Slack *user* OAuth token from `req.session.slackAccessToken`, so the project "linked Slack channel" picker was empty for every Bearer client. It also broke for cookie users once `/auth/me` started re-issuing Bearer tokens (commit `78a33166`) — sessions are `resave:false` with no `rolling`, so the 7-day row expires while the Bearer token self-renews forever and nobody is ever bounced back through OAuth to refresh it. The Slack user token now lives on `Member.slackUserToken` (AES-GCM, same as `githubAccessToken`) and is resolved by `services/slackUserTokenService.ts`; `src/services/slackUserTokenService.test.ts` asserts `api/slack.ts` contains no `req.session` at all.
- `projects.ts` — Project CRUD; also mounts `tagsRouter`.
- `milestones.ts` — Milestone CRUD + health refresh. See **Milestones API** below.
- `blockers.ts` — Project "category" blocker CRUD + task attach/detach. See **Blockers API** below.
- `rewards.ts` — Pending reward queue, admin approve/reject.
- `challenges.ts` — Active challenges, claim endpoint.
- `outreach.ts` — OutreachSubmission CRUD; sub-routers: assets, brand-voices, campaigns, contacts, insights.
- `shop.ts` / `inventory.ts` — Cosmetic shop, inventory.
- `leaderboard.ts` — XP + doubloon rankings.
- `notifications.ts` + `sse.ts` — Notification CRUD + SSE push stream.
- `public.ts` — Unauthenticated endpoints (the public site reads these).
- `github.ts` / `githubWebhook.ts` — GitHub integration + webhook (raw body handler).
- `reporting.ts`, `activity.ts`, `events.ts`, `eventConfig.ts`, `streak.ts` — Ancillary data.
- `vault.ts` (1,096 lines) + `changeRequests.ts` — Constellation Vault CAD/PDM: items, versions, checkouts, BOM, CRs. Mounted at bare `/api` (like `blockers.ts` and `streak.ts`).
- `blog.ts` — Blog editor CRUD, revisions, taxonomy, publish/schedule; collaborative editing WS (Hocuspocus) attaches at `/collab/blog` on the same HTTP server (`backend/src/collab/blogCollab.ts`).

**Gotcha:** `app.ts` uses `express.json()` with the default **100 kb** body limit — endpoints receiving base64 images in JSON (`/api/tasks/create-from-image`) 413 on real photos until the limit is raised (plan phase 3). Only the GitHub webhook mounts its own 10 mb raw parser.

### Services (`backend/src/services/`)
- `rewardService.ts` — XP/doubloon ledger. Key: `grantXP()`, `grantDoubloons()`, `handleTaskComplete()`, `handleTimeLog()`, `handleMilestoneComplete()`. Task rewards are **admin-gated** via `queuePendingReward()`.
- `taskService.ts` — Prisma query wrapper for tasks.
- `challengeService.ts` — `recordEvent(memberId, metric, delta?)` → fires on user actions; `getActiveChallenges()`, `claimChallenge()`.
- `milestoneService.ts` — `refreshMilestoneHealth()`.
- `geminiService.ts` — Gemini API. Standard model (30 RPM sliding window): `generateJson()`, `generateText()`, `generateJsonFromImage()`, `generateJsonFromDocument()`. Complex model (`GEMINI_COMPLEX_MODEL`, 25 requests/day; auto-falls back to the standard model when the daily quota is exhausted rather than blocking — `geminiService.ts:42-53`): `generateJsonComplex(prompt, cacheKey?, opts?)` / `generateTextComplex(prompt, cacheKey?)`. `generateJsonComplex`'s `opts.maxOutputTokens` (default 8192) caps/raises the response size so large structured outputs (e.g. AI action plans) don't truncate. `todayContext()` — a string injected into prompts so the model uses the real current date instead of training-data heuristics.
- `activityService.ts` — **Two-table split**, do not conflate them: `logActivity()` writes to `Activity` (lightweight realtime feed, powers the SSE stream via `activityBus`; read with `getProjectActivities()` / `getEntityActivities()`). `logAuditEvent()` writes to `ActivityLog` (rich audit trail: `eventType` enum + `payload` JSON + optional task/member; read with `getProjectAuditLog()` (project-scoped, paginated) or `getTaskAuditLog(taskId, take = 50)` (task-scoped — backs `GET /api/tasks/:id/history`)). `diffObjects(before, after, watchFields)` returns `{ field, from, to }[]` for building audit payloads.
- `projectContextService.ts` — `buildProjectContext(projectId, opts?)` → `ProjectContext | null`, the single shared snapshot every AI feature (`/ask`, `suggestProjectActions`) builds prompts from. Includes tasks (title, status, priority, assignees, dueDate, **description**, `blockedByOpenDependencies`, `activeCategoryBlockers`, subtask counts), milestones, members with open-task counts, `recentActivity` (from `getProjectAuditLog`), and `activeBlockers`. `opts.taskLimit` (default 300) and `opts.activityLimit` (default 30) bound what's packed in; `ProjectContext.truncated` is `true` if `taskLimit` cut off real tasks.
- `aiActionService.ts` — Agentic action-plan engine; see **AI Action Plan** below.
- `dmBatcher.ts` — Slack DM queue: `queueDm()`.
- `streakService.ts` — `recordActivity()`, daily reset sweep.
- `notificationCrud.ts` — `createNotification()`.
- `rubricGrading.ts` — the shared AI grading path for `LIT_REVIEW` **and** `ASSIGNMENT` sections: `buildGradingPrompt()`, `parseGradingResponse()`, `normalizeRubric()`, `countWords()`, `gradeAgainstRubric()`. `litReviewService.ts` re-exports these under its old `Lit*` names so existing importers keep compiling. **Uses `generateJson`, never `generateJsonComplex`** — the complex lane is 25 requests *per day* and shared with every other AI feature, so one cohort working through a module would starve it. `parseGradingResponse` iterates the *author's* rubric rather than the model's array: an id the model invented is dropped and a point it skipped is scored `missed`, never free credit.
- `assignmentService.ts` — `ASSIGNMENT` pure logic: `sanitizeAssignmentConfig()`, `gradeAssignment()`, `decideCompletion()`, `DEFAULT_ASSIGNMENT_MIN_WORDS`. `sanitizeAssignmentConfig` builds the learner payload **by construction from the five safe keys, never by spreading the column and deleting secrets** — `referenceAnswer` and `rubric` are author-only, and a future author-side key would otherwise ship to every learner by default. `decideCompletion` is the whole of the score gate: `isSectionUnlocked` is untouched, so gating is purely a question of when `COMPLETED` is written, and a gated section whose grading produced no score returns `COMPLETE_UNGRADED` — **fail-open is load-bearing**, a Gemini outage must not strand a cohort.
- `documentTextService.ts` — `extractText(buffer, mimeType, fileName)` turns an uploaded PDF / `.docx` / text file into plain text for grading. Every failure is a typed result, never a throw. **`pdf-parse` must be imported from the deep path `pdf-parse/lib/pdf-parse.js`** — importing the package root runs a bundled debug harness that reads a test PDF off disk and throws in production. Trusts the file extension when the MIME type is generic, because browsers send `application/octet-stream` for `.md`. A file that parses to nothing is `EMPTY`, never ok-with-an-empty-string: that is the scanned-PDF path, and returning ok would grade a scan as a zero and strand a gated learner.

### Slack (`backend/src/slack/`)
- `scheduler.ts` — All cron jobs (node-cron), **~30 of them**: shop rotation + daily quests (00:00 UTC), streak reset (02:00), vault temp sweep + notification cleanup + auto-archive nudges (03:00-03:30), due-date reminders (08:00), escalations (08:30), milestone health (08:45), Monday digest (09:00), standup prompts (09:15 Tue-Fri), CRM follow-ups (09:05), stale-task warnings (10:00 weekdays), several AI reports (risk Fri 15:45, capacity Wed 10:30, dependency inference Sun 20:00), hourly outreach auto-publish, blog scheduled-publish every 5 min, admin re-sync every 6 h. **Add new crons here only.**

### Database (`backend/prisma/schema.prisma`)
Key models: `Member`, `Task`, `Project`, `MilestoneTask`, `XpEvent`, `DoubloonEvent`, `Challenge`, `MemberChallenge`, `MemberAchievement`, `InventoryItem`, `Cosmetic`, `MemberCosmetic`, `Streak`, `ActivityLog`, `GitHubLink`, `OutreachSubmission`, `TaskComment`, `TaskDependency`, `TaskBlocker`, `TimeLog`.

Key enums:
- `Rank` — NESTLING → FLEDGLING → CADET → SPECIALIST → PIONEER → COSMONAUT → CELESTIAL (thresholds 0–21,000 XP)
- `TaskStatus` — TODO, IN_PROGRESS, BLOCKED, DONE
- `Priority` — LOW, MEDIUM, HIGH, CRITICAL
- `RewardEventType` — TIME_LOG_HOUR, TASK_COMPLETE_MEMBER_CREATED, TASK_COMPLETE_ADMIN_CREATED, MILESTONE_HIT, KUDOS_RECEIVED, BLOG_POST_PUBLISHED, EARLY_DELIVERY_BONUS
- `ChallengeMetric` — TASK_COMPLETED, COMMENT_WRITTEN, TIME_LOG_HOURS, UNIQUE_ASSIGNEES, FILE_ATTACHED, etc.
- `ChallengeType` — DAILY, WEEKLY, MONTHLY, ACHIEVEMENT
- `CourseSectionKind` — CONTENT, VIDEO, QUIZ, SLIDES, WALKTHROUGH, LIT_REVIEW, **ASSIGNMENT**. One `Json?` config column per kind on `CourseSection` (`videoConfig` / `slideConfig` / `tourConfig` / `litConfig` / `assignmentConfig`); **every writer spreads the previous value and writes the column whole**, never key-by-key. `LIT_REVIEW` and `ASSIGNMENT` both write learner attempts to `CourseWorkSubmission` — one model, `@@map`'d to the original `CourseLitSubmission` table so the rename emitted no DDL. One row **per attempt**, never updated in place; the revision history is the point. Opt-in score gating on either kind reuses the existing `CourseSection.passThreshold` column.
- `ActivityEventType` — `ActivityLog` event types (see `logAuditEvent`/`getProjectAuditLog`/`getTaskAuditLog`). Task/project/GitHub lifecycle values (`TASK_CREATED`, `TASK_UPDATED`, `TASK_COMPLETED`, `TASK_DELETED`, `TASK_ASSIGNED`, `GITHUB_PR_MERGED`, etc.) plus the audit-sync additions: `TASK_DEPENDENCY_ADDED`/`TASK_DEPENDENCY_REMOVED`, `TASK_BLOCKER_ATTACHED`/`TASK_BLOCKER_DETACHED`, `BLOCKER_RESOLVED`, `COMMENT_ADDED`/`COMMENT_EDITED`/`COMMENT_DELETED`, `TIME_LOGGED`, `MILESTONE_CREATED`/`MILESTONE_UPDATED`/`MILESTONE_DELETED`/`MILESTONE_TASKS_LINKED`, and `AI_PLAN_EXECUTED` (one summary event per AI action-plan execution, in addition to the specific event type logged per executed action).

Member XP lives in **two places kept in sync by `grantXP()`**: a `Member.xp` running-total column (read for display/rank) and `XpEvent` ledger rows (audit/history). Never increment one without the other — go through `rewardService.grantXP()`.
Task `rewardGrantedAt` is an idempotency gate; do not clear it or DONE→IN_PROGRESS→DONE re-grants XP.

### Task API Quick Reference (`backend/src/api/tasks.ts`)

```
GET    /api/tasks/search                        full-text search (max 20)
POST   /api/tasks/check-duplicates              AI duplicate detection
POST   /api/tasks/create-from-nl               NL → structured task
POST   /api/tasks/create-from-image            screenshot → task extraction
GET    /api/tasks/:id                           single task + assignees + milestone
PATCH  /api/tasks/:id                           update (status, priority, assignees, attachments…)
DELETE /api/tasks/:id                           hard delete (prisma.task.delete); creator/admin only — no deletedAt field, row is removed
GET    /api/tasks/:id/comments                  threaded comments (top-level + 200 replies)
POST   /api/tasks/:id/comments                  create comment; parses @handle mentions → in-app notification + Slack DM to matched members; fires challenge hooks
PATCH  /api/tasks/:id/comments/:cid             edit (author only)
DELETE /api/tasks/:id/comments/:cid             delete (author or admin)
POST   /api/tasks/:id/comments/:cid/reactions   toggle emoji reaction (reactions JSON: { emoji: memberId[] }); fires challenge hook on toggle-on of someone else's comment
GET    /api/tasks/:id/subtasks                  list subtasks
POST   /api/tasks/:id/subtasks                  create subtask
POST   /api/tasks/:id/dependencies              add dependency (validates no circular refs)
DELETE /api/tasks/:id/dependencies/:depId       remove dependency
POST   /api/tasks/:id/time-logs                 log time (daily 8-hr cap; >2 hr queued for admin)
GET    /api/tasks/:id/time-logs                 list logs + total minutes
POST   /api/tasks/:id/ai-enrich                Gemini: description + acceptance criteria + DoD
POST   /api/tasks/:id/suggest-deadline         AI deadline suggestion
GET    /api/tasks/:id/history                   50 most recent `ActivityLog` rows for this task (`getTaskAuditLog`), mapped to { id, actor, action, at, metadata } — `action` is the humanized `eventType`, `metadata` is the raw payload (may include a `diffObjects` array rendered in TaskModal as `field: from → to`)
```

PATCH `/:id` status→DONE triggers: blocker validation, CI gate (if `githubBlockDoneOnCiFail`), `rewardService.handleTaskComplete()`, `challengeService.recordEvent()`, streak tick.
Always include `include: { assignees: { include: { member: true } } }` to get avatarUrl + rank.

### Blockers API (`backend/src/api/blockers.ts`)

Reusable, project-scoped "category" blockers (e.g. "Order delays"). Attaching one to a task forces it `BLOCKED`; the task clears back to `TODO` only once it has no open category blockers *and* no open (non-DONE) dependencies.

```
GET    /api/projects/:projectId/blockers        active (unresolved) blockers for a project
POST   /api/projects/:projectId/blockers        create a blocker { label, color?, assigneeId? }
PATCH  /api/blockers/:id                        rename/recolor/reassign a blocker
POST   /api/blockers/:id/resolve                resolve + detach from all tasks; recomputes affected tasks' BLOCKED status
POST   /api/tasks/:id/blockers                  attach an existing blocker to a task { blockerId, reason? }; sets task BLOCKED
DELETE /api/tasks/:id/blockers/:blockerId       detach; recomputes BLOCKED status for that task
```

Reassigning a blocker's `assigneeId` (create or update) sends an in-app notification + Slack DM to the new assignee.

### Milestones API (`backend/src/api/milestones.ts`)

```
GET    /api/milestones/project/:projectId       milestones for a project, with progress/taskCounts
GET    /api/milestones/:id                      single milestone with progress
POST   /api/milestones                          create { title, projectId, dueDate?, description?, ownerId? }
PATCH  /api/milestones/:id                       update fields; `milestoneTaskIds` replaces the full task link set; refreshes health after update
DELETE /api/milestones/:id                       unlinks tasks, then deletes the milestone
```

### AI Action Plan (`backend/src/api/projects.ts` + `backend/src/services/aiActionService.ts` + `projectContextService.ts`)

```
POST   /api/projects/:id/ask                    Q&A over buildProjectContext() via generateTextComplex — reflects task descriptions + recent ActivityLog, not just titles
POST   /api/projects/:id/ai-suggest-actions     { goal } → ActionPlan (proposed actions, not executed): suggestProjectActions() builds context, prompts generateJsonComplex, validates/clamps into known ids
POST   /api/projects/:id/ai-execute-plan        { actions: ActionPlan } → { results: [{ index, type, ok, error? }] }: executeActionPlan() re-validates and dispatches each action
```

`ActionPlan` = `{ type, targetTaskId?, params, rationale }[]`. `type` is one of `CREATE_TASK`, `UPDATE_TASK`, `DELETE_TASK`, `SET_STATUS`, `SET_PRIORITY`, `SET_DUE`, `ASSIGN`, `CREATE_SUBTASK`, `ADD_DEPENDENCY`, `ATTACH_BLOCKER`, `RESOLVE_BLOCKER`, `ADD_COMMENT`, `CREATE_MILESTONE`, `LINK_MILESTONE`. Most types require `targetTaskId` (must be a real task id in the project); `CREATE_TASK`, `CREATE_MILESTONE`, `RESOLVE_BLOCKER` are project-scoped (no target); `LINK_MILESTONE` takes an optional `targetTaskId` plus `params.taskIds[]`. `params` per type (see `aiActionService.ts` `dispatchAction()` for the authoritative list): `CREATE_TASK`/`UPDATE_TASK` → `{ title?, description?, priority?, dueDate?, assigneeIds?, milestoneId? }`; `SET_STATUS` → `{ status }`; `SET_PRIORITY` → `{ priority }`; `SET_DUE` → `{ dueDate }`; `ASSIGN` → `{ assigneeIds }`; `CREATE_SUBTASK` → `{ title, assigneeIds? }`; `ADD_DEPENDENCY` → `{ blockingTaskId, reason? }`; `ATTACH_BLOCKER`/`RESOLVE_BLOCKER` → `{ blockerId, reason? }`; `ADD_COMMENT` → `{ content }`; `CREATE_MILESTONE` → `{ title, dueDate?, description?, ownerId? }`; `LINK_MILESTONE` → `{ milestoneId, taskIds? }`.

Execution is open to **any logged-in member** — `executeActionPlan` re-checks `taskAccess.ts` `getTaskPermissions` (edit/delete) for every action server-side regardless of what the client marked accepted, wraps each action in try/catch so one failure doesn't abort the batch, and logs the specific `eventType` per successful action plus one summary `AI_PLAN_EXECUTED` event with `{ totalActions, succeeded, failed }`. Frontend: `ProjectDetail.jsx`'s AiPanel "Action Plan" section (goal input → editable per-action cards, reusing the `SuggestedTaskCard` accept/dismiss idiom, via `src/components/clubpm/ActionPlanReview.jsx`) → `clubPmClient.js`'s `suggestActions(projectId, goal)` / `executePlan(projectId, actions)`.

---

## ClubPM Frontend Key Files

- `src/components/clubpm/AppShell.jsx` (551 lines) — Protected layout: `pm-sidebar` + `pm-shell-content`. Provides `useClubPmAuth()` (member, logout) and `useProjectNav()` (project-scoped tabs). Hosts: AICommandPalette, CreateProjectModal, RankUpModal, RewardFlux, QuestCompleteToast, admin pending-reward/CR badges.
- `src/pages/ClubPM/ProjectDetail.jsx` (3,613 lines) — Main PM view. Tabs: tasks (kanban with StatusBin drag-drop + blocker sub-bins), milestones, files (Drive + GitHub), vault, reports, ai. Drag uses **`@dnd-kit/core`** (NOT @hello-pangea/dnd) with custom collision detection; member chips are draggable onto tasks/blockers. Optimistic updates with rollback; bulk moves go through `PATCH /api/tasks/bulk`.
- `src/pages/ClubPM/Dashboard.jsx` (1,532 lines) — Personal dashboard: StatsBar (5 stats), DailyQuestsWidget, AIInsightCards, GithubActivityWidget, UpcomingEventsWidget, WorkPanel (filterable task list), AgendaPanel (7-day), LeaderboardPanel.
- `src/pages/ClubPM/MembersView.jsx` (491 lines) — Member roster. Supports search + role filters. MemberDrawer shows full profile. ContributorImportModal links GitHub logins.
- `src/api/clubPmClient.js` (430 lines) — Fetch wrappers (get/post/patch/del/put). Base URL: `process.env.REACT_APP_API_URL || ""`. Sends session cookie **and** `Authorization: Bearer` from localStorage (`clubpm_auth_token`) on every call. Dispatches `clubpm:reward-granted`, `clubpm:achievement-unlocked`, `clubpm:challenge-progress`, `clubpm:cosmetic-unlocked`, `clubpm:reward-queued` custom events on responses. Streak cache: 5-second TTL. Also exports vault/CR helpers, blog editor helpers, `uploadVaultFile()` (XHR multipart w/ progress), and `suggestActions()` / `executePlan()`.
- `src/clubpm/ClubPmAuth.jsx` — Auth provider: consumes the `?lt=` login token, stores it, calls `/auth/me` with Bearer + cookie. `src/clubpm/` also holds ShortcutsRegistry, cosmetics registries + styles context, and engagement helpers.
- `src/components/clubpm/ActionPlanReview.jsx` — Renders an `ActionPlan` as editable per-action cards (per-type field config, accept/decline, rationale) for the AiPanel "Action Plan" section in `ProjectDetail.jsx`. See **AI Action Plan** above for the schema.

---

## CSS Architecture

**`public/search-theme.css` (~6,300 lines) and `public/clubpm-theme.css` (~20,500 lines) — always Grep before Reading.**

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

Grep: `rg "\.pm-shell" public/clubpm-theme.css` or `rg "/\* ===" public/*.css` to find section headers. When hunting a ClubPM class, search `clubpm-theme.css` first, then `search-theme.css` — a few `pm-`/`cpm-` prefixed rules legitimately live in the public file (see the CSS conventions above).

---

## Large Files — Grep Before Reading

| File | Lines | What to Grep |
|------|-------|-------------|
| `public/clubpm-theme.css` | 20,529 | class names, `/* ===` section headers |
| `public/search-theme.css` | 6,321 | class names, `/* ===` section headers |
| `src/pages/ClubPM/ProjectDetail.jsx` | 3,613 | component/state names, tab constants |
| `src/components/clubpm/TaskModal.jsx` | 2,625 | section names, handler names |
| `backend/src/api/outreach.ts` | 1,781 | route paths |
| `backend/prisma/schema.prisma` | 1,661 | model names, enum values |
| `src/pages/ClubPM/Dashboard.jsx` | 1,532 | component names, hook usage |
| `backend/src/api/tasks.ts` | 1,478 | route paths, type names |
| `backend/src/api/vault.ts` | 1,096 | route paths |

---

## Keeping the Constellation Course In Sync

**Any change to ClubPM navigation, routes, or tab bars is also a change to the training course.** The
Constellation courses in `docs/courses/` teach the live product by pointing at real DOM nodes; when
the UI moves and the course doesn't, walkthroughs silently highlight nothing and videos describe
screens that no longer exist.

Three artifacts move together, **in the same commit**:

1. `src/clubpm/tour/tourAnchors.js` — the machine-readable anchor registry (id → label, route, note).
2. `docs/courses/ANCHORS.md` — the human-readable counterpart. Same ids, same routes.
3. Every `docs/courses/**/*.steps.json` that targets an affected anchor, plus the `walkthroughs/README.md`
   outline beside it.

`node scripts/check-tour-anchors.js` (also wired into the build) enforces all three directions:
registry ↔ rendered `data-tour-id` ↔ step files. It is a static scan, so ids must appear as string
literals — never build one with template interpolation.

Beyond the anchor check, which the script cannot catch:

- **Prose goes stale silently.** Course `content/*.md`, `videos/*.md` scripts, and `quizzes/*.json`
  name tabs, buttons, and pages in plain English. Grep `docs/courses/` for the old label whenever you
  rename or remove one, and rewrite what you find.
- **Removing a surface can orphan a whole section.** If a course section teaches UI that no longer
  exists, retitle and rewrite it (or drop it from `course.json`) rather than leaving it pointing at
  nothing. Say so in the PR — that content is someone's teaching material, not just code.
- **Route changes propagate to `route` fields** in both the registry and every step's `route` /
  `entryRoute`, and to the `advance.path` of any step that waits on an API call.

## Plan Conventions

Plans live at `%USERPROFILE%\.claude\plans\` with random-animal-noun slugs.

**Phase rule:** Each plan phase should need ≤50 tool calls. Signs a phase is too large:
- Touches more than 4 files
- Requires a Prisma migration AND frontend changes in the same phase
- Creates more than 2 new components

After each phase: run `npm run build` (repo root) and `npx tsc --noEmit` (backend/) before continuing. Fix all errors before the next phase.

---

## Model Selection

Default to **Sonnet** (`claude-sonnet-5`) for all tasks. Use **Opus** only for:
- Security or performance audits of the backend
- Multi-file refactors spanning both frontend and backend (5+ files)
- Initial architecture design for a brand-new system
