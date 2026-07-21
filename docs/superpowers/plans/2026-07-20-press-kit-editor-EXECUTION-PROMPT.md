# Execution Prompt — Press Kit Editor (subagent-driven)

Paste everything in the fenced block below into a fresh Claude Code session at the repo root
(`purduesearch.github.io`) to execute the plan with subagents.

---

```
Execute the implementation plan at docs/superpowers/plans/2026-07-20-press-kit-editor.md using
the superpowers:subagent-driven-development skill. The design spec is
docs/superpowers/specs/2026-07-20-press-kit-editor-design.md.

INVOKE the superpowers:subagent-driven-development skill first and follow it exactly:
- YOU are the controller. Read the plan file ONCE, extract all 12 tasks (across 6 phases:
  1.1, 2.1, 2.2, 2.3, 3.1, 3.2, 4.1, 4.2, 5.1, 5.2, 6.1, 6.2) with their FULL text and code
  blocks, and create a TodoWrite with one item per task.
- Dispatch a FRESH general-purpose implementer subagent per task. Paste the task's full text +
  code into the subagent prompt (use the implementer-prompt template) — never make a subagent
  read the plan file. Add scene-setting context so it knows where the task fits.
- After each implementer reports DONE: dispatch a spec-compliance reviewer subagent, then (only
  once spec review is ✅) a code-quality reviewer subagent. Loop fixes with the SAME implementer
  until both reviews pass, then mark the task complete and move on.
- Execute continuously — do not stop to check in between tasks. Only stop for a BLOCKED status
  you can't resolve, a genuine ambiguity, or all-tasks-complete.

BRANCH: We are already on branch `feat/press-kit-editor` (the spec + plan are committed there).
Do all work on this branch. DO NOT switch to or commit on `main`. (Optional: create a git
worktree for isolation via superpowers:using-git-worktrees, but the existing branch is fine.)

MODEL SELECTION (per the skill — cheapest that works):
- Implementer subagents: use Sonnet (`claude-sonnet-5`). The plan is fully specified with complete
  code, so tasks are mechanical-to-integration. If an implementer returns BLOCKED for reasoning
  (not missing context), re-dispatch that task on Opus (`claude-opus-4-8`).
- Reviewer subagents (spec + quality) and the final whole-branch review: use Opus.

PER-TASK VERIFICATION each implementer MUST run and report output for:
- Backend tasks: `cd backend && npx tsc --noEmit` (must be clean).
- Backend pure-logic test (Task 2.2/2.3): `cd backend && npx tsx src/services/pressKitService.test.ts`
  (must print "N passed, 0 failed").
- Frontend tasks: from repo root `npm run build` (must compile successfully).
- Each task ends with the git commit specified in the plan.

DATABASE / API-KEY CAVEAT (this environment has no DB or GEMINI_API_KEY):
- Task 1.1 Step 4 (`prisma migrate dev`) will fail to connect. That is expected. Implementers
  should still run `npx prisma validate && npx prisma generate` (Step 3) and `npx tsc --noEmit`,
  then commit the schema. Note in the report that the migration folder must be generated later in
  an environment with DB access (deploy auto-runs `prisma migrate`).
- Task 6.2 Step 3 (manual live smoke test — co-editing, generate, publish→PDF) requires a running
  backend + DB + GEMINI_API_KEY. Do NOT attempt it. Leave it as an unchecked item and flag it in
  your final summary as a manual step for the human. All other Task 6.2 steps (tsc, pure test,
  npm run build) must still pass.

REPO CONVENTIONS the subagents must honor (state these in each implementer prompt):
- Backend is ESM: every relative import ends in `.js` even for `.ts` files.
- API handlers read `req.memberId`, never `req.session.memberId`.
- New CSS is appended to the bottom of public/search-theme.css with a `presskit-` prefix.
- Do not remove/replace the `mxgraph` dependency; do not touch unrelated code.

When all 9 tasks are complete and both reviews pass on each: dispatch one final Opus code-review
subagent over the whole branch diff (base = the commit before Task 1.1), then STOP and report a
summary. Do NOT merge, push, or open a PR — invoke superpowers:finishing-a-development-branch to
present integration options and let me choose.
```

---

## Task inventory (for your reference — the controller extracts these from the plan)

| # | Task | Files | Model |
|---|------|-------|-------|
| 1 | 1.1 Schema + models | `schema.prisma` | Sonnet |
| 2 | 2.1 AI section generator | `aiService.ts` | Sonnet |
| 3 | 2.2 Config + markdown (TDD) | `pressKitService.ts` (+test) | Sonnet |
| 4 | 2.3 Data + generation + render | `pressKitService.ts` | Sonnet |
| 5 | 3.1 REST router | `pressKit.ts`, `app.ts` | Sonnet |
| 6 | 3.2 Client helpers | `clubPmClient.js` | Sonnet |
| 7 | 4.1 Collab namespace | `pressKitCollab.ts`, `app.ts` | Sonnet |
| 8 | 4.2 BlogEditor prop | `BlogEditor.jsx` | Sonnet |
| 9 | 5.1 PressKitPanel | `PressKitPanel.jsx` | Sonnet |
| 10 | 5.2 Reports sub-tabs | `ProjectDetail.jsx` | Sonnet |
| 11 | 6.1 CSS | `search-theme.css` | Sonnet |
| 12 | 6.2 Verification | — | (controller) |

> Note: Tasks 2.1–2.3 are committed together (one commit at end of 2.3) per the plan — dispatch
> them as three sequential implementer runs but expect the single commit at 2.3. The table lists
> 12 rows because phases 2, 3, 5, 6 each contain two tasks; the plan groups them into the 6 phases.
