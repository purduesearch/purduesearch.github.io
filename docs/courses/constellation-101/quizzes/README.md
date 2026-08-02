# Constellation 101 — quiz banks, readable

The `.json` files beside this one are authoritative — they're what `npm run seed:courses` installs.
This file is the reviewable twin for all five banks, so questions can be argued about without anyone
reading JSON. `scripts/check-tour-anchors.js` also verifies that every question id here appears in
the corresponding `.json` and vice versa, so the two cannot silently drift.

**✓ marks the correct answer.** 27 questions across 5 quizzes.

---

## Q01 — Orientation · 4 questions · pass 75% · unlimited attempts

**q01-1 (SINGLE)** What is Constellation's core job for the club?
- ✓ To hold the current state of the club's work somewhere that doesn't scroll away
- To replace Slack as the place the club talks
- To store the club's CAD files and documents
- To track attendance at meetings

> Chat is built to move forward; it cannot tell you the state of anything.

**q01-2 (SINGLE)** You want to know whether the hydroponics wiring is finished. Where is the authoritative answer?
- ✓ The column its task sits in on the project board
- The most recent message in the project's Slack channel
- Whoever you last spoke to about it
- The project's Drive folder

**q01-3 (TRUE_FALSE)** Constellation is meant to replace Slack for club conversation. → ✓ **False**

> Slack stays where you talk. Constellation notifies you there when something needs you.

**q01-4 (SINGLE)** Why does Constellation award XP, ranks, and doubloons?
- ✓ Because volunteer work that nobody notices tends to stop happening
- To rank members against each other for officer selection
- To pressure members into logging more hours
- Because the software was built on a game engine

---

## Q02 — Tasks and the board · 6 questions · pass 75% · unlimited attempts

**q02-1 (SINGLE)** What is the difference between a subtask and a dependency?
- ✓ A subtask is part of this task; a dependency is a different task that must finish before this one can proceed
- A subtask is assigned to someone else; a dependency is assigned to you
- They are the same thing shown in two places
- A dependency is a note for humans; a subtask is enforced by the system

> The most-missed concept in the course. V02 covers it at 01:58.

**q02-2 (MULTI, 2 pts)** You try to move a task to Done and Constellation refuses. Which could explain it?
- ✓ It has a dependency that is not finished yet
- ✓ It has an unresolved blocker attached
- Its priority is set to CRITICAL
- It has no due date

**q02-3 (MULTI, 2 pts)** Which of these belong in a task's description?
- ✓ What is in scope and what is explicitly out
- ✓ Acceptance criteria — the checklist that decides it's finished
- A running log of who said what about it
- The current status of the work

**q02-4 (SINGLE)** Which of these is a well-formed task title?
- ✓ Route and secure the main wiring harness through bay two
- Wiring harness
- URGENT!! harness stuff
- Talk to Priya about the harness

**q02-5 (SINGLE)** You log 3 hours against a task. What happens?
- ✓ It's recorded, and the reward is queued for an officer to approve
- It's rejected — 3 hours exceeds the per-entry limit
- XP is granted immediately with no review
- It's recorded but never earns XP

**q02-6 (TRUE_FALSE)** Typing @someone in a task comment sends them a Slack DM as well as an in-app notification. → ✓ **True**

---

## Q03 — Stalls and milestones · 5 questions · pass 75% · unlimited attempts

**q03-1 (SINGLE)** "Waiting on the sponsor's parts order" is holding up five tasks. What should you use?
- ✓ A blocker, attached to all five tasks
- Five dependencies pointing at one placeholder task
- A comment on each of the five tasks
- A milestone called "parts order"

**q03-2 (SINGLE)** You attach a blocker to a task that is currently IN_PROGRESS. What happens to its status?
- ✓ It moves to BLOCKED
- It stays IN_PROGRESS with a warning icon
- It moves back to TODO
- Nothing — blockers are advisory

**q03-3 (SINGLE)** A milestone's health badge says "at risk." What does that mean?
- ✓ It hasn't missed its date yet, but at the current rate it won't make it
- Its date has already passed with work still open
- Nobody has been assigned as its owner
- It has fewer than three linked tasks

