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
for (const file of readdirSync(editorDir).filter((f) => (f.endsWith(".jsx") || f.endsWith(".js")) && !f.endsWith(".test.js"))) {
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

// Same guard for marks: a mark missing from the collab mirror breaks the Yjs →
// TipTap JSON conversion, and one missing from the renderer leaks review
// artifacts onto the public site.
const markNames = new Set<string>();
for (const file of readdirSync(editorDir).filter((f) => (f.endsWith(".jsx") || f.endsWith(".js")) && !f.endsWith(".test.js"))) {
  const src = readFileSync(join(editorDir, file), "utf8");
  for (const m of src.matchAll(/reviewMark\(\{\s*\n?\s*name:\s*['"]([A-Za-z][A-Za-z0-9]*)['"]/g)) {
    markNames.add(m[1]!);
  }
}

check("found the editor's review marks", markNames.size === 3);
for (const name of markNames) {
  check(`collab mirror defines mark "${name}"`, new RegExp(`reviewMarkMirror\\("${name}"\\)`).test(mirrorSrc));
  check(`renderer handles mark "${name}"`, new RegExp(`case\\s+["']${name}["']:`).test(rendererSrc));
}

console.log(`\nblogSchemaContract: ${passed} passed, ${failed} failed (${nodeNames.size} nodes, ${markNames.size} marks checked)`);
if (failed > 0) process.exit(1);
