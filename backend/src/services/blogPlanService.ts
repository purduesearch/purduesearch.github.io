// "Plan with Claude" for blog posts — the clipboard lane beside the built-in
// generate-from-text pipeline, modelled on aiActionService's buildPlanPrompt /
// importActionPlan pair.
//
// The member runs the prompt in their own chat session (no club quota, no key),
// pastes the reply back, reviews an outline, and only then is a post created.
// Both lanes share one prompt (buildBlogFromTextPrompt) and one validator
// (validateSectionPlan), so a pasted plan is exactly as constrained as a
// generated one.

import { prisma } from "../db/prisma.js";
import * as blogService from "./blogService.js";
import { buildBlogFromTextPrompt, type BlogTaxonomyNames } from "./aiOutreachService.js";
import {
  validateSectionPlan, buildDocFromPlan,
  type SectionPlan, type DroppedSection,
} from "./sectionPlan.js";
import { parsePastedSectionPlan } from "./ai/planTextExtract.js";

export async function loadBlogTaxonomyNames(): Promise<BlogTaxonomyNames> {
  const [tags, categories] = await Promise.all([blogService.listTags(), blogService.listCategories()]);
  return { tags: tags.map((t) => t.name), categories: categories.map((c) => c.name) };
}

/**
 * Appended only on the clipboard path, for the same reason as
 * aiActionService's CLIPBOARD_OUTPUT_RULE: a chat UI has no JSON mode, so ask
 * for the fence the extractor looks for first.
 */
const CLIPBOARD_OUTPUT_RULE = `

Put the whole JSON object in a single \`\`\`json fenced code block. Any explanation you want to add goes outside the fence — do not split the JSON across more than one block.`;

/** Prompt text for the member's own chat session. Makes no AI call. */
export async function buildBlogPlanPrompt(input: {
  text: string; title?: string; guidance?: string;
}): Promise<string> {
  const taxonomy = await loadBlogTaxonomyNames();
  return buildBlogFromTextPrompt({
    text: input.text,
    titleHint: input.title,
    guidance: input.guidance,
    kind: "blog",
    taxonomy,
  }) + CLIPBOARD_OUTPUT_RULE;
}

export type ImportBlogPlanResult =
  | { ok: false; reason: "NO_JSON_FOUND" }
  | { ok: true; plan: SectionPlan; dropped: DroppedSection[]; title: string };

/**
 * Validate a pasted reply. Pure — nothing is persisted until createPostFromPlan.
 *
 * Pass `taxonomy` to narrow meta tags/categories to names that exist, so the
 * outline the member reviews shows only what createPostFromPlan will apply.
 */
export function importBlogPlan(raw: string, taxonomy?: BlogTaxonomyNames): ImportBlogPlanResult {
  const root = parsePastedSectionPlan(raw);
  if (root === null) return { ok: false, reason: "NO_JSON_FOUND" };
  const dropped: DroppedSection[] = [];
  const validated = validateSectionPlan(root, dropped);

  // Sections that would build to nothing in a blog: the data placeholders only
  // render from a press kit's live project data, and a stat band with no values
  // has nothing to show. Report them rather than list them in the outline.
  const sections = validated.sections.filter((s, i) => {
    const why = blogEmptyReason(s);
    if (why) dropped.push({ index: i, type: s.type, reason: why });
    return !why;
  });
  const plan: SectionPlan = { ...validated, sections };
  if (plan.meta && taxonomy) {
    const keep = (names: string[] | undefined, known: string[]) => {
      const set = new Set(known.map((n) => n.trim().toLowerCase()));
      const out = (names ?? []).filter((n) => set.has(n.trim().toLowerCase()));
      return out.length ? out : undefined;
    };
    plan.meta = {
      ...plan.meta,
      tags: keep(plan.meta.tags, taxonomy.tags),
      categories: keep(plan.meta.categories, taxonomy.categories),
    };
  }
  return { ok: true, plan, dropped, title: suggestedTitle(plan) };
}

function blogEmptyReason(s: SectionPlan["sections"][number]): string | null {
  if (s.type === "timeline" || s.type === "team" || s.type === "links") {
    return "Only press kits can fill this section from live project data.";
  }
  if (s.type === "stats" && !s.stats?.length) return "A stat band needs its values written in.";
  return null;
}

function suggestedTitle(plan: SectionPlan): string {
  const hero = plan.sections.find((s) => s.type === "hero")?.heading?.trim();
  return (plan.meta?.title || hero || "").slice(0, 200);
}

/** Case-insensitive name → id resolution against existing taxonomy rows only. */
function resolveNames(rows: { id: string; name: string }[], names: string[] | undefined): string[] {
  if (!names?.length) return [];
  const byName = new Map(rows.map((r) => [r.name.trim().toLowerCase(), r.id]));
  const ids = names.map((n) => byName.get(n.trim().toLowerCase())).filter((x): x is string => Boolean(x));
  return [...new Set(ids)];
}

/**
 * Create a DRAFT from a plan. Shared by the built-in generate route and the
 * clipboard lane, so the plan's post-level meta (excerpt, SEO description,
 * tags, categories) is applied the same way whichever model wrote it.
 *
 * The plan is re-validated here: on the clipboard path it round-tripped through
 * the browser and may have been hand-edited.
 */
export async function createPostFromPlan(rawPlan: unknown, opts: { title?: string; memberId: string }) {
  const plan = validateSectionPlan(rawPlan);
  if (!plan.sections.length) throw new Error("EMPTY_PLAN");

  const doc = buildDocFromPlan(plan);
  const title = (opts.title?.trim() || suggestedTitle(plan) || "Untitled post").slice(0, 200);
  const meta = plan.meta ?? {};

  const post = await blogService.createPost({
    title,
    contentJson: doc,
    excerpt: meta.excerpt,
    createdById: opts.memberId,
  });

  if (meta.metaDescription) {
    await blogService.updatePost(post.id, { metaDescription: meta.metaDescription });
  }
  if (meta.tags?.length || meta.categories?.length) {
    const [tags, categories] = await Promise.all([
      prisma.blogTag.findMany({ select: { id: true, name: true } }),
      prisma.blogCategory.findMany({ select: { id: true, name: true } }),
    ]);
    const tagIds = resolveNames(tags, meta.tags);
    const categoryIds = resolveNames(categories, meta.categories);
    if (tagIds.length || categoryIds.length) {
      return blogService.setPostTaxonomy(
        post.id,
        tagIds.length ? tagIds : undefined,
        categoryIds.length ? categoryIds : undefined,
      );
    }
  }
  return post;
}
