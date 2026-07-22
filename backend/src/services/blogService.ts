import { Prisma, type BlogStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import {
  EMPTY_DOC,
  markdownToTiptapJson,
  renderJsonToHtml,
  computeReadingTime,
  extractText,
  slugify,
  type PMDoc,
} from "./blogRender.js";

// ── Types ────────────────────────────────────────────────────

export interface CreatePostInput {
  title: string;
  createdById: string;
  contentJson?: PMDoc;
  excerpt?: string;
  slug?: string;
  coverImageUrl?: string;
  sourceSubmissionId?: string;
}

export interface UpdatePostInput {
  title?: string;
  slug?: string;
  excerpt?: string | null;
  contentJson?: PMDoc;
  coverImageUrl?: string | null;
  metaDescription?: string | null;
  canonicalUrl?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImageUrl?: string | null;
  scheduledAt?: Date | null;
  authorName?: string | null;
  linkUrl?: string | null;
  publishedAt?: Date | string | null;
  theme?: Record<string, unknown> | null;
}

export interface ListPostsFilters {
  status?: BlogStatus;
  createdById?: string;
  q?: string;
}

const asJson = (doc: PMDoc): Prisma.InputJsonValue => doc as unknown as Prisma.InputJsonValue;

const postInclude = {
  createdBy: { select: { id: true, displayName: true, avatarUrl: true } },
  authors: { include: { member: { select: { id: true, displayName: true, avatarUrl: true } } } },
  tags: true,
  categories: true,
} satisfies Prisma.BlogPostInclude;

// ── Slug helper ──────────────────────────────────────────────

export async function ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base);
  let slug = root;
  let suffix = 1;
  // Loop until no other post owns this slug.
  while (
    await prisma.blogPost.findFirst({
      where: { slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true },
    })
  ) {
    suffix += 1;
    slug = `${root}-${suffix}`;
  }
  return slug;
}

function deriveExcerpt(doc: PMDoc, explicit?: string | null): string {
  if (explicit) return explicit;
  return extractText(doc).trim().replace(/\s+/g, " ").slice(0, 200);
}

// ── CRUD ─────────────────────────────────────────────────────

export async function createPost(input: CreatePostInput) {
  const contentJson = input.contentJson ?? EMPTY_DOC;
  const slug = await ensureUniqueSlug(input.slug ?? input.title);
  return prisma.blogPost.create({
    data: {
      title: input.title,
      slug,
      excerpt: deriveExcerpt(contentJson, input.excerpt),
      status: "DRAFT",
      contentJson: asJson(contentJson),
      coverImageUrl: input.coverImageUrl ?? null,
      readingTimeMin: computeReadingTime(contentJson),
      sourceSubmissionId: input.sourceSubmissionId ?? null,
      createdById: input.createdById,
      authors: { create: { memberId: input.createdById, role: "author" } },
    },
    include: postInclude,
  });
}

/** Create a draft from AI-expanded markdown (the expand-to-blog flow). */
export async function createPostFromMarkdown(input: {
  title: string;
  markdown: string;
  createdById: string;
  coverImageUrl?: string;
  sourceSubmissionId?: string;
}) {
  return createPost({
    title: input.title,
    createdById: input.createdById,
    contentJson: markdownToTiptapJson(input.markdown),
    coverImageUrl: input.coverImageUrl,
    sourceSubmissionId: input.sourceSubmissionId,
  });
}

export async function getPost(id: string) {
  return prisma.blogPost.findUnique({ where: { id }, include: postInclude });
}

export async function getPostBySlug(slug: string) {
  return prisma.blogPost.findUnique({ where: { slug }, include: postInclude });
}

export async function listPosts(filters: ListPostsFilters = {}) {
  return prisma.blogPost.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.createdById ? { createdById: filters.createdById } : {}),
      ...(filters.q
        ? { OR: [{ title: { contains: filters.q, mode: "insensitive" } }, { excerpt: { contains: filters.q, mode: "insensitive" } }] }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: postInclude,
  });
}

