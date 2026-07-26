// Pure tests for the image-proxy URL rewrite.
// Run: cd backend && npx tsx src/services/blogRender.test.ts
import { proxyImageSrc, renderJsonToHtml as _render, extractText as _extractText } from "./blogRender.js";

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

{
  const doc = { type: "doc", content: [
    { type: "section", attrs: { layout: "cols2" }, content: [
      { type: "column", attrs: { span: 5 }, content: [{ type: "paragraph", content: [{ type: "text", text: "narrow" }] }] },
      { type: "column", attrs: { span: 7 }, content: [{ type: "paragraph", content: [{ type: "text", text: "wide" }] }] },
    ] },
    { type: "section", attrs: { layout: "cols2" }, content: [
      { type: "column", content: [{ type: "paragraph", content: [{ type: "text", text: "auto" }] }] },
    ] },
  ] };
  const html = _render(doc as any);
  check("column span 5 emits grid-column", html.includes('style="grid-column:span 5"'));
  check("column span 7 emits grid-column", html.includes('style="grid-column:span 7"'));
  check("column without span emits no style", html.includes('<div class="cpm-blog-col">auto') || html.includes('<div class="cpm-blog-col"><p>auto</p></div>'));
}

{
  const bad = { type: "doc", content: [
    { type: "section", attrs: { layout: "cols2" }, content: [
      { type: "column", attrs: { span: 99 }, content: [{ type: "paragraph" }] },
      { type: "column", attrs: { span: "6; background:url(x)" }, content: [{ type: "paragraph" }] },
    ] },
  ] };
  const html = _render(bad as any);
  check("out-of-range span is ignored", !html.includes("span 99"));
  check("non-numeric span cannot inject css", !html.includes("background:url"));
}

{
  const doc = { type: "doc", content: [
    { type: "gallery", attrs: { images: [
      { src: "https://example.com/a.png", alt: "A", caption: "First <slide>" },
      { src: "https://example.com/b.png", alt: "B" },
      { src: "", alt: "empty" },
    ] } },
  ] };
  const html = _render(doc as any);
  check("carousel wrapper", html.includes('class="cpm-blog-carousel"') && html.includes("data-carousel"));
  check("carousel track", html.includes('class="cpm-blog-carousel-track"'));
  check("slide figure", html.includes('class="cpm-blog-carousel-slide"'));
  check("caption rendered and escaped", html.includes("First &lt;slide&gt;"));
  check("slide without caption has no figcaption text", (html.match(/figcaption/g) ?? []).length === 2);
  check("empty src is skipped", (html.match(/<img /g) ?? []).length === 2);
  check("prev/next controls", html.includes("cpm-blog-carousel-prev") && html.includes("cpm-blog-carousel-next"));
  check("one dot per rendered slide", (html.match(/cpm-blog-carousel-dot"/g) ?? []).length === 2);
}

{
  const empty = { type: "doc", content: [{ type: "gallery", attrs: { images: [] } }] };
  check("empty gallery renders nothing", _render(empty as any).includes("cpm-blog-carousel") === false);
}

{
  const mk = (attrs: Record<string, unknown>) => _render({ type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "styled", marks: [{ type: "textStyle", attrs }] }] },
  ] } as any);

  check("allowed font applied", mk({ fontFamily: "Oswald" }).includes("font-family:'Oswald'"));
  check("unknown font dropped", !mk({ fontFamily: "Comic Sans MS" }).includes("font-family"));
  check("font with quotes normalised", mk({ fontFamily: "'Work Sans'" }).includes("font-family:'Work Sans'"));
  check("size clamped low", mk({ fontSize: "2px" }).includes("font-size:10px"));
  check("size clamped high", mk({ fontSize: "400px" }).includes("font-size:96px"));
  check("size in range kept", mk({ fontSize: "22px" }).includes("font-size:22px"));
  check("hex colour kept", mk({ color: "#ff8800" }).includes("color:#ff8800"));
  check("short hex kept", mk({ color: "#f80" }).includes("color:#f80"));
  check("named colour dropped", !mk({ color: "red" }).includes("color:red"));
  check("css injection via colour dropped", !mk({ color: "#fff;background:url(javascript:alert(1))" }).includes("javascript"));
  check("empty textStyle emits no span", !mk({}).includes("<span"));

  const hl = _render({ type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "hi", marks: [{ type: "highlight", attrs: { color: "#ffee00" } }] }] },
  ] } as any);
  check("highlight renders mark tag", hl.includes("<mark") && hl.includes("#ffee00"));

  const hlBad = _render({ type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "hi", marks: [{ type: "highlight", attrs: { color: "expression(x)" } }] }] },
  ] } as any);
  check("highlight rejects non-hex colour", hlBad.includes("<mark>") && !hlBad.includes("expression"));
}

{
  // A draft mid-review must publish as if the review never happened:
  // insertions land as plain text, deletions vanish, comments leave no trace.
  const doc = { type: "doc", content: [
    { type: "paragraph", content: [
      { type: "text", text: "We " },
      { type: "text", text: "did testing", marks: [{ type: "suggestDelete", attrs: { threadId: "t1" } }] },
      { type: "text", text: "ran thermal vac", marks: [{ type: "suggestInsert", attrs: { threadId: "t1" } }] },
      { type: "text", text: " last week." },
    ] },
    { type: "paragraph", content: [
      { type: "text", text: "Flagged sentence.", marks: [{ type: "commentMark", attrs: { threadId: "t2" } }] },
    ] },
  ] };
  const html = _render(doc as any);
  check("keeps suggestInsert text", html.includes("ran thermal vac"));
  check("drops suggestDelete text", !html.includes("did testing"));
  check("keeps commented text", html.includes("Flagged sentence."));
  check("leaks no thread ids", !html.includes("data-thread-id"));
  check("leaks no review classes",
    !html.includes("cpm-blog-sugg") && !html.includes("cpm-blog-comment-mark"));
  check("surrounding prose survives intact", html.includes("We ") && html.includes(" last week."));
}

{
  // A heading mid-review must not publish its struck wording in the TOC label
  // or bake it into the public anchor id / href.
  const doc = { type: "doc", content: [
    { type: "tableOfContents" },
    { type: "heading", attrs: { level: 2 }, content: [
      { type: "text", text: "Vibe ", marks: [{ type: "suggestDelete", attrs: { threadId: "t3" } }] },
      { type: "text", text: "Thermal ", marks: [{ type: "suggestInsert", attrs: { threadId: "t3" } }] },
      { type: "text", text: "testing" },
    ] },
  ] };
  const html = _render(doc as any);
  check("toc label omits deleted heading words", !html.includes(">Vibe") && html.includes("Thermal testing"));
  check("heading anchor id omits deleted words",
    html.includes('id="thermal-testing"') && !html.includes("vibe-thermal-testing"));
  check("toc href matches the heading anchor", html.includes('href="#thermal-testing"'));

  // extractText backs deriveExcerpt() in blogService.ts (and readingTimeMin),
  // both of which are served publicly — deleted words must never reach them.
  const text = _extractText(doc as any);
  check("extractText omits deleted words", !text.includes("Vibe"));
  check("extractText keeps accepted words", text.includes("Thermal") && text.includes("testing"));
}

console.log(`\nblogRender: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
