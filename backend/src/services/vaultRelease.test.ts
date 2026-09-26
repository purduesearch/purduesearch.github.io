// Phase 7 release tests: recursive BOM pinning, build-readiness blockers vs
// warnings, manifest/package reproducibility, missing bytes, moved GitHub
// heads and package authorization. No DB, no network: storage is injected.
// Run: cd backend && npx tsx src/services/vaultRelease.test.ts
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { bomCsv, buildManifest, canonicalJson, computeReadiness, requirementMatches, ReleaseBlockedError, tarHeader, versionsNeedingHash, whereUsedChains, type PolicyVersion, type ReleaseSnapshot } from "./vaultReleasePolicy.js";
import { ReleasePackageError, writeReleasePackage, type FetchEntry } from "./vaultReleasePackage.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const bytes: Record<string, string> = { vA: "assembly bytes", vB: "sub bytes", vC: "part bytes C", vD: "drawing of C", vC2: "part bytes C rev 2", vTop: "top assembly" };
const item = (id: string, partNumber: string, extra: Partial<ReleaseSnapshot["items"][number]> = {}) => ({ id, name: `Item ${id}`, partNumber, currentRevision: "A", deletedAt: null, drawingForId: null, ...extra });
const version = (id: string, itemId: string, releasedAt: string | null, extra: Partial<PolicyVersion> = {}): PolicyVersion => ({
  id, itemId, versionNumber: 1, revision: releasedAt ? "A" : null, releasedAt, fileName: `${itemId}.step`, mimeType: "model/step",
  sizeBytes: Buffer.byteLength(bytes[id] ?? id), sha256: sha(bytes[id] ?? id), storageProvider: "GITHUB", repositoryId: "repo1",
  repositorySlug: "club/vault", branch: "vault", filePath: `vault/items/${itemId}/source/${itemId}.step`, commitSha: `commit-${id}`,
  blobSha: `blob-${id}`, lfsOid: sha(bytes[id] ?? id), driveFileId: null, ...extra,
});

// TOP ─2→ A ─3→ B ─4→ C   (A is being released; C has a drawing D)
function snapshot(overrides: Partial<ReleaseSnapshot> = {}): ReleaseSnapshot {
  return {
    crId: "cr1",
    crItems: [{ itemId: "A", versionId: "vA" }],
    linkedTaskId: null,
    items: [item("TOP", "PRT-0000"), item("A", "PRT-0001"), item("B", "PRT-0002"), item("C", "PRT-0003"), item("D", "DWG-0003", { drawingForId: "C" })],
    versions: [version("vTop", "TOP", "2026-01-01T00:00:00Z"), version("vA", "A", null, { versionNumber: 2 }), version("vB", "B", "2026-02-01T00:00:00Z"), version("vC", "C", "2026-03-01T00:00:00Z"), version("vD", "D", "2026-03-02T00:00:00Z")],
    edges: [{ parentId: "TOP", childId: "A", quantity: 2 }, { parentId: "A", childId: "B", quantity: 3 }, { parentId: "B", childId: "C", quantity: 4 }],
    requirements: [],
    tasks: [],
    openCrs: [],
    ...overrides,
  };
}
const meta = { projectId: "p1", changeRequestNumber: 7, title: "Bracket v2", approvedAt: new Date("2026-09-26T12:00:00Z"), approvedById: "admin", revisions: { A: "B" } };
const NOW = meta.approvedAt.getTime();

