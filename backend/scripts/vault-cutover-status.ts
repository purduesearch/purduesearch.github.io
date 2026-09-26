import { prisma } from "../src/db/prisma.js";
import { vaultLegacyCounts } from "../src/services/vaultCutoverService.js";

async function main() {
  const projects = await prisma.project.findMany({ select: { id: true, name: true, vaultRepository: { select: { migrationState: true, writeEnabled: true, phase3VerifiedAt: true, cutoverAt: true, retentionUntil: true, healthError: true } } }, orderBy: { name: "asc" } });
  const rows = [];
  for (const project of projects) {
    rows.push({ projectId: project.id, projectName: project.name, state: project.vaultRepository?.migrationState ?? "UNCONFIGURED", writeEnabled: project.vaultRepository?.writeEnabled ?? false, phase3VerifiedAt: project.vaultRepository?.phase3VerifiedAt ?? null, cutoverAt: project.vaultRepository?.cutoverAt ?? null, retentionUntil: project.vaultRepository?.retentionUntil ?? null, healthError: project.vaultRepository?.healthError ?? null, ...await vaultLegacyCounts(project.id) });
  }
  process.stdout.write(JSON.stringify({ checkedAt: new Date().toISOString(), projects: rows }, null, 2) + "\n");
}

main().catch(error => { console.error("Cutover status unavailable:", error instanceof Error ? error.message : "unknown error"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
