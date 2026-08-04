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
