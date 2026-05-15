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
