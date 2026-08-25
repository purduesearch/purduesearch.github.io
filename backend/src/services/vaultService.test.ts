// Pure-logic unit tests for ensureVaultFolder's cached-folder decision table.
// No DB, no network: every Drive/Prisma boundary is injected.
// Run: cd backend && npx tsx src/services/vaultService.test.ts
//
// Why this file exists: Project.vaultFolderId was trusted forever with zero
// Drive calls, so when the Drive bot was reconnected to an account that had not
// created those folders (drive.file only ever sees what the app itself created),
// every check-in 400'd on `File not found: <cached id>` — permanently, with a
// message telling the user to share an unrelated folder. The rules below are
// what keep that from recurring, in BOTH directions: a definitively dead id must
// self-heal, and a transient failure must NOT destroy a good id.
//
// Excluded from the production build (tsconfig `exclude` covers *.test.ts).
// Uses the same tiny inline assertion harness as courseProgressService.test.ts.

import { ensureVaultFolder, type VaultFolderDeps } from "./vaultService.js";
import type { DriveResult, DriveFolderMeta } from "./driveService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

type Calls = {
  probed: string[];
  created: Array<{ name: string; parentId?: string }>;
  saved: Array<string | null>;
  rootCalls: number;
};

const okFolder = (over: Partial<DriveFolderMeta> = {}): DriveResult<DriveFolderMeta> => ({
  ok: true,
  value: { id: "cached-folder", name: "CAD", trashed: false, canAddChildren: true, ...over },
});

/**
 * Build deps whose Drive layer is fully scripted. `probe` decides what the
 * cached id looks like; `createResults` is consumed one call at a time so a
 * test can make the project folder succeed and the CAD folder fail.
 */
function makeDeps(opts: {
  project?: { name: string | null; vaultFolderId: string | null } | null;
  probe?: DriveResult<DriveFolderMeta>;
  createResults?: Array<DriveResult<{ id: string }>>;
  rootId?: string | null;
}): { deps: VaultFolderDeps; calls: Calls } {
  const calls: Calls = { probed: [], created: [], saved: [], rootCalls: 0 };
  const createQueue = [...(opts.createResults ?? [])];
  const deps: VaultFolderDeps = {
    loadProject: async () =>
      opts.project === undefined ? { name: "ARES", vaultFolderId: null } : opts.project,
    saveFolderId: async (_projectId, folderId) => { calls.saved.push(folderId); },
    probeFolder: async (folderId) => {
      calls.probed.push(folderId);
      return opts.probe ?? okFolder();
    },
    createFolder: async (name, parentId) => {
      calls.created.push({ name, parentId });
      return createQueue.shift() ?? { ok: false, reason: "drive-error", detail: "no scripted result" };
    },
    ensureRoot: async () => { calls.rootCalls++; return opts.rootId === undefined ? "root-id" : opts.rootId; },
    getBotEmail: async () => "bot@example.com",
  };
  return { deps, calls };
}

console.log("ensureVaultFolder — healthy cached folder is reused as-is");
{
  const { deps, calls } = makeDeps({
    project: { name: "ARES", vaultFolderId: "cached-folder" },
    probe: okFolder(),
  });
  const res = await ensureVaultFolder("p1", deps);
  check("returns the cached id", "folderId" in res && res.folderId === "cached-folder");
  check("probed exactly once", calls.probed.length === 1 && calls.probed[0] === "cached-folder");
  check("created nothing", calls.created.length === 0);
  check("wrote nothing back", calls.saved.length === 0);
}

console.log("ensureVaultFolder — a 404 cached folder self-heals");
{
  // The exact production failure: the bot was reconnected to an account that
  // cannot see the folder the previous credential created.
  const { deps, calls } = makeDeps({
    project: { name: "ARES", vaultFolderId: "orphaned-id" },
    probe: { ok: false, reason: "not-found" },
    createResults: [{ ok: true, value: { id: "new-project" } }, { ok: true, value: { id: "new-cad" } }],
  });
  const res = await ensureVaultFolder("p1", deps);
  check("re-provisions and returns the NEW id", "folderId" in res && res.folderId === "new-cad");
  check("created the project folder under the root", calls.created[0]?.name === "ARES" && calls.created[0]?.parentId === "root-id");
  check("created the CAD leaf under it", calls.created[1]?.name === "CAD" && calls.created[1]?.parentId === "new-project");
  check("persisted the new id", calls.saved.includes("new-cad"));
}

