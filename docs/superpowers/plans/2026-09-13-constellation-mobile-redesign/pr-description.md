# Constellation on phones: compact shell, daily workflows, dense views

Plan: `docs/superpowers/plans/2026-09-13-constellation-mobile-redesign.md`
Status and evidence: `…/2026-09-13-constellation-mobile-redesign/release-readiness.md`
Release, smoke test and rollback: `…/release-runbook.md`

> **Not cleared for release yet.** All automated gates pass; real iOS Safari / Android Chrome,
> real-account, screen-reader and member usability checks are still pending. See "Validation" and
> "Known limitations" below.

## What changes on a phone

Constellation (`/clubpm/*`) switches to a phone presentation when the viewport is under 768 CSS px,
or is a short touch-only landscape screen (under 1024 × 500). The condition is defined once
(`COMPACT_QUERY` in `src/clubpm/layout/compactLayout.js`) and mirrored exactly by the single compact
`@media` block in `public/clubpm-theme.css`.

- **Shell.** A header (page title or Back, Search, notification bell) and a five-item bottom bar —
  Home, Projects, Chat, Calendar, More — with persistent labels. Projects and More open sheets; every
  other destination (Outreach, Blog, Courses, Admin for admins, Profile, Quests, Shop, People & DMs,
  notification preferences, keyboard shortcuts, main site, sign out) is a labelled row in More. No
  navigation depends on hover. Sheets are in browser history: Back closes them, Forward reopens them.
- **Projects.** Tasks / Files / Chat / Insights under the header. Tasks are grouped by status with
  counts, My tasks / All tasks, search and one Filters sheet. Every row has explicit **Move** and
  **Assign** controls, so nothing needs dragging. Task detail and New task are full screen. Closing a
  task keeps the list's filters and scroll position. The Blocked group lists each category blocker
  with its responsible person and Edit / Resolve, and Move › Blocked asks what is blocking the task,
  as the desktop drop does. Project actions (edit, pin, timeline) live in the project sheet.
- **Home.** My work first, then the next event, my projects (with labelled Tasks/Files buttons), then
  progress and the supporting panels.
- **Chat and DMs.** `/clubpm/chat` stays on the channel list (desktop still opens the first channel).
  List → conversation → thread, one pane at a time, all URL-backed. People & DMs is linked from the
  list and from More. The composer stays above the bottom bar; while the software keyboard is open the
  bar (and, in project chat, the section row) steps aside. Drafts, failed-send retry and attachments
  survive remounts and rotation.
- **Calendar.** Opens on the agenda with a date picker, filters and Month access. Event detail, RSVP,
  permitted event/poll creation (with the existing public-event confirmation) are full screen.
- **Dense views.** Files has a labelled Source selector; Vault items, change requests and Drive
  previews open full screen. Insights has a section selector, a Chart/Data switch on every chart, a
  full-screen per-action AI review and a schedule-first Gantt with a contained timeline. Outreach uses
  a Section selector and stage lists with explicit Move. Blog/course editors get a compact toolbar plus
  a full "More formatting" sheet and a section picker. The course player gets collapsible contents and
  Previous/Next. Admin gets a jump list and card-style reward review. Profile, Shop, Challenges and the
  reward celebrations fit 320px. Login keeps every scope-justification and Limited Use section.
- **Walkthroughs.** Tour steps can carry phone overrides; the tour opens the right sheet before it
  measures, and every phone anchor is mounted once.

## What stays the same on desktop (≥768px)

Sidebar, topbar, breadcrumb, project sidebar tabs, status bins, assignee rail, drag and Ctrl/Shift
selection, bell dropdown, Ctrl+K palette box, multi-pane chat, and the keyboard shortcuts. Phase 5
compared 22 ClubPM routes at 1280 and 1440 px pixel-by-pixel against a build of the pre-redesign
commit, plus drag, shortcuts, load time, blocking time and listener counts (details in the readiness
report).

Desktop-visible changes that need reviewer sign-off:

1. The course player shows a Previous / Next row at every width.
2. Closing a task keeps `tab` / `view` in the URL (previously stripped).
3. The Outreach board uses `@dnd-kit` instead of `@hello-pangea/dnd` (same drag behaviour; the old
   package is no longer imported but is still in `package.json`).
4. The keyboard-shortcuts dialog and the task "···" menu gained accessible names; task comment,
   RSVP and course-completion buttons ignore a second activation while the first is in flight.
5. On screens ≤640px (including a narrow desktop window) the walkthrough card docks to the top when
   its target is in the lower half.

## Fixed during Phase 5 validation

- A task opened from the Dashboard could not be closed (desktop and phone) — a regression from the
  earlier close-keeps-`tab` change; fixed and covered by the HEAD-vs-branch check.
- Phone: category blockers can now be resolved, renamed/recoloured and reassigned, and Move › Blocked
  asks what is blocking the task.
- Phone: project chat gives the conversation the height (hero steps aside; composer stays visible
  with the keyboard open).
- Phone: bottom bar and section row stay inside landscape safe-area insets; 44px section buttons in
  short landscape; Outreach's floating button no longer covers the bar or the Send row; the task
  "···" menu stays on screen; 16px form text and 44px close buttons in legacy dialogs.
- Hardware keyboard: Tab/Escape inside task sub-dialogs no longer act on the full-screen task.
- `Saving…` on the RSVP button was mojibake; comment, RSVP and course completion ignore a same-tick
  second activation; task comment Send, task "···" and the shortcuts dialog have accessible names.

## Rollout switch

`REACT_APP_CLUBPM_COMPACT=off` (repository **variable**, read by `deploy.yml` at build time) ships the
desktop shell at every width. Per browser, `localStorage['pm-compact'] = 'on' | 'off'` overrides it.
Off removes the compact class and the `body.pm-m-compact` marker, so no compact CSS applies; Phase 5
verified the off build lays out exactly like the pre-redesign build on a phone. Full instructions and
what the switch does *not* undo: `release-runbook.md` §5.

## Validation

- Jest, anchor check, lint (unchanged 576-error baseline), icon check and production build — results
  in the readiness report.
- Headless Chrome with touch/viewport emulation against a fixture API, on production bundles:
  Phase 1–4 harnesses plus four Phase 5 harnesses (destination × viewport matrix, five journeys,
  dialogs, HEAD-vs-branch comparison). Evidence under `evidence/phase1…phase5/`.
- **Not yet done:** real iOS Safari and Android Chrome, real accounts on staging, VoiceOver/TalkBack,
  live collaborative editing, member usability sessions. The device checklist is in the readiness
  report §5.

## Known limitations (non-blocking, documented)

- Bulk task selection (Ctrl/Shift-click) has no phone equivalent; every bulk operation is still
  available one task at a time.
- Tablets 768–1023px in portrait keep the desktop layout, including its hover-expanded rail.
- The shell still remounts on every path change (pre-existing; separate change).
- Several legacy desktop dialogs use a state-only submit guard; real taps are protected by React's
  re-render, only a same-tick double activation is not.

## Out of scope / not included

Backend changes (none), the standalone `frontend/` app, and the unrelated working-tree edits under
`backend/**` and `FutureFeatures.txt`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
