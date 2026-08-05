# C02 — The task, field by field

> CONTENT section · Constellation 101 · M2 · ~3 min read
> Reference companion to V02. The video explains what the fields *mean*; this is the page you come
> back to when you're mid-task and can't remember what a field actually does.

---

You just watched a task get taken apart. This page is the version you can scan.

Keep it open while you do the next two walkthroughs. Nothing here is memorisation material — the
useful skill is knowing which field to reach for, and that comes from having read the list once.

## Every field, and what it actually does

| Field | What it's for | What it changes downstream |
|---|---|---|
| **Title** | The outcome, in one line | It's what everyone sees on the board — the only field most people ever read |
| **Status** | TODO · IN_PROGRESS · BLOCKED · DONE | It *is* the column. Dragging the card and changing it here are the same operation |
| **Priority** | LOW · MEDIUM · HIGH · CRITICAL | Sorting and filtering only. Priority never blocks or forces anything |
| **Assignees** | Who is doing it | Puts it on their dashboard; they get notified when assigned |
| **Due date** | A real commitment | Reminders before, escalation after. Leave it empty rather than invent one |
| **Description** | Scope, non-scope, acceptance criteria | Read by teammates *and* by every AI feature in the project |
| **Subtasks** | Pieces of this task | Close with the parent. A progress count appears on the card |
| **Dependencies** | Other tasks that must finish first | **Enforced** — an open dependency prevents Done |
| **Blockers** | A shared, project-wide obstacle | **Enforced** — attaching one forces BLOCKED |
| **Milestone** | Which deadline this belongs to | Feeds that milestone's progress and health |
| **Attachments** | Files, links, Drive documents | Keeps the artefact next to the work |
| **Comments** | The conversation about *this* work | `@name` sends an in-app notification **and** a Slack DM |
| **Time logs** | Hours actually spent | Earns XP; over two hours in one entry goes to an officer to approve |
| **History** | Who changed what, when | Automatic. You never write to it, but you'll be glad it's there |

## The three fields people get wrong

**Priority is not urgency theatre.** It's a sorting signal. A board where every card is CRITICAL
sorts identically to a board with no priorities at all, except now nobody trusts the field. Most
tasks should be MEDIUM and stay there.

**A due date is a promise the system will hold you to.** Constellation reminds people before one and
escalates after one. A date you typed to look organised produces a notification you learn to ignore,
and once you're ignoring those you're ignoring the real ones too.

**The description is read by more than humans.** Project Q&A, action-plan suggestions, and deadline
suggestions all build their prompts from task descriptions — not titles. A task with an empty
description is invisible to every one of those features. This is the cheapest possible reason to
write two sentences.

## Subtask or dependency?

The most-missed distinction in this course, and Q02 tests it twice.

> **Subtask** — a piece of *this* task. It lives inside it and closes with it.
> "Order the connectors" inside "Wire the power distribution board."
>
> **Dependency** — a *different* task that must finish first. Constellation refuses to let you
> mark a task Done while a dependency is still open.
> "Mount the battery" depends on "Fabricate the battery tray."

If the work would still need doing even if this task were cancelled, it's a dependency. If it would
evaporate with the task, it's a subtask.

## Writing a title that works

A title should say **what will be true when it's finished.**

| Don't | Do |
|---|---|
| Wiring harness | Route and secure the main wiring harness through bay two |
| Fix the thing | Correct the tolerance on the mounting bracket to ±0.2 mm |
| Talk to Priya | Get Priya's sign-off on the revised antenna placement |
| URGENT!! harness stuff | Route and secure the main wiring harness through bay two |

The test: read the title and ask *could two people disagree about whether this is done?* If yes, the
title isn't finished yet.

## Four shortcuts worth knowing on day one

- **Describe it in plain English.** The New Task form can take a sentence — "wire the PDB by Friday,
  high priority, give it to me" — and fill in the fields from it. Check what it produced; it's a
  drafting aid, not an oracle.
- **Create one from a screenshot.** A photo of a whiteboard after a meeting becomes tasks.
- **Duplicate detection.** Constellation checks new tasks against existing ones and warns you before
  you create the same work twice.
- **AI enrich.** On a thin task, it drafts a description, acceptance criteria, and a definition of
  done. It's a starting point you edit — it doesn't know what your project cares about.

## The one habit that matters

**Change the state when the state changes**, not when someone asks.

Everything else in Constellation — the board, the milestone health, the reminders, the reports an
officer writes at the end of a semester — is downstream of tasks being honest about where they are.
A board is only worth reading if the people on it move their cards.

Next, two walkthroughs: one reading a real board, one where you create, work, and finish a task of
your own.
