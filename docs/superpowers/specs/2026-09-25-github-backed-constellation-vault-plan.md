# GitHub backed Constellation Vault — design and delivery plan

Date: 2026-09-25  
Status: implementation roadmap. Phases 1–2 are in progress; no historical migration has run. Phase 3 is conditionally skipped for an empty legacy Vault. Phases 6–9 are required by the 2026-09-25 follow-up request. Phase 7 (release manifests, assembly packages, build readiness) is implemented; see `backend/src/services/vaultReleasePolicy.ts`. Phase 8 (per-item subscriptions, deduplicated in-app/Slack notifications, indexed search with saved views) is implemented; see `backend/src/services/vaultNotificationService.ts` and `vaultSearchService.ts`. Phase 9 (geometry diff for STL/OBJ/glTF/GLB and STEP/STP) is implemented; see **Phase 9 geometry diff — implementation notes** below and `backend/src/services/vaultGeometryCore.ts`.

## Goal and scope

Make a private GitHub repository the durable store for every Vault file, thumbnail, and version. Keep Constellation's item identity, part numbers, checkout, BOM, change requests, releases, activity, and permissions in ClubPM. Show GitHub commits and changes beside the existing CAD views so members can tell who changed a file, why, and what version was released.

The project's separately linked **Drive** source in Files is a document library, not the Vault's current storage. This plan removes Drive from **Vault** storage. Retiring the general Drive source is a separate product decision; doing it here would also affect unrelated documents, parsing, and integrations.

## Current state in this repository

- `backend/src/api/vault.ts` sends file and thumbnail uploads to a bot-owned Drive folder, proxies downloads from Drive, and accepts files up to `VAULT_MAX_UPLOAD_MB` (default 512). `backend/src/services/vaultService.ts` provisions that folder and reports Drive health.
- `backend/prisma/schema.prisma` stores `Project.vaultFolderId`, `VaultItem.driveFolderId`, `VaultVersion.driveFileId`, and `VaultVersion.thumbnailFileId`. Versions already carry notes, revision letters, size, checksum, uploader, and release data.
- `src/components/clubpm/vault/` has the item list, check-in dialog, versions, 3D preview, side-by-side comparison, BOM, change requests, and review queue. `src/pages/ClubPM/ProjectDetail.jsx` presents Drive, GitHub, and Vault as Files sources.
- GitHub App installation authentication and multi-repo `ProjectRepo` links exist in `backend/src/services/githubService.ts` and `backend/src/api/github.ts`. The existing GitHub panel focuses on code, tasks, issues, and PRs. It has no Vault file-write path.
- The Vault course, tour anchors, quizzes, walkthroughs, and training fixtures currently teach or assume Drive storage. Those are migration work, not just copy edits.

## Product experience

### Repository setup

An admin chooses a **Vault repository** for each project from its linked `ProjectRepo` records, or links a new repository, then chooses a dedicated branch (default `vault`). Recommend a private repository dedicated to that project's Vault; code repos remain available when a project intentionally chooses one. Setup verifies that the GitHub App installation can read and write Contents on that repository, that Git LFS works with the installation credential, and that the branch policy permits the chosen write flow. The setup screen shows branch, repository visibility, storage mode, last sync, and actionable health errors. A repo cannot be silently switched after it holds versions; changing it starts a migration wizard.

### Main Vault screen

Keep Files → Vault and its subviews, then make the Vault feel like a repository browser:

