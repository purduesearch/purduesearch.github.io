# Execution Prompt — Blog AI + Review Layer (Opus 5 Low subagents)

Paste the fenced block below into a **fresh Claude Code session** at the repo root
(`purduesearch.github.io`).

## Before you paste

1. **Set the session model to Opus 5 Low** (`/model`, pick Opus 5, low reasoning effort).
   This matters: reasoning effort is **not** an `Agent` tool parameter — it comes from an agent
   definition's frontmatter, or is inherited from the parent session. The prompt below tells the
   controller to **omit** the `model` override so every subagent inherits Opus 5 Low. Setting the
   session model is therefore the only thing that actually makes the subagents low-effort.

   *Alternative, if you'd rather the controller run at higher effort:* create
   `.claude/agents/impl-opus-low.md` with frontmatter `model: opus` plus your harness's
   low-reasoning-effort key, then change the two model lines in the prompt to dispatch
   `subagent_type: impl-opus-low`. The repo has no `.claude/agents/` directory today.

2. **Create and switch to the branch** — the prompt assumes you are already on it:

   ```bash
   git checkout -b feat/blog-ai-review
   git add docs/superpowers/specs/2026-07-26-blog-ai-review-layer-design.md \
           docs/superpowers/plans/2026-07-26-blog-ai-review-layer.md \
           docs/superpowers/plans/2026-07-26-blog-ai-review-layer-EXECUTION-PROMPT.md
   git commit -m "docs: spec + plan for blog AI review layer"
   ```

   The spec, plan, and this prompt are currently **uncommitted on `main`**. Commit them on the
   branch first so the final review diff has a clean base.

---

