// Pure tests for the image-proxy URL rewrite.
// Run: cd backend && npx tsx src/services/blogRender.test.ts
import { proxyImageSrc, renderJsonToHtml as _render } from "./blogRender.js";

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

{
  const doc = { type: "doc", content: [
    { type: "section", attrs: { layout: "cols2", background: { kind: "color", value: "#111111" }, padding: "l", width: "contained", theme: "dark" },
      content: [
        { type: "column", content: [{ type: "paragraph", content: [{ type: "text", text: "left" }] }] },
        { type: "column", content: [{ type: "paragraph", content: [{ type: "text", text: "right" }] }] },
      ] },
    { type: "hero", attrs: { heading: "Big Title", subheading: "sub", bgImage: "", align: "center", overlay: false } },
    { type: "statBand", attrs: { stats: [{ label: "HOURS", value: "1240" }, { label: "TASKS", value: "37" }] } },
    { type: "ctaButton", attrs: { label: "Sponsor us", href: "https://x/y", style: "solid", align: "center" } },
  ] };
  const html = _render(doc as any);
  check("section wrapper + layout class", html.includes("cpm-blog-section") && html.includes("cpm-blog-section--cols2"));
  check("section background style", html.includes("#111111"));
  check("section theme class", html.includes("cpm-blog-section--dark"));
  check("column wrapper", html.includes("cpm-blog-col") && html.includes("left") && html.includes("right"));
  check("hero heading", html.includes("cpm-blog-hero") && html.includes("Big Title"));
  check("stat band tile", html.includes("cpm-blog-statband") && html.includes("1240") && html.includes("HOURS"));
  check("cta anchor", html.includes("cpm-blog-cta") && html.includes("Sponsor us") && html.includes('href="https://x/y"'));
}

console.log(`\nblogRender: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
