// Guard test: every custom node the editor registers must also exist in the
// collab schema mirror (backend/src/collab/blogSchema.ts) and have a render
// branch in the server renderer (backend/src/services/blogRender.ts).
// A node missing from either place silently loses content between editing and
// publishing, which is the failure this test exists to prevent.
// Run: cd backend && npx tsx src/services/blogSchemaContract.test.ts
import { readFileSync, readdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const editorDir = resolve(here, "../../../src/components/clubpm/blog");
const mirrorSrc = readFileSync(resolve(here, "../collab/blogSchema.ts"), "utf8");
const rendererSrc = readFileSync(resolve(here, "./blogRender.ts"), "utf8");

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => { if (c) passed++; else { failed++; console.error(`  ✗ ${n}`); } };

// Collect node names from `Node.create({ name: 'x' ... })` in the editor files.
const nodeNames = new Set<string>();
for (const file of readdirSync(editorDir).filter((f) => f.endsWith(".jsx"))) {
  const src = readFileSync(join(editorDir, file), "utf8");
  for (const m of src.matchAll(/Node\.create\(\{\s*name:\s*['"]([A-Za-z][A-Za-z0-9]*)['"]/g)) {
    nodeNames.add(m[1]!);
  }
}

check("found the editor's custom nodes", nodeNames.size >= 9);

for (const name of nodeNames) {
  check(`collab mirror defines "${name}"`, new RegExp(`name:\\s*["']${name}["']`).test(mirrorSrc));
  check(`renderer handles "${name}"`, new RegExp(`case\\s+["']${name}["']:`).test(rendererSrc));
}

console.log(`\nblogSchemaContract: ${passed} passed, ${failed} failed (${nodeNames.size} nodes checked)`);
if (failed > 0) process.exit(1);
