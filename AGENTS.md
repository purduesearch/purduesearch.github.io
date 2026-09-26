<!-- last synced: 2026-09-13 -->
# AGENTS.md — SEARCH Club Website

Root instructions for the whole repo. Agents use this file plus any `AGENTS.md`
closer to the file you're editing — nested files add detail, they don't replace this one:

- `src/AGENTS.md` — frontend conventions, CSS architecture, animation/routing/icon rules, known UI gotchas
- `backend/AGENTS.md` — ClubPM backend entry point + pointers into `backend/src/*`
- `backend/src/api/AGENTS.md` — REST route reference (tasks, blockers, milestones, AI action plan)
- `backend/src/services/AGENTS.md` — service-layer reference
- `backend/src/slack/AGENTS.md` — cron jobs + Slack portal invariants
- `backend/prisma/AGENTS.md` — schema models/enums reference
- `frontend/AGENTS.md` — standalone Vite/TypeScript/Tailwind conventions; these override the root app's JS/CSS conventions

---

## Project Overview

Static SPA for the Purdue SEARCH club, deployed to GitHub Pages and served at the custom domain **`purduesearch.org`** (`public/CNAME`; the old `purduesearch.github.io` URL 301-redirects to it). The backend is reached at **`api.purduesearch.org`**. The React app lives at the **repo root** (`src/`, `public/`, `package.json`). Pages are per-program (AstroUSA, SA²TP, etc.) with shared layout components and a global CSS file. A separate **ClubPM** subsystem (protected routes under `/clubpm`) provides project-management dashboards backed by a `backend/` Node.js/Express/Prisma/Slack service. A standalone Vite+TypeScript admin app lives in `frontend/` (separate build, not deployed to GitHub Pages).

**Stack:** React 19, React Router 7, Framer Motion (page transitions), Font Awesome (icons), mxGraph 4.2.2 (interactive diagrams), Three.js (3D model viewer), `@lottiefiles/react-lottie-player` (Lottie animations), `@dnd-kit/core` + `@dnd-kit/sortable` (ProjectDetail kanban, CrmTab pipeline board, and OutreachHub BoardTab), Fuse.js (fuzzy search), GSAP (scroll/flow animations), recharts (analytics charts), react-hot-toast (notifications), plain CSS custom properties.

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
│   │   ├── useRectMarquee.js
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
│   │       ├── MembersView.jsx        # Roster + DMs (club-wide, and filtered per project in the Members tab)
│   │       ├── ChatPage.jsx           # /clubpm/chat — every Slack channel you can read; browse + join public ones
│   │       ├── GanttView.jsx
│   │       ├── Login.jsx
│   │       ├── AdminView.jsx          # Pending rewards, reward config, admin tools
│   │       ├── CalendarPage.jsx
│   │       ├── ChallengesPage.jsx     # Quests + achievements
│   │       ├── MeetingNotesView.jsx
│   │       ├── OutreachHub.jsx        # outreach composer/CRM/campaigns
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
│       ├── events/                 # Public homepage events calendar (PublicEventsCalendar + MonthGrid + EventCard + CalendarMenu); pure logic in src/lib/publicEvents.js + calendarLinks.js
│       └── clubpm/                 # ClubPM UI components
│           ├── AppShell.jsx        # Protected layout shell
│           ├── GanttChart.jsx
│           ├── TaskModal.jsx       # task detail/comments/deps/time
│           ├── MilestonePanel.jsx
│           ├── vault/              # Constellation Vault CAD/PDM UI (VaultTab + friends)
│           ├── chat/               # Slack portal: ChatConversation (one conversation, any kind), ChatComposer
│           │                       #   (mentions/uploads/reconnect prompt), ChatBlocks (bot Block Kit), ChatTab,
│           │                       #   ChatMessage, ChatThreadDrawer — NEVER emit <span>/<p> here (see invariants)
│           ├── labschedule/        # Lab schedule modal (week grid, rectangle drag, buddy list) — opened from Calendar and the project header
│           ├── members/            # DmInbox + DmPanel — DMs live on the Members page; ?dm=<channelId> is URL state
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

## Commands

All frontend commands run from the **repo root**.

