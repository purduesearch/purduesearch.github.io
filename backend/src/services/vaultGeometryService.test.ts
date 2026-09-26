// Phase 9 geometry diff jobs: cache key, request validation, project
// authorization, the bounded worker thread, and route guards. No DB, no
// network — the database is an in-memory fake injected through `deps.db`.
// Run: cd backend && npx tsx src/services/vaultGeometryService.test.ts

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { boxTris, stepBox, stlBinary } from "./vaultGeometryFixtures.js";
import { authorizeGeometryDiff, geometryCacheKey, GeometryRequestError, normalizeGeometryOptions, requestGeometryDiff, runInWorker } from "./vaultGeometryService.js";

const sha = (c: string) => c.repeat(64);

// ── Cache key: both hashes, order, formats, options, algorithm ──
{
  const base = { beforeSha256: sha("a"), afterSha256: sha("b"), beforeFormat: "stl" as const, afterFormat: "stl" as const, declaredUnits: null, tolerance: null };
  const key = geometryCacheKey(base);
  assert.equal(key, geometryCacheKey({ ...base }), "stable");
  assert.notEqual(key, geometryCacheKey({ ...base, beforeSha256: sha("b"), afterSha256: sha("a") }), "order matters");
  assert.notEqual(key, geometryCacheKey({ ...base, afterSha256: sha("c") }));
  assert.notEqual(key, geometryCacheKey({ ...base, declaredUnits: "mm" }));
  assert.notEqual(key, geometryCacheKey({ ...base, tolerance: 0.1 }));
  assert.notEqual(key, geometryCacheKey({ ...base, afterFormat: "obj" }));
}

// ── Options ─────────────────────────────────────────────────────
assert.deepEqual(normalizeGeometryOptions({}), { declaredUnits: null, tolerance: null });
assert.deepEqual(normalizeGeometryOptions({ units: "in", tolerance: "0.005" }), { declaredUnits: "in", tolerance: 0.005 });
assert.throws(() => normalizeGeometryOptions({ units: "furlong" }), GeometryRequestError);
assert.throws(() => normalizeGeometryOptions({ tolerance: -1 }), GeometryRequestError);
assert.throws(() => normalizeGeometryOptions({ tolerance: "abc" }), GeometryRequestError);

// ── Request + authorization against a fake database ─────────────
type Version = { id: string; fileName: string; sizeBytes: number | null; sha256: string | null; storageProvider: string; item: { projectId: string; deletedAt: Date | null } };
function fakeDb(versions: Version[]) {
  const rows: any[] = [];
  const db = {
    rows,
    vaultVersion: { findUnique: async ({ where }: any) => versions.find((v) => v.id === where.id) ?? null },
    vaultGeometryDiff: {
      findUnique: async ({ where }: any) => rows.find((r) => (where.id ? r.id === where.id : r.projectId === where.projectId_cacheKey.projectId && r.cacheKey === where.projectId_cacheKey.cacheKey)) ?? null,
      create: async ({ data }: any) => { const row = { id: `diff${rows.length + 1}`, state: "PENDING", attempts: 0, outcomeStatus: null, resultJson: null, error: null, completedAt: null, createdAt: new Date(0), updatedAt: new Date(0), ...data }; rows.push(row); return row; },
      update: async ({ where, data }: any) => { const row = rows.find((r) => r.id === where.id); Object.assign(row, data); return row; },
    },
  };
  return db;
}
const v = (id: string, fileName: string, projectId = "P1", extra: Partial<Version> = {}): Version => ({ id, fileName, sizeBytes: 1000, sha256: sha(id.slice(-1)), storageProvider: "GITHUB", item: { projectId, deletedAt: null }, ...extra });
const versions = [v("v1", "a.stl"), v("v2", "b.step"), v("v3", "c.stl", "P2"), v("v4", "native.sldprt"), v("v5", "legacy.stl", "P1", { sha256: null, storageProvider: "DRIVE" }), v("v6", "huge.stl", "P1", { sizeBytes: 10 * 1024 * 1024 * 1024 }), v("v7", "gone.stl", "P1", { item: { projectId: "P1", deletedAt: new Date() } })];
const member = (allowed: string[]) => async (memberId: string | undefined, projectId: string) => !!memberId && allowed.includes(projectId);
const status = async (p: Promise<unknown>) => { try { await p; return 200; } catch (e) { assert.ok(e instanceof GeometryRequestError, String(e)); return e.status; } };
{
  const db = fakeDb(versions);
  let kicks = 0;
  const deps = { db: db as any, canAccess: member(["P1"]), kick: () => { kicks++; } };
  const first = await requestGeometryDiff("m1", { beforeVersionId: "v1", afterVersionId: "v2", units: "mm" }, deps);
  assert.equal(first.state, "PENDING");
  assert.equal(kicks, 1);
  assert.deepEqual(first.options, { declaredUnits: "mm", tolerance: null });
  const again = await requestGeometryDiff("m2", { beforeVersionId: "v1", afterVersionId: "v2", units: "mm" }, deps);
  assert.equal(again.id, first.id, "same hashes + options → cached row, not a new job");
  assert.equal(db.rows.length, 1);
  const other = await requestGeometryDiff("m1", { beforeVersionId: "v1", afterVersionId: "v2", units: "in" }, deps);
  assert.notEqual(other.id, first.id, "different declared unit → different result");

  // Project authorization: a non-member learns nothing, not even the format.
  assert.equal(await status(requestGeometryDiff("m1", { beforeVersionId: "v1", afterVersionId: "v4" }, { ...deps, canAccess: member([]) })), 403);
  assert.equal(await status(requestGeometryDiff(undefined, { beforeVersionId: "v1", afterVersionId: "v2" }, { ...deps, canAccess: async () => false })), 403);
  assert.equal(await status(requestGeometryDiff("m1", { beforeVersionId: "v1", afterVersionId: "v3" }, deps)), 403, "a version in a project the member cannot open");
  assert.equal(await status(requestGeometryDiff("m1", { beforeVersionId: "v1", afterVersionId: "v3" }, { ...deps, canAccess: member(["P1", "P2"]) })), 400, "cross-project pairs are rejected");
  assert.equal(await status(requestGeometryDiff("m1", { beforeVersionId: "v1", afterVersionId: "v7" }, deps)), 404, "soft-deleted items are not diffed");
  assert.equal(await status(requestGeometryDiff("m1", { beforeVersionId: "v1", afterVersionId: "v4" }, deps)), 422, "native CAD is unsupported, explicitly");
  assert.equal(await status(requestGeometryDiff("m1", { beforeVersionId: "v1", afterVersionId: "v5" }, deps)), 409, "no hash, no cache key");
  assert.equal(await status(requestGeometryDiff("m1", { beforeVersionId: "v1", afterVersionId: "v1" }, deps)), 400);
  const huge = await requestGeometryDiff("m1", { beforeVersionId: "v1", afterVersionId: "v6" }, deps);
  assert.equal(huge.state, "DONE");
  assert.equal(huge.outcomeStatus, "TOO_LARGE");
  assert.equal((huge.result as any).side, "after");

  // Reading a stored result re-checks access to the row's project.
  assert.equal((await authorizeGeometryDiff("m1", first.id, { db: db as any, canAccess: member(["P1"]) })).id, first.id);
  assert.equal(await status(authorizeGeometryDiff("m1", first.id, { db: db as any, canAccess: member(["P2"]) })), 403);
  assert.equal(await status(authorizeGeometryDiff("m1", "missing", { db: db as any, canAccess: member(["P1"]) })), 404);

  // A retryable failure is re-queued on the next request; an exhausted one is returned as is.
  db.rows[0].state = "FAILED"; db.rows[0].attempts = 1;
  assert.equal((await requestGeometryDiff("m1", { beforeVersionId: "v1", afterVersionId: "v2", units: "mm" }, deps)).state, "PENDING");
  db.rows[0].state = "FAILED"; db.rows[0].attempts = 3; db.rows[0].outcomeStatus = "TIMEOUT";
  assert.equal((await requestGeometryDiff("m1", { beforeVersionId: "v1", afterVersionId: "v2", units: "mm" }, deps)).state, "FAILED");
}

