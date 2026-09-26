# Vault & CRs — walkthrough outlines

These outlines describe the shipped tours in the adjacent .steps.json files.

The private training project seeds tasks, milestones, and a blocker. It does not seed a Vault item,
version, BOM, CR, or GitHub repository. Complete the Vault walkthrough first with two disposable
practice files. A configured GitHub Vault repository is needed to practice the GitHub job path;
otherwise check-ins use the legacy bot-owned Drive Vault. The general Files → Drive source is separate.

## vault-checkout

1. Open Files, then select Vault.
2. Read the repository and storage status.
3. Use Check in file to create a practice item. Supply a file, name, and required change description.
   For a GitHub-enabled project, wait until the job reaches INDEXED and the dialog closes.
4. Keep Recent activity sort and clear filters, then open the first item. Inspect Versions and check
   it out. The item detail shows the holder.
5. Note the Watch control: checking out watched the item (unless auto-watch is off in Notification
   preferences). The chevron chooses check-ins, CR decisions and checkout conflicts. This step uses
   Next and changes nothing.
6. Choose New check-in in the item detail, submit a second file with a change description, and wait
   for the dialog to close. The successful check-in automatically releases the checkout.
7. Inspect both versions and open the initially empty BOM.

The Search tab (`vault.tab.search`, `vault.search`) is not part of this tour; C06 describes it.

The checkout wait is POST /api/vault/items/:id/checkout. The upload step uses Next because the UI
chooses POST /api/vault/items/:id/github-versions plus job polling, or the legacy POST
/api/vault/items/:id/versions. A POST response alone does not mean a GitHub version is indexed.

## change-request

1. Open Files → Vault → Change Requests.
2. Open New change request. Enter Title and Reason, choose an item and its exact version, and
   optionally link a task. The form may warn when that item appears in an assembly.
3. Submit with POST /api/projects/:id/change-requests and open a request card.
4. An admin can Reject an open request via POST /api/change-requests/:id/reject and enter a reason.
   The release-review panel explains linked PR checks and required sign-offs. Build readiness (open
   requests only; optional step) lists where-used chains, affected open tasks, missing required
   drawings, and stale assemblies, split into approval blockers and warnings. The two admin decision
   steps are optional for a regular learner. A member named by a reviewer rule can sign off here.
   After a decision, the request detail
   remains open with its status; a Review note appears only if one was entered. Skipping review
   leaves the request Open.

Approving a request writes an immutable release manifest; the approved request then shows its
Release package (download, verify, save manifest) in place of build readiness.

This tour does not approve a version. A GitHub commit records storage; ClubPM approval releases a
revision. Review controls are restricted to admins.
