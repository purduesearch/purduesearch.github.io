// Manual, local-file-only reference load. Does not download O*NET or run the skills pipeline.
import "dotenv/config";
import { parseArgs } from "node:util";

async function main() {
  const { values } = parseArgs({ options: { file: { type: "string" }, help: { type: "boolean" } } });
  if (values.help) {
    console.log("Usage: npm run onet:load -- [--file <local subset.json.gz>]");
    return;
  }
  // Production deploys compile src/ into dist/; development runs the same source under tsx.
  const { existsSync } = await import("node:fs");
  const servicePath = existsSync(new URL("../src/services/onetLoadService.ts", import.meta.url))
    ? "../src/services/onetLoadService.js" : "../dist/services/onetLoadService.js";
  const { loadOnetFile } = await import(servicePath);
  const dbPath = servicePath.replace("services/onetLoadService", "db/prisma");
  const { prisma } = await import(dbPath);
  try {
    const report = await loadOnetFile(values.file ?? new URL("../data/onet/31.0/onet-subset.json.gz", import.meta.url), prisma);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
