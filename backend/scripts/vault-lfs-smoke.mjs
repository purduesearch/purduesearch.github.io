// Destructive ONLY to an explicitly named disposable private repository's new test branch.
// From backend: node scripts/vault-lfs-smoke.mjs --repo owner/disposable --installation-id 123 --confirm-disposable
import "dotenv/config";
import { createAppAuth } from "@octokit/auth-app";
import { mkdtemp, writeFile, mkdir, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const repo = arg("--repo");
const installationId = Number(arg("--installation-id"));
const branch = arg("--branch") ?? "vault";
const confirmed = args.includes("--confirm-disposable");
if (!confirmed || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo ?? "") ||
    !Number.isSafeInteger(installationId) || installationId <= 0 || !/^[A-Za-z0-9._-]+$/.test(branch)) {
  console.error("Usage: node scripts/vault-lfs-smoke.mjs --repo owner/disposable --installation-id ID [--branch vault] --confirm-disposable");
  process.exit(2);
}
if (!process.env.GITHUB_APP_ID || !process.env.GITHUB_APP_PRIVATE_KEY) {
  console.error("Missing GITHUB_APP_ID or base64 GITHUB_APP_PRIVATE_KEY");
  process.exit(2);
}

const root = await mkdtemp(path.join(tmpdir(), "vault-lfs-smoke-"));
const askpass = path.join(root, "askpass" + (process.platform === "win32" ? ".cmd" : ".sh"));
const askpassJs = path.join(root, "askpass.mjs");
const gitEnv = { ...process.env, GIT_ASKPASS: askpass, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never",
  GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "credential.helper", GIT_CONFIG_VALUE_0: "",
  GIT_LFS_SKIP_SMUDGE: "1" };
function run(command, argv, cwd, env = gitEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argv, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (x) => { output += x; });
    child.stderr.on("data", (x) => { output += x; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(`${command} ${argv[0]} failed (${code}): ${output.replaceAll(gitEnv.VAULT_SMOKE_TOKEN, "[redacted]").slice(-1200)}`)));
  });
}
async function hash(file) {
  const h = createHash("sha256");
  const handle = await open(file, "r");
  try { for await (const chunk of handle.createReadStream({ autoClose: false })) h.update(chunk); }
  finally { await handle.close(); }
  return h.digest("hex");
}
try {
  await writeFile(askpassJs, `const p=process.argv.slice(2).join(" ").toLowerCase(); process.stdout.write(p.includes("username") ? "x-access-token" : process.env.VAULT_SMOKE_TOKEN);`);
  await writeFile(askpass, process.platform === "win32"
    ? `@echo off\r\n"${process.execPath}" "${askpassJs}" %*\r\n`
    : `#!/bin/sh\nexec "${process.execPath}" "${askpassJs}" "$@"\n`, { mode: 0o700 });
  const auth = createAppAuth({ appId: process.env.GITHUB_APP_ID,
    privateKey: Buffer.from(process.env.GITHUB_APP_PRIVATE_KEY, "base64").toString("utf8"), installationId });
  const token = (await auth({ type: "installation" })).token;
  gitEnv.VAULT_SMOKE_TOKEN = token;
  const api = await fetch(`https://api.github.com/repos/${repo}`, { headers: {
    Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "vault-lfs-smoke" } });
  if (!api.ok) throw new Error(`App installation cannot inspect repository: HTTP ${api.status}`);
  const info = await api.json();
  if (!info.private) throw new Error("Repository must be private");
  const url = `https://github.com/${repo}.git`;
  const existing = await run("git", ["ls-remote", "--heads", url, branch], root);
  if (existing) throw new Error(`Branch ${branch} already exists; choose an unused disposable branch`);
  const anonymous = await fetch(`https://api.github.com/repos/${repo}`, { headers: { "User-Agent": "vault-lfs-smoke" }, redirect: "manual" });
  if (anonymous.status !== 404) throw new Error(`Unauthenticated private repo lookup returned HTTP ${anonymous.status}, expected 404`);
  const checkout = path.join(root, "write");
  await run("git", ["clone", "--quiet", url, checkout], root);
  await run("git", ["-C", checkout, "checkout", "-b", branch], root);
  await run("git", ["-C", checkout, "lfs", "install", "--local"], root);
  await writeFile(path.join(checkout, ".gitattributes"), "vault/smoke/** filter=lfs diff=lfs merge=lfs -text\n");
  const relative = "vault/smoke/512 MiB smoke.bin";
  const large = path.join(checkout, ...relative.split("/"));
  await mkdir(path.dirname(large), { recursive: true });
  const file = await open(large, "w");
  const digest = createHash("sha256");
  try {
    for (let i = 0; i < 512; i++) {
      const block = randomBytes(1024 * 1024);
      await file.write(block);
      digest.update(block);
    }
  } finally { await file.close(); }
  const expected = digest.digest("hex");
  await run("git", ["-C", checkout, "add", ".gitattributes", relative], root);
  await run("git", ["-C", checkout, "-c", "user.name=Vault Smoke", "-c", "user.email=vault-smoke@users.noreply.github.com", "commit", "-qm", "Verify installation-token Git LFS transport"], root);
  const pointer = await run("git", ["-C", checkout, "show", `HEAD:${relative}`], root);
  if (!pointer.includes(`oid sha256:${expected}`) || !pointer.includes("size 536870912")) throw new Error("Committed blob is not the expected LFS pointer");
  await run("git", ["-C", checkout, "push", "--quiet", "origin", branch], root);
  const fresh = path.join(root, "read");
  await run("git", ["clone", "--quiet", "--branch", branch, url, fresh], root);
  await run("git", ["-C", fresh, "lfs", "pull"], root, { ...gitEnv, GIT_LFS_SKIP_SMUDGE: "0" });
  const actualFile = path.join(fresh, ...relative.split("/"));
  const actual = await hash(actualFile);
  if (actual !== expected) throw new Error(`Downloaded bytes mismatch: ${actual} != ${expected}`);
  console.log(JSON.stringify({ result: "PASS", repository: repo, branch, bytes: 536870912, sha256: actual,
    installationTokenPush: true, installationTokenFetch: true, privateDownload: true,
    anonymousRepoLookupStatus: anonymous.status }));
  console.log(`Delete the disposable repository or branch ${branch} when the evidence is recorded.`);
} catch (error) {
  console.error(`Vault LFS smoke FAILED: ${error.message}`);
  process.exitCode = 1;
} finally {
  delete gitEnv.VAULT_SMOKE_TOKEN;
  await rm(root, { recursive: true, force: true });
}
