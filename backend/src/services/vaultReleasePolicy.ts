// Constellation Vault — Phase 7 pure release logic: build readiness / impact,
// the immutable release manifest, and the deterministic assembly package
// layout. No Prisma, no network: vaultReleaseService.ts loads a snapshot and
// hands it here, both for the pre-approval report and inside approveCr's
// serializable transaction, so the two can never disagree about the rules.

import { createHash } from "node:crypto";

export type PolicyItem = { id: string; name: string; partNumber: string | null; currentRevision: string | null; deletedAt: Date | string | null; drawingForId: string | null };
export type PolicyVersion = {
  id: string; itemId: string; versionNumber: number; revision: string | null; releasedAt: Date | string | null;
  fileName: string; mimeType: string | null; sizeBytes: number | null; sha256: string | null;
  storageProvider: "DRIVE" | "GITHUB"; repositoryId: string | null; repositorySlug: string | null; branch: string | null;
  filePath: string | null; commitSha: string | null; blobSha: string | null; lfsOid: string | null; driveFileId: string | null;
};
export type PolicyEdge = { parentId: string; childId: string; quantity: number };
export type DrawingRequirement = { id: string; scope: string; value: string; severity: string };
export type PolicyTask = { id: string; title: string; status: string; description: string | null };
export type PolicyOpenCr = { id: string; number: number; taskId: string | null; itemIds: string[] };

export type ReleaseSnapshot = {
  crId: string;
  crItems: { itemId: string; versionId: string }[];
  linkedTaskId: string | null;
  items: PolicyItem[];
  /** Every CR version plus each item's released versions (the latest one wins). */
  versions: PolicyVersion[];
  edges: PolicyEdge[];
  requirements: DrawingRequirement[];
  /** Open (non-DONE, unarchived) project tasks. May be empty inside the approval transaction. */
  tasks: PolicyTask[];
  /** Other OPEN change requests in the project. */
  openCrs: PolicyOpenCr[];
};

export type Finding = { code: string; severity: "BLOCKER" | "WARNING"; message: string; itemId?: string; relatedItemId?: string };
export type PinnedEntry = { role: "RELEASED" | "COMPONENT" | "DRAWING"; itemId: string; version: PolicyVersion; releasedAt: number; drawingForId?: string };
export type ReadinessReport = {
  state: "ready" | "warnings" | "blocked";
  blockers: Finding[];
  warnings: Finding[];
  whereUsed: { itemId: string; chains: string[][] }[];
  affectedTasks: { id: string; title: string; status: string; reasons: string[] }[];
  missingDrawings: { itemId: string; severity: "BLOCKER" | "WARNING"; requirementIds: string[] }[];
  staleAssemblies: { assemblyId: string; assemblyRevision: string | null; childId: string; reason: string }[];
  /** itemId → display label, so the UI needs no second lookup. */
  labels: Record<string, string>;
  entryCount: number;
};

export const SEVERITIES = ["WARNING", "BLOCKER"] as const;
export const REQUIREMENT_SCOPES = ["ALL", "SUBSYSTEM", "EXTENSION"] as const;
const MAX_CHAINS_PER_ITEM = 50;

const time = (value: Date | string | null): number => (value ? new Date(value).getTime() : 0);
export const itemLabel = (item: Pick<PolicyItem, "name" | "partNumber"> | undefined, fallback = "Unknown item") =>
  item ? (item.partNumber ? `${item.partNumber} ${item.name}` : item.name) : fallback;

export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : "";
}

/** Does a drawing requirement apply to this item and its pinned file? */
export function requirementMatches(requirement: DrawingRequirement, item: PolicyItem, fileName: string): boolean {
  if (requirement.scope === "ALL") return true;
  if (requirement.scope === "SUBSYSTEM") {
    // Like VaultReviewerRule subsystems (case-insensitive path prefix), but a
    // "-" also separates, so "PRT" covers the default PRT-0001 numbering.
    const prefix = requirement.value.trim().toLowerCase();
    const part = (item.partNumber || "").toLowerCase();
    return !!prefix && (part === prefix || part.startsWith(`${prefix}/`) || part.startsWith(`${prefix}-`));
  }
  if (requirement.scope === "EXTENSION") {
    const wanted = requirement.value.split(",").map((v) => v.trim().replace(/^\./, "").toLowerCase()).filter(Boolean);
    return wanted.includes(fileExtension(fileName));
  }
  return false;
}