```
Execute the implementation plan at docs/superpowers/plans/2026-07-26-blog-ai-review-layer.md using
the superpowers:subagent-driven-development skill. The design spec is
docs/superpowers/specs/2026-07-26-blog-ai-review-layer-design.md.

INVOKE the superpowers:subagent-driven-development skill first and follow it exactly.

CONTROLLER ROLE (you):
- Read the plan ONCE. It has 17 tasks, numbered "Task 1" through "Task 17". Extract each task's
  FULL text including every code block, and create a TodoWrite with one item per task.
- Dispatch a FRESH implementer subagent per task, in numerical order. Paste the task's complete
  text and code into the subagent prompt. NEVER tell a subagent to go read the plan file — it must
  receive everything it needs inline, plus scene-setting context for where the task fits.
- After each implementer reports DONE: dispatch a spec-compliance reviewer subagent, then (only
  once spec review passes) a code-quality reviewer subagent. Loop fixes with the SAME implementer
  until both reviews pass, then mark the task complete and move on.
- Execute continuously. Do not stop to check in between tasks. Stop only for a BLOCKED status you
  cannot resolve, a genuine ambiguity in the plan, or all-tasks-complete.

MODEL SELECTION — IMPORTANT:
- Do NOT pass a `model` parameter on any Agent call. Every subagent must INHERIT this session's
  model (Opus 5 Low). This is deliberate: the plan ships complete, verbatim code, so implementers
  are transcribing and verifying, not designing.
- Exception: if a task returns BLOCKED twice for REASONING (not for missing context), re-dispatch
  that one task with `model: "opus"` and say in the prompt that it needs careful reasoning. Tasks
  4, 5, 13 and 15 are the likeliest candidates — they involve ProseMirror position arithmetic,
  schema mirroring, and decoration plugins.

BECAUSE IMPLEMENTERS ARE LOW-EFFORT, every implementer prompt MUST say:
- "Use the code in this prompt VERBATIM. It is already written and reviewed. Do not redesign it,
  do not 'improve' it, do not rename anything. If the code does not compile, report the exact
  error rather than inventing a fix."
- "Do not touch files outside the ones this task lists."
- "If something in this task contradicts what you find in the codebase, STOP and report BLOCKED
  with the specific contradiction. Do not guess."

BRANCH: You are already on `feat/blog-ai-review`. Do ALL work there. Do NOT switch to or commit on
`main`. Each task ends with the exact git commit specified in the plan.

PER-TASK VERIFICATION each implementer MUST run and report the actual output of:
- Any backend change: `cd backend && npx tsc --noEmit` (must be silent).
- After ANY edit to backend/prisma/schema.prisma: `cd backend && npx prisma generate` BEFORE
  running tsc. A stale Prisma client reports phantom errors on fields that do exist.
- Backend tests the task creates or changes (each must print "N passed, 0 failed"):
    cd backend && npx tsx src/services/blogThreadService.test.ts     (Task 2)
    cd backend && npx tsx src/services/blogRender.test.ts            (Task 5)
    cd backend && npx tsx src/services/blogSchemaContract.test.ts    (Task 5)
- Frontend tests the task creates (Tasks 4, 13):
    npx react-scripts test --watchAll=false --testPathPattern=<name>
- Any frontend change: `npm run build` from the repo root (must print "Compiled successfully").
- An implementer that cannot produce this output has NOT finished. It must report BLOCKED with the
  failing output rather than claiming DONE.

ENVIRONMENT CAVEATS:
- Task 1 runs `npx prisma migrate dev --name blog_threads`. backend/.env exists, so this may
  succeed. VERIFY rather than assume: if the DB is unreachable, still run
  `npx prisma validate && npx prisma generate`, commit the schema change, and note in the task
  report that the migration folder must be generated later in an environment with DB access.
  Do NOT fabricate a migration SQL file by hand.
- Every "verify in the browser" step (Tasks 6, 8, 9, 12, 14, 15, 17) needs a running backend, a
  DB, and GEMINI_API_KEY. If those are not available, do NOT attempt them and do NOT claim they
  passed. Leave them unchecked and list them in your final summary as manual steps for the human.
  This applies especially to Task 17 Step 3 (the publish-path check) — it is the single most
  important verification in the plan and a human must run it.
- Curl-based endpoint checks (Tasks 3, 12) need a running backend and a session cookie. Same rule:
  skip and flag rather than fake.

REPO CONVENTIONS every implementer prompt must state:
- Backend is ESM: every relative import ends in `.js`, even when importing a `.ts` file.
- API handlers read `req.memberId`, NEVER `req.session.memberId` — session reads are undefined for
  Bearer-token users and silently break them.
- New CSS goes at the bottom of public/clubpm-theme.css, never public/search-theme.css.
- Icons are Font Awesome classes only: <i className="fas fa-..." aria-hidden="true" />. No emoji.
- No new runtime dependencies. BubbleMenu comes from @tiptap/react/menus, already installed.
- Components are .jsx, PascalCase, hooks only, plain JS (no TypeScript on the frontend).

THE CRITICAL INVARIANT — repeat this verbatim in the prompts for Tasks 4, 5 and 6:
  Any mark or node added to the editor must exist in ALL THREE of:
    1. blogExtensions() in src/components/clubpm/blog/BlogEditor.jsx
    2. backend/src/collab/blogSchema.ts (the Hocuspocus schema mirror)
    3. backend/src/services/blogRender.ts (the publish-time renderer)
  Missing from (2) breaks the Yjs -> TipTap JSON conversion and corrupts the contentJson snapshot.
  Missing from (3) leaks review artifacts onto the PUBLIC website. Both failures are SILENT.
  Task 5's extended blogSchemaContract.test.ts is what catches drift — it must pass.

NATURAL CHECKPOINT: Tasks 1-9 deliver a complete human review system with zero AI. After Task 9
passes both reviews, post a short status summary before continuing to Task 10, so the human can
interrupt if they want to stop there. Then keep going without waiting.

WHEN ALL 17 TASKS ARE COMPLETE and both reviews pass on each:
- Dispatch ONE final code-review subagent with `model: "opus"` over the whole branch diff
  (base: `git merge-base main HEAD`).
- Then STOP and report a summary listing: tasks completed, tests run with their output, every
  verification step you skipped because the environment could not support it, and any BLOCKED
  items.
- Do NOT merge, push, or open a PR. Invoke superpowers:finishing-a-development-branch to present
  integration options and let the human choose.
```

