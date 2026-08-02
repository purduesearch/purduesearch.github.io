# V03 — Reading a milestone's health

| | |
|---|---|
| **Course / section** | Constellation 101 · M3 · "Reading a milestone's health" |
| **Runtime** | 2:40 |
| **Format** | Screen capture + VO |
| **Capture account** | Seeded demo member |
| **Prerequisite on screen** | 3 milestones: one healthy, one at risk, one overdue; linked tasks with mixed statuses |
| **Recorded** | ☐ |

## Purpose

Milestones are the one part of the board a new member will look at without understanding, nod, and
walk away from. This video makes the health badge legible — what it's computed from, and what you're
supposed to *do* when it turns.

## Shot list

| Time | Screen | Action |
|---|---|---|
| 00:00–00:20 | Milestones tab | Hold on the list of three |
| 00:20–00:44 | Milestone card, healthy | Expand it, show linked tasks |
| 00:44–01:12 | Progress bar + task counts | Hover the counts |
| 01:12–01:44 | At-risk milestone | Expand; show overdue linked task |
| 01:44–02:08 | Overdue milestone | Show it red, tasks still open |
| 02:08–02:32 | Gantt view | Switch tabs, show the same milestones on a timeline |
| 02:32–02:40 | Milestones tab | Return, hold |

## Narration

**[00:00 — milestones list]**

A milestone is a date the club has committed to. Design review. Fabrication complete. Competition.

*(pause)*

Tasks are what you do this week. Milestones are what the tasks are *for*. Three here, and you can
tell them apart from across the room, which is the point.

**[00:20 — expand the healthy one]**

Open one up and you get its linked tasks. A milestone doesn't have work of its own — it's a label on
a set of tasks that all have to land before that date.

**[00:44 — progress bar, counts]**

The progress bar is just arithmetic: tasks done, over tasks linked. No judgement in it.

*(beat)*

The health badge next to it is the judgement. Constellation recalculates it every morning, and it's
looking at three things — how much is left, how much time is left, and whether anything linked is
already overdue or blocked.

**[01:12 — at-risk milestone]**

This one's at risk. Notice it isn't behind yet. The date hasn't passed and the bar isn't at zero.

*(pause)*

What it's telling you is that at the current rate, it won't make it. Which is useful precisely
because there's still time to do something — move a deadline, pull someone onto it, or cut scope.
"At risk" is an invitation, not a scolding.

**[01:44 — overdue milestone]**

This one is past its date with work still open. Red.

*(beat)*

The honest thing to do with a red milestone is not to hide it. It's to open it, look at what's still
sitting there, and either finish it or change the date on purpose. A milestone nobody has moved and
nobody has finished stops meaning anything to everyone.

**[02:08 — gantt]**

Same milestones, on a timeline. This is the view for the question "are these three things going to
collide," which the list can't show you.

**[02:32 — back to list]**

So: the bar is arithmetic, the badge is a forecast, and red is a decision waiting to be made.

Next, we'll check what stuck.

*(hold, fade)*

---

**Word count:** ~390 · **Target pace:** 150 wpm + written pauses ≈ 2:40

## Notes for the recorder

- The at-risk milestone must genuinely be at risk on the capture account — do not fake the badge in
  devtools. If the seeded data has drifted and everything is green, adjust a due date and let the
  08:45 health job run, or call `refreshMilestoneHealth` directly before recording.
- "At risk is an invitation, not a scolding" is load-bearing. Members who read the badge as blame
  start avoiding milestones entirely.
