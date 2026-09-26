# C06 — How the Vault is organised

> CONTENT section · Vault & Change Requests · M1 · ~6 min read
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

An assembly's **bill of materials** lists linked child items, their quantities, and optional notes.
The links themselves do not pin a child version. A version is pinned only when a change request is
approved: the release manifest then records the exact released version of every part beneath the
released item. Build from that release package, not from whatever the BOM tab shows today.

**Drawings are items too.** Check in a drawing as its own item, then open its BOM tab and set
**Drawing** to the part it documents. Build readiness uses that link when a project requires
drawings, and the release package ships the drawing beside its part.

The more valuable direction is the reverse one. **Where-used** takes a part and tells you every
assembly that depends on it.

> This is the query that stops small changes becoming expensive ones. "I'm about to widen this
> bracket by 2 mm" is a five-minute job. "I'm about to widen a bracket that four assemblies and the
> competition-day spare both reference" is a conversation. Same change; the difference is entirely
> whether you asked.

Constellation derives both directions from the BOM structure rather than asking anyone to remember,
which matters because the person most likely to forget is the one working fastest under deadline.

## Check-out, in practice

The mechanism is simple: you check an item out, everyone can see you hold it, and you upload a new
version. A successful check-in automatically releases your checkout.

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

An admin can take over a checkout as a recovery action. Checkout is visible coordination rather than
a hard file lock, so conflicts are announced instead of blocked: if someone checks in over your
checkout, takes it over, or tries to check out an item you hold, you get a **checkout conflict**
notice, and so does everyone watching the item.

## What the Vault is not for

The Vault stores parts. It's not a general file dump, and putting the wrong thing in it makes the
right things harder to find.

| Put it in | Where |
|---|---|
| CAD, STEP, drawings, anything with a revision history | **The Vault** |
| Meeting notes, budgets, sponsor decks, photos | **Drive**, linked from the project |
| Firmware and analysis scripts | **GitHub**, linked to the task |
| The conversation about any of the above | **Task comments** |

Projects with an enabled Vault repository store new check-ins in GitHub with Git LFS. Projects without
that setup still use the legacy bot-owned Drive Vault; its files are separate from the project's
general Files → Drive source. Older versions can remain Drive-backed. Download and preview both
through the Vault, which checks project access.
The repository header shows branch health and recent commits; each version shows its storage provider.
A commit means the bytes were stored. Only ClubPM change-request approval releases a revision.

## Watching an item

Open an item and press **Watch** to hear about it without refreshing the Vault. A watched item tells
you about three things, and the chevron beside Watch turns each one on or off:

- **New check-ins** — who uploaded which version, with its change description.
- **Change request decisions** — a CR covering the item was approved or rejected.
- **Checkout conflicts** — see the checkout section above.

Every notice links to the exact version or change request it is about. Creating an item, checking
one in, or checking one out watches it for you; turn that off under **Vault** in Notification
preferences. The same page decides *how* each kind arrives — in Constellation, as a Slack DM, both,
or not at all. Unwatching sticks: a later check-in of your own does not quietly watch it again. You
never hear about your own actions, and you stop hearing about a project's items once you are no
longer a member of it.

## Searching the Vault

The box above the item grid filters what is already on screen. The **Search** tab searches the
whole Vault: item names and descriptions, file names, part numbers, check-in notes, change requests,
and the GitHub commit messages on the Vault branch — including commits someone pushed directly to
GitHub. Search a part number with or without its dash, or paste the first seven characters of a
commit SHA.

Filters narrow by result type, released or unreleased, checkout, change-request status, file type,
date, your own work, or only items you watch. Switch **Scope** to *All my projects* to search every
project you belong to; nothing from a project you cannot open ever appears. **Save view** keeps the
current query and filters under a name only you can see — "Unreleased STEP files this month" is a
good one to keep.

## Seeing what changed in the geometry

Open an item's **Changes** tab and pick two versions. If both are STL, OBJ, glTF/GLB or STEP/STP, a
**Geometry diff** measures them on the server and shows the two models side by side in one shared
coordinate frame, so a part that moved looks moved. Green markers are added material, red is removed
material, amber is a changed surface where it cannot tell which side the material is on, and violet
arrows are displacements. Native CAD files such as .sldprt are not read — check in a STEP or mesh
export beside them if you want this.

Read the numbers with their labels, because the diff tells you how far to trust each one:

- **Units.** STL and OBJ files store no unit. Until you pick the unit they were exported in, sizes
  are in "model units" and no volume is shown. glTF is always metres; STEP carries its own unit and
  is shown in millimetres.
- **Tolerance.** Surfaces closer than this count as the same. It defaults to a tiny fraction of the
  part's size; type your own (for example your print or machining tolerance) and press
  **Recompute**.
- **Volume** appears only for a closed, watertight solid. An open or non-manifold mesh gets a status
  instead of a number. A mesh volume is exact *for that mesh*; a STEP volume comes from a
  tessellation, so it is labelled an approximation — neither is a substitute for your CAD tool's
  mass properties.
- **Components** are matched by name, so a renamed body shows up as one removed and one added.
  Rotations are not detected: a rotated part shows as removed plus added material.

The result is cached against both files' exact hashes, so the second person to open the same pair
gets it instantly. Large models are processed in the background; the panel says when it is queued,
computing, done, or why it could not run.

## Three things that save you time later

- **Link a change request to its task.** The CR form offers an optional task link; item detail does
  not currently offer a direct task link.
- **Write the version note.** "Fixed interference with the harness routing" is the sentence that
  makes a version history readable instead of a list of dates.
- **Ask the Vault.** There's a question box over the project's Vault — "which assemblies use the
  40 mm standoff?" — and it answers from the actual item and BOM data.

Next, the walkthrough: bring two disposable practice files. You'll create an item in your private
training project, check it out, upload a second version, and open its initially empty BOM.
