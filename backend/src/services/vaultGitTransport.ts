import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { octokitForInstallation } from "./githubService.js";

export class VaultGitError extends Error {
  constructor(public code: "AUTH" | "PERMISSION" | "BRANCH_DRIFT" | "LFS_MISSING" | "LFS_QUOTA" | "GIT_ERROR" | "VERIFY_FAILED") {
    super(code);
  }
}

export async function installationToken(installId: number): Promise<string> {
  const client = octokitForInstallation(installId);
  if (!client) throw new VaultGitError("AUTH");
  try {
    const auth = await client.auth({ type: "installation" }) as { token: string };
    return auth.token;
  } catch { throw new VaultGitError("AUTH"); }
}

export async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let diagnostic = "";
    child.stdout.on("data", (part: Buffer) => { if (output.length < 4096) output += part.toString(); });
    child.stderr.on("data", (part: Buffer) => { if (diagnostic.length < 4096) diagnostic += part.toString(); });
    child.on("error", () => reject(new VaultGitError("GIT_ERROR")));
    child.on("close", (code) => {
      if (code === 0) { resolve(output.trim()); return; }
      const lower = diagnostic.toLowerCase();
      const kind = /quota|billing|bandwidth|storage limit/.test(lower) ? "LFS_QUOTA" : /permission|protected branch|ruleset|write access/.test(lower) ? "PERMISSION" : /authentication failed|bad credentials|http 401|http 403/.test(lower) ? "AUTH" : "GIT_ERROR";
      reject(new VaultGitError(kind));
    });
  });
}

export async function withGitCredential<T>(token: string, work: (ctx: { root: string; env: NodeJS.ProcessEnv; run: (args: string[], cwd?: string) => Promise<string> }) => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(tmpdir(), "vault-git-"));
  const js = path.join(root, "askpass.mjs");
  const script = path.join(root, process.platform === "win32" ? "askpass.cmd" : "askpass.sh");
  const env: NodeJS.ProcessEnv = { ...process.env, VAULT_GIT_TOKEN: token, GIT_ASKPASS: script, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "credential.helper", GIT_CONFIG_VALUE_0: "", GIT_LFS_SKIP_SMUDGE: "1" };
  try {
    await writeFile(js, 'process.stdout.write(process.argv.slice(2).join(" ").toLowerCase().includes("username") ? "x-access-token" : process.env.VAULT_GIT_TOKEN);', { mode: 0o700 });
    await writeFile(script, process.platform === "win32" ? `@echo off\r\n"${process.execPath}" "${js}" %*\r\n` : `#!/bin/sh\nexec "${process.execPath}" "${js}" "$@"\n`, { mode: 0o700 });
    return await work({ root, env, run: (args, cwd = root) => run("git", args, cwd, env) });
  } finally {
    delete env.VAULT_GIT_TOKEN;
    await rm(root, { recursive: true, force: true });
  }
}

export function sourcePath(itemId: string, fileName: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(itemId) || !fileName || fileName === "." || fileName === ".." || /[\\/\r\n\0]/.test(fileName)) throw new VaultGitError("GIT_ERROR");
  return `vault/items/${itemId}/source/${fileName}`;
}

export function vaultRepoUrl(slug: string): string {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(slug)) throw new VaultGitError("GIT_ERROR");
  return `https://github.com/${slug}.git`;
}

export type CommitInput = { slug: string; branch: string; installId: number; itemId: string; itemName: string; fileName: string; diskPath: string; sha256: string; size: bigint; note: string; expectedHeadSha: string | null; jobId: string };
export type CommitResult = { commitSha: string; blobSha: string; lfsOid: string; filePath: string; headSha: string };

export async function remoteHead(slug: string, branch: string, installId: number): Promise<string | null> {
  const token = await installationToken(installId);
  return withGitCredential(token, async ({ run }) => {
    const line = await run(["ls-remote", "--heads", vaultRepoUrl(slug), `refs/heads/${branch}`]);
    return line ? line.split(/\s/)[0] : null;
  });
}

export async function findCommittedJob(slug: string, branch: string, installId: number, jobId: string, itemId: string, fileName: string, sha256: string, size: bigint): Promise<CommitResult | null> {
  return withGitCredential(await installationToken(installId), async ({ root, run }) => {
    const checkout = path.join(root, "repo");
    await run(["clone", "--quiet", "--branch", branch, vaultRepoUrl(slug), checkout]);
    const commitSha = await run(["-C", checkout, "log", "-1", "--format=%H", "--fixed-strings", `--grep=[vault-job:${jobId}]`]);
    if (!commitSha) return null;
    const filePath = sourcePath(itemId, fileName);
    const pointer = await run(["-C", checkout, "show", `${commitSha}:${filePath}`]);
    if (!pointer.includes(`oid sha256:${sha256}`) || !pointer.includes(`size ${size}`)) throw new VaultGitError("VERIFY_FAILED");
    const blobSha = await run(["-C", checkout, "rev-parse", `${commitSha}:${filePath}`]);
    return { commitSha, blobSha, lfsOid: sha256, filePath, headSha: commitSha };
  });
}

