// Rebuild the Vault search index (VaultSearchDoc) from source rows and GitHub.
// Run from backend:
//   npm run vault:search-rebuild                      # every project
//   npm run vault:search-rebuild -- --project <id>    # one project
//   npm run vault:search-rebuild -- --no-github       # skip GitHub commit sync (keeps existing commit rows)
// Safe to run while the app is live: rows are upserted before stale ones are
// removed, and every writer recomputes whole documents.
import "dotenv/config";
import { prisma } from "../src/db/prisma.js";
import { rebuildVaultSearch } from "../src/services/vaultSearchService.js";

async function main() {
  const args = process.argv.slice(2);
  const projectFlag = args.indexOf("--project");
  const onlyProject = projectFlag >= 0 ? args[projectFlag + 1] : null;
  if (projectFlag >= 0 && !onlyProject) throw new Error("--project needs a project id");
  const github = !args.includes("--no-github");

  const projects = onlyProject
    ? [{ id: onlyProject }]
    : await prisma.project.findMany({ where: { OR: [{ vaultItems: { some: {} } }, { changeRequests: { some: {} } }, { vaultRepository: { isNot: null } }] }, select: { id: true } });

  let failures = 0;
  for (const project of projects) {
    const result = await rebuildVaultSearch(project.id, { github });
    if (result.githubError) failures++;
    console.log(JSON.stringify({ projectId: project.id, ...result }));
  }
  const total = await prisma.vaultSearchDoc.count();
  console.log(`Rebuilt ${projects.length} project(s); index holds ${total} document(s).${failures ? ` ${failures} GitHub sync failure(s) — commit rows kept as they were.` : ""}`);
  if (failures) process.exitCode = 2;
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
