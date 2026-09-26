// Pure. Vault search: tokenization, index documents, the parameterized search
// SQL, result ranking and deep links. No Prisma and no network here, so every
// rule that decides what a member can find is unit-tested without a database
// (vaultSearch.test.ts). The DB side lives in vaultSearchService.ts.

export type SearchKind = "ITEM" | "VERSION" | "CR" | "COMMIT";
export const SEARCH_KINDS: readonly SearchKind[] = ["ITEM", "VERSION", "CR", "COMMIT"];
const CR_STATUSES = ["OPEN", "APPROVED", "REJECTED", "CANCELLED"] as const;

/** One row for VaultSearchDoc. weightA/B/C are pre-tokenized, space-joined text. */
export interface SearchDocInput {
  id: string;
  projectId: string;
  kind: SearchKind;
  itemId: string | null;
  versionId: string | null;
  crId: string | null;
  commitSha: string | null;
  title: string;
  body: string;
  partNumber: string | null;
  fileName: string | null;
  fileExt: string | null;
  authorId: string | null;
  authorName: string | null;
  released: boolean;
  checkedOut: boolean;
  crStatus: string | null;
  url: string | null;
  occurredAt: Date;
  weightA: string;
  weightB: string;
  weightC: string;
}

// ── Tokens ────────────────────────────────────────────────────

const MAX_QUERY_TOKENS = 8;

/**
 * Lowercase letter/digit runs. A word that contained separators also yields
 * its joined form, so "PRT-0012" is found by "prt 0012", "PRT-0012" and
 * "prt0012", and "bracket_v2.step" by "bracket", "v2" and "step".
 */
export function tokenize(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const word of text.normalize("NFKC").toLowerCase().split(/\s+/)) {
    const parts = word.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    out.push(...parts);
    if (parts.length > 1) out.push(parts.join(""));
  }
  return out;
}

export function tokenText(...values: Array<string | null | undefined>): string {
  return values.flatMap(tokenize).join(" ");
}

/**
 * A to_tsquery('simple', …) string: every query token must match as a prefix.
 * Tokens contain only letters and digits, so no tsquery operator can be
 * injected. Null when the query has nothing searchable.
 */
export function buildTsQuery(q: string | null | undefined): string | null {
  const tokens = [...new Set(queryTokens(q))].slice(0, MAX_QUERY_TOKENS);
  return tokens.length ? tokens.map((t) => `${t}:*`).join(" & ") : null;
}

