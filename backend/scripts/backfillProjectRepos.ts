// One-off backfill: create a ProjectRepo row for every Project that still has
// a legacy single-repo link (Project.githubRepo), and point any un-scoped
// GitHubMilestoneMap rows at the project's (only) migrated repo. Part of the
// multi-repo overhaul (Workstream B, phase 1) — see
// docs/superpowers/specs/2026-07-06-clubpm-drive-multirepo-design.md section 4.
//
//   npx tsx scripts/backfillProjectRepos.ts

import { prisma } from "../src/db/prisma.js";

async function main() {
  const projects = await prisma.project.findMany({
    where: { githubRepo: { not: null } },
    select: {
      id: true,
      name: true,
      githubRepo: true,
      githubInstallId: true,
      githubBlockDoneOnCiFail: true,
    },
  });

  console.log(`Found ${projects.length} project(s) with a legacy githubRepo link.`);

  let reposCreated = 0;
  let reposSkipped = 0;

  for (const project of projects) {
    const slug = project.githubRepo!;
    const existing = await prisma.projectRepo.findUnique({
      where: { projectId_slug: { projectId: project.id, slug } },
      select: { id: true },
    });
    if (existing) {
      reposSkipped++;
      continue;
    }

    await prisma.projectRepo.create({
      data: {
        projectId: project.id,
        slug,
        installId: project.githubInstallId,
        blockDoneOnCiFail: project.githubBlockDoneOnCiFail,
      },
    });
    console.log(`  created ProjectRepo "${slug}" for project "${project.name}" (${project.id})`);
    reposCreated++;
  }

  console.log(
    `created ${reposCreated} ProjectRepo rows (skipped ${reposSkipped} already-migrated).`
  );

  // Backfill GitHubMilestoneMap.projectRepoId from the project's sole
  // migrated repo. At this point in the migration every project has at most
  // one ProjectRepo (created above), so "the project's repo" is unambiguous.
  const unscopedMaps = await prisma.gitHubMilestoneMap.findMany({
    where: { projectRepoId: null },
    select: { id: true, projectId: true, milestoneId: true },
  });

  console.log(`Found ${unscopedMaps.length} GitHubMilestoneMap row(s) with no projectRepoId.`);

  let mapsUpdated = 0;
  let mapsSkipped = 0;

  for (const map of unscopedMaps) {
    const repos = await prisma.projectRepo.findMany({
      where: { projectId: map.projectId },
      select: { id: true },
    });
    if (repos.length !== 1) {
      console.warn(
        `  skipping milestone map ${map.id} (project ${map.projectId} has ${repos.length} ProjectRepo row(s), expected exactly 1)`
      );
      mapsSkipped++;
      continue;
    }

    await prisma.gitHubMilestoneMap.update({
      where: { id: map.id },
      data: { projectRepoId: repos[0].id },
    });
    mapsUpdated++;
  }

  console.log(
    `updated ${mapsUpdated} GitHubMilestoneMap rows (skipped ${mapsSkipped} ambiguous/unresolvable).`
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