- Header: linked repository and branch, sync state, last commit, open change requests, `Open on GitHub`, and an admin-only settings action. A compact recent-commits timeline shows commit messages, authors, and links to GitHub.
- Searchable item list/table: filename and part number, concise **item description**, latest check-in note, author and time, released revision, checkout holder, file type/size, and small status chips. Filters for released/unreleased, changed recently, checked out, and review needed. Sort by activity/name/part number.
- Item detail: Overview, Versions, Changes, Preview/Compare, BOM, and Activity. The overview edits the item description and links relevant task/CR/PR. Versions show an immutable commit SHA with a copy action, original filename, change note, uploader, checksum, LFS marker, file-path breadcrumb, and links to the exact GitHub commit and file. Activity combines ClubPM audit events with relevant GitHub events without implying a GitHub commit released a revision. If a PR is linked, show reviewer and check status as GitHub data, separately from ClubPM release status.
- Changes: select two versions. For text or metadata, show a syntax-aware patch, filename/status, additions/deletions, and a GitHub compare link. For CAD/binary files, show **changed file, sizes, hashes, thumbnails, notes, and the existing side-by-side 3D viewer**; for STL, OBJ, glTF/GLB and STEP/STP, the Phase 9 geometry diff measures the two versions; other CAD formats stay labelled as byte-level (hash/size) differences only. GitHub's compare API does not provide a binary patch.
- Check-in: drag/drop, item name and **required change description**, optional longer release context, duplicate warning, target item, and preview of the selected file. Show transfer progress, then a separate “committing/processing” state. On completion show the new version and its commit. On conflict or GitHub outage show a retryable status and keep the uploaded file until the job is resolved or expires under policy.
- Compact layout: repository status and actions fit the existing phone Files source selector; item details and check-in use the full-screen sheet pattern already used by the Vault.

Do not render private repository URLs or raw GitHub download URLs as the file delivery path. Existing app-authenticated, short-lived download/preview endpoints remain the UI path, now backed by GitHub/LFS. A GitHub link is a convenience for members who also have direct repository access.

## Data and storage contract

1. Add a per-project `VaultRepository` association to an existing `ProjectRepo` plus configured branch, installation ID reference, setup/sync status, last verified head SHA, and migration state. Reject a repository/branch already bound to a different Vault unless explicitly supported later.
2. Give `VaultVersion` a storage provider (`DRIVE` or `GITHUB` during migration), repo/branch, file path, commit SHA, Git blob SHA, SHA-256 of the **real bytes**, and LFS object ID/size when applicable. Give thumbnails provider/path/commit fields too. Keep old Drive IDs nullable until migration is verified and its rollback window closes. Preserve the current version and revision IDs; `ChangeRequestItem.versionId` must never be remapped.
3. Use stable file paths such as `vault/items/<immutable-item-id>/source/<safe-filename>` and `vault/items/<id>/metadata.json`. Each check-in replaces the source path in one new commit; the `VaultVersion` row pins that commit, path, hash, and original filename. A rename removes the former path in the same commit. An item rename does not change its stable path. Generated thumbnails live under a separate preview path. Keep descriptive metadata in both Prisma (query source) and versioned JSON (portable export), with an explicit reconciliation rule: app writes both; on external GitHub changes, flag drift rather than silently overwriting Prisma.
4. Track Vault binaries with Git LFS from the first commit. A repository-local `.gitattributes` rule must cover the Vault binary subtree, while JSON/text metadata stays ordinary Git so GitHub can diff it. Validate the actual blob rather than trusting its extension; test CAD, thumbnails, unknown binary types, and file names with spaces/unicode. Check the repository owner's LFS budget before launch.
5. One check-in is one durable job with an idempotency key and state (`UPLOADED → LFS_STORED → COMMITTED → INDEXED`, plus retry/failure). Serialize writes per Vault branch and compare the expected head SHA when updating the ref. GitHub and PostgreSQL cannot share a transaction: store the commit SHA before exposing the version, retry indexing safely, and reconcile committed-but-unindexed jobs. Never report success while only an LFS pointer or a temp file exists. Clean abandoned temp files on a defined schedule.
6. Preserve the current numbered check-in model and CR approval model. A GitHub commit means **stored**; a ClubPM CR approval means **released**. Optionally add a signed release tag/manifest after approval, but the Prisma release transaction remains authoritative unless a later project explicitly replaces it.

### GitHub transport and permissions

