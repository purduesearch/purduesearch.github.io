// Dev-time only: reads an already downloaded O*NET CSV directory.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import { buildSubset, ONET_HEADERS, type OnetFileName, type OnetFiles } from "../src/services/onetCsvCore.js";

async function main() {
  const { values } = parseArgs({ options: { dir: { type: "string" }, out: { type: "string" } } });
  if (!values.dir || !values.out) throw new Error("Usage: tsx scripts/onet-extract.ts --dir <CSV directory> --out <subset.json.gz>");
  const entries = await Promise.all((Object.keys(ONET_HEADERS) as OnetFileName[]).map(async name =>
    [name, await readFile(join(values.dir!, name), "utf8")] as const));
  const subset = buildSubset(Object.fromEntries(entries) as OnetFiles);
  const raw = JSON.stringify(subset);
  const compressed = gzipSync(raw, { level: 9 });
  await mkdir(dirname(values.out), { recursive: true });
  await writeFile(values.out, compressed);
  console.log(JSON.stringify({ rows: Object.fromEntries(Object.entries(subset)
    .filter(([key]) => key !== "meta").map(([key, rows]) => [key, (rows as unknown[]).length])),
    rawBytes: Buffer.byteLength(raw), gzipBytes: compressed.length }, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
