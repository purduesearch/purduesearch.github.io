// Vault search index (Phase 8). Rows in VaultSearchDoc are derived data: every
// writer here recomputes a document from its source rows and upserts it whole,
// so any call is safe to repeat and `rebuildVaultSearch` can recreate the index
// from scratch. Callers fire these after their own write succeeds and never
// fail the user's request on an index error — the periodic reconcile and the
// rebuild command repair a missed update.

import { prisma } from "../db/prisma.js";
import { installationToken } from "./vaultGitTransport.js";
import {
  buildSearchSql,
  commitDoc,
  commitItemIds,
  crDoc,
  itemDocs,
  normalizeSearchParams,
  rankCandidates,
  toResult,
  vaultJobId,
  type Candidate,
  type CommitSource,
  type SearchDocInput,
} from "./vaultSearchCore.js";

const PERSON = { select: { id: true, displayName: true } } as const;

// ── Writes ────────────────────────────────────────────────────

async function upsertDocs(docs: SearchDocInput[]): Promise<void> {
  for (const d of docs) {
    await prisma.$executeRaw`
      INSERT INTO "VaultSearchDoc" ("id", "projectId", "kind", "itemId", "versionId", "crId", "commitSha", "title", "body", "partNumber", "fileName", "fileExt", "authorId", "authorName", "released", "checkedOut", "crStatus", "url", "occurredAt", "searchVector", "indexedAt")
      VALUES (${d.id}, ${d.projectId}, ${d.kind}, ${d.itemId}, ${d.versionId}, ${d.crId}, ${d.commitSha}, ${d.title}, ${d.body}, ${d.partNumber}, ${d.fileName}, ${d.fileExt}, ${d.authorId}, ${d.authorName}, ${d.released}, ${d.checkedOut}, ${d.crStatus}, ${d.url}, ${d.occurredAt},
        setweight(to_tsvector('simple', ${d.weightA}), 'A') || setweight(to_tsvector('simple', ${d.weightB}), 'B') || setweight(to_tsvector('simple', ${d.weightC}), 'C'),
        now())
      ON CONFLICT ("id") DO UPDATE SET
        "projectId" = EXCLUDED."projectId", "kind" = EXCLUDED."kind", "itemId" = EXCLUDED."itemId", "versionId" = EXCLUDED."versionId",
        "crId" = EXCLUDED."crId", "commitSha" = EXCLUDED."commitSha", "title" = EXCLUDED."title", "body" = EXCLUDED."body",
        "partNumber" = EXCLUDED."partNumber", "fileName" = EXCLUDED."fileName", "fileExt" = EXCLUDED."fileExt",
        "authorId" = EXCLUDED."authorId", "authorName" = EXCLUDED."authorName", "released" = EXCLUDED."released",
        "checkedOut" = EXCLUDED."checkedOut", "crStatus" = EXCLUDED."crStatus", "url" = EXCLUDED."url",
        "occurredAt" = EXCLUDED."occurredAt", "searchVector" = EXCLUDED."searchVector", "indexedAt" = now()`;
  }
}

/** Item doc plus one doc per version. A deleted item takes its docs (and its commits') out of the index. */
export async function reindexVaultItem(itemId: string): Promise<void> {
  const item = await prisma.vaultItem.findUnique({
    where: { id: itemId },
    include: {
      createdBy: PERSON,
      versions: { select: { id: true, versionNumber: true, fileName: true, note: true, revision: true, releasedAt: true, commitSha: true, createdAt: true, uploadedBy: PERSON } },
    },
  });
  if (!item || item.deletedAt) {
    await prisma.vaultSearchDoc.deleteMany({ where: { itemId } });
    return;
  }
  const docs = itemDocs(item);
  await upsertDocs(docs);
  // Versions removed since the last index (none today, but keep the index exact).
  await prisma.vaultSearchDoc.deleteMany({ where: { itemId, kind: { in: ["ITEM", "VERSION"] }, id: { notIn: docs.map((d) => d.id) } } });
}

export async function reindexVaultCr(crId: string): Promise<void> {
  const cr = await prisma.changeRequest.findUnique({
    where: { id: crId },
    include: {
      author: PERSON,
      items: { select: { note: true, targetRevision: true, item: { select: { id: true, name: true, partNumber: true } }, version: { select: { fileName: true } } } },
    },
  });
  if (!cr) {
    await prisma.vaultSearchDoc.deleteMany({ where: { id: `CR:${crId}` } });
    return;
  }
  await upsertDocs([crDoc(cr)]);
}

/** Fire-and-forget wrappers for request handlers. */
export function reindexItemSoon(itemId: string): void {
  reindexVaultItem(itemId).catch((err) => console.error("[vault-search] item reindex failed", itemId, err?.message || err));
}
export function reindexCrSoon(crId: string): void {
  reindexVaultCr(crId).catch((err) => console.error("[vault-search] CR reindex failed", crId, err?.message || err));
}