console.log("ensureVaultFolder — a trashed folder counts as gone");
{
  const { deps, calls } = makeDeps({
    project: { name: "ARES", vaultFolderId: "trashed-id" },
    probe: okFolder({ trashed: true }),
    createResults: [{ ok: true, value: { id: "new-project" } }, { ok: true, value: { id: "new-cad" } }],
  });
  const res = await ensureVaultFolder("p1", deps);
  check("re-provisions", "folderId" in res && res.folderId === "new-cad");
  check("created two folders", calls.created.length === 2);
}

console.log("ensureVaultFolder — a folder we cannot write into counts as gone");
{
  const { deps } = makeDeps({
    project: { name: "ARES", vaultFolderId: "readonly-id" },
    probe: okFolder({ canAddChildren: false }),
    createResults: [{ ok: true, value: { id: "new-project" } }, { ok: true, value: { id: "new-cad" } }],
  });
  const res = await ensureVaultFolder("p1", deps);
  check("re-provisions", "folderId" in res && res.folderId === "new-cad");
}

console.log("ensureVaultFolder — a REVOKED credential must not destroy a good id");
{
  // Regression guard: `unauthorized` says nothing about the folder, only about
  // the token. Re-provisioning here would strand the real folder and silently
  // start a second tree the moment the credential came back.
  const { deps, calls } = makeDeps({
    project: { name: "ARES", vaultFolderId: "good-id" },
    probe: { ok: false, reason: "unauthorized", detail: "invalid_grant" },
  });
  const res = await ensureVaultFolder("p1", deps);
  check("reports unauthorized", "error" in res && res.error.status === "unauthorized");
  check("created nothing", calls.created.length === 0);
  check("did NOT clear the cached id", calls.saved.length === 0);
}

console.log("ensureVaultFolder — a transient Drive error must not destroy a good id");
{
  const { deps, calls } = makeDeps({
    project: { name: "ARES", vaultFolderId: "good-id" },
    probe: { ok: false, reason: "drive-error", detail: "status 503" },
  });
  const res = await ensureVaultFolder("p1", deps);
  check("reports drive-error", "error" in res && res.error.status === "drive-error");
  check("created nothing", calls.created.length === 0);
  check("did NOT clear the cached id", calls.saved.length === 0);
}

console.log("ensureVaultFolder — a dead id is cleared even when re-provision fails");
{
  // The id is known-bad, so a later retry must re-provision rather than probe
  // the same corpse again.
  const { deps, calls } = makeDeps({
    project: { name: "ARES", vaultFolderId: "orphaned-id" },
    probe: { ok: false, reason: "not-found" },
    createResults: [{ ok: false, reason: "drive-error", detail: "status 500" }],
  });
  const res = await ensureVaultFolder("p1", deps);
  check("reports an error", "error" in res);
  check("cleared the dead id", calls.saved.includes(null));
  check("did not persist a bogus id", !calls.saved.some((s) => typeof s === "string"));
}

console.log("ensureVaultFolder — no cached id provisions a fresh tree");
{
  const { deps, calls } = makeDeps({
    project: { name: "Microgreens", vaultFolderId: null },
    createResults: [{ ok: true, value: { id: "proj" } }, { ok: true, value: { id: "cad" } }],
  });
  const res = await ensureVaultFolder("p1", deps);
  check("returns the new leaf", "folderId" in res && res.folderId === "cad");
  check("probed nothing", calls.probed.length === 0);
  check("persisted it", calls.saved.includes("cad"));
}

console.log("ensureVaultFolder — no bot connected");
{
  const { deps, calls } = makeDeps({
    project: { name: "ARES", vaultFolderId: null },
    rootId: null,
  });
  const res = await ensureVaultFolder("p1", deps);
  check("reports no-link", "error" in res && res.error.status === "no-link");
  check("created nothing", calls.created.length === 0);
}

console.log("ensureVaultFolder — unknown project");
{
  const { deps, calls } = makeDeps({ project: null });
  const res = await ensureVaultFolder("nope", deps);
  check("reports no-link", "error" in res && res.error.status === "no-link");
  check("never touched Drive", calls.rootCalls === 0 && calls.created.length === 0);
}

console.log("ensureVaultFolder — a nameless project still gets a folder");
{
  const { deps, calls } = makeDeps({
    project: { name: null, vaultFolderId: null },
    createResults: [{ ok: true, value: { id: "proj" } }, { ok: true, value: { id: "cad" } }],
  });
  const res = await ensureVaultFolder("p1", deps);
  check("provisions", "folderId" in res && res.folderId === "cad");
  check("falls back to a placeholder name", typeof calls.created[0]?.name === "string" && calls.created[0].name.length > 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
