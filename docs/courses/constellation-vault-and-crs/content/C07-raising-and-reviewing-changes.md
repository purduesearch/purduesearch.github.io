# C07 — Raising and reviewing changes

> CONTENT section · Vault & Change Requests · M2 · ~4 min read
> Reference companion to V06. The video argues that a change request is worth the friction; this is
> the page that tells you when to raise one, how to write one somebody can review, and how to review
> one without either rubber-stamping it or becoming the reason nothing ships.

---

## The four states, and what each one means

| State | What it means | Reversible? |
|---|---|---|
| **Open** | Proposed, waiting on a reviewer | Yes — cancel it yourself |
| **Approved** | The change is real. The version is released and takes the next revision letter | No |
| **Rejected** | A reviewer said no, and wrote down why. The record stays | Raise a new one |
| **Cancelled** | The author withdrew it before review | Raise a new one |

Every change request carries a **number** that's sequential within its project (`CR-14`), so it's
citable in Slack, in a task comment, and in a competition design report six months from now.

Approval is the only thing in Constellation that mints a revision letter. Everything else in the
Vault — uploading, checking in, promoting — leaves the item's official revision exactly where it was.

## When do you actually need one?

Not for everything. A team that raises a CR for every fillet stops reading them, and a review process
nobody reads is worse than none, because it looks like oversight while providing none.

| Situation | Raise a CR? |
|---|---|
| The part is referenced by another assembly | **Yes** |
| Something has already been ordered, machined, or printed from it | **Yes** |
| It's an interface — a mating face, a bolt pattern, a connector | **Yes** |
| You're changing a released revision at all | **Yes** |
| Nobody else's work touches it and it's never been released | No — just check in |
| You're still exploring, three versions a day | No. Explore, then propose once |

The rule of thumb: **a change request is for changes that reach past you.** If where-used comes back
empty and nothing has ever been released, you're editing your own sketch and the version history is
already enough.

## Writing one somebody can review

A change request has two fields that do real work, and people fill in the wrong one carefully.

**Title — what changes.** Specific enough to review without opening it. "Widen the battery tray
mounting slots from 5.2 to 6.5 mm," not "battery tray update."

**Rationale — why it changes.** This is the field that's still earning its keep in eighteen months.

> The people who know why a part is shaped the way it is graduate. The rationale field is the
> project's memory of its own reasoning, and it is the only part of the design record that a future
> member cannot reconstruct from the files.

A good rationale answers three things in about three sentences:

1. **What went wrong or changed** — "The M6 hardware we could actually source is 6 mm, not 5."
2. **What you considered and rejected** — "Reaming in place was an option; it breaks the anodising."
3. **What it costs** — "Adds 1.3 mm of slop; acceptable, the clamp load carries the joint anyway."

That third one is what separates a proposal from a request. Reviewers approve trade-offs they can
see much faster than trade-offs they have to go and find.

You don't have to list the affected items. Constellation derives them from the BOM, which is
precisely the thing a person under deadline pressure gets wrong. There's also an AI impact summary
if you want a second opinion on blast radius, and it can draft release notes once the change lands
— both are drafts you read, not answers you forward.

**Link the CR to its task.** A change request that names the task it came out of turns three
artefacts — the part, the work, and the decision — into one thread.

## Reviewing one

If you're the reviewer, your job is not to check that the CAD is pretty. It's to answer four
questions:

1. **Is the rationale legible?** Could someone who wasn't in the room understand this in a year?
2. **Does the impact list contain a surprise?** If it touches something the author clearly didn't
   expect, that's the finding — say so.
3. **Is anything downstream already committed?** Ordered, machined, or being machined right now.
4. **Is now the right time?** Sometimes the change is correct and the week is wrong.

Then approve or reject, **with a comment either way**. An approval that says nothing is a click; an
approval that says "yes — confirm the anodising vendor is fine with the wider slot before you
release" is a review.

### Rejecting is normal

> **"Not until after the design review" is a real answer.** A team that only ever approves has
> stopped reviewing and started rubber-stamping, and the two are indistinguishable from the outside
> right up until something expensive happens.

A rejected CR stays in the record with its reason attached. That record is the point: the next person
to propose the same change reads why it was turned down instead of relitigating a decision nobody
remembers making. This is why the walkthrough after this page has you *reject* one — approving
teaches you a button, rejecting teaches you that it's survivable.

Reject on the merits, in writing, and without softening it into ambiguity. "Maybe later" leaves the
author with nothing to act on.

## What approval actually does

The moment a reviewer approves:

- The named version is **released** — stamped with the next revision letter and the date
- The item's **current revision** advances to match
- Members holding **downstream items** that reference it are notified
- The whole thing is written to the project's audit trail with who approved it and when

Two things it deliberately does *not* do: it doesn't grant anybody XP — a review process that paid
out would immediately start producing change requests for the wrong reasons — and it doesn't close
any linked tasks. Approving the change is not doing the work.

## The honest summary

A change request is a change that one other person looked at before it became everybody's problem.

That's it. On a team where the person who machined the part graduates in May, it's not process for
its own sake — it's the only memory the project has, written down at the one moment when everyone
involved still knows why.

Next, the walkthrough: you'll raise one, watch Constellation work out what it affects, and reject it.
