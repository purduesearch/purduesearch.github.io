// Run: cd backend && npx tsx src/services/docToMarkdown.test.ts
import { pmDocToMarkdown } from "./docToMarkdown.js";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => { if (c) passed++; else { failed++; console.error(`  ✗ ${n}`); } };

const doc = {
  type: "doc", content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
    { type: "paragraph", content: [
      { type: "text", text: "Hello " },
      { type: "text", text: "bold", marks: [{ type: "bold" }] },
    ] },
    { type: "bulletList", content: [
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] },
    ] },
    { type: "image", attrs: { src: "https://x/y.png", alt: "pic" } },
  ],
};

const md = pmDocToMarkdown(doc as any);
check("h1", md.includes("# Title"));
check("bold", md.includes("**bold**"));
check("bullet", md.includes("- one"));
check("image", md.includes("![pic](https://x/y.png)"));
check("null doc -> empty string", pmDocToMarkdown(null) === "");

console.log(`\ndocToMarkdown: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
