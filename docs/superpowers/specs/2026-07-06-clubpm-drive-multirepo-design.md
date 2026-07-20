# ClubPM — Drive OAuth + Multi‑Repo + Vault Subtab Overhaul

**Date:** 2026-07-06
**Status:** Approved design (pending user spec review)
**Delivery:** Spec + paste‑able per‑phase prompts optimized for Sonnet 5 (medium) subagents. Author dispatches phases; user retains control.

---

## 1. Summary

Four independent workstreams in the ClubPM Files/GitHub/Vault area:

- **A. Drive uploads** — switch Google Drive from a zero‑quota **service account** to a **single dedicated "bot" Google account** authorized once via OAuth (refresh token stored server‑side). Uploads then have real quota and an owner.
- **B. Multiple repos per project** — replace the single `Project.githubRepo` string with a `ProjectRepo` table; **all repos fully equal (no primary)**; per‑repo CI gating, per‑repo App installation, per‑repo milestone sync. Routes become `/api/github/repos/:repoId/…`.
- **C1. Reauth on add‑repo** — adding a repo forces a fresh GitHub OAuth round‑trip so newly‑accessible repos appear.
- **C2. Vault → Files subtab** — move the standalone Vault nav item to a third Files subtab (**Drive · GitHub · Vault**).
- **C3. Black‑on‑black CSS** — fix portaled ClubPM modals that lose their CSS custom properties, plus low‑contrast GitHub refresh icon.

Workstream A and C3 are fully independent of B and can run in parallel. C2 and B's frontend panel both edit `ProjectDetail.jsx` and must serialize.

---

## 2. Current‑state findings (verified)

- `backend/src/services/driveService.ts` uses `GOOGLE_SERVICE_ACCOUNT_KEY` for **both** viewing and uploading. Viewing works because reading a file shared with the service account needs **no storage quota**; uploading fails because a created file's bytes must be charged to an owner and a service account's quota is fixed at **zero**. This is a hard Google rule — not a scope/config toggle. `supportsAllDrives: true` is already set on write paths.
- GitHub is already the "user‑authenticated" model: per‑member OAuth tokens stored **encrypted** on `Member.githubAccessToken` via `encryptSecret`/`decryptSecret` (`backend/src/utils/crypto.js`). `octokitForProject(projectId, memberId)` prefers an App installation (`Project.githubInstallId`) then falls back to the member's OAuth (`backend/src/services/githubService.ts:84`).
- The **Files tab already merged GitHub in** as a Drive|GitHub segmented toggle (`FilesTabContent`, `src/pages/ClubPM/ProjectDetail.jsx:2099`). **Vault is still a separate top‑level nav tab** (`NAV_TABS`, line 132; `activeTab === "vault"` block, line 3445). `VaultTab` takes `{ project, member, isAdmin }` and has its own internal pills (Vault / Change Requests / Review Queue).
- `Project.githubRepo` is a single `String?` (`schema.prisma:252`); `githubInstallId Int?`; `githubBlockDoneOnCiFail Boolean @default(true)`. `GitHubLink.repoFullName` is **already repo‑scoped** (cross‑repo task links work at the data layer today).
- **Black‑on‑black root cause:** `--clubpm-*` tokens alias `--pm-*` tokens declared on `.clubpm-app` (`search-theme.css:4443+`). `LinkRepoModal` (and siblings) `createPortal(…, document.body)`, escaping `.clubpm-app`. The tokens then compute to *empty* (not undefined), so `var(--token, fallback)` does **not** use the fallback → transparent bg / default‑black text. The refresh icon (`.cpm-gh-refresh-btn`, `search-theme.css:17697`) is a low‑contrast variant of the same family.
- Webhook (`githubWebhook.ts`) verifies HMAC then dispatches to `githubSyncService.ts` handlers, which resolve repo→project (today via `Project.githubRepo`).

Backend multi‑repo touchpoints: `github.ts`, `githubSyncService.ts`, `taskCompletionService.ts`, `projects.ts`, `projectService.ts`, `githubService.ts`, `githubWebhook.ts`.
Frontend touchpoints (13): `ProjectDetail.jsx`, `Dashboard.jsx`, `MembersView.jsx`, `GhStatsSection.jsx`, `MilestonePanel.jsx`, and `components/clubpm/github/*` (GitHubPanel, LinkRepoModal, GitHubTaskSection, IssuePickerModal, IssuePreviewModal, PrPreviewModal, FilePreviewModal, ImportIssuesModal, BranchCreateModal), plus `api/clubPmClient.js`.

---

## 3. Workstream A — Drive → single bot Google account (OAuth)

### Data
New singleton model:
```prisma
model GoogleDriveCredential {
  id            String   @id @default("singleton")
  refreshToken  String   // encrypted via encryptSecret
  accountEmail  String
  scope         String
  connectedById String?
  connectedAt   DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```
Enforce singleton by fixed id `"singleton"` (upsert on connect).

