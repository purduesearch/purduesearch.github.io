# C06 — How the Vault is organised

> CONTENT section · Vault & Change Requests · M1 · ~4 min read
> Reference companion to V05. The video argues *why* check-out exists; this is the page that
> explains the four things the Vault actually stores, including the one distinction that confuses
> everybody on their first week.

---

V05 made the case for the Vault. Before you go and check something out, it's worth ten minutes to
understand what's underneath it, because the Vault has **four separate concepts** and three of them
are routinely mistaken for each other.

## Items, versions, revisions, part numbers

| Concept | What it is | Who creates it | Looks like |
|---|---|---|---|
| **Item** | One physical part or assembly | Anyone, once | "Battery tray" |
| **Version** | One upload of that item's file | Anyone, every time they check in | 1, 2, 3, 4 … |
| **Revision** | A version that has been *officially released* | Only an approved change request | A, B, C … |
| **Part number** | The item's permanent identifier | Allocated once, on promotion | `ASTRO-0042` |

### Version and revision are not the same thing

This is the distinction to get right, and it's the one people arrive with backwards.

> **A version is what you saved. A revision is what the project has agreed to.**

Every time you check an item in, it gets the next **version number**. That's automatic, it costs
nothing, and it happens whether the change was a breakthrough or a typo in the sketch name. Versions
are cheap on purpose — the whole point of a vault is that saving your work is never a decision.

A **revision letter** is different. Versions only get one when a change request naming them is
**approved**. At that moment the version is stamped with the next letter, marked released, and the
item's *current revision* moves up to match.

So an item might have eleven versions and be at revision C. That's normal and it's not a bookkeeping
error — it means eleven people saved work and three of those states were formally released.

| You want to know… | Look at |
|---|---|
| What's the newest file anyone uploaded? | The latest **version** |
| What should the machine shop actually cut? | The current **revision** |
| What changed between what we built and what we have now? | The versions since the last released one |

If you take one thing from this page: **never hand a shop, a sponsor, or a competition inspector a
version that isn't a revision.** Uploading is a save. Releasing is a decision.

## Part numbers

A new item doesn't have a part number. It's a working item — sketchy, provisional, allowed to be
renamed and rethought.

**Promoting** it allocates the next part number in the project's sequence, using the project's
prefix. That's a **one-way door**: a part number is never reassigned, never recycled, and never
renumbered — including when an officer changes the project's prefix later, which affects new parts
only.

Promote when the part becomes something other people will refer to. Not before, because a part
number is a promise that the identifier is stable.

## The BOM, and the question it really answers

An assembly's **bill of materials** lists the parts it's made of, the quantity of each, and the
versions it references. That's the shopping-list direction, and it's what you hand to whoever is
ordering.

The more valuable direction is the reverse one. **Where-used** takes a part and tells you every
assembly that depends on it.

> This is the query that stops small changes becoming expensive ones. "I'm about to widen this
> bracket by 2 mm" is a five-minute job. "I'm about to widen a bracket that four assemblies and the
> competition-day spare both reference" is a conversation. Same change; the difference is entirely
> whether you asked.

Constellation derives both directions from the BOM structure rather than asking anyone to remember,
which matters because the person most likely to forget is the one working fastest under deadline.

## Check-out, in practice

The mechanism is simple: you check an item out, it's locked to you, everyone can see you hold it,
you upload a new version and check it back in.

The etiquette is where it goes wrong:

- **Leave a note when you check out.** "Reworking the mounting flange for the new standoffs" costs
  you four seconds and answers the question your teammate would otherwise have to Slack you.
- **Check in the same day if you can.** A lock held for a week is functionally a locked drawer with
  the key in someone's pocket. If the work is genuinely multi-day, say so in the note.
- **If someone else holds the lock, message them.** The lock names the holder — that's the whole
  design. Working on a private copy and uploading it separately recreates the exact
  `_FINAL_actual_v2` situation the Vault exists to end.
- **Don't check out to browse.** Reading, downloading, and viewing history need no lock. Check-out is
  for changing.

Forced check-in over somebody else's lock exists, but it's an officer recovery action for when a
person has genuinely gone away — not a way around a queue.

## What the Vault is not for

The Vault stores parts. It's not a general file dump, and putting the wrong thing in it makes the
right things harder to find.

| Put it in | Where |
|---|---|
| CAD, STEP, drawings, anything with a revision history | **The Vault** |
| Meeting notes, budgets, sponsor decks, photos | **Drive**, linked from the project |
| Firmware and analysis scripts | **GitHub**, linked to the task |
| The conversation about any of the above | **Task comments** |

Files in the Vault live in Google Drive underneath — Constellation doesn't reimplement storage. What
it adds on top is the part identity, the ordering, the lock, and the structure.

## Three things that save you time later

- **Link items to tasks.** The part, the work on the part, and the argument about the part end up in
  one place. This is the single highest-value habit in this course.
- **Write the version note.** "Fixed interference with the harness routing" is the sentence that
  makes a version history readable instead of a list of dates.
- **Ask the Vault.** There's a question box over the project's Vault — "which assemblies use the
  40 mm standoff?" — and it answers from the actual item and BOM data.

Next, the walkthrough: you'll check an item out, look at the lock, upload a version, check it back
in, and open a BOM.
