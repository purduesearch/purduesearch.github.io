// Deterministic snapshot maintenance; no model calls or outbound messages.
import "dotenv/config";
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

async function main() {
  const { values } = parseArgs({ options: { help: { type: "boolean" } } });
  if (values.help) {
    console.log("Usage: npm run impact:recompute (recompute all counted-impact snapshots)");
    return;
  }
  // The deployed backend contains dist/; development uses source under tsx.
  const root = existsSync(new URL("../src/services/impactMetricService.ts", import.meta.url)) ? "../src" : "../dist";
  const { prisma } = await import(`${root}/db/prisma.js`);
  try {
    const { recomputeAll } = await import(`${root}/services/impactMetricService.js`);
    const result = await recomputeAll();
    console.log(JSON.stringify(result));
    if (result.status === "SKIPPED") process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => { console.error("Impact recompute failed."); process.exitCode = 1; });