/**
 * Index GitHub commits on a project's Vault branch. Idempotent by SHA, so a
 * duplicate webhook or an overlapping reconcile rewrites the same rows.
 * Commits that only touch deleted items stay out of the index.
 */
export async function indexVaultCommits(projectId: string, repoSlug: string, commits: CommitSource[]): Promise<number> {
  if (commits.length === 0) return 0;
  const jobIds = commits.map((c) => vaultJobId(c.message)).filter((id): id is string => !!id);
  const jobs = jobIds.length ? await prisma.vaultUploadJob.findMany({ where: { id: { in: jobIds }, projectId }, select: { id: true, itemId: true } }) : [];
  const jobItem = new Map(jobs.map((j) => [j.id, j.itemId]));
  const touched = [...new Set(commits.flatMap((c) => commitItemIds(c.paths)).concat(jobs.map((j) => j.itemId)))];
  const live = new Set((await prisma.vaultItem.findMany({ where: { id: { in: touched }, projectId, deletedAt: null }, select: { id: true } })).map((i) => i.id));

  const docs: SearchDocInput[] = [];
  for (const commit of commits) {
    const fromJob = jobItem.get(vaultJobId(commit.message) ?? "");
    const itemIds = fromJob ? [fromJob] : commitItemIds(commit.paths);
    if (itemIds.length > 0 && !itemIds.some((id) => live.has(id))) continue;
    docs.push(commitDoc(projectId, repoSlug, { ...commit, itemId: fromJob ?? commit.itemId }));
  }
  await upsertDocs(docs);
  return docs.length;
}

/** The commits in a GitHub push payload, for the project(s) bound to that branch. */
export async function indexPushPayload(payload: any): Promise<void> {
  const slug = String(payload?.repository?.full_name || "").toLowerCase();
  const branch = String(payload?.ref || "").replace(/^refs\/heads\//, "");
  if (!slug || !branch || !Array.isArray(payload?.commits)) return;
  const repos = await prisma.vaultRepository.findMany({ where: { repoSlug: slug, branch }, select: { projectId: true, projectRepo: { select: { slug: true } } } });
  for (const repo of repos) {
    await indexVaultCommits(repo.projectId, repo.projectRepo.slug, payload.commits.map((c: any) => ({
      sha: String(c.id),
      message: String(c.message ?? ""),
      authorName: c.author?.username || c.author?.name || null,
      at: new Date(c.timestamp || Date.now()),
      paths: [...(c.added ?? []), ...(c.modified ?? []), ...(c.removed ?? [])].map(String),
    })));
  }
}

export type CommitFetcher = (slug: string, branch: string, installId: number) => Promise<CommitSource[]>;

/** Up to 100 recent commits touching vault/ on the branch, through the App installation token. */
export const fetchVaultCommits: CommitFetcher = async (slug, branch, installId) => {
  const token = await installationToken(installId);
  const response = await fetch(`https://api.github.com/repos/${slug}/commits?sha=${encodeURIComponent(branch)}&path=vault&per_page=100`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "Constellation-Vault" },
  });
  if (!response.ok) throw new Error(`GITHUB_${response.status}`);
  const rows = await response.json() as Array<any>;
  return rows.map((row) => ({ sha: row.sha, message: row.commit?.message ?? "", authorName: row.author?.login || row.commit?.author?.name || null, at: new Date(row.commit?.author?.date || Date.now()) }));
};

/** Reconcile path: pull the branch's recent commits so a missed webhook still lands in search. */
export async function syncVaultCommitIndex(projectId: string, fetchCommits: CommitFetcher = fetchVaultCommits): Promise<number> {
  const repo = await prisma.vaultRepository.findUnique({ where: { projectId }, select: { branch: true, installId: true, projectRepo: { select: { slug: true } } } });
  if (!repo) return 0;
  return indexVaultCommits(projectId, repo.projectRepo.slug, await fetchCommits(repo.projectRepo.slug, repo.branch, repo.installId));
}

export interface RebuildDeps {
  listItemIds(projectId: string): Promise<string[]>;
  listCrIds(projectId: string): Promise<string[]>;
  reindexItem(itemId: string): Promise<void>;
  reindexCr(crId: string): Promise<void>;
  syncCommits(projectId: string): Promise<number>;
  /** Remove the project's docs not rewritten since `before`; COMMIT docs too unless keepCommits. */
  deleteStale(projectId: string, before: Date, keepCommits: boolean): Promise<void>;
  now(): Date;
}

export function prismaRebuildDeps(fetchCommits: CommitFetcher = fetchVaultCommits): RebuildDeps {
  return {
    listItemIds: async (projectId) => (await prisma.vaultItem.findMany({ where: { projectId }, select: { id: true } })).map((r) => r.id),
    listCrIds: async (projectId) => (await prisma.changeRequest.findMany({ where: { projectId }, select: { id: true } })).map((r) => r.id),
    reindexItem: reindexVaultItem,
    reindexCr: reindexVaultCr,
    syncCommits: (projectId) => syncVaultCommitIndex(projectId, fetchCommits),
    deleteStale: async (projectId, before, keepCommits) => {
      await prisma.vaultSearchDoc.deleteMany({ where: { projectId, indexedAt: { lt: before }, ...(keepCommits ? { kind: { not: "COMMIT" } } : {}) } });
    },
    now: () => new Date(),
  };
}

