<!-- last synced: 2026-05-15 -->
## Efficiency Directives

### Tool Output Discipline
- Never read entire files when only a section is needed. Use `head`, `tail`, and `grep` to
  target relevant lines before deciding whether a full read is warranted.
- Pipe verbose bash commands through `| tail -50` or `| grep -E "error|warn"` — especially
  for package installs, build steps, and test runners.
- Use the `Edit` tool for in-place file modifications. Avoid Read → full-rewrite → Write
  cycles. Batch all edits to a file into a single turn.
- If you reference a file's structure more than once in a session, record the key details
  in a TodoWrite memory note rather than re-reading the file.

### Reasoning Discipline
- Skip preamble reasoning for routine subtasks where a plan or skill is already defined.
  Move directly to execution. Reserve extended thinking for genuinely ambiguous decisions.

### Large Input Handling
- If an implementation spec or document was provided, treat it as the authoritative source
  and do not re-summarize or re-state it in replies. Reference sections by name/line only.

# CONTEXT.md — Task Routing Guide

This file routes Claude to the correct files for common website tasks. Load only the files relevant to the current task; avoid scanning the full repo.

---

## Task → File Mapping

| Task | Files to load |
|---|---|
| **Edit / add a top-level page** | `src/pages/<PageName>.jsx` |
| **Edit / add a sub-page** | `src/pages/<Program>/<SubPage>.jsx` |
| **Add a new route** | `src/App.js` |
| **Edit navigation** | `src/components/Navbar.jsx` |
| **Edit page transitions / layout shell** | `src/App.js`, `src/components/PageWrapper.jsx` |
| **Add or change global styles / CSS tokens** | `public/search-theme.css` |
| **Add a new component** | `src/components/<NewComponent>.jsx` + `public/search-theme.css` (append CSS) |
| **Edit the interactive flow diagram** | `src/components/AstroFlowDiagram.jsx`, `public/search-theme.css` (`.astro-diagram-*` classes) |
| **Update diagram XML source** | `public/astrousa/interactive diagrams/ASTRO-USA Flow Chart Version 1.8.xml` |
| **Edit AstroUSA page content** | `src/pages/AstroUSA.jsx` or `src/pages/AstroUSA/<sub>.jsx` |
| **Edit SA²TP page content** | `src/pages/SA2TP.jsx` or `src/pages/SA2TP/<sub>.jsx` |
| **Change scroll-to-top behavior** | `src/components/ScrollToTop.jsx` |
| **Add static images / assets** | `public/<program>/` folder (served at `/<program>/filename`) |
| **Change Font Awesome icon set** | `public/index.html` (CDN link in `<head>`) |
| **Edit ClubPM dashboard / project views** | `src/pages/ClubPM/<View>.jsx`, `src/components/clubpm/<Component>.jsx` |
| **Edit Kanban board** | `src/components/clubpm/KanbanBoard.jsx` (`@hello-pangea/dnd`) |
| **Edit Gantt chart** | `src/components/clubpm/GanttChart.jsx` |
| **Edit ClubPM auth / route protection** | `src/clubpm/ClubPmAuth.jsx`, `src/App.js` |
| **Edit ClubPM API calls** | `src/api/clubPmClient.js` |
| **Edit backend REST endpoints** | `backend/src/api/<resource>.ts`, `backend/src/services/<resource>Service.ts` |
| **Edit Slack bot** | `backend/src/slack/` (commands, actions, events, modals, scheduler) |
| **Edit DB schema** | `backend/prisma/schema.prisma` → run `npx prisma migrate dev` |
| **Edit fuzzy search behavior** | `src/hooks/useSearch.js` (Fuse.js config) |
| **Edit 3D model viewer** | `src/components/AstroSubsystem3D.jsx`, `src/components/STLViewer.jsx` |

---

## Exclusions — Do Not Load Unless Asked

| Path | Reason |
|---|---|
| `node_modules/`, `backend/node_modules/`, `frontend/node_modules/` | Third-party packages — never edit |
| `build/` | Generated build output — never edit directly |
| `public/astrousa/*.jpg`, `*.png`, `*.webp`, `*.webm` | Binary assets — not relevant to code tasks |
| `public/animations/*.json` | Lottie animation blobs — edit in LottieFiles, not by hand |
| `public/models/` | Binary 3D model files — not relevant to code tasks |
| `src/vendor/` | Vendored third-party JS/CSS — never edit |
| `frontend/` | Separate Vite/TS app — load only when task explicitly targets it |
| `.git/` | Version history — read-only via git commands only |

---

## Context Loading Rules

1. **Load only what the task needs.** For a style change, load `search-theme.css`. For a page edit, load only that page file.
2. **For mxGraph work**, always load both `src/components/AstroFlowDiagram.jsx` AND the relevant section of `public/search-theme.css` (`.astro-diagram-*` block near the bottom). The CSS and JS are tightly coupled.
3. **Check CLAUDE.md gotchas** before making any change to `AstroFlowDiagram.jsx` — several non-obvious mxGraph constraints apply.
4. **Do not scan `public/` for code.** The only code files in `public/` are `search-theme.css` and `index.html`; everything else is static assets.
5. **Component CSS goes in `public/search-theme.css`.** There are no CSS modules, no Tailwind. Append a clearly-commented block to the bottom of `search-theme.css` for new components. (`src/index.css` is base reset only; `src/newscarousel.scss` is a one-off — do not add more SCSS.)
6. **For ClubPM tasks**, load the relevant `src/pages/ClubPM/` page AND `src/components/clubpm/` component together — they are tightly coupled. Also load `src/api/clubPmClient.js` if the change touches data fetching.
7. **Backend tasks are independent** — `backend/` has its own `node_modules`, TypeScript config, and Prisma client. Never import backend code into frontend.
