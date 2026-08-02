# Vault & CRs — walkthrough outlines

`.steps.json` for these two tours is authored in the final implementation phase, once the anchor
registry has been proven against Constellation 101. This file specifies them completely: every step,
its anchor, and how it advances. Writing the JSON is transcription, not design.

Both tours require the training project, whose fixture seeds **1 vault item with 3 versions, 1
assembly with a 4-line BOM, and 1 open change request** for the review step.

---

## `vault-checkout` — 9 steps, 4 real API calls

| # | Anchor | Advance | Copy |
|---|---|---|---|
| 1 | `project.tab.vault` | `click` | "The Vault lives on its own tab. Open it." |
| 2 | `vault.tree` | `next` | "Parts, not files. Every item here has one current version and every version before it." |
| 3 | `vault.item` | `click` | "Open this bracket." |
| 4 | `vault.versions` | `next` | "Three versions, newest first, each with who uploaded it and why. Nothing is ever overwritten." |
| 5 | `vault.checkout` | `api` POST `/api/vault/items/:id/checkout` | "Check it out. From now until you check it back in, it's locked to you — and everyone can see that." |
| 6 | `vault.item` | `next` | "Notice the lock, and your name on it. That visibility is the entire mechanism." |
| 7 | `vault.upload` | `api` POST `/api/vault/items/:id/versions` | "Upload anything as a new version. On a real part this is where your changed model goes." |
| 8 | `vault.versions` | `next` | "Four now. The old one didn't go anywhere — it just stopped being current." |
| 9 | `vault.bom` | `api` POST `/api/vault/items/:id/checkin` | "Check it back in, then open the BOM. This is what tells you what your change just touched." |

**Design notes**

- Step 6 exists only to make the learner *look at the lock*. Check-out is the step people skip on
  real work, and they skip it because they've never seen what it prevents.
- Step 9 doubles up — check-in plus opening the BOM — deliberately: check-in should feel like the
  natural end of the edit, not a separate chore with its own step.
- Do **not** add a step demonstrating a forced check-in over someone else's lock. That's an admin
  recovery action, and teaching it in an intro tour makes it look routine.

---

## `change-request` — 8 steps, 3 real API calls

| # | Anchor | Advance | Copy |
|---|---|---|---|
| 1 | `cr.list` | `next` | "Every proposed change to a vaulted part, open and closed." |
| 2 | `cr.new` | `click` | "Raise one." |
| 3 | `cr.new` | `next` | "Title says what changes. Rationale says why — that's the field that's still useful in six months." |
| 4 | `cr.new` | `api` POST `/api/change-requests` | "Submit it." |
| 5 | `cr.list` | `next` | "Constellation worked out what it affects from the BOM. You didn't have to remember." |
| 6 | `cr.review` | `next` | "Normally someone else reviews this. In your training project you're both people, so you'll review your own." |
| 7 | `cr.review` | `api` POST `/api/change-requests/:id/reject` | "Reject it, with a reason. Rejecting isn't rude — 'not until after the design review' is a real answer." |
| 8 | `cr.list` | `next` | "It's still there, with the reason attached. That record is what stops the same change being re-proposed blind." |

**Design notes**

- The tour has the learner **reject** rather than approve, which is the opposite of the obvious
  choice. Approving teaches one click; rejecting teaches that rejection is normal and survivable, and
  that's the behaviour a review culture actually needs. V06 sets this up.
- Step 6 says out loud that reviewing your own CR is an artefact of the sandbox. Without that line the
  tour quietly teaches that self-review is fine.
- No step approves anything, so the tour never mutates a version. Keeps the sandbox re-runnable.