// ── BOM recursion ─────────────────────────────────────────────
{
  const { manifest } = buildManifest(snapshot(), meta);
  const roles = Object.fromEntries(manifest.entries.map((e) => [e.itemId, e.role]));
  assert.deepEqual(roles, { A: "RELEASED", B: "COMPONENT", C: "COMPONENT", D: "DRAWING" }, "closure walks every level and brings the drawing");
  assert.equal(manifest.entries.find((e) => e.itemId === "A")!.revision, "B", "released item carries the new revision letter");
  assert.equal(manifest.entries.find((e) => e.itemId === "C")!.versionId, "vC", "component pinned to its released version");
  assert.deepEqual(manifest.bom.edges.map((e) => `${e.parentId}>${e.childId}x${e.quantity}`), ["A>Bx3", "B>Cx4"], "exact recursive BOM under the release, not the parent above");
  const csv = bomCsv(manifest).trim().split("\n");
  assert.equal(csv.length, 4);
  assert.match(csv[3], /^2,PRT-0002,PRT-0003,Item C,A,4,12,/, "extended quantity multiplies down the tree");
  assert.equal(manifest.entries.find((e) => e.itemId === "C")!.storage.commitSha, "commit-vC", "manifest pins the commit SHA");
}
{
  // Shared subassembly appears once in the pinned set but twice in the BOM rows.
  const s = snapshot({ edges: [{ parentId: "A", childId: "B", quantity: 1 }, { parentId: "A", childId: "C", quantity: 2 }, { parentId: "B", childId: "C", quantity: 5 }] });
  const { manifest } = buildManifest(s, meta);
  assert.equal(manifest.entries.filter((e) => e.itemId === "C").length, 1);
  assert.equal(bomCsv(manifest).trim().split("\n").filter((row) => row.includes(",PRT-0003,")).length, 2);
}
{
  const chains = whereUsedChains("C", snapshot().edges);
  assert.deepEqual(chains, [["C", "B", "A", "TOP"]], "where-used walks to the top assembly");
  const cyclic = computeReadiness(snapshot({ edges: [...snapshot().edges, { parentId: "C", childId: "A", quantity: 1 }] }), NOW);
  assert.ok(cyclic.blockers.some((f) => f.code === "BOM_CYCLE"), "a BOM cycle blocks release");
}

// ── Readiness: blockers vs warnings ───────────────────────────
{
  const report = computeReadiness(snapshot(), NOW);
  assert.equal(report.state, "warnings");
  assert.equal(report.blockers.length, 0);
  // TOP Rev A was released against the old A; B (Feb) also predates the C (Mar) it will be built with.
  assert.deepEqual(report.staleAssemblies.map((s) => s.assemblyId), ["TOP", "B"]);
  assert.deepEqual(report.whereUsed, [{ itemId: "A", chains: [["A", "TOP"]] }]);
}
{
  const unreleased = snapshot({ versions: snapshot().versions.filter((v) => v.id !== "vB") });
  const report = computeReadiness(unreleased, NOW);
  assert.equal(report.state, "blocked");
  assert.ok(report.blockers.some((f) => f.code === "UNRELEASED_COMPONENT" && f.itemId === "B"));
  assert.throws(() => buildManifest(unreleased, meta), ReleaseBlockedError, "the approval transaction refuses a blocked release");
}
{
  const reqs = (severity: string) => [{ id: "r1", scope: "SUBSYSTEM", value: "PRT", severity }];
  const warn = computeReadiness(snapshot({ requirements: reqs("WARNING") }), NOW);
  assert.deepEqual(warn.missingDrawings.map((m) => [m.itemId, m.severity]), [["A", "WARNING"], ["B", "WARNING"]], "C has its drawing; A and B do not");
  assert.notEqual(warn.state, "blocked", "warning requirements never block");
  const block = computeReadiness(snapshot({ requirements: reqs("BLOCKER") }), NOW);
  assert.equal(block.state, "blocked");
  assert.equal(block.blockers.filter((f) => f.code === "MISSING_DRAWING").length, 2);
  // A drawing released in the same CR satisfies the requirement.
  const withDrawing = snapshot({
    requirements: [{ id: "r1", scope: "EXTENSION", value: ".STEP, sldprt", severity: "BLOCKER" }],
    items: [...snapshot().items, item("DA", "DWG-0001", { drawingForId: "A" }), item("DB", "DWG-0002", { drawingForId: "B" })],
    versions: [...snapshot().versions, version("vDA", "DA", null), version("vDB", "DB", "2026-02-02T00:00:00Z")],
    crItems: [{ itemId: "A", versionId: "vA" }, { itemId: "DA", versionId: "vDA" }],
  });
  assert.equal(computeReadiness(withDrawing, NOW).blockers.length, 0);
  assert.equal(requirementMatches({ id: "x", scope: "SUBSYSTEM", value: "PRT", severity: "WARNING" }, item("Z", "PRTX-1"), "z.step"), false, "prefix match is by path segment");
}
{
  const report = computeReadiness(snapshot({
    tasks: [{ id: "t1", title: "Machine PRT-0001 bracket", status: "TODO", description: null }, { id: "t2", title: "Unrelated", status: "TODO", description: null }, { id: "t3", title: "Paint", status: "IN_PROGRESS", description: "top frame" }],
    openCrs: [{ id: "cr2", number: 8, taskId: "t3", itemIds: ["TOP"] }],
  }), NOW);
  assert.deepEqual(report.affectedTasks.map((t) => t.id).sort(), ["t1", "t3"], "mentions and tasks linked to overlapping open CRs");
  assert.ok(report.warnings.some((w) => w.code === "CONCURRENT_CHANGE"));
}
{
  const missingRef = snapshot({ versions: snapshot().versions.map((v) => v.id === "vC" ? { ...v, commitSha: null } : v) });
  assert.ok(computeReadiness(missingRef, NOW).blockers.some((f) => f.code === "MISSING_BYTES" && f.itemId === "C"));
  const legacy = snapshot({ versions: snapshot().versions.map((v) => v.id === "vB" ? { ...v, storageProvider: "DRIVE" as const, driveFileId: "drive-b", sha256: null, commitSha: null } : v) });
  assert.ok(computeReadiness(legacy, NOW).warnings.some((f) => f.code === "HASH_PENDING"), "legacy bytes are hashed at approval, not trusted blind");
  assert.deepEqual(versionsNeedingHash(legacy, NOW).map((v) => v.id), ["vB"]);
  assert.throws(() => buildManifest(legacy, meta), ReleaseBlockedError, "no manifest without a real-byte hash");
}