/** Latest released version of each item, by release time then version number. */
function latestReleased(versions: PolicyVersion[]): Map<string, PolicyVersion> {
  const best = new Map<string, PolicyVersion>();
  for (const v of versions) {
    if (!v.releasedAt) continue;
    const current = best.get(v.itemId);
    if (!current || time(v.releasedAt) > time(current.releasedAt) || (time(v.releasedAt) === time(current.releasedAt) && v.versionNumber > current.versionNumber)) best.set(v.itemId, v);
  }
  return best;
}

/** Every path from `itemId` up to a top-level assembly, as item-id arrays starting at the item. */
export function whereUsedChains(itemId: string, edges: PolicyEdge[], live: (id: string) => boolean = () => true): string[][] {
  const parentsOf = new Map<string, string[]>();
  for (const e of edges) if (live(e.parentId)) parentsOf.set(e.childId, [...(parentsOf.get(e.childId) || []), e.parentId]);
  const chains: string[][] = [];
  const walk = (path: string[]) => {
    if (chains.length >= MAX_CHAINS_PER_ITEM) return;
    const parents = (parentsOf.get(path[path.length - 1]) || []).filter((p) => !path.includes(p));
    if (parents.length === 0) { if (path.length > 1) chains.push(path); return; }
    for (const parent of [...parents].sort()) walk([...path, parent]);
  };
  walk([itemId]);
  return chains;
}

type Pinned = { entries: PinnedEntry[]; closure: Set<string>; bomEdges: PolicyEdge[]; findings: Finding[] };

/** Resolve the exact recursive BOM under the CR items and pin one version per item. */
function pinRelease(snapshot: ReleaseSnapshot, now: number): Pinned {
  const items = new Map(snapshot.items.map((i) => [i.id, i]));
  const versions = new Map(snapshot.versions.map((v) => [v.id, v]));
  const released = latestReleased(snapshot.versions);
  const crVersion = new Map(snapshot.crItems.map((c) => [c.itemId, c.versionId]));
  const childrenOf = new Map<string, PolicyEdge[]>();
  for (const e of snapshot.edges) childrenOf.set(e.parentId, [...(childrenOf.get(e.parentId) || []), e]);
  const findings: Finding[] = [];
  const label = (id: string) => itemLabel(items.get(id));

  const closure = new Set<string>();
  const bomEdges: PolicyEdge[] = [];
  const cycleReported = new Set<string>();
  const visit = (id: string, stack: string[]) => {
    if (stack.includes(id)) {
      if (!cycleReported.has(id)) { cycleReported.add(id); findings.push({ code: "BOM_CYCLE", severity: "BLOCKER", itemId: id, message: `${label(id)} contains itself through its BOM; remove the cycle before release.` }); }
      return;
    }
    if (closure.has(id)) return;
    closure.add(id);
    for (const edge of childrenOf.get(id) || []) {
      const child = items.get(edge.childId);
      if (!child || child.deletedAt) {
        findings.push({ code: "DELETED_COMPONENT", severity: "WARNING", itemId: edge.childId, relatedItemId: id, message: `${label(id)} lists a deleted component; it is left out of the package.` });
        continue;
      }
      bomEdges.push(edge);
      visit(edge.childId, [...stack, id]);
    }
  };
  for (const c of snapshot.crItems) visit(c.itemId, []);

  const entries: PinnedEntry[] = [];
  const pin = (itemId: string, role: PinnedEntry["role"], drawingForId?: string): PinnedEntry | null => {
    const fromCr = crVersion.get(itemId);
    const version = fromCr ? versions.get(fromCr) : released.get(itemId);
    if (!version) return null;
    return { role: fromCr && role !== "DRAWING" ? "RELEASED" : role, itemId, version, releasedAt: fromCr ? now : time(version.releasedAt), ...(drawingForId ? { drawingForId } : {}) };
  };
  for (const id of [...closure].sort()) {
    const entry = pin(id, crVersion.has(id) ? "RELEASED" : "COMPONENT");
    if (entry) entries.push(entry);
    else findings.push({ code: "UNRELEASED_COMPONENT", severity: "BLOCKER", itemId: id, message: `${label(id)} is in the BOM but has no released revision; release it first or add it to this change request.` });
  }

  // Drawings of every pinned part travel with the package.
  const drawingsOf = new Map<string, PolicyItem[]>();
  for (const item of snapshot.items) if (item.drawingForId && !item.deletedAt) drawingsOf.set(item.drawingForId, [...(drawingsOf.get(item.drawingForId) || []), item]);
  for (const id of [...closure].sort()) {
    for (const drawing of (drawingsOf.get(id) || []).sort((a, b) => a.id.localeCompare(b.id))) {
      if (closure.has(drawing.id)) continue;
      const entry = pin(drawing.id, "DRAWING", id);
      if (entry) entries.push({ ...entry, role: "DRAWING", drawingForId: id });
    }
  }
  return { entries, closure, bomEdges, findings };
}