---

## Task inventory (controller reference — it extracts these from the plan itself)

| # | Task | Files | Verification |
|---|------|-------|--------------|
| 1 | Prisma schema — threads, comments, enums | `schema.prisma` | `prisma generate` + `tsc` |
| 2 | Thread service + pure permission predicates | `blogThreadService.ts` (+test) | `tsx` test, 12 checks |
| 3 | Thread REST routes | `blogThreads.ts`, `app.ts` | `tsc` + curl (needs backend) |
| 4 | Suggestion marks + commands | `suggestionMarks.js` (+test) | jest, 6 tests |
| 5 | **Collab schema + renderer lockstep** | `blogSchema.ts`, `blogRender.ts`, 2 tests | both `tsx` tests |
| 6 | Client helpers + register marks | `clubPmClient.js`, `BlogEditor.jsx` | `npm run build` |
| 7 | Review CSS (all of it, one pass) | `clubpm-theme.css` | `rg` check vs search-theme.css |
| 8 | Selection bubble | `BlogSelectionBubble.jsx`, `BlogEditor.jsx` | build + browser |
| 9 | Thread card + list, panel wiring | 2 new, `BlogAnnotationsPanel.jsx`, `BlogEditorPage.jsx` | build + browser |
| — | **Checkpoint: human review system complete, no AI yet** | | |
| 10 | Gemini fast lane | `geminiService.ts` | `tsc` |
| 11 | Blog AI service | `blogAiService.ts` | `tsc` + flattener spot-check |
| 12 | Blog AI routes | `blogAi.ts`, `app.ts`, `clubPmClient.js` | `tsc` + build + curl |
| 13 | Quote matching | `aiQuoteMatch.js` (+test) | jest, 8 tests |
| 14 | AI panel | `BlogAiPanel.jsx`, `BlogEditorPage.jsx`, `BlogEditor.jsx` | build + browser |
| 15 | Inline autocomplete | `blogAutocomplete.js`, `BlogEditor.jsx` | build + browser |
| 16 | Author notifications | `blogThreadNotify.ts`, `blogThreads.ts` | `tsc` |
| 17 | Full-suite verification | none | all tests + publish-path check |

## Where a low-effort implementer is most likely to slip

Worth knowing when you read the task reports:

- **Task 4** — `findMarkRanges` must merge adjacent text nodes sharing a mark. The test covers it;
  an implementer that "simplifies" the merge will fail that test rather than silently break, which
  is the point of having it.
- **Task 5** — the three edits are in three different files and the contract test greps for exact
  patterns (`reviewMarkMirror("commentMark")`, `case "commentMark":`). Renaming anything breaks the
  guard. This is the task to escalate to full Opus if it stalls.
- **Task 13** — `normalizedIndex` maps normalized offsets back to raw document positions. Fiddly,
  fully specified, and covered by 8 tests including two that must return `null`.
- **Task 15** — the ProseMirror decoration plugin invalidates ghost text on `docChanged` or
  `selectionSet`. An implementer that drops that guard produces ghost text stuck at a stale caret,
  which the browser check in Step 4 catches.

## Things this prompt deliberately does not do

- **No worktree.** The plan touches ~20 files across frontend and backend with sequential
  dependencies; a branch is sufficient and simpler. Add `superpowers:using-git-worktrees` yourself
  if you want the isolation.
- **No merge, push, or PR.** The controller stops at a summary.
- **No faked verification.** Browser and curl steps are explicitly skipped-and-flagged rather than
  guessed at, so the final summary tells you exactly what still needs a human.
