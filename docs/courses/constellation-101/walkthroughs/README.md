# Constellation 101 — walkthrough rationale

Why each tour is shaped the way it is. The `.steps.json` files beside this are what actually runs;
this is the reasoning, so that whoever edits them next knows which lines are load-bearing.

**6 tours · 59 steps · 10 required real API calls (plus 1 optional), all against the learner's own
training project.**

| Tour | Steps | Entry | Sandbox? | Real calls |
|---|---|---|---|---|
| `first-look` | 8 | `/clubpm` | No | 0 |
| `board-basics` | 10 | training project | Yes | 0 |
| `your-first-task` | 13 | training project | Yes | 6 |
| `blocked-and-unblocked` | 11 | training project | Yes | 4 |
| `rewards-tour` | 8 | `/clubpm/challenges` | No | 1 (optional) |
| `comms-tour` | 9 | `/clubpm/notifications` | No | 0 |

## The shape of the arc

The three read-only tours (`first-look`, `board-basics`, `comms-tour`) exist to build a map. The two
hands-on ones (`your-first-task`, `blocked-and-unblocked`) exist to build a habit. They're
deliberately not interleaved: a learner who is still working out where things are cannot also be
learning what to do, and a tour that asks for both at once produces someone who clicked correctly
eight times and remembers nothing.

`rewards-tour` sits between the two modes because claiming a quest is a real action with no
consequences, which makes it a safe place to end.

## Tour-by-tour

### `first-look` — 8 steps, read-only

Runs on the learner's **real dashboard**, not the training project, and that's the point: the first
thing they see should be their own account, so the product feels like theirs before it feels like a
lesson.

Nothing here mutates. The one `click` step (the notification bell) is a disclosure, not a change.

`streak` is marked `optional` because a brand-new member's streak widget may not have rendered any
history yet, and a step that spotlights an empty box teaches nothing.

### `board-basics` — 10 steps, read-only, training project

Step 1 does one job and it is the most important line in the whole course: **tell the learner this
project is disposable.** People are careful with software they think is real, and careful people
don't click things. The tour is worth less if they're worried.

Steps 3–6 walk the four columns in board order rather than in logical order. Reading left to right
matches what their eyes will do forever after.

The `IN_PROGRESS` copy plants "a card that sits here for three weeks is usually blocked and nobody
said so" — which is the actual failure mode this whole system is trying to catch, seeded before the
learner has the vocabulary for it. Module 3 pays it off.

### `your-first-task` — 13 steps, 6 real API calls

The module the engine exists for. The learner creates, owns, dates, specifies, starts, discusses,
logs, and finishes one task, in that order, with six of those being genuine writes.

Step 4 (`open-it`) is load-bearing scaffolding, not filler. **Creating a task does not open it** —
the New Task form takes a title, a priority and a date, then closes. Everything after it lives in a
different component (`TaskModal`, reached by clicking the card), so without an explicit click step
the next five steps hunt for a modal that was never opened and degrade one after another. Any step
sequence that crosses from `task.create.*` to `task.modal.*` needs a spotlit click in between.

The status changes are made in the modal rather than by dragging, for the same reason: dragging
means closing the modal, and the steps after it need the modal open. The copy still says dragging is
the same operation, because it is.

Three copy decisions worth preserving:

- **"Not 'agenda.'"** — the title lesson lands only if the counter-example is right there.
- **"an invented deadline just trains you to ignore reminders"** — the honest reason not to fill in a
  due date reflexively. This is the habit that quietly ruins a board.
- **"here it's suppressed, because practice work shouldn't pay"** — the learner *will* notice no XP
  arrived. Saying so is better than letting them conclude the reward system is broken.

The final step advances on `next` rather than an API call, so the tour ends on a summary instead of
on a mechanical action.

### `blocked-and-unblocked` — 11 steps, 4 real API calls

Structured as a contrast, because dependency-versus-blocker is the single most confused pair in the
product — Q02 and Q05 both test it.

The learner adds a dependency, **is refused** when trying to finish (step 4 is the only step in the
course whose purpose is to make something fail), removes it, then attaches a blocker and watches the
card relocate itself. Seeing both mechanisms enforce themselves is what makes the distinction stick
where a definition wouldn't.

Step 4 advances on `next`, not on the failed request — a rejected call is not a success and must not
be wired to `api`.

Steps 7–9 send the learner back to the board and then back into the task. `reopen-task` exists for
the same reason as `your-first-task`'s `open-it`: `resolve` needs the task modal, and the two steps
before it asked the learner to close it. A step that silently assumes a modal is open is the most
common way these files break.

The blocker this module attaches is the seeded "Waiting on the machine shop". `ensureTrainingProject`
re-creates it, and un-resolves it, every time the sandbox is entered — resolving a category is
otherwise a one-way door, and a learner who took this module once could never take it again.

### `rewards-tour` — 8 steps

`claim` is `optional` for an honest reason: whether a claimable quest exists depends on what the
learner has done today, and we cannot guarantee one. A required step that some learners physically
cannot complete is a broken tour.

The two lines that matter here are both about limits — "cosmetics only," and "rank is recognition,
not permission." Members who believe rank gates features start optimising for XP instead of for work,
which is the exact failure this system is trying to avoid.

### `comms-tour` — 9 steps

Ends the course by closing V01's loop: Constellation comes to you. The preferences step deliberately
argues *against* muting rather than just describing the toggles, because the member who mutes
everything is the member who quietly stops being asked to do things.

The last step introduces AI insights with "treat them as a colleague's opinion: often useful,
occasionally wrong, never the final word." Setting that expectation once, early, is cheaper than
undoing overconfidence later.

## Authoring rules

- **Every `api` step must name a call that step actually causes.** Wiring one to a call the learner
  makes incidentally produces a tour that skips ahead on its own.
- **Name the path the client actually calls, not the one the docs describe.** Creating a board task
  is `POST /api/projects/:id/tasks`, not `POST /api/tasks`; the step waits forever on the wrong one
  and the static anchor check cannot see it. Grep the client before writing an `api` step.
- **Never wire `api` to a request you expect to fail.** Use `next` and describe the failure.
- **If an anchor only exists after a click, spend a step on that click.** The learner gets a
  spotlight and the following steps get their element. "Open the task again" buried in a body is not
  a prompt — nothing is highlighted, so there is nothing to obey.
- **Mark a step `optional` whenever its anchor depends on data you cannot guarantee** — an empty
  widget, a quest that may not exist, a repo that may not be linked.
- **Copy is second person, present tense, and says why.** "Assign yourself. An unassigned task is a
  wish." The instruction alone is forgettable; the reason is what survives.
- **Keep bodies under about 40 words.** The coach card is small and a wall of text gets skipped, at
  which point the step has taught nothing and still cost a click.