```bash
npm start          # Dev server → http://localhost:3000
npm run build      # Production build → build/
npm test           # Jest in watch mode, after the tour-anchor check
npm run test:ci    # One non-watch Jest run
npm run lint       # ESLint over src/**/*.js and src/**/*.jsx
npm test -- --watchAll=false src/lib/publicEvents.test.js  # one frontend test file
```

Backend (separate):

```bash
cd backend
npm run dev        # tsx watch mode; requires backend/.env and its services
npm run build      # tsc compile
npm run typecheck  # tsc --noEmit; no .env or network required
npm test           # all standalone *.test.ts files; no external network required
npx tsx src/services/publicEventService.test.ts  # one backend test file

cd ../frontend
npm run dev        # Vite dev server → http://localhost:5173
npm run build      # TypeScript build + Vite bundle
npm run typecheck  # tsc --noEmit
```

Backend database, seed, dev-server, and integration/diagnostic commands require a populated
`backend/.env`; database and third-party integration paths may also require network access.
The checked-in standalone backend tests are intended to use injected/pure boundaries and do not
require real credentials or external network access. Of the two checked-in examples, the root
`.env.example` is the canonical style and the broader template; it explicitly targets
`backend/.env`. `backend/.env.example` is an older, shorter backend-local copy and omits newer
optional keys. Neither file currently enumerates every optional `process.env` knob. Keep new documented variables in
the root template first, and do not put real secret values in either file.

Deploy is manual push to the `main` branch; GitHub Pages serves from root at `purduesearch.org`. The bundle's backend URL comes from the `REACT_APP_API_URL` repo secret and is **baked in at build time** — changing the secret does nothing until the Pages workflow re-runs.

---

## Large Files — Search Before Reading

Use `rg` first and read only the relevant section of these large files.

| File | What to search for |
|------|--------------------|
| `public/clubpm-theme.css` | class names, `/* ===` section headers |
| `public/search-theme.css` | class names, `/* ===` section headers |
| `src/pages/ClubPM/ProjectDetail.jsx` | component/state names, tab constants |
| `src/components/clubpm/TaskModal.jsx` | section names, handler names |
| `backend/src/api/outreach.ts` | route paths |
| `backend/prisma/schema.prisma` | model names, enum values |
| `src/pages/ClubPM/Dashboard.jsx` | component names, hook usage |
| `backend/src/api/tasks.ts` | route paths, type names |
| `backend/src/api/vault.ts`, `backend/src/api/vaultGithub.ts` | provider-pinned routes, repository setup, and GitHub jobs |

Vault training and rollout guidance lives in `docs/VAULT-GITHUB-PHASE4-RUNBOOK.md` and
`docs/courses/constellation-vault-and-crs/`. An enabled Vault repository stores new source files
through GitHub/LFS; the separate Files → Drive source remains a general document link. Existing
Drive-backed Vault versions and rollback writes remain supported until inventory verification and
the owner-approved retention period are complete.

---

## Workflow Notes & Gotchas