export async function updatePost(id: string, patch: UpdatePostInput) {
  const data: Prisma.BlogPostUpdateInput = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.slug !== undefined) data.slug = await ensureUniqueSlug(patch.slug, id);
  if (patch.excerpt !== undefined) data.excerpt = patch.excerpt;
  if (patch.contentJson !== undefined) {
    data.contentJson = asJson(patch.contentJson);
    data.readingTimeMin = computeReadingTime(patch.contentJson);
    if (patch.excerpt === undefined) {
      const existing = await prisma.blogPost.findUnique({ where: { id }, select: { excerpt: true } });
      if (!existing?.excerpt) data.excerpt = deriveExcerpt(patch.contentJson);
    }
  }
  if (patch.coverImageUrl !== undefined) data.coverImageUrl = patch.coverImageUrl;
  if (patch.metaDescription !== undefined) data.metaDescription = patch.metaDescription;
  if (patch.canonicalUrl !== undefined) data.canonicalUrl = patch.canonicalUrl;
  if (patch.ogTitle !== undefined) data.ogTitle = patch.ogTitle;
  if (patch.ogDescription !== undefined) data.ogDescription = patch.ogDescription;
  if (patch.ogImageUrl !== undefined) data.ogImageUrl = patch.ogImageUrl;
  if (patch.scheduledAt !== undefined) data.scheduledAt = patch.scheduledAt;
  if (patch.authorName !== undefined) data.authorName = patch.authorName;
  if (patch.linkUrl !== undefined) data.linkUrl = patch.linkUrl;
  if (patch.publishedAt !== undefined) {
    data.publishedAt = patch.publishedAt ? new Date(patch.publishedAt) : null;
  }
  if (patch.theme !== undefined) {
    data.theme = patch.theme as Prisma.InputJsonValue ?? Prisma.JsonNull;
  }

  return prisma.blogPost.update({ where: { id }, data, include: postInclude });
}

export async function deletePost(id: string) {
  await prisma.blogPost.delete({ where: { id } });
  return { ok: true };
}

// ── Workflow ─────────────────────────────────────────────────

/** Publish now: snapshot a revision, render the public HTML, flip to PUBLISHED. */
export async function publishPost(id: string, memberId: string) {
  const post = await prisma.blogPost.findUnique({ where: { id } });
  if (!post) throw new Error("Post not found");
  const doc = post.contentJson as unknown as PMDoc;
  await snapshotRevision(id, memberId);
  return prisma.blogPost.update({
    where: { id },
    data: {
      status: "PUBLISHED",
      publishedAt: post.publishedAt ?? new Date(),
      scheduledAt: null,
      renderedHtml: renderJsonToHtml(doc, process.env.PUBLIC_API_BASE_URL ?? ""),
      readingTimeMin: computeReadingTime(doc),
    },
    include: postInclude,
  });
}

export async function schedulePost(id: string, when: Date) {
  return prisma.blogPost.update({
    where: { id },
    data: { status: "SCHEDULED", scheduledAt: when },
    include: postInclude,
  });
}

export async function unpublishPost(id: string) {
  return prisma.blogPost.update({
    where: { id },
    data: { status: "DRAFT" },
    include: postInclude,
  });
}

export async function archivePost(id: string) {
  return prisma.blogPost.update({
    where: { id },
    data: { status: "ARCHIVED" },
    include: postInclude,
  });
}

/** Find scheduled posts whose time has arrived — used by the auto-publish cron. */
export async function publishDueScheduledPosts(now: Date = new Date()): Promise<number> {
  const due = await prisma.blogPost.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: now } },
    select: { id: true, createdById: true },
  });
  for (const p of due) {
    await publishPost(p.id, p.createdById);
  }
  return due.length;
}

// ── Revisions ────────────────────────────────────────────────

export async function snapshotRevision(postId: string, authorId: string) {
  const post = await prisma.blogPost.findUnique({ where: { id: postId }, select: { title: true, contentJson: true } });
  if (!post) throw new Error("Post not found");
  return prisma.blogRevision.create({
    data: { postId, authorId, title: post.title, contentJson: post.contentJson as Prisma.InputJsonValue },
  });
}

