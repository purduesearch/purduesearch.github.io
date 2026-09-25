// Source-inspection test for the workspaces router. No DB.
// Run: cd backend && npx tsx src/api/workspaces.test.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

const src = readFileSync(fileURLToPath(new URL("./workspaces.ts", import.meta.url)), "utf8");
const firstParam = src.indexOf('("/:id');

check("never reads req.session", !/req\.session/.test(src));
check("has a /:id route", firstParam > -1);
for (const path of ['"/buddy-requests"', '"/shifts/:shiftId"']) {
  const at = src.indexOf(path);
  check(`${path} registered above /:id`, at > -1 && at < firstParam);
}
check("create is admin-only", /workspacesRouter\.post\("\/", requireAdmin/.test(src));
check("archive is admin-only", /workspacesRouter\.delete\("\/:id", requireAdmin/.test(src));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
