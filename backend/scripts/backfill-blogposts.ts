// One-off backfill: port legacy blog posts (OutreachSubmission rows with
// blogMarkdown + blogSlug set) into the new BlogPost model so existing
// published URLs keep resolving after the public API repoint (Epic 1.4).
//
//   npx tsx scripts/backfill-blogposts.ts          — apply
//   npx tsx scripts/backfill-blogposts.ts --dry    — preview only

import { prisma } from "../src/db/prisma.js";
import { markdownToTiptapJson, renderJsonToHtml, computeReadingTime } from "../src/services/blogRender.js";
import type { Prisma } from "@prisma/client";

async function main() {
  const dry = process.argv.includes("--dry");
  const legacy = await prisma.outreachSubmission.findMany({
    where: { blogMarkdown: { not: null }, blogSlug: { not: null } },
    select: {
      id: true,
      title: true,
      blogMarkdown: true,
      blogSlug: true,
      publishedAt: true,
      createdAt: true,
      authorId: true,
      mediaUrls: true,
    },
  });

  console.log(`Found ${legacy.length} legacy blog submission(s).`);
  let created = 0;
  let skipped = 0;

  for (const s of legacy) {
    const slug = s.blogSlug!;
    // Skip if a BlogPost already owns this slug or was sourced from this submission.
    const existing = await prisma.blogPost.findFirst({
      where: { OR: [{ slug }, { sourceSubmissionId: s.id }] },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const doc = markdownToTiptapJson(s.blogMarkdown!);
    console.log(`${dry ? "[dry] would create" : "creating"} BlogPost "${s.title}" (slug: ${slug})`);
    if (dry) continue;

    await prisma.blogPost.create({
      data: {
        title: s.title,
        slug,
        status: "PUBLISHED",
        contentJson: doc as unknown as Prisma.InputJsonValue,
        renderedHtml: renderJsonToHtml(doc),
        readingTimeMin: computeReadingTime(doc),
        coverImageUrl: s.mediaUrls?.[0] ?? null,
        publishedAt: s.publishedAt ?? s.createdAt,
        sourceSubmissionId: s.id,
        createdById: s.authorId,
        authors: { create: { memberId: s.authorId, role: "author" } },
      },
    });
    created++;
  }

  console.log(`Done. Created ${created}, skipped ${skipped}${dry ? " (dry run)" : ""}.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