/** Query words without the joined forms tokenize() adds for indexing. */
export function queryTokens(q: string | null | undefined): string[] {
  if (!q) return [];
  return q.normalize("NFKC").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

export function fileExtension(fileName: string | null | undefined): string | null {
  const match = /\.([A-Za-z0-9]{1,12})$/.exec(fileName ?? "");
  return match ? match[1].toLowerCase() : null;
}

// ── Deep links ────────────────────────────────────────────────

/** The in-app path to one item, version or change request. */
export function vaultLink(target: { projectId: string; itemId?: string | null; versionId?: string | null; crId?: string | null }): string {
  const params = new URLSearchParams({ tab: "files", sub: "vault" });
  if (target.itemId) params.set("vaultItem", target.itemId);
  if (target.versionId) params.set("vaultVersion", target.versionId);
  if (target.crId) params.set("vaultCr", target.crId);
  return `/clubpm/projects/${encodeURIComponent(target.projectId)}?${params.toString()}`;
}

// ── Index documents ───────────────────────────────────────────

type Person = { id: string; displayName: string } | null | undefined;

export interface ItemSource {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  partNumber: string | null;
  currentRevision: string | null;
  checkedOutById: string | null;
  checkoutNote: string | null;
  createdBy?: Person;
  createdAt: Date;
  updatedAt: Date;
  versions: VersionSource[];
}

export interface VersionSource {
  id: string;
  versionNumber: number;
  fileName: string;
  note: string | null;
  revision: string | null;
  releasedAt: Date | null;
  commitSha: string | null;
  uploadedBy?: Person;
  createdAt: Date;
}

export function itemDocs(item: ItemSource): SearchDocInput[] {
  const latest = [...item.versions].sort((a, b) => b.versionNumber - a.versionNumber)[0];
  const checkedOut = !!item.checkedOutById;
  const docs: SearchDocInput[] = [{
    id: `ITEM:${item.id}`,
    projectId: item.projectId,
    kind: "ITEM",
    itemId: item.id,
    versionId: null,
    crId: null,
    commitSha: null,
    title: item.name,
    body: [item.description, latest?.note].filter(Boolean).join("\n"),
    partNumber: item.partNumber,
    fileName: latest?.fileName ?? null,
    fileExt: fileExtension(latest?.fileName),
    authorId: item.createdBy?.id ?? null,
    authorName: item.createdBy?.displayName ?? null,
    released: !!item.currentRevision,
    checkedOut,
    crStatus: null,
    url: null,
    occurredAt: latest?.createdAt ?? item.updatedAt,
    weightA: tokenText(item.name, item.partNumber, latest?.fileName, item.currentRevision ? `rev ${item.currentRevision}` : null),
    weightB: tokenText(item.description),
    weightC: tokenText(latest?.note, item.checkoutNote),
  }];
  for (const version of item.versions) {
    docs.push({
      id: `VERSION:${version.id}`,
      projectId: item.projectId,
      kind: "VERSION",
      itemId: item.id,
      versionId: version.id,
      crId: null,
      commitSha: version.commitSha,
      title: `${item.name} v${version.versionNumber}`,
      body: version.note ?? "",
      partNumber: item.partNumber,
      fileName: version.fileName,
      fileExt: fileExtension(version.fileName),
      authorId: version.uploadedBy?.id ?? null,
      authorName: version.uploadedBy?.displayName ?? null,
      released: !!version.releasedAt,
      checkedOut,
      crStatus: null,
      url: null,
      occurredAt: version.createdAt,
      weightA: tokenText(version.fileName, item.partNumber, item.name, version.commitSha, version.revision ? `rev ${version.revision}` : null),
      weightB: tokenText(version.note),
      weightC: tokenText(item.description),
    });
  }
  return docs;
}

export interface CrSource {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description: string | null;
  status: string;
  releaseNotes: string | null;
  reviewNote: string | null;
  author?: Person;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{ note: string | null; targetRevision: string; item: { id: string; name: string; partNumber: string | null }; version: { fileName: string } }>;
}

export function crDoc(cr: CrSource): SearchDocInput {
  return {
    id: `CR:${cr.id}`,
    projectId: cr.projectId,
    kind: "CR",
    itemId: cr.items.length === 1 ? cr.items[0].item.id : null,
    versionId: null,
    crId: cr.id,
    commitSha: null,
    title: `CR-${cr.number} ${cr.title}`,
    body: [cr.description, cr.releaseNotes, cr.reviewNote].filter(Boolean).join("\n"),
    partNumber: cr.items.length === 1 ? cr.items[0].item.partNumber : null,
    fileName: null,
    fileExt: null,
    authorId: cr.author?.id ?? null,
    authorName: cr.author?.displayName ?? null,
    released: cr.status === "APPROVED",
    checkedOut: false,
    crStatus: cr.status,
    url: null,
    occurredAt: cr.updatedAt,
    weightA: tokenText(cr.title, `cr ${cr.number}`, `cr-${cr.number}`, ...cr.items.map((i) => i.item.partNumber)),
    weightB: tokenText(cr.description, cr.releaseNotes, ...cr.items.map((i) => i.item.name)),
    weightC: tokenText(cr.reviewNote, ...cr.items.flatMap((i) => [i.note, i.version.fileName])),
  };
}

export interface CommitSource {
  sha: string;
  message: string;
  authorName: string | null;
  at: Date;
  /** Paths the commit touched, when known (push webhooks carry them). */
  paths?: string[];
  /** Resolved from a [vault-job:<id>] tag when the path list is unknown. */
  itemId?: string | null;
}

const JOB_TAG = /\s*\[vault-job:[^\]]+\]\s*$/;

