// Reproduce a Vault release package from its stored manifest and compare it
// with the recorded package SHA-256. Reads bytes by pinned commit/file id only.
// Usage: cd backend && npx tsx scripts/vault-release-verify.ts <releaseId> [--out package.tar]
import { prisma } from "../src/db/prisma.js";
import { storageFetchEntry, verifyRelease } from "../src/services/vaultReleaseService.js";
import { writeReleasePackage } from "../src/services/vaultReleasePackage.js";

async function main() {
  const [releaseId, flag, out] = process.argv.slice(2);
  if (!releaseId) throw new Error("Usage: vault-release-verify.ts <releaseId> [--out file.tar]");
  const result = await verifyRelease(releaseId, null);
  if (flag === "--out" && out) {
    const release = await prisma.vaultRelease.findUniqueOrThrow({ where: { id: releaseId } });
    await writeReleasePackage(release.manifestJson, release.manifestSha256, out, storageFetchEntry);
  }
  process.stdout.write(JSON.stringify({ releaseId, ...result }, null, 2) + "\n");
  if (!result.reproducible) process.exitCode = 2;
}

main().catch(error => { console.error("Release verification unavailable:", error instanceof Error ? error.message : "unknown error"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