### Backend
- `backend/src/api/googleAuth.ts` (mirrors `githubAuth.ts`), mounted in `app.ts`:
  - `GET /auth/google` — admin‑only; redirect to Google consent, `scope=https://www.googleapis.com/auth/drive`, `access_type=offline`, `prompt=consent` (guarantees a refresh token), state bound to session.
  - `GET /auth/google/callback` — exchange code, upsert `GoogleDriveCredential` (encrypt refresh token, store `accountEmail` from `oauth2.userinfo`), redirect back to the SPA.
  - `DELETE /auth/google` — admin; delete the credential row.
  - `GET /auth/google/status` — `{ connected, email }`.
- Rewrite `driveService.ts` auth: replace `getDriveAuth()`/`getDriveWriteAuth()` with one `getBotDrive()` that reads the stored credential, builds a `google.auth.OAuth2` client with the refresh token, and returns a `drive` client (googleapis auto‑refreshes the access token). **All existing exported functions keep their signatures**; viewing and uploading both run as the bot. Replace `getServiceAccountEmail()` with `getBotAccountEmail()` (reads the stored email). If no credential exists, functions return their existing "null/empty" failure shapes so the UI degrades gracefully.

### Frontend
- `GoogleDriveConnectButton.jsx` (mirrors `GitHubConnectButton.jsx`): shows connected bot email + Connect/Disconnect; used in `AdminView` and surfaced in the Drive files empty‑state when uploads would fail.
- `clubPmClient.js`: `getGoogleDriveStatus()`, `disconnectGoogleDrive()` (connect is a full‑page redirect to `/auth/google`).

