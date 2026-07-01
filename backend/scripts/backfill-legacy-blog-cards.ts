// Backfill the 4 legacy hardcoded blog cards (src/pages/Blog.jsx) into BlogPost
// rows. RASC-AL 2023 gets a full body rebuilt from the /research/rascal subpage;
// the other three are "link posts" (card links to a program page, no article body).
//
//   npx tsx scripts/backfill-legacy-blog-cards.ts --dry   — preview
//   npx tsx scripts/backfill-legacy-blog-cards.ts         — apply
import { prisma } from "../src/db/prisma.js";
import { renderJsonToHtml, computeReadingTime, slugify, EMPTY_DOC, type PMDoc } from "../src/services/blogRender.js";
import type { Prisma } from "@prisma/client";

const rascal2023Doc: PMDoc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "About the Challenge" }] },
    { type: "image", attrs: { src: "/research/2022_23/mars_mission.webp", alt: "Mars Mission", align: "wrap-left", width: 45, widthUnit: "%", caption: "" } },
    { type: "paragraph", content: [{ type: "text", marks: [{ type: "italic" }], text: "\"NASA is pioneering the future of space exploration as we extend humanity's presence further into the solar system. The 2023 RASC-AL Competition is seeking undergraduate and graduate teams to develop new concepts that leverage innovation to improve our ability to operate on the Moon, Mars and beyond.\"" }] },
    { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "The Team" }] },
    { type: "paragraph", content: [{ type: "text", marks: [{ type: "italic" }], text: "As part of SEARCH, Purdue University participated in the 2023 RASC-AL Challenge. The team chose Homesteading Mars as the topic to research. The team comprised a group of graduate students, undergraduate students and PhD mentors." }] },
    { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "P.U.R.E. S.P.A.C.E. — Purdue University Research Expedition: Sustainable Planetary Access, Colonization and Exploration" }] },
    { type: "image", attrs: { src: "/research/2022_23/mission_architecture.webp", alt: "Mission Architecture", align: "wrap-right", width: 45, widthUnit: "%", caption: "" } },
    { type: "paragraph", content: [{ type: "text", text: "Proposed in our model is a system that relies on sustainable research, production and growth, through In-Situ Resource Utilization, aquaponics, and other forms of reuse and recycling. Our proposal is best organized into six categories:" }] },
    { type: "bulletList", content: [
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "MISSION — the Mars Interplanetary Spacecraft for Scientific Inquiry and Optimal Navigation: the architecture of our flights to Mars and back." }] }] },
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "HOME — the Habitat for Occupancy and Mars Exploration: a design combining 3D-printing and inflatable domes to create the habitat." }] }] },
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "LIFE — a Life-support Infrastructure with Filtration and Environment-Control integrated in HOME, generating oxygen and fuel via the Sabatier process." }] }] },
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "SITE — Surface In-situ Transformation and Exploitation: a Rodwell to mine water from martian ice, with nuclear and solar power." }] }] },
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "GARAGES — Geared Autonomous Rover And Ground Exploration Systems: autonomous rovers that prepare the habitat before the crew arrives." }] }] },
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "FARM — the Food and Aquaponics Research Module: aquaponics and vertical farming to overcome the health challenges of human space flight." }] }] },
    ] },
    { type: "embed", attrs: { url: "https://www.youtube.com/embed/HXg2vXIEi5g", provider: "youtube", html: "<iframe width=\"560\" height=\"315\" src=\"https://www.youtube.com/embed/HXg2vXIEi5g\" title=\"YouTube video player\" frameborder=\"0\" allow=\"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share\" allowfullscreen></iframe>" } },
    { type: "paragraph", content: [
      { type: "text", text: "Here is a link to the " },
      { type: "text", marks: [{ type: "link", attrs: { href: "https://drive.google.com/file/d/1CXIf-BjmNxkB1M1Act1oBQ13DG8Pcota/view?usp=sharing" } }], text: "Technical Report" },
      { type: "text", text: " the team submitted to NASA." },
    ] },
    { type: "image", attrs: { src: "/research/2022_23/Team_Photo.webp", alt: "RASC-AL Team 2023", align: "full", caption: "" } },
  ],
};

