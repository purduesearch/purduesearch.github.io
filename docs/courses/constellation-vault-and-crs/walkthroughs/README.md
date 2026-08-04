# Vault & CRs — walkthrough outlines

These outlines track the shipped `.steps.json` beside them. Keep them in step when you edit either.

Both tours require the training project, whose fixture seeds **1 vault item with 3 versions, 1
assembly with a 4-line BOM, and 1 open change request** for the review step.

**Everything the Vault owns is two clicks deep.** The Vault is a sub-tab of the project's Files tab,
and change requests are a sub-view of the Vault. Neither tour can target a `vault.*` or `cr.*` anchor
until it has opened `project.tab.files`, then `project.tab.vault` — both tours previously started
mid-way down that path and every step degraded.

---

## `vault-checkout` — 10 steps, 4 real API calls

| # | Anchor | Advance | Copy |
|---|---|---|---|
| 1 | `project.tab.files` | `click` | "Everything a project stores hangs off Files — Drive, GitHub, and the Vault." |
| 2 | `project.tab.vault` | `click` | "The Vault is the third source: Drive holds documents, GitHub holds code, the Vault holds parts." |
| 3 | `vault.tree` | `next` | "Parts, not files. Every item here has one current version and every version before it." |
| 4 | `vault.item` | `click` | "Open this bracket." |
| 5 | `vault.versions` | `next` | "Three versions, newest first, each with who uploaded it and why. Nothing is ever overwritten." |
| 6 | `vault.checkout` | `api` POST `/api/vault/items/:id/checkout` | "Check it out. From now until you check it back in, it's locked to you — and everyone can see that." |
| 7 | `vault.item` | `next` | "Notice the lock, and your name on it. That visibility is the entire mechanism." |
| 8 | `vault.upload` | `api` POST `/api/vault/items/:id/versions` | "Upload anything as a new version. On a real part this is where your changed model goes." |
| 9 | `vault.versions` | `next` | "Four now. The old one didn't go anywhere — it just stopped being current." |
| 10 | `vault.bom` | `api` DELETE `/api/vault/items/:id/checkout` | "Check it back in, then open the BOM. This is what tells you what your change just touched." |

**Design notes**

- Step 7 exists only to make the learner *look at the lock*. Check-out is the step people skip on
  real work, and they skip it because they've never seen what it prevents.
- Step 10 doubles up — check-in plus opening the BOM — deliberately: check-in should feel like the
  natural end of the edit, not a separate chore with its own step.
- Do **not** add a step demonstrating a forced check-in over someone else's lock. That's an admin
  recovery action, and teaching it in an intro tour makes it look routine.

---

## `change-request` — 12 steps, 2 real API calls

| # | Anchor | Advance | Copy |
|---|---|---|---|
| 1 | `project.tab.files` | `click` | "Change requests live under the Vault, which lives under Files." |
| 2 | `project.tab.vault` | `click` | "Then the Vault." |
| 3 | `vault.tab.crs` | `click` | "The Vault splits in two: the parts, and the proposals to change them." |
| 4 | `cr.list` | `next` | "Every proposed change to a vaulted part, open and closed." |
| 5 | `cr.new` | `click` | "Raise one." |
| 6 | `cr.new` | `next` | "Title says what changes. Rationale says why — that's the field that's still useful in six months." |
| 7 | `cr.new` | `api` POST `/api/projects/:id/change-requests` | "Submit it." |
| 8 | `cr.list` | `next` | "Constellation worked out what it affects from the BOM. You didn't have to remember." |
| 9 | `cr.card` | `click` | "Open the one you just raised — the review controls are inside it, not on the list." |
| 10 | `cr.review` | `next` *(optional)* | "Normally someone else reviews this. In your training project you're both people." |
| 11 | `cr.review` | `api` POST `/api/change-requests/:id/reject` *(optional)* | "Reject it, with a reason. Rejecting isn't rude — 'not until after the design review' is a real answer." |
| 12 | `cr.list` | `next` | "It's still there, with the reason attached. That record is what stops the same change being re-proposed blind." |

**Design notes**

- The tour has the learner **reject** rather than approve, which is the opposite of the obvious
  choice. Approving teaches one click; rejecting teaches that rejection is normal and survivable, and
  that's the behaviour a review culture actually needs. V06 sets this up.
- Step 10 says out loud that reviewing your own CR is an artefact of the sandbox. Without that line
  the tour quietly teaches that self-review is fine.
- Steps 10 and 11 are both `optional`: `cr.review` renders only for admins, on an OPEN CR. A
  non-officer gets a Skip button instead of a 25-second wait on a control their account will never
  show them.
- No step approves anything, so the tour never mutates a version. Keeps the sandbox re-runnable.
