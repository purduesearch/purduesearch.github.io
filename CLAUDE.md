# CLAUDE.md — SEARCH Club Website

## Project Overview

Static SPA for the Purdue SEARCH club, deployed to GitHub Pages at `purduesearch.github.io`. Built with **React 19 + React Router 7** inside `my-app/`. All development happens in `my-app/` — the repo root is just the git container. Pages are per-program (AstroUSA, SA²TP, etc.) with shared layout components and a single global CSS file.

**Stack:** React 19, React Router 7, Framer Motion (page transitions), AOS (scroll animations), Font Awesome (icons), mxGraph 4.2.2 (interactive diagrams), plain CSS custom properties.

---

## File Structure

```
my-app/
├── public/
│   ├── index.html                  # HTML shell; Font Awesome CDN link here
│   ├── search-theme.css            # ALL global + component CSS (single file)
│   └── <program>/                  # Static assets per program
│       └── interactive diagrams/   # mxGraph XML source files (.xml)
├── src/
│   ├── index.js                    # React DOM entry point
│   ├── App.jsx                     # Router config + AnimatePresence wrapper
│   ├── pages/                      # One file per route/page
│   │   ├── Home.jsx
│   │   ├── AstroUSA.jsx
│   │   ├── SA2TP.jsx
│   │   └── ...
│   └── components/                 # Shared and page-specific components
│       ├── AstroFlowDiagram.jsx    # mxGraph interactive diagram (complex — see gotchas)
│       ├── NavBar.jsx
│       ├── PageWrapper.jsx         # Framer Motion page transition wrapper
│       ├── ScrollToTop.jsx
│       └── ...
└── package.json
```

---

## Coding Conventions

### Files & Components
- All component files use `.jsx` and **PascalCase** (`NavBar.jsx`, `PageWrapper.jsx`).
- No TypeScript — plain JS/JSX only.
- Hooks only — no class components.

### CSS
- **One global file:** `public/search-theme.css`. No CSS modules, no Tailwind, no SCSS.
- Theme tokens are CSS custom properties: `--color-accent`, `--color-border`, `--color-muted`, `--color-text-muted`, `--color-bg`, etc.
- Component class names are kebab-case, namespaced by feature (e.g., `astro-diagram-wrap`, `astro-diagram-toolbar`, `astro-key-btn`).
- Append new component CSS to the bottom of `search-theme.css`; never inline critical styles.

### Animations
- AOS for scroll entrance: `data-aos="fade-up"`, `data-aos-delay="100"` on JSX elements.
- Framer Motion `<AnimatePresence>` in `App.jsx`; page components wrapped in `<PageWrapper>`.

### Routing
- React Router 7 file-per-page pattern. Routes defined in `App.jsx`.
- `<ScrollToTop>` component wraps the route tree to reset scroll on navigation.

### Icons
- Font Awesome classes only: `<i className="fas fa-wind" aria-hidden="true" />`.
- Never use emoji as icons in JSX.

---

## Commands

All commands run from **`my-app/`**, not the repo root.

```bash
cd my-app

npm start          # Dev server → http://localhost:3000
npm run build      # Production build → my-app/build/
npm test           # Jest test runner (minimal test coverage currently)
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