**q03-4 (SINGLE)** A milestone has gone red. What's the right response?
- ✓ Open it and either finish the remaining work or move the date on purpose
- Delete it and create a fresh one so the board looks clean
- Leave it — the badge will clear itself on the next refresh
- Unlink the unfinished tasks from it

**q03-5 (TRUE_FALSE)** A milestone's progress bar is a judgement call made by the system. → ✓ **False**

> The bar is arithmetic. The badge beside it is the judgement.

---

## Q04 — Rewards · 4 questions · pass 75% · unlimited attempts

**q04-1 (MULTI, 2 pts)** Which of these earn you XP?
- ✓ Completing a task
- ✓ Logging time against a task
- Opening Constellation each day
- Reading a project's board

**q04-2 (SINGLE)** What is the rank ladder, in order from the bottom?
- ✓ Nestling, Fledgling, Cadet, Specialist, Pioneer, Cosmonaut, Celestial
- Cadet, Nestling, Fledgling, Pioneer, Specialist, Celestial, Cosmonaut
- Fledgling, Nestling, Specialist, Cadet, Cosmonaut, Pioneer, Celestial
- Nestling, Cadet, Fledgling, Pioneer, Specialist, Celestial, Cosmonaut

**q04-3 (SINGLE)** What is the difference between XP and doubloons?
- ✓ XP is a permanent record that drives rank; doubloons are currency you spend in the shop
- They are the same balance shown in two units
- Doubloons drive rank; XP is spent on cosmetics
- XP expires each semester; doubloons carry over

**q04-4 (TRUE_FALSE)** Reaching a higher rank unlocks features lower ranks cannot use. → ✓ **False**

> Rank is recognition, not permission. Role and project access govern what you can do.

---

## Q05 — Final · 8 questions · **pass 80%** · **3 attempts**

**q05-1 (SINGLE)** Someone asks in Slack whether the battery mount is done.
- ✓ Check the task's column on the board and answer from that
- Answer from memory — you were in the meeting
- Ask whoever you think was assigned to it
- Check the project's Drive folder for a recent file

**q05-2 (MULTI, 2 pts)** Which will stop a task from being moved to Done?
- ✓ An unfinished dependency
- ✓ An unresolved blocker attached to it
- A priority of CRITICAL
- An empty description field

**q05-3 (SINGLE)** Three tasks are all stuck waiting for the machine shop to reopen.
- ✓ One blocker attached to all three tasks
- Three dependencies on a dummy task
- Setting all three to CRITICAL priority
- A milestone named "machine shop"

**q05-4 (SINGLE)** What does a milestone's progress bar actually measure?
- ✓ Linked tasks completed, over linked tasks total
- Days elapsed since the milestone was created
- Hours logged against the milestone's tasks
- The system's forecast of whether it will land on time

**q05-5 (SINGLE)** You log 4 hours on a task on Thursday.
- ✓ It's queued for an officer to approve before XP is granted
- XP is granted instantly at four times the hourly rate
- The entry is rejected for exceeding the per-entry maximum
- It's recorded for reporting but never earns XP

**q05-6 (SINGLE)** Constellation is getting too noisy for you.
- ✓ Turn off the specific categories you don't need in notification preferences
- Mute the Constellation app in Slack entirely
- Stop opening the notification centre
- Ask an officer to remove you from the project

**q05-7 (SINGLE)** Which title describes a task well enough to know when it's finished?
- ✓ Publish the Q3 outreach post to the club blog
- Blog stuff
- Look into the outreach thing
- Outreach — ASAP!!

**q05-8 (TRUE_FALSE)** Everything you did during this course's walkthroughs happened in your own private training project. → ✓ **True**

---

## Why the final is the only gated quiz

Module quizzes have unlimited attempts on purpose. They exist to make the material stick, and a
learner locked out of a module quiz just messages someone for the answers — which teaches nothing and
costs the club a conversation.

The final is 3 attempts at 80% because it is the one place the course makes a claim: that this person
can be handed a real project. Three attempts is enough to recover from a careless read and few enough
that the claim means something.