// ── Manifest determinism ──────────────────────────────────────
{
  const a = buildManifest(snapshot(), meta);
  const shuffled = snapshot();
  const b = buildManifest({ ...shuffled, versions: [...shuffled.versions].reverse(), edges: [...shuffled.edges].reverse(), items: [...shuffled.items].reverse() }, meta);
  assert.equal(a.json, b.json, "input order never changes the manifest");
  assert.equal(a.sha256, sha(a.json));
  assert.equal(canonicalJson({ b: 1, a: { d: 2, c: 3 } }), '{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}\n');
}

// ── Package reproducibility, missing bytes, moved heads ───────
function readTar(buffer: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let offset = 0, paxPath: string | null = null;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/s, "");
    const size = parseInt(header.subarray(124, 136).toString("ascii"), 8);
    const type = String.fromCharCode(header[156]);
    const body = buffer.subarray(offset + 512, offset + 512 + size);
    if (type === "x") paxPath = /\d+ path=(.*)\n/.exec(body.toString("utf8"))?.[1] ?? null;
    else { files.set(paxPath ?? name, Buffer.from(body)); paxPath = null; }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

async function main() {
  const dir = await mkdtemp(path.join(tmpdir(), "vault-release-test-"));
  try {
    const { json, sha256: manifestSha, manifest } = buildManifest(snapshot(), meta);
    // "GitHub" keyed by commit SHA: the branch head has since moved on and holds different bytes for C.
    const commits: Record<string, string> = Object.fromEntries(Object.entries(bytes).map(([id, body]) => [`commit-${id}`, body]));
    const branchHead = { C: "part bytes C rev 99 (pushed after release)" };
    const requested: string[] = [];
    const fetchByCommit: FetchEntry = async (entry) => {
      requested.push(entry.storage.commitSha!);
      const body = commits[entry.storage.commitSha!];
      if (body === undefined) throw new Error("unknown commit");
      const file = path.join(dir, `fetch-${requested.length}`);
      await writeFile(file, body);
      return { file, cleanup: () => rm(file, { force: true }) };
    };
    const first = await writeReleasePackage(json, manifestSha, path.join(dir, "one.tar"), fetchByCommit);
    const second = await writeReleasePackage(json, manifestSha, path.join(dir, "two.tar"), fetchByCommit);
    assert.equal(first.sha256, second.sha256, "rebuilding from the same manifest is byte-identical");
    assert.ok(requested.every((c) => c.startsWith("commit-")) && !requested.includes("vault"), "reads are pinned by commit SHA, never the branch");
    assert.notEqual(branchHead.C, bytes.vC);
    const files = readTar(await readFile(path.join(dir, "one.tar")));
    const root = "CR-7-release";
    assert.equal(files.get(`${root}/manifest.json`)!.toString(), json, "the package embeds the exact manifest bytes");
    for (const entry of manifest.entries) assert.equal(sha(files.get(`${root}/${entry.packagePath}`)!.toString()), entry.sha256);
    const sums = files.get(`${root}/SHA256SUMS`)!.toString();
    assert.ok(sums.includes(`${manifestSha}  manifest.json`) && sums.split("\n").filter(Boolean).length === manifest.entries.length + 1);
    assert.ok(files.has(`${root}/BOM.csv`) && files.has(`${root}/README.txt`));

    // Storage now returns different bytes for a pinned commit (e.g. a rewritten LFS object): refuse, never substitute.
    const tampered: FetchEntry = async (entry) => {
      const file = path.join(dir, `tamper-${entry.itemId}`);
      await writeFile(file, entry.itemId === "C" ? branchHead.C : commits[entry.storage.commitSha!]);
      return { file, cleanup: () => rm(file, { force: true }) };
    };
    await assert.rejects(writeReleasePackage(json, manifestSha, path.join(dir, "bad.tar"), tampered), (e: unknown) => e instanceof ReleasePackageError && e.code === "HASH_MISMATCH");
    assert.equal(existsSync(path.join(dir, "bad.tar")) || existsSync(path.join(dir, "bad.tar.partial")), false, "a failed build leaves no package behind");

    // Missing bytes (pinned commit gone / LFS object missing).
    delete commits["commit-vB"];
    await assert.rejects(writeReleasePackage(json, manifestSha, path.join(dir, "missing.tar"), fetchByCommit), (e: unknown) => e instanceof ReleasePackageError && e.code === "MISSING_BYTES" && e.entry?.itemId === "B");
    assert.equal((await readdir(dir)).some((f) => f.startsWith("missing.tar")), false);

    // A manifest edited after approval is refused outright.
    await assert.rejects(writeReleasePackage(json.replace("Bracket v2", "Bracket v3"), manifestSha, path.join(dir, "edited.tar"), fetchByCommit), (e: unknown) => e instanceof ReleasePackageError && e.code === "MANIFEST_MISMATCH");

    // Long and unicode file names survive via pax headers.
    const header = tarHeader(`${root}/files/${"x".repeat(120)}/ünïcode part.step`, 10, 0);
    assert.equal(header.length, 512 * 3);
    assert.equal(String.fromCharCode(header[156]), "x");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  // ── Package authorization ───────────────────────────────────
  process.env.SESSION_SECRET ||= "vault-release-test-secret-at-least-32-chars";
  const { authorizeRelease } = await import("./vaultReleaseService.js");
  const deps = { find: async (id: string) => (id === "rel1" ? { projectId: "p1" } : null), canAccess: async (m: string | undefined, p: string) => m === "member" && p === "p1" };
  assert.equal(await authorizeRelease("member", "rel1", deps), "ok");
  assert.equal(await authorizeRelease("outsider", "rel1", deps), "forbidden", "non-members cannot read another project's package");
  assert.equal(await authorizeRelease(undefined, "rel1", deps), "forbidden");
  assert.equal(await authorizeRelease("member", "nope", deps), "not_found");
  const { signedPackageMember } = await import("../api/vaultReleases.js");
  const { signVaultPath, verifyVaultSignature } = await import("./vaultService.js");
  const signed = signVaultPath("/vault-releases/rel1/package", "member");
  const q = { exp: String(signed.exp), sig: signed.sig, memberId: "member" };
  assert.equal(signedPackageMember("GET", "/rel1/package", q, verifyVaultSignature), "member");
  assert.equal(signedPackageMember("GET", "/rel2/package", q, verifyVaultSignature), null, "a link for one release cannot open another");
  assert.equal(signedPackageMember("GET", "/rel1/package", { ...q, memberId: "outsider" }, verifyVaultSignature), null, "the link is bound to the member it was minted for");
  assert.equal(signedPackageMember("GET", "/rel1/manifest", q, verifyVaultSignature), null, "only the package download accepts a signed link");
  assert.equal(signedPackageMember("POST", "/rel1/package", q, verifyVaultSignature), null);
  assert.equal(signedPackageMember("GET", "/rel1/package", { ...q, exp: String(Date.now() - 1) }, verifyVaultSignature), null, "expired links fail");
  console.log("vaultRelease tests passed");
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