function bytesFindings(entries: PinnedEntry[], label: (id: string) => string): Finding[] {
  const findings: Finding[] = [];
  for (const { itemId, version: v } of entries) {
    const name = `${label(itemId)} v${v.versionNumber} (${v.fileName})`;
    const complete = v.storageProvider === "GITHUB" ? !!(v.commitSha && v.filePath && v.sha256 && v.repositoryId && v.repositorySlug) : !!v.driveFileId;
    if (!complete) findings.push({ code: "MISSING_BYTES", severity: "BLOCKER", itemId, message: `${name} has no complete storage reference, so its bytes cannot be pinned.` });
    else if (!v.sha256) findings.push({ code: "HASH_PENDING", severity: "WARNING", itemId, message: `${name} has no SHA-256 yet; approval hashes the stored bytes before releasing.` });
  }
  return findings;
}

export function computeReadiness(snapshot: ReleaseSnapshot, now = Date.now()): ReadinessReport {
  const items = new Map(snapshot.items.map((i) => [i.id, i]));
  const label = (id: string) => itemLabel(items.get(id));
  const live = (id: string) => { const i = items.get(id); return !!i && !i.deletedAt; };
  const pinned = pinRelease(snapshot, now);
  const findings: Finding[] = [...pinned.findings, ...bytesFindings(pinned.entries, label)];
  const pinnedByItem = new Map(pinned.entries.map((e) => [e.itemId, e]));
  const crItemIds = new Set(snapshot.crItems.map((c) => c.itemId));

  // Required drawings, evaluated over the whole build (released items and their components).
  const missingDrawings: ReadinessReport["missingDrawings"] = [];
  for (const entry of pinned.entries) {
    if (entry.role === "DRAWING") continue;
    const item = items.get(entry.itemId);
    if (!item || item.drawingForId) continue;
    const matched = snapshot.requirements.filter((r) => requirementMatches(r, item, entry.version.fileName));
    if (matched.length === 0) continue;
    // A drawing released in this same CR counts, even though it is pinned as RELEASED.
    const drawings = pinned.entries.filter((d) => items.get(d.itemId)?.drawingForId === item.id);
    if (drawings.length > 0) {
      if (drawings.every((d) => d.releasedAt < entry.releasedAt)) findings.push({ code: "STALE_DRAWING", severity: "WARNING", itemId: item.id, message: `${label(item.id)}'s drawing was released before this revision of the part; check it still matches.` });
      continue;
    }
    const severity = matched.some((r) => r.severity === "BLOCKER") ? "BLOCKER" : "WARNING";
    missingDrawings.push({ itemId: item.id, severity, requirementIds: matched.map((r) => r.id).sort() });
    findings.push({ code: "MISSING_DRAWING", severity, itemId: item.id, message: `${label(item.id)} needs a released drawing (link a drawing item and release it${crItemIds.has(item.id) ? ", or add it to this change request" : ""}).` });
  }

  // Where-used chains and assemblies that will reference an older child revision.
  const whereUsed = snapshot.crItems.map((c) => ({ itemId: c.itemId, chains: whereUsedChains(c.itemId, snapshot.edges, live) }));
  const released = latestReleased(snapshot.versions);
  const staleAssemblies: ReadinessReport["staleAssemblies"] = [];
  const staleSeen = new Set<string>();
  const addStale = (assemblyId: string, childId: string, reason: string) => {
    const key = `${assemblyId}>${childId}`;
    if (staleSeen.has(key)) return;
    staleSeen.add(key);
    const revision = pinnedByItem.get(assemblyId)?.version.revision ?? released.get(assemblyId)?.revision ?? items.get(assemblyId)?.currentRevision ?? null;
    staleAssemblies.push({ assemblyId, assemblyRevision: revision, childId, reason });
    findings.push({ code: "STALE_ASSEMBLY", severity: "WARNING", itemId: assemblyId, relatedItemId: childId, message: `${label(assemblyId)}${revision ? ` Rev ${revision}` : ""} ${reason}` });
  };
  for (const { itemId, chains } of whereUsed) {
    for (const chain of chains) {
      for (let i = 1; i < chain.length; i++) {
        const assembly = chain[i];
        if (crItemIds.has(assembly) || !released.has(assembly)) continue;
        addStale(assembly, chain[i - 1], `was released against an older revision of ${label(itemId)}; release a new assembly revision to pick up this change.`);
      }
    }
  }
  for (const edge of pinned.bomEdges) {
    if (crItemIds.has(edge.parentId)) continue;
    const parent = pinnedByItem.get(edge.parentId), child = pinnedByItem.get(edge.childId);
    if (parent && child && parent.releasedAt < child.releasedAt) addStale(edge.parentId, edge.childId, `predates the released revision of ${label(edge.childId)} it will be built with.`);
  }

  // Open work touching the affected items.
  const affected = new Set<string>([...crItemIds, ...whereUsed.flatMap((w) => w.chains.flat())]);
  const needles = [...affected].flatMap((id) => { const i = items.get(id); return i ? [i.name, i.partNumber].filter((s): s is string => !!s && s.trim().length >= 3).map((s) => ({ id, text: s.toLowerCase() })) : []; });
  const taskReasons = new Map<string, Set<string>>();
  const addReason = (taskId: string, reason: string) => taskReasons.set(taskId, (taskReasons.get(taskId) || new Set()).add(reason));
  if (snapshot.linkedTaskId) addReason(snapshot.linkedTaskId, "Linked to this change request");
  for (const cr of snapshot.openCrs) {
    if (cr.id === snapshot.crId) continue;
    const overlap = cr.itemIds.filter((id) => affected.has(id));
    if (overlap.length === 0) continue;
    findings.push({ code: "CONCURRENT_CHANGE", severity: "WARNING", itemId: overlap[0], message: `CR-${cr.number} is also open against ${overlap.map(label).join(", ")}.` });
    if (cr.taskId) addReason(cr.taskId, `Linked to open CR-${cr.number}`);
  }
  for (const task of snapshot.tasks) {
    const haystack = `${task.title} ${task.description ?? ""}`.toLowerCase();
    for (const n of needles) if (haystack.includes(n.text)) addReason(task.id, `Mentions ${label(n.id)}`);
  }
  const taskById = new Map(snapshot.tasks.map((t) => [t.id, t]));
  const affectedTasks = [...taskReasons].filter(([id]) => taskById.has(id)).map(([id, reasons]) => ({ id, title: taskById.get(id)!.title, status: taskById.get(id)!.status, reasons: [...reasons].sort() })).sort((a, b) => a.title.localeCompare(b.title));
  if (affectedTasks.length > 0) findings.push({ code: "AFFECTED_TASKS", severity: "WARNING", message: `${affectedTasks.length} open task${affectedTasks.length === 1 ? "" : "s"} touch${affectedTasks.length === 1 ? "es" : ""} these items or the assemblies that use them.` });

  const labels: Record<string, string> = {};
  for (const id of new Set([...pinned.closure, ...affected, ...findings.flatMap((f) => [f.itemId, f.relatedItemId]).filter((v): v is string => !!v)])) labels[id] = label(id);
  const blockers = findings.filter((f) => f.severity === "BLOCKER");
  const warnings = findings.filter((f) => f.severity === "WARNING");
  return { state: blockers.length ? "blocked" : warnings.length ? "warnings" : "ready", blockers, warnings, whereUsed, affectedTasks, missingDrawings, staleAssemblies, labels, entryCount: pinned.entries.length };
}