type Card = {
  slug: string; title: string; excerpt: string; coverImageUrl: string;
  authorName: string; category: string; publishedAt: string;
  contentJson: PMDoc; linkUrl: string | null; render: boolean;
};

const cards: Card[] = [
  {
    slug: "nasa-rasc-al-2023", title: "NASA RASC-AL 2023 Competition",
    excerpt: "SEARCH competed in the NASA RASC-AL challenge for a second consecutive year, refining our Mars habitat design and presenting to a panel of space exploration professionals.",
    coverImageUrl: "/research/2022_23/mars_mission.webp", authorName: "Hrishikesh Viswanath",
    category: "NASA", publishedAt: "2023-03-03", contentJson: rascal2023Doc, linkUrl: null, render: true,
  },
  {
    slug: "nasa-rasc-al-2024", title: "NASA RASC-AL 2024",
    excerpt: "SEARCH presented a Mars surface habitat concept at NASA's RASC-AL design challenge, competing against top universities before NASA engineers and space industry professionals.",
    coverImageUrl: "/research/2023_24/rascal/astros-pup-pr-hab-horizontal4.webp", authorName: "Hrishikesh Viswanath",
    category: "NASA", publishedAt: "2024-03-03", contentJson: EMPTY_DOC, linkUrl: "/research/rascal", render: false,
  },
  {
    slug: "ices-2025-conference", title: "ICES 2025 Conference",
    excerpt: "SEARCH presents microgreen chamber research at the International Conference on Environmental Systems — connecting our LEAF initiative work to the global space life sciences community.",
    coverImageUrl: "/research/ICES2025_Research.webp", authorName: "SEARCH Research Team",
    category: "Research", publishedAt: "2025-04-01", contentJson: EMPTY_DOC, linkUrl: "/research", render: false, // PLACEHOLDER date — edit in the editor's Publish-date field
  },
  {
    slug: "nasa-suits-2024", title: "NASA SUITS 2024",
    excerpt: "SEARCH competed in NASA's SUITS augmented-reality challenge at Johnson Space Center, presenting an AR HUD for astronaut EVA operations to NASA engineers and industry evaluators.",
    coverImageUrl: "/software/2023_24/SUITS/bg.webp", authorName: "Hrishikesh Viswanath",
    category: "NASA", publishedAt: "2024-05-30", contentJson: EMPTY_DOC, linkUrl: "/software/suits", render: false,
  },
];

async function main() {
  const dry = process.argv.includes("--dry");
  const creator = await prisma.member.findFirst({ where: { isAdmin: true }, select: { id: true } })
    ?? await prisma.member.findFirst({ select: { id: true } });
  if (!creator) throw new Error("No member found to own the posts");

  let created = 0, skipped = 0;
  for (const c of cards) {
    const existing = await prisma.blogPost.findFirst({ where: { slug: c.slug }, select: { id: true } });
    if (existing) { skipped++; console.log(`skip (exists): ${c.slug}`); continue; }
    console.log(`${dry ? "[dry] would create" : "creating"}: ${c.slug}${c.linkUrl ? ` (link → ${c.linkUrl})` : " (full article)"}`);
    if (dry) continue;

    const category = await prisma.blogCategory.upsert({
      where: { name: c.category },
      create: { name: c.category, slug: slugify(c.category) },
      update: {},
    });
    await prisma.blogPost.create({
      data: {
        title: c.title,
        slug: c.slug,
        status: "PUBLISHED",
        excerpt: c.excerpt,
        contentJson: c.contentJson as unknown as Prisma.InputJsonValue,
        renderedHtml: c.render ? renderJsonToHtml(c.contentJson) : null,
        readingTimeMin: c.render ? computeReadingTime(c.contentJson) : null,
        coverImageUrl: c.coverImageUrl,
        authorName: c.authorName,
        linkUrl: c.linkUrl,
        publishedAt: new Date(c.publishedAt),
        createdById: creator.id,
        categories: { connect: [{ id: category.id }] },
        authors: { create: { memberId: creator.id, role: "author" } },
      },
    });
    created++;
  }
  console.log(`Done. Created ${created}, skipped ${skipped}${dry ? " (dry run)" : ""}.`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