// ── Bounded worker thread ───────────────────────────────────────
{
  const dir = await mkdtemp(path.join(tmpdir(), "geom-test-"));
  try {
    const a = path.join(dir, "a"), b = path.join(dir, "b"), mesh = path.join(dir, "after.stl");
    await writeFile(a, stlBinary(boxTris([0, 0, 0], [10, 10, 10])));
    await writeFile(b, stepBox("Cube", [0, 0, 0], [10, 10, 12]));
    const ok = await runInWorker({ before: { file: a, fileName: "a.stl" }, after: { file: b, fileName: "b.step" }, declaredUnits: "mm", tolerance: null, maxTriangles: 100_000, sampleCap: 4_000, meshOut: { after: mesh } }, { timeoutMs: 60_000, heapMb: 512 });
    assert.equal(ok.kind, "outcome");
    if (ok.kind === "outcome") {
      assert.equal(ok.outcome.status, "COMPLETE");
      if (ok.outcome.status === "COMPLETE") assert.deepEqual(ok.outcome.summary.bboxDelta, [0, 0, 2]);
    }
    const stl = await readFile(mesh);
    assert.equal(stl.length, 84 + stl.readUInt32LE(80) * 50, "the STEP side's tessellation is written as binary STL for the viewer");
    const slow = await runInWorker({ before: { file: a, fileName: "a.stl" }, after: { file: b, fileName: "b.step" }, declaredUnits: null, tolerance: null, maxTriangles: 100_000 }, { timeoutMs: 1, heapMb: 512 });
    assert.equal(slow.kind, "timeout", "a diff that exceeds its time budget is stopped");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ── Route guards (static): every route authenticates, reads re-check the project ──
{
  const src = readFileSync(new URL("../api/vaultGeometry.ts", import.meta.url), "utf8");
  const routes = [...src.matchAll(/vaultGeometryRouter\.(get|post|put|patch|delete)\(\s*"([^"]+)",\s*(\w+)/g)];
  assert.ok(routes.length >= 4);
  for (const r of routes) assert.equal(r[3], "requireAuth", `${r[1].toUpperCase()} ${r[2]} must use requireAuth`);
  const readers = src.match(/authorizeGeometryDiff\(/g) ?? [];
  assert.equal(readers.length, 2, "GET /:id and GET /:id/mesh/:side both authorize the stored row");
  const app = readFileSync(new URL("../app.ts", import.meta.url), "utf8");
  assert.match(app, /app\.use\("\/api", vaultGeometryRouter\)/);
}

console.log("vaultGeometryService.test.ts: passed");
