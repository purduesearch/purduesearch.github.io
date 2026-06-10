<!-- last synced: 2026-05-15 -->
# CLAUDE.md — SEARCH Club Website

## Project Overview

Static SPA for the Purdue SEARCH club, deployed to GitHub Pages at `purduesearch.github.io`. The React app lives at the **repo root** (`src/`, `public/`, `package.json`). Pages are per-program (AstroUSA, SA²TP, etc.) with shared layout components and a global CSS file. A separate **ClubPM** subsystem (protected routes under `/clubpm`) provides project-management dashboards backed by a `backend/` Node.js/Express/Prisma/Slack service. A standalone Vite+TypeScript admin app lives in `frontend/` (separate build, not deployed to GitHub Pages).

**Stack:** React 19, React Router 7, Framer Motion (page transitions), Font Awesome (icons), mxGraph 4.2.2 (interactive diagrams), Three.js (3D model viewer), `@lottiefiles/react-lottie-player` (Lottie animations), `@hello-pangea/dnd` (Kanban drag-and-drop), Fuse.js (fuzzy search), GSAP (scroll/flow animations), recharts (analytics charts), react-hot-toast (notifications), plain CSS custom properties.

---

## File Structure

```
(repo root)
├── public/
│   ├── index.html                  # HTML shell; Font Awesome CDN link here
│   ├── search-theme.css            # Global + component CSS (primary CSS file)
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
│   │   └── ClubPM/                    # Protected PM dashboards
│   │       ├── Dashboard.jsx
│   │       ├── GanttView.jsx
│   │       ├── Login.jsx
│   │       ├── MembersView.jsx
│   │       └── ProjectDetail.jsx
│   └── components/
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
│       └── clubpm/                 # ClubPM UI components
│           ├── AppShell.jsx        # Protected layout shell
│           ├── GanttChart.jsx
│           ├── KanbanBoard.jsx     # @hello-pangea/dnd drag-and-drop
│           ├── MilestonePanel.jsx
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
- **Primary global file:** `public/search-theme.css` — component and theme styles go here. No CSS modules, no Tailwind.
- `src/index.css` — base reset and font styles only.
- `src/newscarousel.scss` — carousel-specific SCSS (one-off; do not add more SCSS files).
- Theme tokens are CSS custom properties: `--color-accent`, `--color-border`, `--color-muted`, `--color-text-muted`, `--color-bg`, etc.
- Component class names are kebab-case, namespaced by feature (e.g., `astro-diagram-wrap`, `astro-diagram-toolbar`, `astro-key-btn`).
- Append new component CSS to the bottom of `search-theme.css`; never inline critical styles.

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

Deploy is manual push to the `main` branch; GitHub Pages serves from root.

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

### General
- `public/` assets are served at `/` in dev and in the GitHub Pages build. Paths in JSX must start with `/` (e.g., `/astrousa/fig1.jpg`).
- There is no `.env` file; no environment variables are required for dev or build.
- `mxgraph` is an npm dependency in `package.json`; do not remove it or switch to a CDN reference.

---

## ClubPM Backend Architecture

**Entry:** `backend/src/app.ts` — Express setup, session (PostgreSQL-backed), Helmet, 30 route mounts.

### API Routes (`backend/src/api/`)
- `tasks.ts` — Core task CRUD + comments, subtasks, dependencies, time logs, AI enrichment. See **Task API Quick Reference** below.
- `members.ts` — Member profile, XP history, rank. Rank is a Prisma enum on `Member`.
- `auth.ts` / `githubAuth.ts` — Session-based auth (express-session + Slack OAuth + GitHub OAuth). No JWT.
- `projects.ts` — Project CRUD; also mounts `tagsRouter`.
- `milestones.ts` — Milestone create/update/health refresh.
- `rewards.ts` — Pending reward queue, admin approve/reject.
- `challenges.ts` — Active challenges, claim endpoint.
- `outreach.ts` — OutreachSubmission CRUD; sub-routers: assets, brand-voices, campaigns, contacts, insights.
- `shop.ts` / `inventory.ts` / `avatar.ts` — Cosmetic shop, inventory, avatar slot management.
- `leaderboard.ts` — XP + doubloon rankings.
- `notifications.ts` + `sse.ts` — Notification CRUD + SSE push stream.
- `public.ts` — Unauthenticated endpoints (GitHub Pages reads these).
- `github.ts` / `githubWebhook.ts` — GitHub integration + webhook (raw body handler).
- `reporting.ts`, `activity.ts`, `events.ts`, `eventConfig.ts`, `streak.ts` — Ancillary data.

### Services (`backend/src/services/`)
- `rewardService.ts` — XP/doubloon ledger. Key: `grantXP()`, `grantDoubloons()`, `handleTaskComplete()`, `handleTimeLog()`, `handleMilestoneComplete()`. Task rewards are **admin-gated** via `queuePendingReward()`.
- `taskService.ts` — Prisma query wrapper for tasks.
- `challengeService.ts` — `recordEvent(memberId, metric, delta?)` → fires on user actions; `getActiveChallenges()`, `claimChallenge()`.
- `milestoneService.ts` — `refreshMilestoneHealth()`.
- `geminiService.ts` — Gemini API: `generateJson()`, `generateJsonFromImage()`.
- `activityService.ts` — Audit log: `logAuditEvent()`, `diffObjects()`.
- `dmBatcher.ts` — Slack DM queue: `queueDm()`.
- `streakService.ts` — `recordActivity()`, daily reset sweep.
- `notificationCrud.ts` — `createNotification()`.

### Slack (`backend/src/slack/`)
- `scheduler.ts` — All cron jobs (node-cron). Includes: midnight shop rotation, daily streak reset (02:00 UTC), Monday digest (09:00), daily due-date reminders (08:00), milestone health refresh (08:45), Friday risk analysis (15:45), hourly auto-publish. **Add new crons here only.**

### Database (`backend/prisma/schema.prisma`)
Key models: `Member`, `Task`, `Project`, `MilestoneTask`, `XpEvent`, `DoubloonEvent`, `Challenge`, `MemberChallenge`, `MemberAchievement`, `InventoryItem`, `Cosmetic`, `MemberCosmetic`, `Streak`, `ActivityLog`, `GitHubLink`, `OutreachSubmission`.

Key enums:
- `Rank` — NESTLING → FLEDGLING → CADET → SPECIALIST → PIONEER → COSMONAUT → CELESTIAL (thresholds 0–21,000 XP)
- `TaskStatus` — TODO, IN_PROGRESS, BLOCKED, DONE
- `Priority` — LOW, MEDIUM, HIGH, CRITICAL
- `RewardEventType` — TIME_LOG_HOUR, TASK_COMPLETE_MEMBER_CREATED, TASK_COMPLETE_ADMIN_CREATED, MILESTONE_HIT, KUDOS_RECEIVED, BLOG_POST_PUBLISHED, EARLY_DELIVERY_BONUS
- `ChallengeMetric` — TASK_COMPLETED, COMMENT_WRITTEN, TIME_LOG_HOURS, UNIQUE_ASSIGNEES, FILE_ATTACHED, etc.
- `ChallengeType` — DAILY, WEEKLY, MONTHLY, ACHIEVEMENT

Member XP is stored as `XpEvent` rows, not a single column — always query via aggregation.
Task `rewardGrantedAt` is an idempotency gate; do not clear it or DONE→IN_PROGRESS→DONE re-grants XP.

### Task API Quick Reference (`backend/src/api/tasks.ts`)

```
GET    /api/tasks/search                        full-text search (max 20)
POST   /api/tasks/check-duplicates              AI duplicate detection
POST   /api/tasks/create-from-nl               NL → structured task
POST   /api/tasks/create-from-image            screenshot → task extraction
GET    /api/tasks/:id                           single task + assignees + milestone
PATCH  /api/tasks/:id                           update (status, priority, assignees, attachments…)
DELETE /api/tasks/:id                           soft-delete (sets deletedAt); creator/admin only
GET    /api/tasks/:id/comments                  threaded comments (top-level + 200 replies)
POST   /api/tasks/:id/comments                  create comment; fires @mention DMs + challenge hooks
PATCH  /api/tasks/:id/comments/:cid             edit (author only)
DELETE /api/tasks/:id/comments/:cid             delete (author or admin)
POST   /api/tasks/:id/comments/:cid/reactions   emoji reaction toggle
GET    /api/tasks/:id/subtasks                  list subtasks
POST   /api/tasks/:id/subtasks                  create subtask
POST   /api/tasks/:id/dependencies              add dependency (validates no circular refs)
DELETE /api/tasks/:id/dependencies/:depId       remove dependency
POST   /api/tasks/:id/time-logs                 log time (daily 8-hr cap; >2 hr queued for admin)
GET    /api/tasks/:id/time-logs                 list logs + total minutes
POST   /api/tasks/:id/ai-enrich                Gemini: description + acceptance criteria + DoD
POST   /api/tasks/:id/suggest-deadline         AI deadline suggestion
GET    /api/tasks/:id/history                   50 most recent audit events
```

PATCH `/:id` status→DONE triggers: blocker validation, CI gate (if `githubBlockDoneOnCiFail`), `rewardService.handleTaskComplete()`, `challengeService.recordEvent()`, streak tick.
Always include `include: { assignees: { include: { member: true } } }` to get avatarUrl + rank.

---

## ClubPM Frontend Key Files

- `src/components/clubpm/AppShell.jsx` (542 lines) — Protected layout: `pm-sidebar` + `pm-shell-content`. Provides `useClubPmAuth()` (member, logout) and `useProjectNav()` (project-scoped tabs). Hosts: AICommandPalette, CreateProjectModal, RankUpModal, RewardFlux, QuestCompleteToast.
- `src/pages/ClubPM/ProjectDetail.jsx` (2,711 lines) — Main PM view. Tabs: tasks (kanban with StatusBin drag-drop), milestones, files (Drive + GitHub), reports, ai. Drag uses `@hello-pangea/dnd`. State: `project`, `activeTab`, `selectedTask`, `overBin`.
- `src/pages/ClubPM/Dashboard.jsx` (1,532 lines) — Personal dashboard: StatsBar (5 stats), DailyQuestsWidget, AIInsightCards, WorkPanel (filterable task list), AgendaPanel (7-day), LeaderboardPanel.
- `src/pages/ClubPM/MembersView.jsx` (490 lines) — Member roster. Supports search + team/role filters. MemberDrawer shows full profile. ContributorImportModal links GitHub logins.
- `src/api/clubPmClient.js` (289 lines) — Fetch wrappers (get/post/patch/del). Base URL: `process.env.REACT_APP_API_URL || ""`. Session cookie sent automatically (no auth headers). Dispatches `clubpm:reward-granted`, `clubpm:achievement-unlocked`, `clubpm:challenge-progress` custom events on responses. Streak cache: 5-second TTL.

---

## CSS Architecture (`public/search-theme.css`)

**20,313 lines — always Grep before Reading.**

Section order:
1. CSS custom properties (`:root`) — SEARCH branding tokens
2. Global resets + typography
3. Navbar / Footer
4. Hero + home page sections
5. Program pages (AstroUSA, SA²TP, Research, Software)
6. Blog / News carousel
7. **ClubPM** — starts ~line 4270, header: `/* === CLUBPM`

ClubPM CSS class prefixes:
- `clubpm-` — Full component names (`clubpm-app`, `clubpm-surface-*`, `clubpm-badge-*`, `clubpm-btn-primary`)
- `pm-` — Layout & panels (`pm-shell`, `pm-sidebar`, `pm-topbar`, `pm-shell-content`, `pm-stats-bar`, `pm-stat-tile`, `pm-work-panel`, `pm-agenda-panel`, `pm-member-card`, `pm-leaderboard-panel`)
- `cpm-` — Compact utilities (`cpm-card`, `cpm-kanban-grid/column/card`, `cpm-progress-bar`, `cpm-tag`, `cpm-spinner`, `cpm-stagger-1` through `-6`, `cpm-members-grid`, `cpm-project-grid`, `cpm-gradient-text`)

ClubPM design tokens (on `.clubpm-app`): `--pm-bg-base`, `--pm-surface`, `--pm-elevated`, `--pm-overlay`, `--pm-accent-teal` (#00e5cc), `--pm-accent-amber` (#f5a623), `--pm-accent-coral`, `--pm-accent-violet`, `--pm-font-display` (Syne), `--pm-font-body` (DM Sans), `--pm-font-mono` (JetBrains Mono).

Grep: `rg "\.pm-shell" public/search-theme.css` or `rg "/\* ===" public/search-theme.css` to find section headers.

---

## Large Files — Grep Before Reading

| File | Lines | What to Grep |
|------|-------|-------------|
| `public/search-theme.css` | 20,313 | class names, `/* ===` section headers |
| `src/pages/ClubPM/ProjectDetail.jsx` | 2,711 | component/state names, tab constants |
| `src/pages/ClubPM/Dashboard.jsx` | 1,532 | component names, hook usage |
| `backend/src/api/tasks.ts` | ~450 | route paths, type names |
| `backend/prisma/schema.prisma` | ~350 | model names, enum values |

---

## Plan Conventions

Plans live at `%USERPROFILE%\.claude\plans\` with random-animal-noun slugs.

**Phase rule:** Each plan phase should need ≤50 tool calls. Signs a phase is too large:
- Touches more than 4 files
- Requires a Prisma migration AND frontend changes in the same phase
- Creates more than 2 new components

After each phase: run `npm run build` (repo root) and `npx tsc --noEmit` (backend/) before continuing. Fix all errors before the next phase.

---

## Model Selection

Default to **Sonnet** (`claude-sonnet-4-6`) for all tasks. Use **Opus** only for:
- Security or performance audits of the backend
- Multi-file refactors spanning both frontend and backend (5+ files)
- Initial architecture design for a brand-new system
