import { readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const backendRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceRoot = join(backendRoot, "src");
const tsxCli = join(backendRoot, "node_modules", "tsx", "dist", "cli.mjs");

function findTests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findTests(path);
    return entry.isFile() && entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

const tests = findTests(sourceRoot).sort((a, b) => a.localeCompare(b));
if (tests.length === 0) {
  console.error("No standalone *.test.ts files found under backend/src.");
  process.exit(1);
}

console.log(`Running ${tests.length} standalone backend test files...`);
let failed = 0;

for (const test of tests) {
  const label = relative(backendRoot, test);
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(process.execPath, [tsxCli, test], {
    cwd: backendRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) {
    failed += 1;
    console.error(`${label}: failed to start: ${result.error.message}`);
  } else if (result.status !== 0) {
    failed += 1;
    console.error(`${label}: failed with ${result.signal ?? `exit code ${result.status}`}`);
  }
}

console.log(`\nBackend test files: ${tests.length - failed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
