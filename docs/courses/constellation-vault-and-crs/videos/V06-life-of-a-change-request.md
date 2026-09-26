# V06 — The life of a change request

> Vault & CRs · M2 · screen capture and voice-over · recording pending

## Recording setup

Use disposable item versions and two demo accounts: a member who submits and an admin who reviews.
The standard private training project has no seeded Vault items or CRs. Prepare a BOM parent and
child if you want to show a where-used warning. Label every account switch on screen.

## Shot list and narration

| Shot | Live action | Narration |
|---|---|---|
| 1 | Open Files → Vault → Change Requests | "The Vault separates stored versions from proposals to release them." |
| 2 | New change request form | "Give the request a Title and Reason. Select at least one item and the exact version to release; a linked task is optional." |
| 3 | Select a child item used in an assembly | "The form warns when another assembly uses this item. This is a where-used warning; the full Build readiness report appears once the request is open." |
| 4 | Submit and reopen the request | "The request lists its proposed versions. You can ask for an AI impact summary, but review the output yourself." |
| 4a | Link a disposable PR, then open Release review | "The PR title, current head, reviews, checks, and timeline appear beside the request. A failing check or requested change blocks release." |
| 4b | Configure a subsystem or BOM-parent rule; switch to its assigned reviewer | "The assigned member signs off on these exact versions and PR head. A new version or commit makes that sign-off stale." |
| 4c | Open Build readiness on the request | "Before approval, this lists where the part is used, open tasks it touches, missing required drawings, and assemblies on stale revisions. Red blockers stop approval; amber warnings are the reviewer's call." |
| 5 | Switch to admin account | "Only an admin can approve or reject an open request after the release review gate is approved. Approval offers an optional note. Rejection prompts for a reason." |
| 6 | Reject a disposable request | "The rejected request remains in the record with its review note. A regular member can read it, but cannot perform the review action." |
| 7 | Approve a separate disposable request | "Approval releases the selected version, assigns the next revision letter, and records an audit event. It does not close a task or automatically update BOM links." |
| 8 | Open version history | "A GitHub commit stored the file before this review. ClubPM approval is what released the revision." |
| 9 | Reopen the approved request; show Release package | "Approval wrote a manifest pinning every file by commit and SHA-256. The package is built only from it, and Verify rebuilds it byte for byte." |

Approval or rejection notifies the request's author and members watching the covered items, per
their notification preferences. Do not claim that approval notifies every downstream checkout holder, updates stale assemblies, or
checks geometric fit — build readiness reports BOM structure, drawings, and tasks only. Use the actual Reason label and the browser prompt for rejection.