/** Versions whose SHA-256 must be computed from the stored bytes before approval. */
export function versionsNeedingHash(snapshot: ReleaseSnapshot, now = Date.now()): PolicyVersion[] {
  return pinRelease(snapshot, now).entries.map((e) => e.version).filter((v) => (!v.sha256 || v.sizeBytes === null) && v.storageProvider === "DRIVE" && !!v.driveFileId);
}

// ── Manifest ──────────────────────────────────────────────────

export const MANIFEST_SCHEMA = "constellation.vault.release-manifest/v1";

export type ManifestEntry = {
  role: PinnedEntry["role"]; itemId: string; partNumber: string | null; name: string; drawingForId: string | null;
  versionId: string; versionNumber: number; revision: string | null; fileName: string; mimeType: string | null;
  sizeBytes: number; sha256: string; packagePath: string;
  storage: { provider: string; repositoryId: string | null; repository: string | null; branch: string | null; commitSha: string | null; blobSha: string | null; path: string | null; lfsOid: string | null; driveFileId: string | null };
};
export type ReleaseManifest = {
  schema: typeof MANIFEST_SCHEMA;
  release: { projectId: string; changeRequestId: string; changeRequestNumber: number; title: string; approvedAt: string; approvedById: string };
  releasedItemIds: string[];
  entries: ManifestEntry[];
  bom: { roots: string[]; edges: PolicyEdge[] };
};