Use a **GitHub App installation token** for Vault reads/writes. Do not fall back to a member OAuth token for a write: ClubPM membership/admin rules and a member's GitHub repository role may differ. Request Contents read/write for file and Git transport; add Pull requests permission only if the optional PR workflow is selected. Keep tokens server-side, out of clone URLs, process logs, and API responses. Confirm that the installation token supports the chosen Git LFS transport in a disposable private repo before implementing the production uploader.

For large files, implement a bounded, disk-backed worker that commits with Git + Git LFS through the installation credential. The normal repository Contents API cannot serve files above 100 MB and is not the large-file upload mechanism. Reads and downloads need a version-pinned Git/LFS resolver and backend streaming with authorization, range support if practical for 3D previews, and correct content headers. Cache only after access control. Webhooks for `push` and installation/repository permission changes update health and detect out-of-band edits; polling/reconciliation covers missed webhooks.

## Migration and rollout

| Phase | Deliverable | Exit check |
| --- | --- | --- |
| 0. Decisions and spike | Choose repository owner/visibility, branch policy, expected file sizes, LFS budget; prove App-token Git LFS push/fetch and private download. Inventory every Vault item/version/thumbnail and its Drive checksum/size. | A disposable repo accepts and returns a 512 MB test object; estimated LFS storage and bandwidth are acceptable. |
| 1. Foundation | Add schema and migrations, repo setup/health API, GitHub transport, durable upload jobs, and authorization. Keep Drive reads for existing versions. | Multiple simultaneous check-ins, retries, permission loss, and branch-head conflicts do not create duplicate visible versions. |
| 2. Dual read and UI | Enable GitHub for new check-ins on pilot projects; render provider-aware versions/downloads and the new Vault UI. Keep old versions readable. | Pilot members can upload, preview, compare, download, create CRs, and approve releases on desktop and phone. |
| 3. Historical migration — skip if empty | No copy job is needed if a read-only inventory across all projects, including soft-deleted items, finds zero legacy Drive-backed versions and thumbnails. Record the counts and inventory timestamp before cutover. If any exist, copy every Drive-backed version and thumbnail into Git/LFS in chronological order, verify SHA-256 and byte length after reading from GitHub, then mark each version GitHub-backed. Keep a checkpoint and per-version retry report. | Empty path: recorded zero Drive-backed versions and thumbnails, with no unexplained legacy items. Migration path: every live version and preview matches the original bytes; CR links, part numbers, revision letters, and audit history are unchanged. |
| 4. Cutover | Recheck the Phase 3 counts, freeze old Vault writes briefly, reconcile in-flight jobs and GitHub head, switch all projects to GitHub writes, and monitor failures and LFS budget. Remove Vault-specific Drive code and setup UI only after the recheck confirms no Drive-backed versions or thumbnails remain and the rollback window closes. | No Vault file or thumbnail read/write depends on Drive; the general Files → Drive source and other Drive integrations still function. |
| 5. Documentation | Update `src/clubpm/tour/tourAnchors.js`, `docs/courses/ANCHORS.md`, affected `*.steps.json`, walkthrough outlines, course prose/videos/quizzes, training fixtures, runbook, env examples, and `AGENTS.md` references in the same navigation/UX change. | `node scripts/check-tour-anchors.js`, frontend build/tests, backend typecheck/tests, and a manual private-repo pilot pass. |
| 6. PR reviews and reviewer rules | Link Vault CRs to GitHub PRs, mirror checks/reviews and timelines, and enforce subsystem/BOM-based required sign-off before ClubPM approval. | Review and check failures block approval; stale approvals are invalidated when the proposed version changes. |
| 7. Releases and build readiness | Produce immutable release manifests and assembly packages pinned to hashes; add where-used, task, drawing, and stale-assembly impact checks. | A package can be reproduced from pinned versions, and approval shows a complete impact report. |
| 8. Subscriptions and search | Add per-item subscriptions with in-app/Slack notifications and indexed search across Vault and GitHub metadata with saved views. | Notifications are deduplicated; search respects project permissions and updates after webhook/reconciliation. |
| 9. Geometry diff | Compute CAD-aware measurements and annotated overlays for supported formats, with clear unsupported-format handling. | Fixture models produce expected dimensions, volume/mesh changes, and stable visual overlays. |

