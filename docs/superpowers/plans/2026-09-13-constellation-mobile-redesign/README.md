# Constellation mobile redesign — Phase 0 supporting material

Plan: `../2026-09-13-constellation-mobile-redesign.md`. Status tracker and next steps:
`../2026-09-13-constellation-mobile-redesign-HANDOFF.md` (read that first).

| Path | What it is |
| --- | --- |
| `inventory.md` | Every route, project sub-view, shell control, role gate, modal/overlay, hover/drag-only interaction, shortcut, and orphaned item, with its proposed phone entry point |
| `findings.md` | Phone usability problems — browser-observed (B) vs source-only (S), with component references and severity |
| `contracts.md` | Decisions: compact condition, route → current item, project navigation, overlay stack + z-index, Back/Forward, keyboard, tour-anchor migration, API flags, desktop boundaries |
| `prototype/` | Interactive phone prototype (fixture data). Viewing instructions: `prototype/README.md` |
| `evidence/browser/` | Production baseline screenshots + `metrics.json`, `metrics-extras.json`; `SUMMARY.md` is the readable table |
| `evidence/prototype/` | Prototype screenshots + `report.json` (automated checks) |
| `evidence/source/` | Generated source scans: media-query inventory, shell tour steps, course prose naming desktop-only UI |
| `scripts/fixture-api.mjs` | Fixture-only mock API on :3001 so `npm start` renders real components without the backend |
| `scripts/capture-baselines.mjs`, `scripts/capture-extras.mjs` | Production baseline capture (CDP, headless Chrome) |
| `scripts/summarize-baselines.mjs` | Regenerates `evidence/browser/SUMMARY.md` |
| `scripts/check-prototype.mjs` | Automated prototype checks (layout, nav, journeys, history, keyboard) |
| `scripts/scan-shell-tour-steps.mjs` | Lists walkthrough steps that target shell anchors |
| `scripts/check-phase1-shell.mjs` | Phase 1: 213 emulated checks of the production phone/desktop shell (which shell mounts, desktop rects vs Phase 0, bottom bar, sheets, history, picker failure, admin, breakpoint crossing, walkthrough reveal) |
| `evidence/phase1/` | Phase 1 screenshots + `report.json` (emulation only) |
| `scripts/check-phase2-tasks.mjs` | Phase 2: phone dashboard/task journeys at 320, 390, 430, landscape, keyboard-height proxy, and a 1280px desktop regression boundary |
| `evidence/phase2/` | Phase 2 workflow screenshots + `report.json` (fixture API and headless Chrome emulation only) |
| `scripts/check-phase3-comms.mjs` | Phase 3: channel/list/thread history, DM navigation, failed-send retry, keyboard/nav interaction, agenda/RSVP/creation permissions, notification deep links, and desktop messaging |
| `evidence/phase3/` | Phase 3 communication/calendar screenshots + `report.json` (fixture-only Chromium emulation; real-device validation pending) |
| `scripts/check-phase4-tools.mjs` | Phase 4: Files/Vault/GitHub, Insights/AI/Gantt, Outreach, course learning, admin, Profile/Shop/Challenges, login, landscape, and a desktop regression sweep |
| `evidence/phase4/` | Phase 4 screenshots + `report.json` (fixture-only Chromium emulation; real-device validation pending) |
| `scripts/cdp.mjs` | Minimal Chrome DevTools Protocol client (Node's built-in WebSocket; no puppeteer) |
| `release-readiness.md` | **Phase 5:** gate-by-gate status (passed / unverified), defects fixed, remaining device checklist |
| `release-runbook.md` | **Phase 5:** commit scope, release steps, deployed smoke test, per-browser preview, rollback |
| `pr-description.md` | **Phase 5:** review-ready change description |
| `scripts/serve-build.mjs` | Serves a production `build/` like GitHub Pages (SPA fallback) and proxies `/api` + `/auth` to the fixture |
| `scripts/phase5-lib.mjs` | Shared Phase 5 harness helpers (viewports, taps, keys, shell snapshot, report writer) |
| `scripts/check-phase5-matrix.mjs` | 44 destinations × phone/boundary/desktop viewports, enlarged text, safe areas, roles, empty/error/expired states, rollback switch |
| `scripts/check-phase5-journeys.mjs` | Five primary journeys, blockers, history/refresh/direct links, real key events, AX tree, drafts, duplicate submits, keyboard-height composers, live EventSource count |
| `scripts/check-phase5-overlays.mjs` | Remaining legacy dialogs and the Outreach floating button at 320px |
| `scripts/check-phase5-compare.mjs` | HEAD build vs working-tree build: desktop and public pixels, drag, shortcuts, task close, load/blocking/scroll timing, listener counts |
| `evidence/phase5/` | Phase 5 reports (`matrix`, `journeys`, `overlays`, `compare`, `bundle`), screenshots, and `compare/` HEAD-vs-branch pairs for every remaining pixel difference |

## Re-running the evidence

Do **not** start the real backend for this: `backend/.env` holds live Slack/GitHub/Google credentials
and the Bolt app + cron scheduler act on the real workspace.

```bash
# terminal 1 — fixture API (fake data, writes nothing)
node docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/scripts/fixture-api.mjs
# terminal 2 — the real frontend (CRA proxies /api and /auth to :3001)
BROWSER=none npm start
# terminal 3 — captures (~10 min), then the summary table
node docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/scripts/capture-baselines.mjs
node docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/scripts/capture-extras.mjs
node docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/scripts/summarize-baselines.mjs
# Phase 1 shell checks (~4 min)
node docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/scripts/check-phase1-shell.mjs
# Phase 2 task workflow checks (~1 min)
node docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/scripts/check-phase2-tasks.mjs
# Phase 4 dense-view checks (~2 min)
node docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/scripts/check-phase4-tools.mjs
# Phase 3 communication/calendar checks (~1 min)
node docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/scripts/check-phase3-comms.mjs
# Phase 5 (production bundles; ~60 min for all four). Build first — REACT_APP_API_URL must be
# empty, or .env.production's placeholder host is baked in and every API call leaves the machine.
CI=false REACT_APP_API_URL= BUILD_PATH=/tmp/p5/cur npx react-scripts build
CI=false REACT_APP_API_URL= REACT_APP_CLUBPM_COMPACT=off BUILD_PATH=/tmp/p5/off npx react-scripts build
git archive HEAD src public scripts package.json | tar -x -C /tmp/p5/head   # + node_modules junction, then npm run build there
node docs/.../scripts/serve-build.mjs /tmp/p5/head/build 4001 &
node docs/.../scripts/serve-build.mjs /tmp/p5/cur 4002 &
node docs/.../scripts/serve-build.mjs /tmp/p5/off 4003 &
node docs/.../scripts/check-phase5-journeys.mjs   # then -overlays, -matrix, -compare, one at a time
# prototype checks
node docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/prototype/serve.mjs
node docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/scripts/check-prototype.mjs
```

Chrome is found at `C:/Program Files/Google/Chrome/Application/chrome.exe` (override with
`CHROME_PATH`). Harness notes learned the hard way: headless reports an 800×600 screen unless
`screenWidth/screenHeight` are set; `Input.synthesizeTapGesture` emits no click in headless — use
`Input.dispatchTouchEvent`; the CRA dev proxy leaks EventSource sockets, so the capture script unloads
each page (`about:blank`) and disables the back/forward cache; enable focus emulation or focus events
never fire in a background headless page.