### Domain / hostnames
- **Never hardcode `https://purduesearch.org` in JS.** Import `SITE_URL` from `src/seo/siteUrl.js`. The non-JS assets that can't import it (`public/sitemap.xml`, `robots.txt`, `llms.txt`, `index.html`, `legal/*.html`, `constellation/index.html`) carry the literal and must be updated alongside it.
- **The Google OAuth "application home page" is `/clubpm/login`**, not `/constellation/` — the standalone page was merged into the React login route, and `public/constellation/index.html` is now only a redirect stub. That route renders the scope-justification table and Limited Use language a Google reviewer reads, so don't trim the `.pm-login-doc` sections in `src/pages/ClubPM/Login.jsx` for visual tidiness. Caveat: as an SPA route it is served via the `404.html` fallback, so it returns **HTTP 404** with a JS-only body to non-browser fetchers.
- **Set the custom domain in Settings → Pages *and* keep `public/CNAME`.** Neither alone works: the Settings field is what triggers GitHub's certificate issuance, while the file is what reaches the served site (deploys go through `actions/upload-pages-artifact`, which publishes `build/`, so the CNAME the Settings UI writes to the default branch is never read). The field does **not** self-populate from the artifact — set it by hand or the domain serves a `*.github.io` cert and every browser shows a privacy error.
- **`FRONTEND_URL` must stay single-valued** — ~10 backend modules read it to build outbound links (Slack deep links, OAuth redirects), so a comma-separated value breaks all of them. Extra CORS-only origins go in `CORS_EXTRA_ORIGINS` (`backend/src/app.ts`).
- Session cookies are `sameSite: "none"` and **must stay that way** while `CORS_EXTRA_ORIGINS` still carries `https://purduesearch.github.io`. Once that is cleared (see pending cleanup below), `purduesearch.org` ↔ `api.purduesearch.org` are same-site and the cookie can drop to `"lax"` — restoring real cookie auth in Brave/Safari and demoting the `auth.ts` Bearer-token fallback. Worth its own PR with auth testing.
- `pollService.ts`'s iCal `UID:...@purduesearch.github.io` is **deliberately not migrated**. Changing an iCalendar UID duplicates events on already-subscribed calendars.
- **Cutover completed 2026-08-05, with cleanup deliberately deferred ~2 weeks; that cleanup is now overdue.** Still live and still to be removed: `CORS_EXTRA_ORIGINS`, the DuckDNS nginx vhost + cert (`search-constellation.duckdns.org`), and the old OAuth redirect URLs in the Slack/GitHub apps. They remain the rollback path — don't remove them opportunistically. Schedule and execute the checklist in `docs/DOMAIN-CUTOVER-RUNBOOK.md` Phase 8 as a dedicated, tested change.
- `provision-domain.yml` (Actions tab) adds an nginx vhost + certbot cert for a hostname alongside the existing ones. Run `diagnose` first; `apply` refuses to call certbot until DNS resolves to the box, because Let's Encrypt allows only 5 validation failures per hostname per hour. Design rationale: `docs/superpowers/specs/2026-08-05-purduesearch-org-migration-design.md`.

---

### General
- `public/` assets are served at `/` in dev and in the GitHub Pages build. Paths in JSX must start with `/` (e.g., `/astrousa/fig1.jpg`).
- No `.env` is needed for frontend dev or build. `REACT_APP_API_URL` is optional locally (CRA's `proxy` field forwards to `localhost:3001`) and is supplied as a repo secret in CI.
- **Constellation phone layout (temporary rollout switch).** The compact shell mounts when `COMPACT_QUERY` in `src/clubpm/layout/compactLayout.js` matches. `REACT_APP_CLUBPM_COMPACT=off` at build time (repo *variable* of the same name, read by `deploy.yml`) ships the desktop shell at every width; per browser, `localStorage['pm-compact'] = 'on' | 'off'` overrides it for previewing. CSS for it is only under `.pm-shell--compact` inside the identical `@media` block at the end of `clubpm-theme.css`. Remove the switch once the redesign is stable (plan Phase 5).
- `mxgraph` is an npm dependency in `package.json`; do not remove it or switch to a CDN reference.
- **`@hello-pangea/dnd` is still in `package.json` but nothing imports it** — OutreachHub's BoardTab was migrated to `@dnd-kit`. Drop the dependency in a change of its own (it touches the lockfile), not as a side effect of unrelated work.
- **`Event.isPublic` defaults to `false` in the DB on purpose.** Only the ClubPM event form and the Slack `/event` modal opt in (UI default on, with a confirm step in `EventFormModal`). Any new event-creating path stays private unless it deliberately passes `isPublic`. `eventService` forces `DEADLINE` events to `false`.

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
  name tabs, buttons, and pages in plain English. Search `docs/courses/` with `rg` for the old label whenever you
  rename or remove one, and rewrite what you find.
- **Removing a surface can orphan a whole section.** If a course section teaches UI that no longer
  exists, retitle and rewrite it (or drop it from `course.json`) rather than leaving it pointing at
  nothing. Say so in the PR — that content is someone's teaching material, not just code.
- **Route changes propagate to `route` fields** in both the registry and every step's `route` /
  `entryRoute`, and to the `advance.path` of any step that waits on an API call.

---
