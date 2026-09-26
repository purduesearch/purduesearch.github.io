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
On pilot projects, a GitHub commit records storage and appears in the version's activity. It does
not approve the change or update the released revision.

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

**Reason — why it changes.** This is the field that's still earning its keep in eighteen months.

> The people who know why a part is shaped the way it is graduate. The Reason field is the
> project's memory of its own reasoning, and it is the only part of the design record that a future
> member cannot reconstruct from the files.

A good Reason answers three things in about three sentences:

1. **What went wrong or changed** — "The M6 hardware we could actually source is 6 mm, not 5."
2. **What you considered and rejected** — "Reaming in place was an option; it breaks the anodising."
3. **What it costs** — "Adds 1.3 mm of slop; acceptable, the clamp load carries the joint anyway."

That third one is what separates a proposal from a request. Reviewers approve trade-offs they can
see much faster than trade-offs they have to go and find.

Select each item and the exact version to release. The form shows a where-used warning for selected
items that another assembly references. Once the request is open, its **Build readiness** panel
computes the full impact report described below. You can also request an AI impact summary or
release-note draft; review those drafts before relying on them.

**Link the CR to its task.** A change request that names the task it came out of turns three
artefacts — the part, the work, and the decision — into one thread.

## Reviewing one

The request's **Release review** panel shows the ClubPM gate and any linked GitHub PR. The author
or an admin can link a PR from a repository already linked to this project. The panel mirrors its
title, head commit, review decisions, checks, and timeline. A GitHub commit stores work; it does
not release a Vault revision. A linked PR must be open, ready for review, approved on the current
head, and have passing checks. A requested change or failing check blocks approval.

Admins configure required reviewers under **Review rules** in the request list. A subsystem rule
matches a part-number prefix, including slash-separated descendants; a BOM-parent rule matches
every part anywhere beneath that assembly, not only its direct children. Every matching reviewer
must sign off on the proposed versions and current PR head. A new Vault version or PR head makes an
earlier sign-off stale. A required reviewer can sign off or revoke in the request panel. A lost
GitHub App permission leaves the gate pending until access is restored and the PR is refreshed;
Constellation also rechecks linked PRs every 20 minutes in case a GitHub notification was missed.
If a required reviewer leaves the project, the gate shows **failing** until an admin updates the
review rules. Only an admin can approve the CR and assign the released revision after the gate
says **approved**.

### Build readiness: blockers and warnings

An open request also shows **Build readiness**. It walks the whole BOM beneath each item you are
releasing, pins one version of every part, and reports:

- **Where used** — every chain from the item up to a top-level assembly.
- **Affected open tasks** — the linked task, tasks linked to other open requests on the same items
  or their assemblies, and open tasks that mention an affected item's name or part number.
- **Missing required drawings** — admins set **Drawing requirements** in the request list, by part
  number prefix, file type, or every item. A drawing counts once it is released, including in the
  same request.
- **Assemblies on stale revisions** — released assemblies that were built against an older revision
  of a part this request changes, or that predate a component they will now be built with.

Each finding is either a **blocker** or a **warning**. Blockers stop approval: a component in the
BOM with no released revision, a file whose stored bytes cannot be pinned, a BOM cycle, or a missing
drawing whose requirement is set to *blocks approval*. Warnings — stale assemblies, affected tasks,
another open request on the same items, a drawing older than its part — are for the reviewer's
judgement. The server applies the same rules again inside the approval, so a blocker cannot slip
through a stale page.

If you're the reviewer, your job is not to check that the CAD is pretty. It's to answer four
questions:

1. **Is the Reason legible?** Could someone who wasn't in the room understand this in a year?
2. **Does build readiness contain a surprise?** A stale assembly, an open task, or a where-used
   chain the author did not mention deserves a question. It shows structure, not geometry: whether
   the part still fits is still your call.
3. **Is anything downstream already committed?** Ordered, machined, or being machined right now.
4. **Is now the right time?** Sometimes the change is correct and the week is wrong.

Then approve or reject. Approval offers an optional note; rejection prompts for a reason. An approval that says nothing is a click; an
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
- An immutable **release manifest** is written in the same step: every pinned item and version,
  its revision letter, repository and commit, file path, the SHA-256 of the real bytes, and the exact
  recursive BOM with quantities
- The whole thing is written to the project's audit trail with who approved it and when

After approval, the request shows **Release package**. Constellation builds one downloadable
archive from the manifest alone: the pinned files, `BOM.csv` with extended quantities,
`manifest.json`, and `SHA256SUMS` so a manufacturer can check every file with
`sha256sum -c SHA256SUMS`. Later pushes to the Vault branch do not change it — files are read by
their pinned commit, and any byte that no longer matches its hash fails the build instead of being
swapped in. A failed build (a GitHub outage, a missing file) shows its reason and retries on its
own; **Verify reproducibility** rebuilds the package from the pinned versions and confirms it is
byte-for-byte identical. Only project members can open or download it.

Two things it deliberately does *not* do: it doesn't grant anybody XP — a review process that paid
out would immediately start producing change requests for the wrong reasons — and it doesn't close
any linked tasks or update assemblies flagged as stale. Approving the change is not doing the work.

## The honest summary

A change request is a change that one other person looked at before it became everybody's problem.

That's it. On a team where the person who machined the part graduates in May, it's not process for
its own sake — it's the only memory the project has, written down at the one moment when everyone
involved still knows why.

Next, the walkthrough: after creating a practice Vault version, you'll select it in a request.
An officer can demonstrate rejection. Ordinary members assigned by a rule can sign off on a
request, while only admins can approve or reject the release.