### Env / out‑of‑band (user)
- New env: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`. `GOOGLE_SERVICE_ACCOUNT_KEY` may be retired after cutover.
- Create an OAuth 2.0 Client (Web) in the existing GCP project; add the redirect URI.
- After connecting, **re‑share each project's Drive folder with the bot's email** (shown in the UI). No DB data migration; Drive file IDs remain valid. Existing public blog images (`anyone:reader`) stay accessible regardless.

---

## 4. Workstream B — Multiple repos per project (all equal)

### Data
```prisma
model ProjectRepo {
  id                String   @id @default(cuid())
  project           Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  projectId         String
  slug              String   // "owner/repo"
  installId         Int?     // per-repo GitHub App installation
  blockDoneOnCiFail Boolean  @default(true)
  createdById       String?
  createdAt         DateTime @default(now())
  milestoneMaps     GitHubMilestoneMap[]
  @@unique([projectId, slug])
}
```
- `Project.repos ProjectRepo[]`.
- `GitHubMilestoneMap` gains `projectRepoId String?` + relation (which repo the mapped GitHub milestone lives in).
- `GitHubLink.repoFullName` unchanged.
- **Data migration:** for every `Project` with a non‑null `githubRepo`, create a `ProjectRepo { slug: githubRepo, installId: githubInstallId, blockDoneOnCiFail: githubBlockDoneOnCiFail }`. Backfill `GitHubMilestoneMap.projectRepoId` from the project's sole migrated repo. Keep the old `Project.github*` columns until all code paths read `ProjectRepo`; drop them in a final cleanup migration.

### Backend
- `githubService.ts`: add `octokitForRepo(projectRepoId, memberId)` (per‑repo `installId` → member OAuth fallback). Keep `octokitForProject` only if a caller still needs project‑level (else remove).
- `github.ts`:
  - Repo CRUD: `GET /api/github/projects/:id/repos`, `POST /api/github/projects/:id/repos` (validate via member OAuth before insert), `PATCH /api/github/repos/:repoId` (toggle `blockDoneOnCiFail`), `DELETE /api/github/repos/:repoId`.
  - Convert browse/sync routes to `/api/github/repos/:repoId/{repo,issues,pulls,branches,commits,contents}` and `…/issues/:number`, `…/pulls/:number`. Replace `loadProjectRepo(projectId)` with `loadRepo(repoId)` → `{ owner, repo, projectRepo }`.
  - Milestone + contributor routes become repo‑scoped where they were project‑scoped.
- `taskCompletionService.ts` (CI gating): on DONE, for each linked PR resolve its repo's `ProjectRepo.blockDoneOnCiFail` (not the project flag).
- `githubSyncService.ts`: `syncMilestoneToGitHub` takes a target `repoId`; contributor discovery per repo; **webhook handlers resolve repo→project via `ProjectRepo.slug`** (not `Project.githubRepo`).

### Frontend
- `GitHubPanel.jsx`: fetch linked repos; render a **repo switcher** (tabs) + "Add repo" + per‑repo CI‑gating toggle + remove. All sub‑panel fetches use the selected `repoId` against `/repos/:repoId/…`. Empty state → "Add a repository".
- `LinkRepoModal` → `AddRepoModal`: **appends** via `POST /projects/:id/repos` (not a project PATCH); launches the reauth (C1) first.
- Task/milestone integration (`GitHubTaskSection`, `IssuePickerModal`, `ImportIssuesModal`, `BranchCreateModal`, `IssuePreviewModal`, `PrPreviewModal`, `FilePreviewModal`, `MilestonePanel`): accept/choose a `repoId` (default to first linked repo; show a picker when >1).
- `Dashboard.jsx` GithubActivityWidget / `GhStatsSection.jsx` / `MembersView.jsx`: iterate linked repos (aggregate or per‑repo).
- `clubPmClient.js`: `listProjectRepos`, `addProjectRepo`, `updateProjectRepo`, `removeProjectRepo`; existing GitHub getters take `repoId`.

---

## 5. Workstream C

### C1 — Reauth on add‑repo
"Add repo" full‑page‑redirects to `/auth/github?returnTo=<project files/github>&intent=addrepo`. On return, the panel reads `intent=addrepo` and auto‑opens `AddRepoModal`. The re‑minted OAuth token reflects any repo the user can now access. **Caveat:** if a repo is gated by the **App installation** (not the user's OAuth), it must also be added to the installation in GitHub settings — surface a "manage installation" link for that case.

### C2 — Vault → Files subtab
`ProjectDetail.jsx`: remove `vault` from `NAV_TABS`; extend `FilesTabContent`'s segmented control to **Drive · GitHub · Vault**; render `<VaultTab project={project} member={member} isAdmin={isAdmin} />` for the vault segment; delete the top‑level `activeTab === "vault"` block; extend the sessionStorage sub‑tab persistence to accept `"vault"`. Redirect any deep link targeting the old vault tab to files+vault.

### C3 — Black‑on‑black CSS
- Give portaled ClubPM modals a token‑carrying scope: add a `clubpm-portal` wrapper class (redeclaring the `--pm-*`/`--clubpm-*` block) or render the portal root with `className="clubpm-app"`, so custom properties resolve outside `.clubpm-app`. Apply to `LinkRepoModal`/`AddRepoModal` and any sibling ClubPM modal portaled to `document.body`.
- Raise `.cpm-gh-refresh-btn` icon contrast (explicit token with guaranteed contrast). Verify the validated‑repo card text and repo‑name input read correctly in both light and dark.

---

## 6. Phasing (Sonnet 5 medium; ≤4 files / ≤50 tool calls each)

After **every** phase: `npm run build` (repo root) + `npx tsc --noEmit` (backend/). Fix all errors before continuing.

| # | Phase | Files (≈) | Depends on | Parallel group |
|---|-------|-----------|-----------|----------------|
| A1 | Drive bot backend: `GoogleDriveCredential` + migration, `driveService.ts` OAuth rewrite, `googleAuth.ts`, mount in `app.ts` | 4 | — | **A (independent)** |
| A2 | Drive bot UI: `GoogleDriveConnectButton`, AdminView + Drive empty‑state wiring, clubPmClient helpers | 3 | A1 | A |
| C3 | CSS portal‑token fix + refresh‑icon contrast (`search-theme.css` + modal portal wrappers) | 2–3 | — | **independent** |
| B1 | Schema: `ProjectRepo` + `GitHubMilestoneMap.projectRepoId` + migration + data‑migrate | 2 | — | **B (serial chain)** |
| B2 | `octokitForRepo` + `github.ts` repo CRUD + convert routes to `/repos/:repoId/…` | 2 | B1 | B |
| B3 | Per‑repo CI gating + milestone sync + webhook resolution (`taskCompletionService.ts`, `githubSyncService.ts`) | 2–3 | B1 | B |
| B4 | Frontend: `GitHubPanel` repo switcher + `AddRepoModal` + clubPmClient repo helpers (updates the `GitHubPanel` call site in `FilesTabContent`, so it **does** touch `ProjectDetail.jsx`) | 4 | B2 | B |
| B5 | Frontend: task/milestone repo integration (GitHubTaskSection, pickers, preview modals, MilestonePanel) | 4 | B2 | B |
| B6 | Frontend: Dashboard/GhStatsSection/MembersView repo iteration | 3 | B2 | B |
| C1 | Reauth‑on‑add flow (`/auth/github` intent + panel auto‑open) | 2 | B4 | B |
| C2 | Vault → Files subtab (`ProjectDetail.jsx`) | 1–2 | — (but serialize vs B4 — both touch ProjectDetail.jsx) | **serial w/ B4** |

**Parallelism:** Group A (A1→A2) and C3 can run concurrently with the B chain. Within B: B1→(B2,B3)→(B4,B5,B6)→C1. **C2 and B4 both edit `ProjectDetail.jsx`; run them one after the other, not in parallel.**

---

## 7. Risks / open items

- **GitHub App vs OAuth for new‑repo visibility:** OAuth re‑mint (C1) covers user‑accessible repos; App‑installation‑gated repos need a GitHub settings action. Surfaced via a link, not automated.
- **Drive cutover:** folders must be re‑shared with the bot email; until then, listing/upload return graceful empty/failure states. Communicate the bot email prominently.
- **Dropping old `Project.github*` columns:** deferred to a final cleanup migration after all reads move to `ProjectRepo`, to keep each phase reversible.
- **`driveService.ts` null byte:** the file trips ripgrep binary detection; implementers should use Read, not Grep, on it, and strip the stray byte if encountered.
- **Testing:** minimal Jest coverage exists; verification is build + tsc + manual drive of the affected flow per phase.
