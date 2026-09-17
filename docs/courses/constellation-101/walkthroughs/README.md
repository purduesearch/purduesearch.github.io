# Constellation 101 — walkthrough rationale

Why each tour is shaped the way it is. The `.steps.json` files beside this are what actually runs;
this is the reasoning, so that whoever edits them next knows which lines are load-bearing.

**6 tours · 60 steps · 10 required real API calls (plus 1 optional), all against the learner's own
training project.**

| Tour | Steps | Entry | Sandbox? | Real calls |
|---|---|---|---|---|
| `first-look` | 8 | `/clubpm` | No | 0 |
| `board-basics` | 10 | training project | Yes | 0 |
| `your-first-task` | 13 | training project | Yes | 6 |
| `blocked-and-unblocked` | 11 | training project | Yes | 4 |
| `rewards-tour` | 8 | `/clubpm/challenges` | No | 1 (optional) |
| `comms-tour` | 10 | `/clubpm/notifications` | No | 0 |

## Phone and desktop

Constellation has two shells: the desktop sidebar + topbar, and a phone layout (bottom bar with
Home / Projects / Chat / Calendar / More, a compact header with Search and the bell, and sheets for
Projects and More). A step's optional `compact` object replaces its anchor and copy on the phone
shell; `compact.reveal` opens the More or Projects sheet before the step looks for its target.
`scripts/check-tour-anchors.js` refuses a step that would have nothing to point at on either shell.
Phone copy says "tap", never "click", and never tells the learner to drag.

| Tour | Phone overrides |
|---|---|
| `first-look` | `the-rail` → `nav.bar` (the bottom bar); `dashboard-link` says Home; `xp` and `streak` reveal More; `notifications` says tap (the phone bell opens the Notification Center page rather than a dropdown); `projects-next` points at the Projects button |
| `comms-tour` | `open-social-group` → `nav.chat`, advancing on Next: the phone has no Social group — Chat and Calendar sit on the bar and the Chat landing screen begins with People & DMs (also in More); `to-calendar` / `back-to-dash` only re-place the card |
| `rewards-tour` | `to-shop` and `to-profile` reveal More |

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

Nothing here mutates. The one `click` step (the notification bell) is a disclosure, not a change —
on desktop it opens the dropdown; on a phone the bell is a link to the Notification Center, and the
next step's `/clubpm` route brings the learner straight back.

On a phone the XP bar and the streak live in More, so those two steps open the More sheet first
(`compact.reveal: "more"`) and the sheet closes again when the tour moves on.

`streak` is marked `optional` because a brand-new member's streak widget may not have rendered any
history yet, and a step that spotlights an empty box teaches nothing.

### `board-basics` — 10 steps, read-only, training project

Step 1 does one job and it is the most important line in the whole course: **tell the learner this
project is disposable.** People are careful with software they think is real, and careful people
don't click things. The tour is worth less if they're worried.

Steps 3–6 walk the four statuses in board order rather than in logical order. Desktop presents them
as columns; phones present the same statuses as counted, collapsible groups.

The phone version points assignment at the labelled **Assign** control on a task row. It must never
target the desktop-only member chip rail or teach dragging as required interaction.

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

The status changes are made in task detail rather than by dragging, because the steps after them
need the detail open. Phone copy also names the explicit row-level Move control; desktop copy may
still explain that dragging performs the same mutation.

Three copy decisions worth preserving:

- **"Not 'agenda.'"** — the title lesson lands only if the counter-example is right there.
- **"an invented deadline just misleads the people planning around it"** — the honest reason not to
  fill in a due date reflexively. This is the habit that quietly ruins a board.
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

On phones `board.blocker.bin` resolves to the first blocked task row, because the compact list groups
by status. Per-task attach/detach stays inside task detail; the project-wide blocker controls
(responsible person, rename/recolour, Resolve for every attached task) are listed at the top of the
phone Blocked group, and Move › Blocked asks what is blocking the task, as the desktop drop does.

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

### `comms-tour` — 10 steps

Ends the course by closing V01's loop: Constellation comes to you. The preferences step deliberately
argues *against* muting rather than just describing the toggles, because the member who mutes
everything is the member who quietly stops being asked to do things.

On desktop the tour opens the Social group before pointing to Calendar because both groups in the
sidebar start collapsed. Social keeps the club's channels, member directory, and shared calendar
together. The phone shell has no Social group, so `open-social-group` instead spotlights Chat on the
bottom bar and names where the other two live (Calendar beside it, People & DMs at the top of Chat and in More); it advances
on Next rather than a click, because tapping Chat would navigate away from the step's screen.

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