/** Stable JSON: sorted object keys, two-space indent, trailing newline. */
export function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort) : v && typeof v === "object" && !(v instanceof Date)
    ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])]))
    : v;
  return JSON.stringify(sort(value), null, 2) + "\n";
}

export const sha256Hex = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

export function safeSegment(value: string): string {
  const cleaned = value.normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "_").trim();
  return (cleaned || "_").slice(0, 120);
}

export class ReleaseBlockedError extends Error {
  status = 409;
  constructor(public findings: Finding[]) { super(`Release blocked: ${findings.map((f) => f.message).join(" ")}`); }
}

/**
 * Build the immutable manifest for an approval. `revisions` carries the letter
 * each CR item receives in this approval. Throws ReleaseBlockedError while any
 * blocker remains or any pinned entry lacks a real-byte SHA-256 and size.
 */
export function buildManifest(snapshot: ReleaseSnapshot, meta: { projectId: string; changeRequestNumber: number; title: string; approvedAt: Date; approvedById: string; revisions: Record<string, string> }): { manifest: ReleaseManifest; json: string; sha256: string; report: ReadinessReport } {
  const now = meta.approvedAt.getTime();
  const report = computeReadiness(snapshot, now);
  const pinned = pinRelease(snapshot, now);
  const unhashed = pinned.entries.filter((e) => !e.version.sha256 || (e.version.sizeBytes ?? null) === null);
  const blocking = [...report.blockers, ...unhashed.map((e): Finding => ({ code: "MISSING_HASH", severity: "BLOCKER", itemId: e.itemId, message: `${report.labels[e.itemId] || e.itemId} v${e.version.versionNumber} has no verified SHA-256 and size.` }))];
  if (blocking.length) throw new ReleaseBlockedError(blocking);
  const items = new Map(snapshot.items.map((i) => [i.id, i]));
  const entries: ManifestEntry[] = pinned.entries.map(({ role, itemId, version: v, drawingForId }) => {
    const item = items.get(itemId)!;
    const revision = role === "RELEASED" ? meta.revisions[itemId] : v.revision;
    return {
      role, itemId, partNumber: item.partNumber, name: item.name, drawingForId: drawingForId ?? null,
      versionId: v.id, versionNumber: v.versionNumber, revision: revision ?? null, fileName: v.fileName, mimeType: v.mimeType,
      sizeBytes: v.sizeBytes!, sha256: v.sha256!.toLowerCase(),
      packagePath: `files/${safeSegment(item.partNumber || item.id)}_rev-${safeSegment(revision || `v${v.versionNumber}`)}/${safeSegment(v.fileName)}`,
      storage: { provider: v.storageProvider, repositoryId: v.repositoryId, repository: v.repositorySlug, branch: v.branch, commitSha: v.commitSha, blobSha: v.blobSha, path: v.filePath, lfsOid: v.lfsOid, driveFileId: v.driveFileId },
    };
  }).sort((a, b) => a.packagePath.localeCompare(b.packagePath) || a.itemId.localeCompare(b.itemId));
  const manifest: ReleaseManifest = {
    schema: MANIFEST_SCHEMA,
    release: { projectId: meta.projectId, changeRequestId: snapshot.crId, changeRequestNumber: meta.changeRequestNumber, title: meta.title, approvedAt: meta.approvedAt.toISOString(), approvedById: meta.approvedById },
    releasedItemIds: snapshot.crItems.map((c) => c.itemId).sort(),
    entries,
    bom: { roots: snapshot.crItems.map((c) => c.itemId).sort(), edges: [...pinned.bomEdges].map((e) => ({ parentId: e.parentId, childId: e.childId, quantity: e.quantity })).sort((a, b) => a.parentId.localeCompare(b.parentId) || a.childId.localeCompare(b.childId)) },
  };
  const json = canonicalJson(manifest);
  return { manifest, json, sha256: sha256Hex(json), report };
}

