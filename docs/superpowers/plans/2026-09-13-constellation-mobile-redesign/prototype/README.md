# Constellation phone prototype (Phase 0)

An interactive, dependency-free model of the proposed phone navigation. **Fixture data only** — it
never calls the Constellation API, and nothing here is imported by the production app (it lives under
`docs/`, outside `src/` and `public/`, so neither the CRA build nor `check-tour-anchors.js` sees it).

## View it

From the repository root:

```bash
node docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/prototype/serve.mjs
```

Then open:

- **Review frames** (320 / 390 / 844×390 landscape / 768 boundary side by side, with persona and data
  controls): `http://localhost:4410/docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/prototype/review.html`
- **Single app** (use DevTools device mode, or a phone): `http://localhost:4410/` (redirects to the prototype)
- **On a real phone on the same Wi-Fi**: the server prints `http://<LAN-IP>:4410/...` lines. Windows may
  ask to allow Node through the firewall. The server is read-only and serves only this folder and the
  Font Awesome package; stop it with Ctrl+C.

Opening `index.html` directly from disk (`file://`) also works in Chromium browsers; Font Awesome loads
from the repo's `node_modules/@fortawesome/fontawesome-free` (run `npm install` first if it is missing).
Fonts come from Google Fonts when online and fall back to system fonts offline.

## Scenario controls (URL query)

| Param | Values | Effect |
| --- | --- | --- |
| `persona` | `member` (default), `admin` | Admin row + three badges in More, New project in the picker, admin-only calendar import |
| `projects` | `few` (default, includes a very long name and an empty project), `many` (26), `none`, `error` | Picker volume, empty states, load-error + Retry |
| `compact` | `1` | Force the phone layout (needed for the landscape review frame on a mouse-driven desktop, where `(pointer: coarse)` is false) |
| `kb` | `1` | Treat a focused text field as "software keyboard open" (desktop has no keyboard to shrink the viewport) |

Routes live in the hash and mirror production paths, e.g. `index.html?persona=admin#/clubpm/projects/p1?task=p1-t3`.

## What to try

1. **All five bottom items**: Home, Projects (sheet), Chat, Calendar, More (sheet). Exactly one is
   highlighted per screen; Projects/More show an expanded state while open.
2. **Home → task**: tap a My work row → full-screen task → change Status or Assign (picker sheet over
   the task) → Back returns to Home at the same scroll position. The round status button on each row
   opens a status sheet without leaving the list.
3. **Projects**: switch projects with a search (`projects=many`), star/unstar, try `projects=error` → Retry.
   The long project name ellipsizes in the header and wraps to two lines in the picker.
4. **Project Tasks**: My/All, search, Filters (count), New task (validation; the draft survives closing),
   collapsible status groups with counts, Actions › Select tasks (bulk bar replaces Ctrl/Shift-click),
   Actions › Timeline (today's URL-only Gantt route).
5. **Chat**: the list is the destination (no auto-open), People & DMs card at the top, browse/preview/join
   public channels, conversation with composer above the bottom bar; a draft survives Back.
6. **More**: account row, Progress & rewards, People & DMs, Notifications + Preferences, club tools,
   Admin (admin persona), Help, Main site, separated Sign out.
7. **Back/Forward and keyboard**: browser Back closes sheets before leaving a page; Escape closes the
   top layer; focus returns to the button that opened it; Tab stays inside open sheets.
8. **Breakpoint**: widen the window past 767px — the desktop note replaces the phone UI; narrow it again
   and drafts/filters are still there. Rotate a phone for the landscape layout.

Destinations outside the five primary journeys (Outreach, Blog, Courses, Admin, Profile, Shop, Quests,
Notification preferences, Help, Timeline, file detail) render a labelled stand-in page naming the real
route, the phase that adapts it, and what must remain reachable.

## Automated checks

With the server running:

```bash
node docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/scripts/check-prototype.mjs
```

Drives headless Chrome with touch emulation (taps by coordinate, so a covered control fails), writes
`../evidence/prototype/report.json` and screenshots. Last run: **205 passed, 0 failed, 0 page errors**.

## Files

| File | Role |
| --- | --- |
| `index.html` | shell page (prototype ribbon, containers) |
| `proto.css` | tokens copied from `public/clubpm-theme.css :root`; phone layout; landscape tweaks |
| `proto.js` | router, layout condition, overlay stack, screens, sheets, keyboard heuristic |
| `fixtures.js` | all fixture data and personas |
| `review.html` | multi-size review page |
| `serve.mjs` | read-only static server (prototype folder + Font Awesome only) |

Not production code: string-built HTML and a hash router keep it dependency-free. Phase 1 implements
the contracts (`../contracts.md`) in React inside `AppShell`, not by porting this file.