export async function listRevisions(postId: string) {
  return prisma.blogRevision.findMany({
    where: { postId },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
  });
}

export async function rollbackRevision(postId: string, revisionId: string, memberId: string) {
  const rev = await prisma.blogRevision.findUnique({ where: { id: revisionId } });
  if (!rev || rev.postId !== postId) throw new Error("Revision not found");
  // Snapshot current state first so a rollback is itself reversible.
  await snapshotRevision(postId, memberId);
  const doc = rev.contentJson as unknown as PMDoc;
  return prisma.blogPost.update({
    where: { id: postId },
    data: { title: rev.title, contentJson: rev.contentJson as Prisma.InputJsonValue, readingTimeMin: computeReadingTime(doc) },
    include: postInclude,
  });
}

// ── Tags / Categories / Snippets ─────────────────────────────

export async function listTags() {
  return prisma.blogTag.findMany({ orderBy: { name: "asc" } });
}

export async function createTag(name: string) {
  return prisma.blogTag.create({ data: { name, slug: slugify(name) } });
}

export async function listCategories() {
  return prisma.blogCategory.findMany({ orderBy: { name: "asc" } });
}

export async function createCategory(name: string) {
  return prisma.blogCategory.create({ data: { name, slug: slugify(name) } });
}

export async function setPostTaxonomy(id: string, tagIds?: string[], categoryIds?: string[]) {
  return prisma.blogPost.update({
    where: { id },
    data: {
      ...(tagIds ? { tags: { set: tagIds.map((t) => ({ id: t })) } } : {}),
      ...(categoryIds ? { categories: { set: categoryIds.map((c) => ({ id: c })) } } : {}),
    },
    include: postInclude,
  });
}

export async function listSnippets() {
  return prisma.blogSnippet.findMany({ orderBy: { updatedAt: "desc" } });
}

export async function createSnippet(name: string, contentJson: PMDoc, createdById: string) {
  return prisma.blogSnippet.create({ data: { name, contentJson: asJson(contentJson), createdById } });
}

export async function updateSnippet(id: string, patch: { name?: string; contentJson?: PMDoc }) {
  return prisma.blogSnippet.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.contentJson !== undefined ? { contentJson: asJson(patch.contentJson) } : {}),
    },
  });
}

export async function deleteSnippet(id: string) {
  await prisma.blogSnippet.delete({ where: { id } });
  return { ok: true };
}

// ── Multi-author ─────────────────────────────────────────────

export async function addAuthor(postId: string, memberId: string, role = "author") {
  return prisma.blogAuthor.upsert({
    where: { postId_memberId: { postId, memberId } },
    create: { postId, memberId, role },
    update: { role },
    include: { member: { select: { id: true, displayName: true, avatarUrl: true } } },
  });
}

export async function removeAuthor(postId: string, memberId: string) {
  await prisma.blogAuthor.deleteMany({ where: { postId, memberId } });
  return { ok: true };
}

// ── Draft annotations ───────────────────────────────────────────
// Internal review notes on a post, reusing the OutreachComment thread model.

export async function listAnnotations(postId: string) {
  return prisma.outreachComment.findMany({
    where: { blogPostId: postId, parentId: null },
    include: {
      author: { select: { id: true, displayName: true, avatarUrl: true } },
      replies: {
        include: {
          author: { select: { id: true, displayName: true, avatarUrl: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function addAnnotation(
  postId: string,
  authorId: string,
  body: string,
  mentions: string[] = [],
  parentId?: string
) {
  if (parentId) {
    const parent = await prisma.outreachComment.findUnique({ where: { id: parentId } });
    if (!parent || parent.blogPostId !== postId) {
      throw new Error("Invalid parentId: comment does not belong to this post");
    }
  }
  return prisma.outreachComment.create({
    data: { blogPostId: postId, authorId, body, mentions, parentId },
    include: {
      author: { select: { id: true, displayName: true, avatarUrl: true } },
    },
  });
}
