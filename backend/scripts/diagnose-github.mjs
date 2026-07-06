// One-off diagnostic (and optional repair) for the GitHub App integration.
//
// Why this exists: octokitForProject() builds an App-installation client from
// the per-project `githubInstallId` stored in Postgres. Changing the App's
// installation scope on GitHub can replace the installation (new id), leaving
// that stored value stale — every token mint then 404s and GET /repo returns
// 502. This script shows the real error and, with GH_APPLY=1, rewrites each
// project's githubInstallId to the installation that actually covers its repo.
//
// Run from the backend dir so dotenv finds .env:
//   cd /opt/clubpm/backend && node scripts/diagnose-github.mjs         # report only
//   cd /opt/clubpm/backend && GH_APPLY=1 node scripts/diagnose-github.mjs   # repair
import "dotenv/config";
import {
  appOctokit,
  octokitForInstallation,
  parseRepoUrl,
  repoSlug,
} from "../dist/services/githubService.js";
import { prisma } from "../dist/db/prisma.js";

const APPLY = process.env.GH_APPLY === "1";
const errInfo = (e) => `${e?.status ?? ""} ${e?.message ?? e}`.trim();

async function main() {
  console.log(`\n=== GitHub App diagnostic (${APPLY ? "REPAIR" : "read-only"}) ===`);
  console.log(`GITHUB_APP_ID set:          ${Boolean(process.env.GITHUB_APP_ID)}`);
  console.log(`GITHUB_APP_PRIVATE_KEY set: ${Boolean(process.env.GITHUB_APP_PRIVATE_KEY)}`);

  const app = appOctokit();
  if (!app) {
    console.log("\n!! App is NOT configured (missing GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY).");
    console.log("   That alone breaks installation auth — set those env vars and restart.");
    return;
  }

  // 1) Prove the app credentials work, then list every installation.
  try {
    const { data: me } = await app.apps.getAuthenticated();
    console.log(`\nApp authenticates OK: ${me.slug} (id ${me.id}), owner @${me.owner?.login}`);
  } catch (e) {
    console.log(`\n!! Could NOT authenticate as the App (bad app id / private key?): ${errInfo(e)}`);
  }

  try {
    const { data: installs } = await app.apps.listInstallations({ per_page: 100 });
    console.log(`\nCurrent installations (${installs.length}):`);
    for (const i of installs) {
      console.log(
        `  - id ${i.id} | @${i.account?.login} (${i.target_type}) | ` +
          `repos=${i.repository_selection} | suspended=${i.suspended_at ?? "no"}`
      );
    }
  } catch (e) {
    console.log(`\n!! listInstallations failed: ${errInfo(e)}`);
  }

  // 2) For each linked project: what's stored, what's correct, does it work.
  const projects = await prisma.project.findMany({
    where: { NOT: { githubRepo: null } },
    select: { id: true, name: true, githubRepo: true, githubInstallId: true },
  });
  console.log(`\nProjects with a linked repo (${projects.length}):`);

  for (const p of projects) {
    const ref = parseRepoUrl(p.githubRepo);
    console.log(`\n  • ${p.name} [${p.id}]`);
    console.log(
      `    repo="${p.githubRepo}"  parsed=${ref ? repoSlug(ref) : "UNPARSEABLE"}  ` +
        `storedInstallId=${p.githubInstallId ?? "null"}`
    );
    if (!ref) continue;

    // The installation that GitHub says currently covers this repo.
    let correctId = null;
    try {
      const { data } = await app.apps.getRepoInstallation({ owner: ref.owner, repo: ref.repo });
      correctId = data.id;
      console.log(`    installation that covers this repo NOW: ${correctId}`);
    } catch (e) {
      console.log(`    !! no installation of this App can see this repo: ${errInfo(e)}`);
      console.log(`       (install/authorize the App on @${ref.owner} for this repo)`);
    }

    // Does the *stored* id actually work?
    if (p.githubInstallId) {
      try {
        await octokitForInstallation(p.githubInstallId).repos.get({ owner: ref.owner, repo: ref.repo });
        console.log(`    stored install id ${p.githubInstallId}: WORKS`);
      } catch (e) {
        console.log(`    stored install id ${p.githubInstallId}: FAILS -> ${errInfo(e)}`);
      }
    }

    if (correctId && correctId !== p.githubInstallId) {
      if (APPLY) {
        await prisma.project.update({ where: { id: p.id }, data: { githubInstallId: correctId } });
        console.log(`    >> REPAIRED githubInstallId ${p.githubInstallId ?? "null"} -> ${correctId}`);
      } else {
        console.log(
          `    >> would set githubInstallId ${p.githubInstallId ?? "null"} -> ${correctId}  ` +
            `(re-run with GH_APPLY=1 to apply)`
        );
      }
    }
  }
}

main()
  .catch((e) => {
    console.error("diagnostic crashed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
    console.log("\n=== done ===");
  });