Use a per-project feature flag/rollout state so a pilot can be reversed while historical Drive bytes remain available. Rollback changes **new writes** back to Drive only if the business permits it; GitHub versions already created remain readable by provider. Never delete or unlink the Drive originals until the owner accepts a migration report and the retention period ends. After that, archive/export and document a restore procedure before removing Drive credentials used by the Vault; other product features may still need those credentials.

## Acceptance criteria

- A member can create an item, check in a 512 MB CAD version, download the exact bytes, view a preview, compare it to an older version, and see the author, description, commit, and check-in time.
- The version list and CR release status survive GitHub webhook delay, duplicate delivery, backend restart, retries, and an external branch push. Out-of-band pushes are visible as drift and cannot silently overwrite a Vault version.
- A revoked App installation, branch protection denial, LFS quota stop, missing LFS object, and GitHub outage produce distinct repair messages. No partial check-in appears as a valid version.
- Private bytes remain behind ClubPM authorization; signed links expire and cannot be used to browse other projects. Repo links reveal only metadata users are already allowed to see.
- If the legacy Vault is empty, a recorded inventory shows zero Drive-backed versions and thumbnails before cutover. Otherwise, all migrated versions and thumbnails have matching SHA-256/size checks, and all legacy CR/BOM/release relationships remain intact.

## Required extension features (phases 6–9)

| Phase | Feature | Why add it |
| --- | --- | --- |
| 6 | Link a Vault change request to a GitHub PR, mirror review/check status, and show both timelines. | One review trail for CAD and code, while ClubPM remains the authority for the released revision. |
| 7 | Release manifest and downloadable assembly package pinned to exact version hashes. | Makes a physical build reproducible and gives purchasers/manufacturers one unambiguous set of files. |
| 8 | File-level subscriptions and Slack notifications for new check-ins, CR decisions, and checkout conflicts. | Helps collaborators notice relevant changes without watching the whole repo. |
| 9 | CAD-aware geometry diff: bounding-box/volume measurements, changed components, and annotated overlays. | Gives a real answer to “what changed” for binary models beyond filename, checksum, and side-by-side inspection. Requires format-specific parsers and reliable tolerances. |
| 6 | `CODEOWNERS`-style reviewer rules by subsystem or BOM parent, with required sign-off. | Routes release review to the people responsible for affected assemblies. |
| 7 | Dependency impact and build readiness: show where-used chains, affected tasks, missing drawings, and stale assembly revisions before approval. | Prevents a part release from surprising downstream work. |
| 8 | Search across descriptions, filenames, part numbers, notes, CRs, and GitHub commit messages, with saved views. | Makes a larger Vault usable without guessing exact names. |

## Phase 9 geometry diff — implementation notes

