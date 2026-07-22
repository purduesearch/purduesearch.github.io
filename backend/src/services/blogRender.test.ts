// Pure tests for the image-proxy URL rewrite.
// Run: cd backend && npx tsx src/services/blogRender.test.ts
import { proxyImageSrc } from "./blogRender.js";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => { if (c) passed++; else { failed++; console.error(`  ✗ ${n}`); } };

check("rewrites uc?export=view",
  proxyImageSrc("https://drive.google.com/uc?export=view&id=ABC123defGH") === "/api/public/blog-image/ABC123defGH");
check("rewrites file/d/ID/view",
  proxyImageSrc("https://drive.google.com/file/d/ABC123defGH/view") === "/api/public/blog-image/ABC123defGH");
check("rewrites lh3 googleusercontent",
  proxyImageSrc("https://lh3.googleusercontent.com/d/ABC123defGH=w1600") === "/api/public/blog-image/ABC123defGH");
check("prefixes baseUrl when given",
  proxyImageSrc("https://drive.google.com/uc?export=view&id=ABC123defGH", "https://api.example.com")
    === "https://api.example.com/api/public/blog-image/ABC123defGH");
check("passes through an already-proxied URL",
  proxyImageSrc("/api/public/blog-image/ABC123defGH") === "/api/public/blog-image/ABC123defGH");
check("passes through a normal https image",
  proxyImageSrc("https://example.com/pic.png") === "https://example.com/pic.png");

console.log(`\nblogRender: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
