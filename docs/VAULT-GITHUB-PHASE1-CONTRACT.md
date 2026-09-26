# Vault GitHub Phase 1 contract for Phase 2

Phase 1 adds the backend foundation. The migration in `backend/prisma/migrations/20260925000000_vault_github_foundation/` has **not** been applied to production. New GitHub writes are disabled per project until an admin completes setup and explicitly enables them. Legacy Drive versions remain `DRIVE` and retain their IDs, CR links, revision letters, and Drive IDs.

## Schema

- `VaultRepository` binds exactly one project to one existing `ProjectRepo` and a branch. It stores a lowercase repo slug, the App installation ID, `writeEnabled`, `setupStatus`, `migrationState`, `lastHeadSha`, `lastSyncedAt`, and a branch worker lease. `ProjectRepo.id` and the lowercase slug/branch pair are unique in this table. Setup rejects the same slug/branch on another project and refuses to switch a binding after the project has versions.
- `VaultVersion.storageProvider` defaults to `DRIVE`. GitHub versions set `repositoryId`, `branch`, `filePath`, `commitSha`, `blobSha`, `sha256`, `lfsOid`, and `lfsSize`. `driveFileId` and `VaultItem.driveFolderId` are nullable for new GitHub items. Thumbnail provider/path/commit/blob/hash/LFS fields are nullable; old thumbnails continue to use `thumbnailFileId`.
- `VaultUploadJob` stores one idempotency key per project, disk path, source hash and length, expected branch head, state, commit fields, optional indexed version ID, and a safe error code. The database row does not contain GitHub credentials. States are `UPLOADED`, `LFS_STORED`, `COMMITTED`, `INDEXED`, `RETRY`, and `FAILED`. Only `INDEXED` has a visible `VaultVersion`.
- Source paths are `vault/items/<itemId>/source/<filename>`; metadata is `vault/items/<itemId>/metadata.json`. `.gitattributes` places source and preview subtrees under LFS. A filename change removes the old source path in the same commit. Metadata remains ordinary Git.

## REST API

All paths below are under `/api`. Setup and toggles require a ClubPM admin. Reads, jobs, downloads, and signed link minting check current project membership or admin status. The binary URL signature binds the requesting member ID and each use rechecks membership.

| Method and path | Request | Response |
| --- | --- | --- |
| `GET /projects/:projectId/vault/repository` | — | Sanitized repository binding or `null`. |
| `PUT /projects/:projectId/vault/repository` | JSON `{ projectRepoId, branch? }` | Binding with writes off and setup pending. The `ProjectRepo` must belong to the project and have an App installation. |
| `POST /projects/:projectId/vault/repository/verify` | — | Performs an actual App-token Git LFS write/fetch proof on the selected branch; returns `READY` and head SHA. It commits a small `healthcheck` LFS object. |
| `GET /projects/:projectId/vault/repository/health` | — | Current visibility, App push permission, branch head, and drift status. |
| `PATCH /projects/:projectId/vault/repository` | JSON `{ writeEnabled: boolean }` | Per-project rollout switch. Enabling requires `READY`. |
| `POST /projects/:projectId/vault/github-items` | Multipart `file`, `name`, `note`, optional `description`, `expectedHeadSha`; required `Idempotency-Key` header | `202 { itemId, job }`. An item can exist while its first version is pending. |
| `POST /vault/items/:id/github-versions` | Multipart `file`, required `note`, `expectedHeadSha`; required `Idempotency-Key` header | `202 { job }`. A repeat key with changed file, note, item, or uploader is rejected. |
| `GET /vault/upload-jobs/:id` | — | Safe job status, error code, commit SHA, and version ID. Never returns disk path or credential. |
| `POST /vault/upload-jobs/:id/retry` | For branch drift, JSON `{ expectedHeadSha }` | `202 { job }`. Only uploader or admin may retry. Reuses a recorded commit; it does not push a duplicate. |
| `GET /vault/versions/:id/download` | Auth or signed URL; optional single byte range | Verified Git/LFS bytes for GitHub versions; Drive proxy for legacy versions. |
| `GET /vault/versions/:id/download-url` | Auth | Short-lived signed URL for that version. |

The client should poll a job until `INDEXED`, then load the version by `versionId`. `COMMITTED` means Git has the commit but the version is still hidden. `RETRY` carries a safe `errorCode` (`AUTH`, `PERMISSION`, `BRANCH_DRIFT`, `LFS_MISSING`, `LFS_QUOTA`, `GIT_ERROR`, or `VERIFY_FAILED`). For drift, fetch repository health/head and present a deliberate retry; never silently replace the user's expected head. The worker resumes pending jobs on boot and every 30 seconds. Keep `VAULT_JOB_DIR` on a durable, writable volume; orphan files are swept after 48 hours and failed-job files after seven days.

The existing Drive item and check-in endpoints reject writes when `writeEnabled` is true, so Phase 2 should use the GitHub endpoints for pilot projects. Drive reads remain available. Phase 2 still needs the user interface and GitHub thumbnail upload flow; this phase adds the thumbnail storage contract and provider-aware reads, but does not enable thumbnail writes for GitHub versions.

## Operational gate

The Phase 0 live inventory, owner LFS budget decision, and 512 MiB disposable-repository proof remain outstanding. Before any pilot, apply the migration in a controlled environment, configure a persistent job volume, complete those checks, and run the admin repository verification against a private repository. No production migration, deployment, or write toggle occurred in Phase 1.