- **Where:** item → **Changes** → pick two versions. `VaultGeometryDiffPanel.jsx` requests `POST /api/vault/geometry-diffs`, polls `GET /api/vault/geometry-diffs/:id`, and renders units, tolerance, measurements, components, limitations and aligned side-by-side viewers (`VaultCompareView` with a shared frame and overlays).
- **Pipeline:** `vaultGeometryParsers.ts` (STL binary/ASCII, OBJ, glTF 2.0/GLB) and `vaultGeometryStep.ts` (STEP) produce named triangle components; `vaultGeometryCore.ts` measures and diffs them; `vaultGeometryRun.ts` is the whole computation a worker thread performs; `vaultGeometryService.ts` queues, leases, bounds and caches it.
- **STEP conversion (reproducible):** OpenCascade compiled to WebAssembly, npm `occt-import-js` pinned to an exact version in `backend/package.json`, run in-process with fixed `STEP_PARAMS` (millimetre output, linear deflection 0.001 × average bounding-box side, angular 0.5 rad). No system binary or network. Same bytes + same package version + same parameters = same triangles. The converter version and parameters are part of the cache key. To reproduce by hand: `cd backend && node -e "require('occt-import-js')().then(o => console.log(o.ReadStepFile(require('fs').readFileSync('part.step'), {linearUnit:'millimeter',linearDeflectionType:'bounding_box_ratio',linearDeflection:0.001,angularDeflection:0.5})))"`. The package is LGPL-2.1 (OpenCascade); it runs server-side and is not shipped in the web bundle.
- **Units:** STL/OBJ carry none — the requester may declare one, recorded as "declared"; glTF is metres by specification; STEP uses the file's own unit converted to mm. With no known unit, lengths are "model units" and no volume is reported.
- **What is exact and what is not:** bounding boxes come from every triangle. Volume is reported only for a closed, edge-manifold, consistently oriented mesh with a known unit — "exact for the stored mesh" for mesh formats, "tessellation approximation" for STEP. Open, non-manifold and inconsistently oriented meshes get an explicit status and no number. Deviations and deviating areas come from deterministic area-weighted surface samples and are labelled estimates; added/removed *material* is claimed only when both models are valid solids (inside/outside test), otherwise "changed surface". Rigid translations are detected; rotations are not.
- **Tolerance:** requested, or automatic (0.01% of the larger bounding-box diagonal, never below twice the STEP tessellation deflection). Always shown with its source.
- **Bounds:** per-file size cap before fetching (`VAULT_GEOMETRY_MAX_MB`), triangle cap in the parsers, one worker thread per diff with a heap limit (`VAULT_GEOMETRY_WORKER_MB`) and wall-clock timeout (`VAULT_GEOMETRY_TIMEOUT_MS`), one diff at a time per process, leased rows reclaimed by the `*/2` cron. Storage failures retry up to three times; unsupported/conversion-failed/too-large/timeout outcomes are stored and not retried.
- **Cache and authorization:** `VaultGeometryDiff` is unique per (project, cacheKey), where cacheKey hashes the algorithm version, converter version/parameters, both versions' SHA-256, formats, declared unit and tolerance. Bump `GEOMETRY_ALGORITHM_VERSION` whenever output can change. Every read re-checks `canAccessVaultProject` for the row's project; results are never shared across projects.
- **Tests:** `backend/src/services/vaultGeometry.test.ts` (fixture pairs: unchanged, translation, added/removed material, a pocket cut, changed components, glTF transforms, non-manifold/open/flipped meshes, STEP in mm and inch, conversion and parse failures, tolerance, determinism), `vaultGeometryService.test.ts` (cache key, authorization, bounded worker, route guards), and `src/components/clubpm/vault/VaultGeometryDiff.test.jsx`.

## Decisions for the product owner

1. **Repository topology:** recommended one private, dedicated Vault repository per project, linked through `ProjectRepo`; allow an existing code repo only as an explicit choice.
2. **Release review:** keep ClubPM change requests authoritative; Phase 6 adds PR-linked review and required sign-off as gates before ClubPM approval.
3. **File scope:** recommended migrate the CAD Vault only; retain the separate general Drive source until a document-storage plan exists.
4. **Budget/retention:** set the repository owner's Git LFS spending cap, expected monthly download volume, and how long Drive originals remain after verification.

## GitHub documentation used for the constraints

- [GitHub file and repository size limits](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github): ordinary Git blocks files above 100 MiB.
- [Git LFS overview](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage): the repository stores pointers to large objects.
- [Git LFS billing](https://docs.github.com/en/billing/concepts/product-billing/git-lfs): every changed large-file version uses storage and downloads use bandwidth.
- [Repository Contents API](https://docs.github.com/en/rest/repos/contents): contents reads do not support files above 100 MB.
- [Compare commits API](https://docs.github.com/en/rest/commits/commits): binary files have no `patch` property.
- [GitHub App permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app): Contents permission enables HTTP Git access; installation tokens use the App's granted permissions.
- [Git LFS in pull requests](https://docs.github.com/en/repositories/working-with-files/managing-large-files/collaboration-with-git-large-file-storage): GitHub may show only LFS pointer changes in PRs.