export function vaultJobId(message: string): string | null {
  return /\[vault-job:([^\]]+)\]\s*$/.exec(message)?.[1] ?? null;
}

/** Item ids named by vault/items/<id>/… paths, in first-seen order. */
export function commitItemIds(paths: string[] | undefined): string[] {
  const ids: string[] = [];
  for (const p of paths ?? []) {
    const id = /^vault\/items\/([^/]+)\//.exec(p)?.[1];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function commitDoc(projectId: string, repoSlug: string, commit: CommitSource): SearchDocInput {
  const message = commit.message.replace(JOB_TAG, "");
  const itemIds = commitItemIds(commit.paths);
  return {
    id: `COMMIT:${projectId}:${commit.sha}`,
    projectId,
    kind: "COMMIT",
    itemId: commit.itemId ?? (itemIds.length === 1 ? itemIds[0] : null),
    versionId: null,
    crId: null,
    commitSha: commit.sha,
    title: message.split("\n")[0].slice(0, 200) || commit.sha.slice(0, 12),
    body: message,
    partNumber: null,
    fileName: null,
    fileExt: null,
    authorId: null,
    authorName: commit.authorName,
    released: false,
    checkedOut: false,
    crStatus: null,
    url: `https://github.com/${repoSlug}/commit/${commit.sha}`,
    occurredAt: commit.at,
    weightA: tokenText(message.split("\n")[0], commit.sha),
    weightB: tokenText(message.split("\n").slice(1).join(" ")),
    weightC: tokenText(commit.authorName),
  };
}

// ── Search parameters ─────────────────────────────────────────

export interface SearchParams {
  q: string;
  projectId: string | null;
  kinds: SearchKind[];
  released: boolean | null;
  checkedOut: boolean | null;
  crStatus: string | null;
  fileExts: string[];
  authorId: string | null;
  watching: boolean;
  since: Date | null;
  until: Date | null;
  sort: "relevance" | "recent";
  limit: number;
  offset: number;
}

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(list);
  if (typeof value !== "string") return [];
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}

function bool(value: unknown): boolean | null {
  if (value === true || value === "true" || value === "1" || value === "yes") return true;
  if (value === false || value === "false" || value === "0" || value === "no") return false;
  return null;
}

