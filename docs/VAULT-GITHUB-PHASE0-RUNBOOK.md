# Vault GitHub Phase 0: configuration, inventory, and migration

Status: preparation only. No production Vault write path or historical migration is enabled.

## Decisions and prerequisites

| Decision | Phase 0 value |
| --- | --- |
| Topology | One private, dedicated Vault repository per ClubPM project, owned by the same GitHub organization/account that installs the Constellation App. Record its exact `owner/repo` against that project's `ProjectRepo`; never reuse one repository across projects. The actual owner and repo names must be selected by the project administrator. |
| Branch | `vault`, created by the App in the dedicated repository. All Vault writes target this branch. No force pushes or direct human writes. |
| Release authority | ClubPM change request approval and Prisma release state; a GitHub commit only proves storage. |
| Existing Files source | Files → Drive remains available for general documents. Only Vault storage migrates. |
| File size envelope | Current server upload cap is `VAULT_MAX_UPLOAD_MB`, default 512 MiB. Run the 512 MiB LFS proof before accepting the target. Inventory actual distribution before setting a lower or higher cap. |
| Old bytes | Preserve Drive originals and credentials through verification, owner acceptance, and a documented retention window. Choose the window before Phase 3; no deletion in Phase 0. |

The repository owner must approve the LFS budget and spending cap after seeing the inventory and likely monthly downloads. The current quota and price depend on the owner's plan; record those values from [GitHub's LFS billing page](https://docs.github.com/en/billing/concepts/product-billing/git-lfs) and the owner's Billing settings, rather than embedding a price in code.

## Required repository and App configuration

1. Create a **private** repository dedicated to one project. Install the existing GitHub App on that exact repository. Record `projectId`, `ProjectRepo.id`, `owner/repo`, installation ID, owner plan, and the `vault` branch in the migration ledger. `ProjectRepo.installId` may currently be null; resolve and verify it before later setup work. Never use a member OAuth token for Vault writes.
2. Give the App **Contents: read and write**. GitHub documents that Contents permission enables installation-token HTTP Git access ([App permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app)). Phase 6 PR linkage will require **Pull requests** permission if implemented. A repository administrator needs access to create the repo, install/configure the App, and set branch rules; these are setup privileges, not runtime App permissions.
3. On `vault`, prevent force pushes and deletion. Restrict direct updates to the App where supported. If a ruleset requires a pull request, signed commits, status checks, or restricted updates, explicitly allow the App's intended direct-push flow or choose a compatible PR flow before enabling writes. Check **all** repo and organization rulesets and legacy branch protection; a rule at either level can reject a push. A ruleset can grant an App bypass, but only grant the narrow bypass required ([GitHub rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository)). Prove actual push with the smoke command; API read permission alone does not prove write or LFS permission.
4. Track source binaries and thumbnails in LFS from the first commit. Keep metadata JSON in ordinary Git. Validate committed pointers and fetched bytes. Set a billing alert/spending limit with enough headroom for migration uploads and verification downloads. Keep App private key and tokens server-side; never embed a token in a clone URL or output file.

## Read-only inventory and estimate

From `backend/`, with `DATABASE_URL`, `INTEGRATION_TOKEN_KEY`, the Drive bot credential in the database, and `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET` available:

```powershell
$env:VAULT_EST_MONTHLY_DOWNLOADS = '2'  # example: each stored object fetched twice/month
$env:VAULT_EST_MONTHLY_NEW_GIB = '1'     # example: 1 GiB of new versions/month
npx tsx scripts/vault-inventory.ts > vault-inventory.json
```

`vault-inventory.json` contains **all** Vault items, including soft-deleted ones, every version, source and thumbnail Drive IDs, database size/MD5, Drive size/MD5, and mismatch/error flags. It makes only database reads and Drive `files.get` metadata requests. Treat the output as sensitive: it contains private filenames and Drive IDs; store it outside the repository. Exit code 2 means at least one Drive size is missing or a stored source size/MD5 disagrees. Resolve each discrepancy before migration. DB MD5 and Drive MD5 are inventory checks only; Phase 3 must stream and SHA-256 hash both original and migrated bytes.

The estimate sums **distinct Drive objects** (source versions plus thumbnails), so `initialStorageGiB` is the known lower bound for Git LFS. `storageAfter12MonthsGiB = initial + 12 × monthlyNewGiB`. `monthlyBandwidthGiB = initial × monthlyDownloadsPerStoredObject`; the first month also includes initial migration upload. These are planning scenarios, not GitHub billing invoices. Add expected preview/download traffic, retries, migration validation fetches, and growth; compare against the owner account's current LFS allowance and cap. Missing Drive sizes make the estimate incomplete. Never mark the budget accepted from a partial inventory.

## Disposable repository transport proof

Use a disposable **private** repository whose App installation has Contents read/write and a fresh branch name. The command creates a 512 MiB random file, commits its LFS pointer, pushes with an **installation token**, then makes a fresh authenticated clone and LFS pull and compares SHA-256. It checks that an unauthenticated repository API lookup returns 404. The branch stays in the disposable repo for inspection; remove that repo/branch after recording evidence. The command will refuse an existing branch.

```powershell
cd backend
node scripts/vault-lfs-smoke.mjs --repo OWNER/DISPOSABLE-REPO --installation-id INSTALLATION_ID --branch vault --confirm-disposable
```

Requires `GITHUB_APP_ID`, base64 `GITHUB_APP_PRIVATE_KEY`, Git, Git LFS, network access, and about 1.2 GiB free temporary disk. It prints a PASS record with byte count and hash only after push, fresh fetch, and byte comparison. A missing repo, installation, or credential is **not** proof. Record the repo, branch, App permission/ruleset snapshot, command result, SHA-256, and LFS owner billing state. If a direct push is denied, fix the branch policy in the disposable repo and rerun; do not weaken production rules based on an API-only check.

## Phase 1–4 migration sequence

1. Phase 1: add a per-project Vault repository association and provider-aware version fields. Keep `VaultItem.id`, `VaultVersion.id`, `ChangeRequestItem.versionId`, revisions, and release records stable. Existing versions remain `DRIVE`. Refuse a repository/branch already assigned to another project and block silent switching after versions exist. Add a durable idempotent check-in job and commit-head compare before new writes.
2. Phase 2: pilot new GitHub writes on one project behind a per-project flag. Keep Drive reads for historical versions and the separate Files → Drive source. Test check-in, signed private download, preview, compare, CR approval, and retry on desktop and phone.
3. Phase 3: skip the historical copy if the initial inventory shows no legacy Vault items and the pre-cutover inventory shows zero Drive-backed versions and thumbnails across all projects, including soft-deleted items. Record the timestamp and counts. Otherwise, freeze a migration checkpoint and copy every source version and thumbnail in chronological order. For each object record Drive ID, original byte length and SHA-256, repository path, commit SHA, LFS OID, fetched byte length and SHA-256, state, and retry error. Mark a version GitHub-backed only after byte-for-byte validation. Reconcile counts and all CR/BOM links. Do not rewrite existing IDs or release dates.
4. Phase 4: recheck the legacy counts, pause old Vault writes, drain jobs, compare GitHub branch head and database checkpoint, then switch projects to GitHub writes. Remove Vault-specific Drive code only when no Drive-backed versions or thumbnails remain and the rollback window has closed. Monitor auth, branch denials, LFS quota, missing LFS objects, and download failures. To roll back writes, change only the project write flag; GitHub-backed versions must keep a provider-aware read path. If originals exist, retain them for the agreed window and export/archive them with a restore procedure before deletion.

For the empty-Vault decision, record the initial `itemCount` and `versionCount` from `vault-inventory.json` before pilot writes. Immediately before cutover, run this read-only SQL against the same production database and save its timestamped result. A nonzero Drive-backed count means Phase 3 cannot be skipped. The query includes soft-deleted items and treats a null thumbnail provider with a Drive file ID as a legacy thumbnail.

```sql
SELECT now() AS checked_at,
       (SELECT count(*) FROM "VaultVersion" WHERE "storageProvider" = 'DRIVE') AS drive_versions,
       (SELECT count(*) FROM "VaultVersion"
        WHERE "thumbnailFileId" IS NOT NULL
          AND ("thumbnailProvider" IS NULL OR "thumbnailProvider" = 'DRIVE')) AS drive_thumbnails,
       (SELECT count(*) FROM "VaultItem" WHERE "driveFolderId" IS NOT NULL) AS drive_items;
```

Investigate any nonzero `drive_items` even when both version counts are zero; its folder or item metadata may still need reconciliation. Phase 2 creates GitHub-backed items, so total item and version counts need not remain zero at cutover.

Exit from Phase 0 requires a complete inventory with no unexplained missing metadata, a reviewed storage/bandwidth scenario and cap, and a **live passing** 512 MiB disposable-repository proof. No production cutover follows automatically.

## Local execution record — 2026-09-25

- Backend typecheck and smoke-script syntax check passed; Git and Git LFS are installed locally.
- The inventory command could not connect to `localhost:5432` from this workspace. The local `backend/.env` also lacks `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`, which are needed to inspect Drive file metadata. Consequently there is no live inventory or numeric owner budget approval yet.
- App ID and private key are configured locally, but no disposable repository name or corresponding installation ID was supplied. The 512 MiB Git LFS upload/fetch/private-download proof has **not** run. Provide a private disposable `owner/repo`, its App installation ID, a reachable database, and Drive OAuth client configuration to complete the exit check.
