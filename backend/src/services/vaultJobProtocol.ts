import { VaultGitError } from "./vaultGitTransport.js";

export type StoredCommit = { commitSha: string; blobSha: string; lfsOid: string };
export function sameUpload(existing: { uploaderId: string; fileName: string; note: string; sha256: string; itemId?: string }, request: { uploaderId: string; fileName: string; note: string; sha256: string; itemId?: string }): boolean {
  return existing.uploaderId === request.uploaderId && existing.fileName === request.fileName && existing.note === request.note && existing.sha256 === request.sha256 && (request.itemId === undefined || existing.itemId === request.itemId);
}
export type VaultJobPort = {
  acquire(): Promise<boolean>;
  release(): Promise<void>;
  storedCommit(): Promise<StoredCommit | null>;
  recoverCommit(): Promise<StoredCommit | null>;
  actualHead(): Promise<string | null>;
  expectedHead: string | null;
  verify(commit: StoredCommit): Promise<void>;
  push(onCommitted: (commit: StoredCommit) => Promise<void>): Promise<void>;
  saveCommit(commit: StoredCommit): Promise<void>;
  index(commit: StoredCommit): Promise<void>;
  fail(code: string): Promise<void>;
};

/** The only transition to INDEXED is after a pinned Git/LFS byte verification. */
export async function executeVaultJob(port: VaultJobPort): Promise<"LOCKED" | "INDEXED" | "RETRY"> {
  if (!(await port.acquire())) return "LOCKED";
  try {
    let committed = await port.storedCommit();
    if (!committed) {
      committed = await port.recoverCommit();
      if (committed) await port.saveCommit(committed);
    }
    if (!committed) {
      if (await port.actualHead() !== port.expectedHead) throw new VaultGitError("BRANCH_DRIFT");
      await port.push(async result => { await port.saveCommit(result); committed = result; });
      if (!committed) throw new VaultGitError("GIT_ERROR");
    }
    await port.verify(committed);
    await port.index(committed);
    return "INDEXED";
  } catch (error) {
    await port.fail(error instanceof VaultGitError ? error.code : "GIT_ERROR");
    return "RETRY";
  } finally { await port.release(); }
}
