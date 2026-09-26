import assert from "node:assert/strict";
import test from "node:test";
import { executeVaultJob, sameUpload, type StoredCommit, type VaultJobPort } from "./vaultJobProtocol.js";
import { sourcePath, VaultGitError } from "./vaultGitTransport.js";

function fixture() {
  let held = false;
  let head = "a";
  let pushes = 0;
  let visible = 0;
  const storedByJob = new Map<string, StoredCommit>();
  let recovered: StoredCommit | null = null;
  let failure: string | null = null;
  let verifyError: VaultGitError | null = null;
  let pushError: VaultGitError | null = null;
  const commit = { commitSha: "b", blobSha: "blob", lfsOid: "oid" };
  const port = (expectedHead: string, jobKey = "one"): VaultJobPort => ({
    expectedHead,
    acquire: async () => { if (held) return false; held = true; return true; },
    release: async () => { held = false; },
    storedCommit: async () => storedByJob.get(jobKey) ?? null,
    recoverCommit: async () => recovered,
    actualHead: async () => head,
    saveCommit: async value => { storedByJob.set(jobKey, value); },
    push: async onCommitted => { pushes++; if (pushError) throw pushError; head = "b"; await onCommitted(commit); },
    verify: async () => { if (verifyError) throw verifyError; },
    index: async () => { visible++; },
    fail: async code => { failure = code; },
  });
  return { port, get pushes() { return pushes; }, get visible() { return visible; }, get failure() { return failure; }, get stored() { return storedByJob.get("one") ?? null; }, set head(value: string) { head = value; }, set recovered(value: StoredCommit | null) { recovered = value; }, set verifyError(value: VaultGitError | null) { verifyError = value; }, set pushError(value: VaultGitError | null) { pushError = value; } };
}

test("simultaneous check-ins on one branch cannot both write the same expected head", async () => {
  const f = fixture();
  const [first, second] = await Promise.all([executeVaultJob(f.port("a", "first")), executeVaultJob(f.port("a", "second"))]);
  assert.equal(first, "INDEXED");
  assert.equal(second, "LOCKED");
  assert.equal(await executeVaultJob(f.port("a", "second")), "RETRY");
  assert.equal(f.failure, "BRANCH_DRIFT");
  assert.equal(f.pushes, 1);
  assert.equal(f.visible, 1);
});

test("a retry after verification failure reuses the recorded commit", async () => {
  const f = fixture();
  f.verifyError = new VaultGitError("LFS_MISSING");
  assert.equal(await executeVaultJob(f.port("a")), "RETRY");
  assert.equal(f.visible, 0);
  assert.equal(f.failure, "LFS_MISSING");
  f.verifyError = null;
  assert.equal(await executeVaultJob(f.port("a")), "INDEXED");
  assert.equal(f.pushes, 1);
  assert.equal(f.visible, 1);
});

test("restart recovers a pushed commit whose database callback was lost", async () => {
  const f = fixture();
  f.head = "b";
  f.recovered = { commitSha: "b", blobSha: "blob", lfsOid: "oid" };
  assert.equal(await executeVaultJob(f.port("a")), "INDEXED");
  assert.deepEqual(f.stored, { commitSha: "b", blobSha: "blob", lfsOid: "oid" });
  assert.equal(f.pushes, 0);
  assert.equal(f.visible, 1);
});

test("permission failure keeps the job retryable without indexing", async () => {
  const f = fixture();
  f.pushError = new VaultGitError("PERMISSION");
  assert.equal(await executeVaultJob(f.port("a")), "RETRY");
  assert.equal(f.failure, "PERMISSION");
  assert.equal(f.visible, 0);
  f.pushError = null;
  assert.equal(await executeVaultJob(f.port("a")), "INDEXED");
  assert.equal(f.visible, 1);
});

test("external branch drift blocks a push and exposes no version", async () => {
  const f = fixture();
  f.head = "external";
  assert.equal(await executeVaultJob(f.port("a")), "RETRY");
  assert.equal(f.failure, "BRANCH_DRIFT");
  assert.equal(f.pushes, 0);
  assert.equal(f.visible, 0);
});

test("idempotency accepts the same upload and rejects changed bytes or scope", () => {
  const original = { uploaderId: "member", itemId: "part", fileName: "wing ü.stl", note: "Revise rib", sha256: "abc" };
  assert.equal(sameUpload(original, { ...original }), true);
  assert.equal(sameUpload(original, { ...original, sha256: "def" }), false);
  assert.equal(sameUpload(original, { ...original, itemId: "other" }), false);
  assert.equal(sameUpload(original, { ...original, uploaderId: "other" }), false);
});

test("source paths keep spaces and unicode inside an immutable item directory", () => {
  assert.equal(sourcePath("cj123", "wing ü.stl"), "vault/items/cj123/source/wing ü.stl");
  assert.throws(() => sourcePath("cj123", "../secret.stl"));
});
