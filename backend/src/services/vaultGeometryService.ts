// Constellation Vault — Phase 9 geometry diff jobs.
//
// A request names two pinned versions. The result is a pure function of
// (algorithm version, both versions' SHA-256, formats, declared unit,
// tolerance), hashed into `cacheKey`; a second request for the same inputs in
// the same project returns the stored row instead of recomputing.
//
// Work is bounded three ways: a file-size cap checked before any bytes are
// fetched, a triangle cap enforced by the parsers, and a worker thread per
// diff with a V8 heap limit and a wall-clock timeout. At most one diff runs
// per API process at a time. Rows are leased like release packages, so a
// crashed or restarted process leaves nothing stuck: the */2 cron reclaims
// expired leases. Storage failures are retried; deterministic outcomes
// (unsupported, conversion failed, too large, timeout) are stored and not
// retried.
//
// Authorization: every read goes through canAccessVaultProject for the row's
// project, and rows are unique per project, never shared across projects.

import { createHash } from "node:crypto";
import fs from "node:fs";
import { mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { prisma } from "../db/prisma.js";
import { getDriveFileStream } from "./driveService.js";
import { GEOMETRY_ALGORITHM_VERSION } from "./vaultGeometryCore.js";
import { geometryFormatOf, LENGTH_UNITS, type GeometryFormat, type LengthUnit } from "./vaultGeometryParsers.js";
import type { GeometryOutcome, GeometryRunInput } from "./vaultGeometryRun.js";
import { OCCT_PACKAGE, OCCT_VERSION, STEP_PARAMS } from "./vaultGeometryStep.js";
import { canAccessVaultProject } from "./vaultGithubJobs.js";
import { materializeVaultObject, sha256File } from "./vaultGitTransport.js";

const envNumber = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

export const GEOMETRY_LIMITS = {
  maxFileBytes: envNumber("VAULT_GEOMETRY_MAX_MB", 256) * 1024 * 1024,
  maxTriangles: envNumber("VAULT_GEOMETRY_MAX_TRIANGLES", 3_000_000),
  timeoutMs: envNumber("VAULT_GEOMETRY_TIMEOUT_MS", 180_000),
  workerHeapMb: envNumber("VAULT_GEOMETRY_WORKER_MB", 2048),
  retentionDays: envNumber("VAULT_GEOMETRY_RETENTION_DAYS", 90),
};
export const GEOMETRY_DIR = process.env.VAULT_GEOMETRY_DIR || "uploads/vault-geometry";
const MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = 5 * 60 * 1000;
const leaseMs = () => GEOMETRY_LIMITS.timeoutMs + 5 * 60 * 1000;

export class GeometryRequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ── Inputs and cache key ──────────────────────────────────────

export type GeometryOptions = { declaredUnits: LengthUnit | null; tolerance: number | null };

export function normalizeGeometryOptions(body: { units?: unknown; tolerance?: unknown }): GeometryOptions {
  const units = body.units == null || body.units === "" ? null : String(body.units);
  if (units !== null && !LENGTH_UNITS.includes(units as LengthUnit)) throw new GeometryRequestError(400, `units must be one of ${LENGTH_UNITS.join(", ")}`);
  let tolerance: number | null = null;
  if (body.tolerance != null && body.tolerance !== "") {
    tolerance = Number(body.tolerance);
    if (!Number.isFinite(tolerance) || tolerance <= 0 || tolerance > 1e6) throw new GeometryRequestError(400, "tolerance must be a positive length in the comparison unit");
    tolerance = Number(tolerance.toPrecision(6));
  }
  return { declaredUnits: units as LengthUnit | null, tolerance };
}

export function geometryCacheKey(input: { beforeSha256: string; afterSha256: string; beforeFormat: GeometryFormat; afterFormat: GeometryFormat } & GeometryOptions): string {
  // Order matters: before→after is not after→before. The STEP converter's
  // version and parameters are part of the key, so upgrading OpenCascade
  // never serves a result computed by the old one.
  const converter = [input.beforeFormat, input.afterFormat].includes("step") ? `${OCCT_PACKAGE}@${OCCT_VERSION}:${JSON.stringify(STEP_PARAMS)}` : null;
  return createHash("sha256").update(JSON.stringify([GEOMETRY_ALGORITHM_VERSION, converter, input.beforeSha256, input.afterSha256, input.beforeFormat, input.afterFormat, input.declaredUnits, input.tolerance])).digest("hex");
}

export const meshFile = (sha256: string) => path.join(GEOMETRY_DIR, `${sha256}.${GEOMETRY_ALGORITHM_VERSION.replace(/[^a-z0-9]+/gi, "-")}.stl`);

// ── Read model ────────────────────────────────────────────────

type DiffRow = {
  id: string; projectId: string; cacheKey: string; algorithmVersion: string; beforeVersionId: string; afterVersionId: string;
  beforeSha256: string; afterSha256: string; options: unknown; state: string; outcomeStatus: string | null; resultJson: string | null;
  error: string | null; attempts: number; completedAt: Date | null; createdAt: Date; updatedAt: Date;
};

export function publicGeometryDiff(row: DiffRow) {
  let result: GeometryOutcome | null = null;
  if (row.resultJson) { try { result = JSON.parse(row.resultJson) as GeometryOutcome; } catch { /* surfaced as error below */ } }
  return {
    id: row.id, projectId: row.projectId, state: row.state, outcomeStatus: row.outcomeStatus,
    algorithmVersion: row.algorithmVersion, beforeVersionId: row.beforeVersionId, afterVersionId: row.afterVersionId,
    beforeSha256: row.beforeSha256, afterSha256: row.afterSha256, options: row.options,
    error: row.error, attempts: row.attempts, retrying: row.state === "FAILED" && row.attempts < MAX_ATTEMPTS,
    completedAt: row.completedAt, createdAt: row.createdAt, updatedAt: row.updatedAt,
    result,
  };
}

export function geometryCapabilities() {
  return {
    algorithmVersion: GEOMETRY_ALGORITHM_VERSION,
    formats: [
      { ext: ["stl"], units: "none in the file; declare them", components: "multi-solid ASCII STL only" },
      { ext: ["obj"], units: "none in the file; declare them", components: "o / g groups" },
      { ext: ["gltf", "glb"], units: "metres (glTF 2.0 specification)", components: "named nodes" },
      { ext: ["step", "stp"], units: "read from the file, converted to mm", components: "STEP products", converter: `${OCCT_PACKAGE}@${OCCT_VERSION}`, tessellation: STEP_PARAMS },
    ],
    units: LENGTH_UNITS,
    limits: { maxFileMb: GEOMETRY_LIMITS.maxFileBytes / 1024 / 1024, maxTriangles: GEOMETRY_LIMITS.maxTriangles, timeoutSeconds: GEOMETRY_LIMITS.timeoutMs / 1000 },
  };
}

// ── Request ───────────────────────────────────────────────────

const VERSION_SELECT = {
  id: true, fileName: true, sizeBytes: true, sha256: true, storageProvider: true, repositoryId: true, branch: true, filePath: true, commitSha: true, driveFileId: true,
  item: { select: { projectId: true, deletedAt: true } },
} as const;

type Db = Pick<typeof prisma, "vaultVersion" | "vaultGeometryDiff">;
type Deps = { canAccess?: typeof canAccessVaultProject; kick?: () => void; db?: Db };

export async function requestGeometryDiff(memberId: string | undefined, body: { beforeVersionId?: unknown; afterVersionId?: unknown; units?: unknown; tolerance?: unknown }, deps: Deps = {}) {
  const canAccess = deps.canAccess ?? canAccessVaultProject;
  const db = deps.db ?? prisma;
  const beforeId = typeof body.beforeVersionId === "string" ? body.beforeVersionId : "";
  const afterId = typeof body.afterVersionId === "string" ? body.afterVersionId : "";
  if (!beforeId || !afterId) throw new GeometryRequestError(400, "beforeVersionId and afterVersionId are required");
  if (beforeId === afterId) throw new GeometryRequestError(400, "Choose two different versions");
  const options = normalizeGeometryOptions(body);
  const [before, after] = await Promise.all([beforeId, afterId].map((id) => db.vaultVersion.findUnique({ where: { id }, select: VERSION_SELECT })));
  if (!before || !after || before.item.deletedAt || after.item.deletedAt) throw new GeometryRequestError(404, "Version not found");
  // Check access before revealing anything else about either version.
  if (!(await canAccess(memberId, before.item.projectId)) || !(await canAccess(memberId, after.item.projectId))) throw new GeometryRequestError(403, "Forbidden");
  if (before.item.projectId !== after.item.projectId) throw new GeometryRequestError(400, "Both versions must belong to the same project");
  const beforeFormat = geometryFormatOf(before.fileName), afterFormat = geometryFormatOf(after.fileName);
  for (const [label, v, f] of [["before", before, beforeFormat], ["after", after, afterFormat]] as const) {
    if (!f) throw new GeometryRequestError(422, `The ${label} version (${v.fileName}) is not a supported geometry format. Supported: STL, OBJ, glTF, GLB, STEP/STP.`);
    if (!v.sha256) throw new GeometryRequestError(409, `The ${label} version has no recorded SHA-256 (legacy Drive storage), so its result cannot be cached against its exact bytes.`);
  }
  const projectId = before.item.projectId;
  const cacheKey = geometryCacheKey({ beforeSha256: before.sha256!, afterSha256: after.sha256!, beforeFormat: beforeFormat!, afterFormat: afterFormat!, ...options });
  const existing = await db.vaultGeometryDiff.findUnique({ where: { projectId_cacheKey: { projectId, cacheKey } } });
  if (existing) {
    if (existing.state === "FAILED" && existing.attempts < MAX_ATTEMPTS) {
      const reset = await db.vaultGeometryDiff.update({ where: { id: existing.id }, data: { state: "PENDING", leaseUntil: null } });
      (deps.kick ?? kickGeometryQueue)();
      return publicGeometryDiff(reset);
    }
    return publicGeometryDiff(existing);
  }
  const data = {
    projectId, cacheKey, algorithmVersion: GEOMETRY_ALGORITHM_VERSION,
    beforeVersionId: before.id, afterVersionId: after.id, beforeSha256: before.sha256!, afterSha256: after.sha256!,
    options: { declaredUnits: options.declaredUnits, tolerance: options.tolerance }, requestedById: memberId ?? null,
  };
  const oversize = [before, after].find((v) => v.sizeBytes != null && v.sizeBytes > GEOMETRY_LIMITS.maxFileBytes);
  let row;
  try {
    row = oversize
      ? await db.vaultGeometryDiff.create({ data: { ...data, ...terminal({ algorithmVersion: GEOMETRY_ALGORITHM_VERSION, status: "TOO_LARGE", side: oversize === before ? "before" : "after", message: `${oversize.fileName} is larger than the ${GEOMETRY_LIMITS.maxFileBytes / 1024 / 1024} MB geometry-diff limit.` }) } })
      : await db.vaultGeometryDiff.create({ data });
  } catch (err: any) {
    if (err?.code !== "P2002") throw err;
    row = await db.vaultGeometryDiff.findUnique({ where: { projectId_cacheKey: { projectId, cacheKey } } });
    if (!row) throw err;
  }
  if (row.state === "PENDING") (deps.kick ?? kickGeometryQueue)();
  return publicGeometryDiff(row);
}

function terminal(outcome: GeometryOutcome) {
  return { state: "DONE", outcomeStatus: outcome.status, resultJson: JSON.stringify(outcome), error: null, leaseUntil: null, completedAt: new Date() };
}

/** Load a row the member may read, or throw 404/403. */
export async function authorizeGeometryDiff(memberId: string | undefined, id: string, deps: Deps = {}) {
  const canAccess = deps.canAccess ?? canAccessVaultProject;
  const row = await (deps.db ?? prisma).vaultGeometryDiff.findUnique({ where: { id } });
  if (!row) throw new GeometryRequestError(404, "Geometry diff not found");
  if (!(await canAccess(memberId, row.projectId))) throw new GeometryRequestError(403, "Forbidden");
  return row;
}

// ── Processing ────────────────────────────────────────────────

let running = false;
let rerun = false;

export function kickGeometryQueue(): void {
  setImmediate(() => { processDueGeometryDiffs().catch((err) => console.error("[vault-geometry] queue error", err)); });
}

/** Process due rows one at a time in this process. Safe to call concurrently and from several processes. */
export async function processDueGeometryDiffs(limit = 3): Promise<number> {
  if (running) { rerun = true; return 0; }
  running = true;
  let processed = 0;
  try {
    do {
      rerun = false;
      const now = new Date();
      const due = await prisma.vaultGeometryDiff.findMany({
        where: { OR: [
          { state: "PENDING", OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
          { state: "RUNNING", leaseUntil: { lt: now } },
          { state: "FAILED", attempts: { lt: MAX_ATTEMPTS }, updatedAt: { lt: new Date(now.getTime() - RETRY_AFTER_MS) } },
        ] },
        orderBy: { createdAt: "asc" }, take: limit, select: { id: true },
      });
      for (const { id } of due) { if (await runGeometryDiff(id)) processed++; }
    } while (rerun);
  } finally {
    running = false;
  }
  return processed;
}

type VersionRow = { fileName: string; sha256: string | null; storageProvider: string; repositoryId: string | null; branch: string | null; filePath: string | null; commitSha: string | null; driveFileId: string | null };

class StorageError extends Error {}

/** Fetch a version's pinned bytes to a local file and check them against the recorded SHA-256. */
async function materialize(version: VersionRow, dir: string, label: string): Promise<string> {
  if (version.storageProvider === "GITHUB") {
    const repository = version.repositoryId ? await prisma.vaultRepository.findUnique({ where: { id: version.repositoryId }, include: { projectRepo: true } }) : null;
    if (!repository || !version.commitSha || !version.filePath || !version.sha256) throw new StorageError(`The ${label} version's storage record is incomplete.`);
    try {
      const m = await materializeVaultObject(repository.projectRepo.slug, version.branch || repository.branch, repository.installId, version.commitSha, version.filePath, version.sha256);
      const target = path.join(dir, label);
      await fs.promises.copyFile(m.file, target);
      await m.cleanup();
      return target;
    } catch (err) {
      throw new StorageError(`Could not read the ${label} version from GitHub (${err instanceof Error ? err.message.slice(0, 120) : "unknown error"}).`);
    }
  }
  if (!version.driveFileId) throw new StorageError(`The ${label} version has no stored file.`);
  const file = await getDriveFileStream(version.driveFileId);
  if (!file) throw new StorageError(`Could not read the ${label} version from Drive.`);
  const target = path.join(dir, label);
  await pipeline(file.stream, fs.createWriteStream(target));
  if (version.sha256 && (await sha256File(target)) !== version.sha256) throw new StorageError(`The ${label} version's bytes no longer match its recorded SHA-256.`);
  return target;
}

function spawnWorker(input: GeometryRunInput, heapMb: number): Worker {
  const options = { workerData: input, resourceLimits: { maxOldGenerationSizeMb: heapMb }, stdout: true, stderr: true };
  if (!import.meta.url.endsWith(".ts")) return new Worker(fileURLToPath(new URL("./vaultGeometryWorker.js", import.meta.url)), options);
  // Under tsx (dev, tests) the worker does not inherit tsx's resolver, so
  // register it inside the worker before importing the TypeScript entry.
  const entry = new URL("./vaultGeometryWorker.ts", import.meta.url).href;
  return new Worker(`import("tsx/esm/api").then((m) => { m.register(); return import(${JSON.stringify(entry)}); });`, { ...options, eval: true });
}

export type WorkerResult = { kind: "outcome"; outcome: GeometryOutcome } | { kind: "timeout" } | { kind: "memory" } | { kind: "crash"; message: string };

/** Run one diff in a worker thread with a heap limit and a wall-clock timeout. */
export function runInWorker(input: GeometryRunInput, limits = { timeoutMs: GEOMETRY_LIMITS.timeoutMs, heapMb: GEOMETRY_LIMITS.workerHeapMb }): Promise<WorkerResult> {
  return new Promise((resolve) => {
    const worker = spawnWorker(input, limits.heapMb);
    // OpenCascade prints parse diagnostics; keep them out of the API log unless debugging.
    worker.stdout.resume(); worker.stderr.resume();
    let settled = false;
    const finish = (r: WorkerResult) => { if (settled) return; settled = true; clearTimeout(timer); worker.terminate().catch(() => undefined); resolve(r); };
    const timer = setTimeout(() => finish({ kind: "timeout" }), limits.timeoutMs);
    worker.on("message", (msg: { ok: boolean; outcome?: GeometryOutcome; error?: string }) => finish(msg.ok ? { kind: "outcome", outcome: msg.outcome! } : { kind: "crash", message: msg.error || "worker failed" }));
    worker.on("error", (err: Error & { code?: string }) => finish(err.code === "ERR_WORKER_OUT_OF_MEMORY" ? { kind: "memory" } : { kind: "crash", message: err.message }));
    worker.on("exit", (code) => finish({ kind: "crash", message: `worker exited with code ${code}` }));
  });
}

async function runGeometryDiff(id: string): Promise<boolean> {
  const now = new Date();
  const claimed = await prisma.vaultGeometryDiff.updateMany({
    where: { id, state: { in: ["PENDING", "RUNNING", "FAILED"] }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    data: { state: "RUNNING", leaseUntil: new Date(now.getTime() + leaseMs()), attempts: { increment: 1 } },
  });
  if (!claimed.count) return false;
  const row = (await prisma.vaultGeometryDiff.findUnique({ where: { id } }))!;
  const dir = await mkdtemp(path.join(tmpdir(), "vault-geometry-"));
  try {
    const [before, after] = await Promise.all([row.beforeVersionId, row.afterVersionId].map((vid) => prisma.vaultVersion.findUnique({ where: { id: vid }, select: VERSION_SELECT })));
    if (!before || !after) {
      await prisma.vaultGeometryDiff.update({ where: { id }, data: { state: "FAILED", attempts: MAX_ATTEMPTS, error: "A compared version no longer exists.", leaseUntil: null } });
      return true;
    }
    const beforeFile = await materialize(before, dir, "before");
    const afterFile = await materialize(after, dir, "after");
    await mkdir(GEOMETRY_DIR, { recursive: true });
    const options = row.options as GeometryOptions;
    const result = await runInWorker({
      before: { file: beforeFile, fileName: before.fileName }, after: { file: afterFile, fileName: after.fileName },
      declaredUnits: options.declaredUnits, tolerance: options.tolerance, maxTriangles: GEOMETRY_LIMITS.maxTriangles,
      meshOut: { before: path.resolve(meshFile(row.beforeSha256)), after: path.resolve(meshFile(row.afterSha256)) },
    });
    if (result.kind === "outcome") {
      await prisma.vaultGeometryDiff.update({ where: { id }, data: terminal(result.outcome) });
    } else if (result.kind === "timeout" || result.kind === "memory") {
      // Deterministic for these inputs: store it as the outcome, do not retry.
      const status = result.kind === "timeout" ? "TIMEOUT" : "MEMORY_LIMIT";
      const message = result.kind === "timeout"
        ? `The diff did not finish within ${GEOMETRY_LIMITS.timeoutMs / 1000} s. Export a lighter mesh or raise VAULT_GEOMETRY_TIMEOUT_MS.`
        : `The diff exceeded the ${GEOMETRY_LIMITS.workerHeapMb} MB worker memory limit. Export a lighter mesh or raise VAULT_GEOMETRY_WORKER_MB.`;
      await prisma.vaultGeometryDiff.update({ where: { id }, data: { state: "FAILED", attempts: MAX_ATTEMPTS, outcomeStatus: status, error: message, leaseUntil: null } });
    } else {
      await prisma.vaultGeometryDiff.update({ where: { id }, data: { state: "FAILED", error: `Geometry worker failed: ${result.message.slice(0, 300)}`, leaseUntil: null } });
    }
  } catch (err) {
    const message = err instanceof StorageError ? err.message : "Unexpected error while preparing the diff.";
    if (!(err instanceof StorageError)) console.error("[vault-geometry] run failed", id, err);
    await prisma.vaultGeometryDiff.update({ where: { id }, data: { state: "FAILED", error: message, leaseUntil: null } });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return true;
}

/** Drop cached rows and converted meshes older than the retention window; a later request recomputes them. */
export async function pruneGeometryCache(): Promise<void> {
  const cutoff = new Date(Date.now() - GEOMETRY_LIMITS.retentionDays * 86_400_000);
  await prisma.vaultGeometryDiff.deleteMany({ where: { state: { in: ["DONE", "FAILED"] }, updatedAt: { lt: cutoff } } });
  let names: string[] = [];
  try { names = await readdir(GEOMETRY_DIR); } catch { return; }
  for (const name of names) {
    const file = path.join(GEOMETRY_DIR, name);
    try { if ((await stat(file)).mtime < cutoff) await rm(file, { force: true }); } catch { /* raced with another prune */ }
  }
}