function date(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Validate a raw query (Express query string or a stored saved-view object)
 * into SearchParams. Unknown values are dropped, never passed through;
 * `authorId: "me"` resolves to the caller.
 */
export function normalizeSearchParams(raw: Record<string, unknown>, memberId: string): SearchParams {
  const kinds = list(raw.kinds).map((k) => k.toUpperCase()).filter((k): k is SearchKind => (SEARCH_KINDS as readonly string[]).includes(k));
  const crStatus = typeof raw.crStatus === "string" && (CR_STATUSES as readonly string[]).includes(raw.crStatus.toUpperCase()) ? raw.crStatus.toUpperCase() : null;
  const author = typeof raw.authorId === "string" && raw.authorId ? (raw.authorId === "me" ? memberId : raw.authorId.slice(0, 64)) : null;
  const limit = Math.min(50, Math.max(1, Number.parseInt(String(raw.limit ?? "25"), 10) || 25));
  const offset = Math.min(500, Math.max(0, Number.parseInt(String(raw.offset ?? "0"), 10) || 0));
  return {
    q: typeof raw.q === "string" ? raw.q.slice(0, 200) : "",
    projectId: typeof raw.projectId === "string" && raw.projectId ? raw.projectId : null,
    kinds: [...new Set(kinds)],
    released: bool(raw.released),
    checkedOut: bool(raw.checkedOut),
    crStatus,
    fileExts: [...new Set(list(raw.fileExts ?? raw.fileExt).map((e) => e.replace(/^\./, "").toLowerCase()).filter((e) => /^[a-z0-9]{1,12}$/.test(e)))].slice(0, 10),
    authorId: author,
    watching: bool(raw.watching) === true,
    since: date(raw.since),
    until: date(raw.until),
    sort: raw.sort === "recent" ? "recent" : "relevance",
    limit,
    offset,
  };
}

/** The shape stored in VaultSavedView.query: the filters, never paging. "me" stays symbolic. */
export function savedViewQuery(raw: Record<string, unknown>): Record<string, unknown> {
  const p = normalizeSearchParams(raw, "__me__");
  const out: Record<string, unknown> = { q: p.q, sort: p.sort };
  if (p.kinds.length) out.kinds = p.kinds;
  if (p.released !== null) out.released = p.released;
  if (p.checkedOut !== null) out.checkedOut = p.checkedOut;
  if (p.crStatus) out.crStatus = p.crStatus;
  if (p.fileExts.length) out.fileExts = p.fileExts;
  if (p.authorId) out.authorId = p.authorId === "__me__" ? "me" : p.authorId;
  if (p.watching) out.watching = true;
  if (p.since) out.since = p.since.toISOString();
  if (p.until) out.until = p.until.toISOString();
  return out;
}

// ── SQL ───────────────────────────────────────────────────────

export const CANDIDATE_LIMIT = 200;

/**
 * The candidate query. The project permission clause is the first condition
 * and is always present — `allowedProjectIds` comes from the caller's
 * membership, never from the request. Every request value is a bound
 * parameter.
 */
export function buildSearchSql(params: SearchParams, allowedProjectIds: string[], watchedItemIds: string[] | null): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  const bind = (value: unknown) => { values.push(value); return `$${values.length}`; };
  const where: string[] = [`d."projectId" = ANY(${bind(allowedProjectIds)}::text[])`];
  if (params.projectId) where.push(`d."projectId" = ${bind(params.projectId)}`);
  if (params.kinds.length) where.push(`d."kind" = ANY(${bind(params.kinds)}::text[])`);
  if (params.released !== null) where.push(`d."released" = ${bind(params.released)}`);
  if (params.checkedOut !== null) where.push(`d."checkedOut" = ${bind(params.checkedOut)}`);
  if (params.crStatus) where.push(`d."crStatus" = ${bind(params.crStatus)}`);
  if (params.fileExts.length) where.push(`d."fileExt" = ANY(${bind(params.fileExts)}::text[])`);
  if (params.authorId) where.push(`d."authorId" = ${bind(params.authorId)}`);
  if (watchedItemIds) where.push(`d."itemId" = ANY(${bind(watchedItemIds)}::text[])`);
  if (params.since) where.push(`d."occurredAt" >= ${bind(params.since)}`);
  if (params.until) where.push(`d."occurredAt" <= ${bind(params.until)}`);

  const tsQuery = buildTsQuery(params.q);
  let rank = "0::real";
  let from = `"VaultSearchDoc" d`;
  if (tsQuery) {
    from += ` CROSS JOIN to_tsquery('simple', ${bind(tsQuery)}) query`;
    where.push(`d."searchVector" @@ query`);
    rank = `ts_rank_cd(d."searchVector", query)`;
  }
  const order = tsQuery && params.sort === "relevance" ? `rank DESC, d."occurredAt" DESC` : `d."occurredAt" DESC`;
  const limit = tsQuery && params.sort === "relevance" ? CANDIDATE_LIMIT : params.offset + params.limit + 1;
  const text = `SELECT d."id", d."projectId", d."kind", d."itemId", d."versionId", d."crId", d."commitSha", d."title", d."body", d."partNumber", d."fileName", d."fileExt", d."authorId", d."authorName", d."released", d."checkedOut", d."crStatus", d."url", d."occurredAt", ${rank} AS rank FROM ${from} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ${bind(limit)}`;
  return { text, values };
}