/** Flattened BOM with extended quantities, one row per path from a root. */
export function bomCsv(manifest: ReleaseManifest): string {
  const byItem = new Map(manifest.entries.filter((e) => e.role !== "DRAWING").map((e) => [e.itemId, e]));
  const childrenOf = new Map<string, PolicyEdge[]>();
  for (const e of manifest.bom.edges) childrenOf.set(e.parentId, [...(childrenOf.get(e.parentId) || []), e]);
  const cell = (v: string | number | null) => { const s = v === null ? "" : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = ["level,parent_part,part,name,revision,quantity,extended_quantity,sha256,file"];
  const walk = (id: string, parent: string | null, level: number, qty: number, extended: number, path: string[]) => {
    const e = byItem.get(id);
    rows.push([level, parent ? byItem.get(parent)?.partNumber ?? parent : "", e?.partNumber ?? id, e?.name ?? "", e?.revision ?? "", qty, extended, e?.sha256 ?? "", e?.packagePath ?? ""].map(cell).join(","));
    if (path.includes(id)) return;
    for (const child of childrenOf.get(id) || []) walk(child.childId, id, level + 1, child.quantity, extended * child.quantity, [...path, id]);
  };
  for (const root of manifest.bom.roots) walk(root, null, 0, 1, 1, []);
  return rows.join("\n") + "\n";
}

export function packageReadme(manifest: ReleaseManifest, manifestSha256: string): string {
  return [
    `Constellation Vault release package — CR-${manifest.release.changeRequestNumber}: ${manifest.release.title}`,
    `Approved ${manifest.release.approvedAt}`,
    `manifest.json SHA-256: ${manifestSha256}`,
    "",
    "Every file here is pinned by the manifest to an exact Vault version, repository commit, path and SHA-256.",
    "Verify on any machine:",
    "  sha256sum -c SHA256SUMS            (Linux)",
    "  shasum -a 256 -c SHA256SUMS        (macOS)",
    "BOM.csv lists the exact recursive bill of materials with extended quantities.",
    "Rebuilding this package from the same manifest produces byte-identical output; use Verify in Constellation to prove it.",
    "",
  ].join("\n");
}

// ── Deterministic tar (POSIX ustar + pax) ─────────────────────

const BLOCK = 512;
function octal(value: number, width: number): string { return value.toString(8).padStart(width - 1, "0") + "\0"; }

function paxRecord(key: string, value: string): Buffer {
  const body = ` ${key}=${value}\n`;
  let length = Buffer.byteLength(body) + 1;
  while (String(length).length + Buffer.byteLength(body) !== length) length = String(length).length + Buffer.byteLength(body);
  return Buffer.from(`${length}${body}`);
}

function rawHeader(name: string, size: number, mtime: number, type: "0" | "x"): Buffer {
  const header = Buffer.alloc(BLOCK, 0);
  header.write(name, 0, 100, "utf8");
  header.write(octal(0o644, 8), 100, "ascii");
  header.write(octal(0, 8), 108, "ascii");
  header.write(octal(0, 8), 116, "ascii");
  header.write(octal(size, 12), 124, "ascii");
  header.write(octal(mtime, 12), 136, "ascii");
  header.write("        ", 148, "ascii");
  header.write(type, 156, "ascii");
  header.write("ustar\u000000", 257, "binary");
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(octal(sum, 7) + " ", 148, "ascii");
  return header;
}

/** Header block(s) for one regular file; adds a pax record for long/unicode names or sizes over 8 GiB. */
export function tarHeader(name: string, size: number, mtime: number): Buffer {
  const ascii = /^[\x20-\x7e]*$/.test(name);
  const records: Buffer[] = [];
  if (!ascii || Buffer.byteLength(name) > 99) records.push(paxRecord("path", name));
  if (size > 0o77777777777) records.push(paxRecord("size", String(size)));
  const plain = rawHeader(ascii && Buffer.byteLength(name) <= 99 ? name : name.replace(/[^\x20-\x7e]/g, "_").slice(-99), Math.min(size, 0o77777777777), mtime, "0");
  if (records.length === 0) return plain;
  const pax = Buffer.concat(records);
  return Buffer.concat([rawHeader("PaxHeader", pax.length, mtime, "x"), pax, tarPadding(pax.length), plain]);
}

export const tarPadding = (size: number) => Buffer.alloc((BLOCK - (size % BLOCK)) % BLOCK, 0);
export const tarTrailer = () => Buffer.alloc(BLOCK * 2, 0);

/** Top-level folder inside the package. */
export const packageRoot = (manifest: ReleaseManifest) => `CR-${manifest.release.changeRequestNumber}-release`;
