# C02 — Three ways work stalls

> CONTENT section · Constellation 101 · M3 · ~3 min read

---

Work stops for different reasons, and Constellation models three of them separately. They look
similar on the board and they are not interchangeable — picking the wrong one is how a project ends
up with an accurate-looking board that tells you nothing.

## 1 · A dependency — "that has to happen first"

A relationship between **two specific tasks**. *Mount the battery* cannot start until *fabricate the
battery tray* is finished.

- Points at exactly one other task
- **Enforced**: a task with an unfinished dependency cannot be moved to Done
- Clears itself the moment the other task finishes — nobody has to remember to unblock it
- Circular chains are refused when you create them, so you can't build a deadlock by accident

> **Use it when** the thing you're waiting on is itself a task in this project.

## 2 · A blocker — "we're all stuck on the same thing"

A **reusable, project-wide reason** that can be attached to many tasks at once. "Waiting on the
sponsor's parts order." "Machine shop closed for the break." "Need faculty sign-off."

- Created once per project, attached to as many tasks as it affects
- Attaching one **forces** that task to BLOCKED
- Can have an owner — the person chasing it — who gets notified when assigned
- Resolving it once detaches it from every task and recomputes each of their statuses

> **Use it when** the obstacle is outside the board: a person, an order, a decision, a building.

On the board, blocked cards cluster under the reason blocking them. That turns "why is nothing
moving?" into a short list of things somebody needs to go chase — which is a far more useful question
than a column of unrelated stuck cards.

## 3 · A milestone at risk — "the date is in trouble"

Not a stall on any single task. A **forecast about a date**.

A milestone groups tasks that all have to land before a committed deadline. Constellation
recalculates its health every morning from three things: how much work is left, how much time is
left, and whether anything linked to it is overdue or blocked.

| Badge | Meaning |
|---|---|
| **On track** | Current rate lands it before the date |
| **At risk** | Date hasn't passed, but at this rate it won't make it |
| **Overdue** | Date has passed with work still open |

> **At risk is an invitation, not a scolding.** It fires while there's still time to move a date, pull
> someone onto it, or cut scope. If it only fired once you were late, it would be a report rather
> than a warning.

## Choosing between them

| The situation | What to use |
|---|---|
| Waiting on another task in this project | **Dependency** |
| Waiting on a person, an order, a decision, a room | **Blocker** |
| Several tasks stuck on the *same* external thing | **One blocker**, attached to all of them |
| The whole deadline is in danger | Nothing to attach — read the **milestone's** health |
| You just haven't started yet | None of these. It's a to-do. |

That last row matters. "Blocked" is not a synonym for "not started," and using it that way costs the
board the one signal it has for genuine trouble.

## What this means in practice

When something stops, **say so in the system** rather than in your head. Attaching a blocker takes
ten seconds and means the next person who looks at the board — an officer planning the week, a
teammate wondering whether to start something — sees the truth.

An accurate board is worth more than a tidy one.

Next you'll do all of this by hand: add a dependency, watch it refuse to let you finish, attach a
blocker, and watch the card move itself.
