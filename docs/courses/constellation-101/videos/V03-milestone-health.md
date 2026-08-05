# V03 — Milestones on the timeline

| | |
|---|---|
| **Course / section** | Constellation 101 · M3 · "Milestones on the timeline" |
| **Runtime** | 1:50 |
| **Format** | Screen capture + VO |
| **Capture account** | Seeded demo member |
| **Prerequisite on screen** | 3 milestones with distinct due dates; linked tasks with mixed statuses |
| **Recorded** | ☐ |

> **Rewritten.** This script used to walk the Milestones & Updates tab and its health badge. That
> tab was removed from the project view, so the badge, the progress bar, and the expandable linked-task
> list have no on-screen surface any more. Milestones still exist — they are created through the API
> and they still render as markers on the Gantt — so the section now teaches the timeline instead.
> Health is still computed nightly by `refreshMilestoneHealth`; it is simply not displayed.

## Purpose

A new member will read the board as a flat pile of tasks and never ask what any of it is *for*.
This video gives them the other axis: the dates the club has committed to, and where to see them.

## Shot list

| Time | Screen | Action |
|---|---|---|
| 00:00–00:22 | Project board, tasks tab | Hold, then pan across the columns |
| 00:22–00:50 | Gantt view | Switch views; hold on the three milestone markers |
| 00:50–01:20 | Gantt, one marker | Point at a marker whose date is close to open work |
| 01:20–01:44 | Gantt, full timeline | Pull back, show all three in sequence |
| 01:44–01:50 | Gantt | Hold, fade |

## Visual edits

This video carries more weight than its 1:50 suggests, because the surface it teaches is sparse —
markers on a timeline with no health badge to point at. The edits do the work the removed UI used
to do.

| Time | Edit | Why |
|---|---|---|
| 00:10 | **Caption:** "every card here is *someone's week*" over the board pan | Sets up the missing axis: the board says what, not by when |
| 00:24 | **View-switch highlight** — briefly outline the Gantt control as it's clicked | Learners routinely never find this view. Show the click target explicitly |
| 00:30 | **Marker pins** drop in one at a time with their dates as labels, left to right | The three markers are small and easy to miss against the bars. Pinning them is the single most valuable edit in this script |
| 00:56 | **Vertical "today" line** drawn in, then a **shaded span** between it and the nearest marker | Makes "how much time is left" a visible quantity rather than a mental subtraction |
| 01:04 | **Bracket** the open task bars that sit under that marker | Shows the second quantity — how much work is left — beside the first |
| 01:26 | **Pull back** to the full timeline and let the three shaded spans coexist for the closing beat | Three commitments in sequence is the mental model the section is trying to install |
| 01:44 | **Lower third:** "Milestone health is recalculated every morning" | Health is computed but not displayed anywhere in the current UI. Say so on screen, or a learner goes looking for a badge that doesn't exist |

> **If the milestone surface is ever rebuilt**, most of these edits become redundant — the badge and
> progress bar would show natively what the pins and shading are faking. Delete them then rather
> than layering annotation over real UI.

## Narration

**[00:00 — the board]**

Everything you've seen so far is a task: a thing someone does this week.

*(pause)*

Tasks are what you do. Milestones are what the tasks are *for*. Design review. Fabrication complete.
Competition. They're dates the club has committed to, and they don't live on the board.

**[00:22 — switch to Gantt]**

They live here. Same project, drawn against time instead of status, and each of these markers is a
milestone with a date on it.

*(beat)*

This is the view for the question "are these three things going to collide," which a column of
cards can't answer no matter how long you stare at it.

**[00:50 — one marker]**

Take this one. The date is two weeks out, and the bars to its left are the work that has to land
before it. That's the whole reading: what is committed, and what is still open in front of it.

*(pause)*

When those two disagree — a near date with a lot of open bars behind it — that's the moment to do
something. Move the date on purpose, pull someone onto it, or cut scope. All three are honest. What
isn't honest is letting the date pass without anyone deciding.

**[01:20 — pull back]**

Three commitments, in order, with the work laid against them. Check this view before you promise
anyone anything.

**[01:44 — hold]**

Next, we'll check what stuck.

*(hold, fade)*

---

**Word count:** ~275 · **Target pace:** 150 wpm + written pauses ≈ 1:50

## Notes for the recorder

- The seeded milestones need genuinely different due dates or the timeline reads as one clump.
- Don't narrate a health badge or a percentage. Neither is on screen any more, and describing UI the
  learner can't find is the fastest way to lose them.