// ── Ranking and results ───────────────────────────────────────

export interface Candidate {
  id: string;
  projectId: string;
  kind: string;
  itemId: string | null;
  versionId: string | null;
  crId: string | null;
  commitSha: string | null;
  title: string;
  body: string;
  partNumber: string | null;
  fileName: string | null;
  fileExt: string | null;
  authorId: string | null;
  authorName: string | null;
  released: boolean;
  checkedOut: boolean;
  crStatus: string | null;
  url: string | null;
  occurredAt: Date;
  rank: number;
}

const KIND_WEIGHT: Record<string, number> = { ITEM: 0.6, CR: 0.4, VERSION: 0.2, COMMIT: 0 };
const compact = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Final score on top of Postgres' ts_rank_cd: an exact part number beats
 * everything, then an exact file name or commit SHA prefix, then a title that
 * starts with the query. Items outrank their own versions and commits at equal
 * text relevance; recency breaks the remaining ties.
 */
export function scoreCandidate(c: Candidate, q: string, now: Date): number {
  const query = compact(q);
  let score = c.rank * 10;
  if (query) {
    if (compact(c.partNumber) === query) score += 8;
    if (compact(c.fileName) === query || compact(c.fileName?.replace(/\.[^.]+$/, "")) === query) score += 4;
    if (c.commitSha && query.length >= 7 && c.commitSha.toLowerCase().startsWith(query)) score += 4;
    if (compact(c.title).startsWith(query)) score += 1;
  }
  score += KIND_WEIGHT[c.kind] ?? 0;
  const ageDays = Math.max(0, (now.getTime() - new Date(c.occurredAt).getTime()) / 86_400_000);
  score += 0.5 * Math.exp(-ageDays / 90);
  return score;
}

export function rankCandidates(candidates: Candidate[], params: SearchParams, now = new Date()): Candidate[] {
  if (params.sort === "recent" || !buildTsQuery(params.q)) {
    return [...candidates].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  }
  const scored = candidates.map((c) => ({ c, s: scoreCandidate(c, params.q, now) }));
  scored.sort((a, b) => b.s - a.s || new Date(b.c.occurredAt).getTime() - new Date(a.c.occurredAt).getTime() || a.c.id.localeCompare(b.c.id));
  return scored.map((x) => x.c);
}

/** ~160 characters of body around the first query token, or its start. */
export function makeSnippet(body: string, q: string): string {
  const text = body.replace(/\s+/g, " ").trim();
  if (text.length <= 160) return text;
  const lower = text.toLowerCase();
  const hit = queryTokens(q).map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (hit === undefined) return `${text.slice(0, 157)}…`;
  const start = Math.max(0, hit - 50);
  return `${start > 0 ? "…" : ""}${text.slice(start, start + 157)}${start + 157 < text.length ? "…" : ""}`;
}

export function toResult(c: Candidate, q: string) {
  return {
    id: c.id,
    kind: c.kind,
    projectId: c.projectId,
    itemId: c.itemId,
    versionId: c.versionId,
    crId: c.crId,
    commitSha: c.commitSha,
    title: c.title,
    snippet: makeSnippet(c.body, q),
    partNumber: c.partNumber,
    fileName: c.fileName,
    fileExt: c.fileExt,
    authorName: c.authorName,
    released: c.released,
    checkedOut: c.checkedOut,
    crStatus: c.crStatus,
    occurredAt: c.occurredAt,
    githubUrl: c.url,
    link: vaultLink({ projectId: c.projectId, itemId: c.itemId, versionId: c.versionId, crId: c.crId }),
  };
}
