# Execution Prompt — Blog / Press Kit v2 (subagent-driven)

Paste everything in the fenced block below into a fresh Claude Code session at the repo root
(`purduesearch.github.io`) to execute both plans with subagents.

There are **two plans**, run in order:
1. `docs/superpowers/plans/2026-07-22-blog-presskit-v2-fixes.md` — icons, expand button, delete, image proxy, richer press-kit content, exports.
2. `docs/superpowers/plans/2026-07-22-blog-presskit-section-builder.md` — the Section Page Builder (blog + press kit) + per-post theme.

Run plan 1 first (it heals images and adds `pmDocToMarkdown`'s section fallthrough that plan 2 uses).

---

```
Execute two implementation plans, in order, using the superpowers:subagent-driven-development skill:
  1. docs/superpowers/plans/2026-07-22-blog-presskit-v2-fixes.md
  2. docs/superpowers/plans/2026-07-22-blog-presskit-section-builder.md
The design spec for both is docs/superpowers/specs/2026-07-22-blog-presskit-v2-design.md.

INVOKE the superpowers:subagent-driven-development skill first and follow it exactly:
- YOU are the controller. Read plan 1 ONCE, extract every task (Phases 1-6: tasks 1.1, 2.1, 3.1,
  3.2, 3.3, 4.1, 4.2, 4.3, 5.1, 6.1, 6.2, 6.3) with FULL text + code blocks, and create a
  TodoWrite with one item per task. Do plan 2 the same way after plan 1 is fully green
  (Phases 1-5: tasks 1.1, 2.1, 2.2, 2.3, 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2).
- Dispatch a FRESH general-purpose implementer subagent per task. Paste the task's full text +
  code into the subagent prompt (implementer-prompt template) — never make a subagent read the
  plan file. Add scene-setting context so it knows where the task fits.
- After each implementer reports DONE: dispatch a spec-compliance reviewer subagent, then (only
  once spec review is OK) a code-quality reviewer subagent. Loop fixes with the SAME implementer
  until both reviews pass, then mark the task complete and move on.
- Execute continuously — do not stop to check in between tasks. Only stop for a BLOCKED status you
  can't resolve, a genuine ambiguity, or all-tasks-complete.

BRANCH: We are already on branch `feat/blog-presskit-v2` (the spec + both plans are committed
there). Do ALL work on this branch. DO NOT switch to or commit on `main`. (Optional: create a git
worktree for isolation via superpowers:using-git-worktrees; the existing branch is fine.)

MODEL SELECTION (per the skill — cheapest that works):
- Implementer subagents: use Sonnet (`claude-sonnet-5`). The plans are fully specified with complete
  code. If an implementer returns BLOCKED for reasoning (not missing context), re-dispatch that task
  on Opus (`claude-opus-4-8`). The React NodeView tasks in plan 2 (Phase 3-4) are the most involved —
  if a Sonnet implementer struggles with TipTap NodeView wiring, escalate that task to Opus.
- Reviewer subagents (spec + quality) and the final whole-branch review: use Opus.

PER-TASK VERIFICATION each implementer MUST run and report output for:
- Backend tasks: `cd backend && npx tsc --noEmit` (must be clean).
- Backend pure-logic tests where the task adds/changes them:
    `cd backend && npx tsx src/services/pressKitService.test.ts`
    `cd backend && npx tsx src/services/blogRender.test.ts`
    `cd backend && npx tsx src/services/docToMarkdown.test.ts`
  (each must print "N passed, 0 failed").
- Frontend tasks: from repo root `npm run build` (must compile successfully).
- Each task ends with the git commit specified in the plan.

DATABASE / API-KEY / DEPLOY CAVEATS (this environment has no DB, GEMINI_API_KEY, Drive creds, or
Chromium sandbox):
- Both plans have a `prisma migrate dev` step (fixes plan has none; section-builder Task 1.1). It
  will fail to connect with no DB. That's expected: still run `npx prisma validate && npx prisma
  generate` and `npx tsc --noEmit`, commit the schema, and note that the migration folder must be
  generated later in an environment with DB access (deploy auto-runs `prisma migrate`).
- Fixes-plan Task 6.2 installs `puppeteer` (downloads Chromium). If the install/download fails in
  this environment, still add the dependency to package.json and write the code; note the download
  as a deploy-time step. Do NOT attempt to actually render a PDF here.
- All "manual verification (human)" steps (live co-editing, generate, publish, export, image
  round-trip, mobile responsiveness) require a running backend + DB + GEMINI + Drive. Do NOT attempt
  them. Leave them unchecked and flag them in your final summary as manual steps for the human.
- Env var `PUBLIC_API_BASE_URL` (fixes plan) — do not set it here; note it in the summary as a
  required deploy env var for legacy cross-origin image healing and PDF/DOCX image fidelity.

REPO CONVENTIONS the subagents must honor (state these in each implementer prompt):
- Backend is ESM: every relative import ends in `.js` even for `.ts` files.
- API handlers read `req.memberId`, never `req.session.memberId`.
- New CSS is appended to the bottom of public/search-theme.css with `cpm-blog-`/`presskit-` prefixes.
- CRITICAL sync invariant (plan 2): any new TipTap node must appear in ALL THREE of
  `blogExtensions()` (src/components/clubpm/blog/BlogEditor.jsx), `blogCollabExtensions()`
  (backend/src/collab/blogSchema.ts), and `renderNode()` (backend/src/services/blogRender.ts).
- Do not remove/replace the `mxgraph` dependency; do not touch unrelated code.

When BOTH plans are complete and both reviews pass on each task: dispatch one final Opus code-review
subagent over the whole branch diff (base = the commit before the first task, i.e. the spec/plan
commit `f5c55574`... use `git merge-base main HEAD` if unsure), then STOP and report a summary. Do
NOT merge, push, or open a PR — invoke superpowers:finishing-a-development-branch to present
integration options and let me choose.
```

---

## Task inventory (for your reference — the controller extracts these from the plans)

### Plan 1 — Fixes & Exports

| # | Task | Files | Model |
|---|------|-------|-------|
| 1 | 1.1 Font Awesome 6 upgrade + verify | `public/index.html` | Sonnet |
| 2 | 2.1 Expand button gating | `OutreachHub.jsx` | Sonnet |
| 3 | 3.1 Blog delete UI | `BlogTab.jsx`, `BlogEditorPage.jsx`, CSS | Sonnet |
| 4 | 3.2 Press-kit delete route + client | `pressKit.ts`, `clubPmClient.js` | Sonnet |
| 5 | 3.3 Press-kit delete button | `PressKitPanel.jsx` | Sonnet |
| 6 | 4.1 Drive stream + proxy route + upload URL | `driveService.ts`, `public.ts`, `blog.ts` | Sonnet |
| 7 | 4.2 Renderer URL-heal (TDD) | `blogRender.ts` (+test), `public.ts`, `pressKitService.ts` | Sonnet |
| 8 | 4.3 Client image proxy | `clubPmClient.js`, `BlogImage.jsx` | Sonnet |
| 9 | 5.1 Richer generation (TDD) | `pressKitService.ts` (+test) | Sonnet |
| 10 | 6.1 Backend Markdown util (TDD) | `docToMarkdown.ts` (+test) | Sonnet |
| 11 | 6.2 Export deps + route | `package.json`, `pressKit.ts` | Sonnet |
| 12 | 6.3 Client download + Export menu | `clubPmClient.js`, `PressKitPanel.jsx`, CSS | Sonnet |

### Plan 2 — Section Page Builder

| # | Task | Files | Model |
|---|------|-------|-------|
| 1 | 1.1 Theme column + migration | `schema.prisma` | Sonnet |
| 2 | 2.1 Renderer branches (TDD) | `blogRender.ts` (+test) | Sonnet |
| 3 | 2.2 Collab schema mirror | `blogSchema.ts` | Sonnet |
| 4 | 2.3 Section + theme CSS (web+print) | `search-theme.css`, `pressKitService.ts` | Sonnet |
| 5 | 3.1 column/hero/statBand/cta nodes | 4 new `Blog*.jsx`, CSS | Sonnet / Opus |
| 6 | 3.2 section node + register set | `BlogSection.jsx`, `sectionNodes.js`, `BlogEditor.jsx` | Opus |
| 7 | 4.1 Section library popover | `BlogSectionLibrary.jsx`, `BlogEditor.jsx`, CSS | Sonnet |
| 8 | 4.2 Section settings panel | `BlogSectionSettings.jsx`, `BlogEditor.jsx`, CSS | Opus |
| 9 | 4.3 Theme bar + apply | `BlogThemeBar.jsx`, `BlogEditor.jsx`, `BlogEditorPage.jsx`, `BlogPost.jsx`, CSS, `blogService.ts`, `public.ts` | Opus |
| 10 | 4.4 Press-kit theme wiring | `PressKitPanel.jsx`, `pressKit.ts`, `pressKitService.ts` | Sonnet |
| 11 | 5.1 Section-based generation | `pressKitService.ts` | Sonnet |
| 12 | 5.2 Preview parity + verification | `BlogEditorPage.jsx` | Sonnet |
