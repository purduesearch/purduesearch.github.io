# CONTEXT.md — Task Routing Guide

This file routes Claude to the correct files for common website tasks. Load only the files relevant to the current task; avoid scanning the full repo.

---

## Task → File Mapping

| Task | Files to load |
|---|---|
| **Edit / add a page** | `src/pages/<PageName>.jsx` |
| **Add a new route** | `src/App.jsx` |
| **Edit navigation** | `src/components/NavBar.jsx` |
| **Edit page transitions / layout shell** | `src/App.jsx`, `src/components/PageWrapper.jsx` |
| **Add or change global styles / CSS tokens** | `public/search-theme.css` |
| **Add a new component** | `src/components/<NewComponent>.jsx` + `public/search-theme.css` (append CSS) |
| **Edit the interactive flow diagram** | `src/components/AstroFlowDiagram.jsx`, `public/search-theme.css` (`.astro-diagram-*` classes) |
| **Update diagram XML source** | `public/astrousa/interactive diagrams/ASTRO-USA Flow Chart Version 1.8.xml` |
| **Edit AstroUSA page content** | `src/pages/AstroUSA.jsx` |
| **Edit SA²TP page content** | `src/pages/SA2TP.jsx` |
| **Change scroll-to-top behavior** | `src/components/ScrollToTop.jsx` |
| **Add static images / assets** | `public/<program>/` folder (served at `/<program>/filename`) |
| **Change Font Awesome icon set** | `public/index.html` (CDN link in `<head>`) |
| **Modify AOS scroll animations** | Attribute-level in any `.jsx` page file (`data-aos`, `data-aos-delay`) |

---

## Exclusions — Do Not Load Unless Asked

| Path | Reason |
|---|---|
| `my-app/node_modules/` | Third-party packages — never edit |
| `my-app/build/` | Generated build output — never edit directly |
| `public/astrousa/*.jpg`, `*.png`, `*.webp`, `*.webm` | Binary assets — not relevant to code tasks |
| `.git/` | Version history — read-only via git commands only |

---

## Context Loading Rules

1. **Load only what the task needs.** For a style change, load `search-theme.css`. For a page edit, load only that page file.
2. **For mxGraph work**, always load both `AstroFlowDiagram.jsx` AND the relevant section of `search-theme.css` (`.astro-diagram-*` block near the bottom). The CSS and JS are tightly coupled.
3. **Check CLAUDE.md gotchas** before making any change to `AstroFlowDiagram.jsx` — several non-obvious mxGraph constraints apply.
4. **Do not scan `public/` for code.** The only code file in `public/` is `search-theme.css` and `index.html`; everything else is static assets.
5. **All CSS lives in one file.** There are no CSS modules, no component `.css` files, no Tailwind config. When adding styles for a new component, append a clearly-commented block to the bottom of `public/search-theme.css`.