/**
 * Rebuild one project's index from its source rows (and GitHub, unless
 * disabled). Rows are upserted before stale ones are removed, so search keeps
 * answering during a rebuild. A GitHub failure keeps existing commit docs.
 */
export async function rebuildVaultSearch(projectId: string, opts: { github?: boolean } = {}, deps: RebuildDeps = prismaRebuildDeps()): Promise<{ items: number; changeRequests: number; commits: number; githubError: string | null }> {
  const started = deps.now();
  const items = await deps.listItemIds(projectId);
  for (const id of items) await deps.reindexItem(id);
  const crs = await deps.listCrIds(projectId);
  for (const id of crs) await deps.reindexCr(id);
  let commits = 0;
  let githubError: string | null = null;
  if (opts.github !== false) {
    try { commits = await deps.syncCommits(projectId); }
    catch (err: any) { githubError = err?.message || "GITHUB_ERROR"; }
  }
  await deps.deleteStale(projectId, started, opts.github === false || !!githubError);
  return { items: items.length, changeRequests: crs.length, commits, githubError };
}

/**
 * Periodic repair: reindex anything changed in the window (covers a crashed
 * fire-and-forget update) and resync each bound repository's commits.
 */
export async function reconcileVaultSearch(windowMs = 40 * 60_000): Promise<void> {
  const since = new Date(Date.now() - windowMs);
  const items = await prisma.vaultItem.findMany({ where: { OR: [{ updatedAt: { gte: since } }, { versions: { some: { createdAt: { gte: since } } } }] }, select: { id: true } });
  for (const item of items) await reindexVaultItem(item.id).catch((err) => console.error("[vault-search] reconcile item", item.id, err?.message || err));
  const crs = await prisma.changeRequest.findMany({ where: { updatedAt: { gte: since } }, select: { id: true } });
  for (const cr of crs) await reindexVaultCr(cr.id).catch((err) => console.error("[vault-search] reconcile CR", cr.id, err?.message || err));
  const repos = await prisma.vaultRepository.findMany({ select: { projectId: true } });
  for (const repo of repos) await syncVaultCommitIndex(repo.projectId).catch((err) => console.error("[vault-search] commit sync", repo.projectId, err?.message || err));
}

// ── Reads ─────────────────────────────────────────────────────

/** Same rule as canAccessVaultProject, for every project at once. */
export async function accessibleVaultProjectIds(memberId: string): Promise<string[]> {
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true, role: true } });
  if (!member) return [];
  if (member.isAdmin || member.role === "ADMIN") return (await prisma.project.findMany({ select: { id: true } })).map((p) => p.id);
  return (await prisma.projectMember.findMany({ where: { memberId }, select: { projectId: true } })).map((m) => m.projectId);
}

export async function watchedItemIds(memberId: string, projectId?: string | null): Promise<string[]> {
  const rows = await prisma.vaultSubscription.findMany({
    where: { memberId, ...(projectId ? { projectId } : {}), OR: [{ checkins: true }, { decisions: true }, { conflicts: true }] },
    select: { itemId: true },
  });
  return rows.map((r) => r.itemId);
}

export class SearchForbidden extends Error { status = 403; }

export interface SearchDeps {
  accessibleProjectIds(memberId: string): Promise<string[]>;
  watchedItemIds(memberId: string, projectId: string | null): Promise<string[]>;
  query(text: string, values: unknown[]): Promise<Candidate[]>;
}

export const prismaSearchDeps: SearchDeps = {
  accessibleProjectIds: accessibleVaultProjectIds,
  watchedItemIds,
  query: (text, values) => prisma.$queryRawUnsafe<Candidate[]>(text, ...values),
};

export async function searchVault(memberId: string, raw: Record<string, unknown>, deps: SearchDeps = prismaSearchDeps) {
  const params = normalizeSearchParams(raw, memberId);
  const allowed = await deps.accessibleProjectIds(memberId);
  if (params.projectId && !allowed.includes(params.projectId)) throw new SearchForbidden("Forbidden");
  if (allowed.length === 0) return { results: [], hasMore: false, params };
  const watched = params.watching ? await deps.watchedItemIds(memberId, params.projectId) : null;
  if (watched && watched.length === 0) return { results: [], hasMore: false, params };

  const { text, values } = buildSearchSql(params, allowed, watched);
  const rows = await deps.query(text, values);
  const ranked = rankCandidates(rows.map((r) => ({ ...r, rank: Number(r.rank) || 0 })), params);
  return {
    results: ranked.slice(params.offset, params.offset + params.limit).map((c) => toResult(c, params.q)),
    hasMore: ranked.length > params.offset + params.limit,
    params,
  };
}