export async function commitVaultFile(input: CommitInput, onCommitted: (result: CommitResult) => Promise<void>, onLfsStored?: () => Promise<void>, verifyAfterPush = true): Promise<CommitResult> {
  const token = await installationToken(input.installId);
  return withGitCredential(token, async ({ root, run, env }) => {
    const checkout = path.join(root, "repo");
    const url = vaultRepoUrl(input.slug);
    await run(["clone", "--quiet", "--no-checkout", url, checkout]);
    const current = await run(["-C", checkout, "ls-remote", "--heads", "origin", `refs/heads/${input.branch}`]);
    const head = current ? current.split(/\s/)[0] : null;
    if (head !== input.expectedHeadSha) throw new VaultGitError("BRANCH_DRIFT");
    if (head) await run(["-C", checkout, "checkout", "-q", "-B", input.branch, head]);
    else {
      try {
        const base = await run(["-C", checkout, "rev-parse", "HEAD"]);
        await run(["-C", checkout, "checkout", "-q", "-b", input.branch, base]);
      } catch { await run(["-C", checkout, "checkout", "-q", "--orphan", input.branch]); }
    }
    await run(["-C", checkout, "lfs", "install", "--local"]);
    const attributes = path.join(checkout, ".gitattributes");
    const sourceRule = "vault/items/**/source/** filter=lfs diff=lfs merge=lfs -text\n";
    const previewRule = "vault/items/**/preview/** filter=lfs diff=lfs merge=lfs -text\n";
    let existing = "";
    try { existing = await readFile(attributes, "utf8"); } catch { /* new repository */ }
    const additions = (existing.includes("vault/items/**/source/** filter=lfs") ? "" : sourceRule) + (existing.includes("vault/items/**/preview/** filter=lfs") ? "" : previewRule);
    if (additions) await writeFile(attributes, existing + (existing.endsWith("\n") || !existing ? "" : "\n") + additions);
    const relative = sourcePath(input.itemId, input.fileName);
    const target = path.join(checkout, ...relative.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(input.diskPath, target);
    const sourceDir = path.dirname(target);
    for (const old of await (await import("node:fs/promises")).readdir(sourceDir)) {
      if (old !== input.fileName) await rm(path.join(sourceDir, old));
    }
    const metadata = `vault/items/${input.itemId}/metadata.json`;
    await writeFile(path.join(checkout, ...metadata.split("/")), JSON.stringify({ itemId: input.itemId, name: input.itemName, latestFile: input.fileName, filePath: relative, sha256: input.sha256, sizeBytes: input.size.toString(), note: input.note, jobId: input.jobId }, null, 2) + "\n");
    await run(["-C", checkout, "add", "-A", "--", ".gitattributes", `vault/items/${input.itemId}`]);
    const pointer = await run(["-C", checkout, "show", `:${relative}`]);
    if (!pointer.includes(`oid sha256:${input.sha256}`) || !pointer.includes(`size ${input.size}`)) throw new VaultGitError("VERIFY_FAILED");
    const blobSha = await run(["-C", checkout, "rev-parse", `:${relative}`]);
    await run(["-C", checkout, "-c", "user.name=Constellation Vault", "-c", "user.email=vault@users.noreply.github.com", "commit", "-qm", `${input.note.slice(0, 160)} [vault-job:${input.jobId}]`]);
    const commitSha = await run(["-C", checkout, "rev-parse", "HEAD"]);
    await run(["-C", checkout, "lfs", "push", "origin", "HEAD"]);
    if (onLfsStored) await onLfsStored();
    try { await run(["-C", checkout, "push", "--quiet", "origin", `HEAD:refs/heads/${input.branch}`]); }
    catch (error) {
      const after = await run(["-C", checkout, "ls-remote", "--heads", "origin", `refs/heads/${input.branch}`]).catch(() => "");
      if ((after ? after.split(/\s/)[0] : null) !== head) throw new VaultGitError("BRANCH_DRIFT");
      throw error;
    }
    const fetched = await run(["-C", checkout, "ls-remote", "--heads", "origin", `refs/heads/${input.branch}`]);
    if (fetched.split(/\s/)[0] !== commitSha) throw new VaultGitError("BRANCH_DRIFT");
    const result = { commitSha, blobSha, lfsOid: input.sha256, filePath: relative, headSha: commitSha };
    await onCommitted(result);
    if (verifyAfterPush) await verifyVaultObject(input.slug, input.branch, input.installId, commitSha, relative, input.sha256, Number(input.size), { root, run, env });
    return result;
  });
}

export async function commitVaultThumbnail(input: { slug: string; branch: string; installId: number; itemId: string; versionId: string; bytes: Buffer; expectedHeadSha: string }, onCommitted: (commitSha: string) => Promise<void>): Promise<{ path: string; commitSha: string; blobSha: string; sha256: string }> {
  if (!/^[a-zA-Z0-9_-]+$/.test(input.itemId) || !/^[a-zA-Z0-9_-]+$/.test(input.versionId)) throw new VaultGitError("GIT_ERROR");
  const relative = `vault/items/${input.itemId}/preview/${input.versionId}.png`;
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const result = await withGitCredential(await installationToken(input.installId), async ({ root, run }) => {
    const checkout = path.join(root, "repo");
    await run(["clone", "--quiet", "--branch", input.branch, vaultRepoUrl(input.slug), checkout]);
    const head = await run(["-C", checkout, "rev-parse", "HEAD"]);
    if (head !== input.expectedHeadSha) throw new VaultGitError("BRANCH_DRIFT");
    await run(["-C", checkout, "lfs", "install", "--local"]);
    const target = path.join(checkout, ...relative.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, input.bytes);
    await run(["-C", checkout, "add", "--", relative]);
    const pointer = await run(["-C", checkout, "show", `:${relative}`]);
    if (!pointer.includes(`oid sha256:${sha256}`) || !pointer.includes(`size ${input.bytes.length}`)) throw new VaultGitError("VERIFY_FAILED");
    const blobSha = await run(["-C", checkout, "rev-parse", `:${relative}`]);
    await run(["-C", checkout, "-c", "user.name=Constellation Vault", "-c", "user.email=vault@users.noreply.github.com", "commit", "-qm", `Add preview for Vault version ${input.versionId}`]);
    const commitSha = await run(["-C", checkout, "rev-parse", "HEAD"]);
    await run(["-C", checkout, "lfs", "push", "origin", "HEAD"]);
    try { await run(["-C", checkout, "push", "--quiet", "origin", `HEAD:refs/heads/${input.branch}`]); }
    catch (error) {
      const actual = await run(["-C", checkout, "ls-remote", "--heads", "origin", `refs/heads/${input.branch}`]).catch(() => "");
      if (actual.split(/\s/)[0] !== head) throw new VaultGitError("BRANCH_DRIFT");
      throw error;
    }
    return { path: relative, commitSha, blobSha, sha256 };
  });
  await onCommitted(result.commitSha);
  await verifyVaultObject(input.slug, input.branch, input.installId, result.commitSha, relative, sha256);
  return result;
}

export async function verifyVaultObject(slug: string, branch: string, installId: number, commitSha: string, relative: string, sha256: string, size?: number, existing?: { root: string; run: (args: string[], cwd?: string) => Promise<string>; env: NodeJS.ProcessEnv }): Promise<void> {
  const verify = async ({ root, run, env }: { root: string; run: (args: string[], cwd?: string) => Promise<string>; env: NodeJS.ProcessEnv }) => {
    const url = vaultRepoUrl(slug);
    const verify = path.join(root, "verify");
    await run(["clone", "--quiet", "--branch", branch, url, verify]);
    await run(["-C", verify, "checkout", "--detach", "--quiet", commitSha]);
    await new Promise<void>((resolve, reject) => {
      const child = spawn("git", ["-C", verify, "lfs", "pull", "--include", relative], { env: { ...env, GIT_LFS_SKIP_SMUDGE: "0" }, stdio: "ignore" });
      child.on("error", () => reject(new VaultGitError("LFS_MISSING")));
      child.on("close", code => code === 0 ? resolve() : reject(new VaultGitError("LFS_MISSING")));
    });
    const file = path.join(verify, ...relative.split("/"));
    const actualSize = (await (await import("node:fs/promises")).stat(file)).size;
    if (await sha256File(file) !== sha256 || (size !== undefined && actualSize !== size)) throw new VaultGitError("LFS_MISSING");
  };
  if (existing) await verify(existing);
  else await withGitCredential(await installationToken(installId), verify);
}

export async function materializeVaultObject(slug: string, branch: string, installId: number, commitSha: string, relative: string, sha256: string): Promise<{ file: string; cleanup: () => Promise<void> }> {
  const out = await mkdtemp(path.join(tmpdir(), "vault-read-"));
  try {
    await withGitCredential(await installationToken(installId), async ({ root, run, env }) => {
      const checkout = path.join(root, "repo");
      await run(["clone", "--quiet", "--branch", branch, vaultRepoUrl(slug), checkout]);
      await run(["-C", checkout, "checkout", "--detach", "--quiet", commitSha]);
      await new Promise<void>((resolve, reject) => {
        const child = spawn("git", ["-C", checkout, "lfs", "pull", "--include", relative], { env: { ...env, GIT_LFS_SKIP_SMUDGE: "0" }, stdio: "ignore" });
        child.on("error", () => reject(new VaultGitError("LFS_MISSING")));
        child.on("close", code => code === 0 ? resolve() : reject(new VaultGitError("LFS_MISSING")));
      });
      const source = path.join(checkout, ...relative.split("/"));
      if (await sha256File(source) !== sha256) throw new VaultGitError("LFS_MISSING");
      await copyFile(source, path.join(out, "file"));
    });
    return { file: path.join(out, "file"), cleanup: () => rm(out, { recursive: true, force: true }) };
  } catch (error) {
    await rm(out, { recursive: true, force: true });
    throw error;
  }
}
