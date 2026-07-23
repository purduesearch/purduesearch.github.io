// Shared "section plan" pipeline for AI-generated blog posts and press kits.
//
// The AI never emits raw TipTap JSON. Instead it returns a validated, high-level
// SectionPlan — an ordered list of typed sections it authored (hero / rich text /
// columns / media+text / image / gallery / callout / quote / cta / divider) plus
// placeholder references (stats / timeline / team / links) whose data is filled in
// deterministically from live project data. `buildDocFromPlan` maps every entry
// into a schema-valid `section` node set, so output is always well-formed and
// co-editable, and factual data (numbers, rosters, dates) is never hallucinated.
//
// Keep the section-node shapes in sync with the client node defs
// (src/components/clubpm/blog/*), the collab schema mirror
// (backend/src/collab/blogSchema.ts), and the renderer (blogRender.ts).

import { markdownToTiptapJson, type PMDoc, type PMNode } from "./blogRender.js";

// ── Plan schema (AI output) ──────────────────────────────────

export type PlanSectionType =
  | "hero" | "richText" | "columns" | "mediaText" | "image" | "gallery"
  | "callout" | "quote" | "cta" | "divider"
  | "stats" | "timeline" | "team" | "links";

export interface PlanSection {
  type: PlanSectionType;
  // Section-level styling (optional overrides applied to the wrapping section).
  theme?: "inherit" | "light" | "dark";
  width?: "contained" | "fullBleed";
  padding?: "s" | "m" | "l" | "xl";
  // hero
  heading?: string;
  subheading?: string;
  align?: "left" | "center";
  overlay?: boolean;
  // richText body
  markdown?: string;
  // columns
  columns?: { markdown: string }[];
  // mediaText
  imageSide?: "left" | "right";
  imageAlt?: string;
  imageCaption?: string;
  // gallery
  imageCount?: number;
  // callout
  variant?: "info" | "success" | "warning" | "tip";
  // quote
  text?: string;
  attribution?: string;
  // cta
  label?: string;
  href?: string;
  style?: "solid" | "outline";
  // stats (explicit, AI-authored — falls back to PlanData when absent)
  stats?: { label: string; value: string }[];
}

export interface SectionPlan {
  sections: PlanSection[];
}

// Deterministic live data the placeholder sections render from. Every field is
// optional; a placeholder whose data is absent renders nothing (which lets the
// caller gate sections by disabling their data rather than editing the plan).
export interface PlanData {
  stats?: { label: string; value: string }[];
  timeline?: { title: string; date: string | null }[];
  team?: { displayName: string; title: string | null; isLead: boolean }[];
  contributors?: { displayName: string; tasksDone: number; hours: number }[];
  links?: { label: string; url: string }[];
}

const PLAN_TYPES: readonly PlanSectionType[] = [
  "hero", "richText", "columns", "mediaText", "image", "gallery",
  "callout", "quote", "cta", "divider",
  "stats", "timeline", "team", "links",
];

const CALLOUT_VARIANTS = new Set(["info", "success", "warning", "tip"]);
const PADS = new Set(["s", "m", "l", "xl"]);
const MAX_SECTIONS = 30;

function clampStr(v: unknown, max: number): string | undefined {
  return typeof v === "string" ? v.slice(0, max) : undefined;
}

/** Coerce arbitrary model JSON into a safe SectionPlan (drops unknown types/fields). */
export function validateSectionPlan(raw: unknown): SectionPlan {
  const root = (raw ?? {}) as Record<string, unknown>;
  const list: unknown[] = Array.isArray(root.sections)
    ? root.sections
    : Array.isArray(raw) ? (raw as unknown[]) : [];

  const sections: PlanSection[] = [];
  for (const item of list.slice(0, MAX_SECTIONS)) {
    const o = (item ?? {}) as Record<string, unknown>;
    if (!PLAN_TYPES.includes(o.type as PlanSectionType)) continue;
    const sec: PlanSection = { type: o.type as PlanSectionType };

    // Section-level styling
    if (o.theme === "light" || o.theme === "dark" || o.theme === "inherit") sec.theme = o.theme;
    if (o.width === "contained" || o.width === "fullBleed") sec.width = o.width;
    if (typeof o.padding === "string" && PADS.has(o.padding)) sec.padding = o.padding as PlanSection["padding"];

    const heading = clampStr(o.heading, 200);      if (heading !== undefined) sec.heading = heading;
    const sub = clampStr(o.subheading, 300);       if (sub !== undefined) sec.subheading = sub;
    if (o.align === "left" || o.align === "center") sec.align = o.align;
    if (typeof o.overlay === "boolean") sec.overlay = o.overlay;
    const md = clampStr(o.markdown, 8000);         if (md !== undefined) sec.markdown = md;
    if (Array.isArray(o.columns)) {
      sec.columns = o.columns.slice(0, 3).map((c) => ({
        markdown: clampStr((c as Record<string, unknown> | null)?.markdown, 5000) ?? "",
      }));
    }
    if (o.imageSide === "left" || o.imageSide === "right") sec.imageSide = o.imageSide;
    const iAlt = clampStr(o.imageAlt, 300);         if (iAlt !== undefined) sec.imageAlt = iAlt;
    const iCap = clampStr(o.imageCaption, 300);     if (iCap !== undefined) sec.imageCaption = iCap;
    if (typeof o.imageCount === "number" && Number.isFinite(o.imageCount)) {
      sec.imageCount = Math.max(0, Math.min(8, Math.round(o.imageCount)));
    }
    if (typeof o.variant === "string" && CALLOUT_VARIANTS.has(o.variant)) sec.variant = o.variant as PlanSection["variant"];
    const text = clampStr(o.text, 1200);           if (text !== undefined) sec.text = text;
    const attr = clampStr(o.attribution, 200);     if (attr !== undefined) sec.attribution = attr;
    const label = clampStr(o.label, 120);          if (label !== undefined) sec.label = label;
    const href = clampStr(o.href, 500);            if (href !== undefined) sec.href = href;
    if (o.style === "outline" || o.style === "solid") sec.style = o.style;
    if (Array.isArray(o.stats)) {
      sec.stats = o.stats.slice(0, 8)
        .map((x) => ({
          label: clampStr((x as Record<string, unknown> | null)?.label, 40) ?? "",
          value: clampStr((x as Record<string, unknown> | null)?.value, 40) ?? "",
        }))
        .filter((x) => x.label || x.value);
    }

    sections.push(sec);
  }
  return { sections };
}

// ── Plan → PMDoc ─────────────────────────────────────────────

const h2 = (text: string): PMNode => ({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text }] });

/** A `section` node; falls back to an empty paragraph so it's never contentless. */
function section(attrs: Record<string, unknown>, content: PMNode[]): PMNode {
  return { type: "section", attrs, content: content.length ? content : [{ type: "paragraph" }] };
}

/** Merge a section's base attrs with the plan's optional style overrides. */
function withStyle(base: Record<string, unknown>, s: PlanSection): Record<string, unknown> {
  const out = { ...base };
  if (s.theme === "light" || s.theme === "dark" || s.theme === "inherit") out.theme = s.theme;
  if (s.width === "contained" || s.width === "fullBleed") out.width = s.width;
  if (s.padding && PADS.has(s.padding)) out.padding = s.padding;
  return out;
}

/** Block nodes parsed from markdown (headings/lists/tables/bold/links/etc.). */
function blocks(md: string | undefined): PMNode[] {
  if (!md || !md.trim()) return [];
  return markdownToTiptapJson(md).content ?? [];
}

/** An image node with no source — renders as an upload placeholder in the editor. */
function imageNode(alt?: string, caption?: string): PMNode {
  return { type: "image", attrs: {
    src: null, alt: (alt ?? "").slice(0, 300), align: "center",
    width: null, widthUnit: "px", caption: (caption ?? "").slice(0, 300),
  } };
}

/** A column node whose content is parsed from markdown (never empty). */
function columnNode(md: string | undefined, extra: PMNode[] = []): PMNode {
  const cb = [...extra, ...blocks(md)];
  return { type: "column", content: cb.length ? cb : [{ type: "paragraph" }] };
}

/**
 * Build a section-based TipTap document from a plan. Authored sections come
 * straight from the plan; placeholder sections (stats/timeline/team/links) are
 * rendered from `data` (stats may instead be authored inline) and silently
 * skipped when their data is absent.
 */
export function buildDocFromPlan(plan: SectionPlan, data: PlanData = {}): PMDoc {
  const out: PMNode[] = [];

  for (const s of plan.sections) {
    switch (s.type) {
      case "hero": {
        const heading = (s.heading ?? "").trim();
        const subheading = (s.subheading ?? "").trim();
        if (!heading && !subheading) break;
        out.push(section(
          withStyle({ layout: "single", padding: "xl", width: "fullBleed" }, s),
          [{ type: "hero", attrs: {
            heading, subheading,
            align: s.align === "left" ? "left" : "center",
            overlay: !!s.overlay, bgImage: "",
          } }],
        ));
        break;
      }
      case "richText": {
        const inner: PMNode[] = [];
        if (s.heading?.trim()) inner.push(h2(s.heading.trim()));
        inner.push(...blocks(s.markdown));
        if (!inner.length) break;
        out.push(section(withStyle({ layout: "single", padding: "l" }, s), inner));
        break;
      }
      case "columns": {
        const filled = (s.columns ?? [])
          .map((c) => (c?.markdown ?? "").trim())
          .filter(Boolean);
        if (!filled.length) break;
        if (filled.length === 1) {
          out.push(section(withStyle({ layout: "single", padding: "l" }, s), blocks(filled[0])));
          break;
        }
        // A heading above a grid can't be a grid cell, so it gets its own band.
        if (s.heading?.trim()) out.push(section({ layout: "single", padding: "s" }, [h2(s.heading.trim())]));
        const n = Math.min(filled.length, 3);
        out.push(section(
          withStyle({ layout: n >= 3 ? "cols3" : "cols2", padding: "l" }, s),
          filled.slice(0, n).map((md) => columnNode(md)),
        ));
        break;
      }
      case "mediaText": {
        // Text beside an image placeholder. Heading rides inside the text column.
        const textExtra: PMNode[] = s.heading?.trim() ? [h2(s.heading.trim())] : [];
        const textCol = columnNode(s.markdown, textExtra);
        const imgCol: PMNode = { type: "column", content: [imageNode(s.imageAlt, s.imageCaption)] };
        const cols = s.imageSide === "right" ? [textCol, imgCol] : [imgCol, textCol];
        out.push(section(withStyle({ layout: "mediaText", padding: "l" }, s), cols));
        break;
      }
      case "image": {
        out.push(section(withStyle({ layout: "single", padding: "m" }, s), [imageNode(s.imageAlt, s.imageCaption)]));
        break;
      }
      case "gallery": {
        const inner: PMNode[] = [];
        if (s.heading?.trim()) inner.push(h2(s.heading.trim()));
        inner.push({ type: "gallery", attrs: { images: [] } });
        out.push(section(withStyle({ layout: "single", padding: "l" }, s), inner));
        break;
      }
      case "callout": {
        const body = blocks(s.markdown);
        if (!body.length) break;
        const variant = s.variant && CALLOUT_VARIANTS.has(s.variant) ? s.variant : "info";
        out.push(section(
          withStyle({ layout: "single", padding: "m" }, s),
          [{ type: "callout", attrs: { variant }, content: body }],
        ));
        break;
      }
      case "quote": {
        const text = (s.text ?? "").trim();
        if (!text) break;
        const inner: PMNode[] = [
          { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
        ];
        // Route attribution through markdown so its italic mark matches the renderer.
        if (s.attribution?.trim()) inner.push(...blocks(`*— ${s.attribution.trim()}*`));
        out.push(section(withStyle({ layout: "single", padding: "l" }, s), inner));
        break;
      }
      case "cta": {
        const label = (s.label ?? "").trim();
        if (!label) break;
        out.push(section(withStyle({ layout: "single", padding: "l" }, s), [{ type: "ctaButton", attrs: {
          label,
          href: (s.href ?? "").trim(),
          style: s.style === "outline" ? "outline" : "solid",
          align: "center",
        } }]));
        break;
      }
      case "divider": {
        out.push(section(withStyle({ layout: "single", padding: "s" }, s), [{ type: "horizontalRule" }]));
        break;
      }
      case "stats": {
        // Prefer AI-authored values (blogs); fall back to live data (press kits).
        const stats = (s.stats && s.stats.length ? s.stats : data.stats) ?? [];
        if (!stats.length) break;
        const inner: PMNode[] = [];
        if (s.heading?.trim()) inner.push(h2(s.heading.trim()));
        inner.push({ type: "statBand", attrs: { stats } });
        out.push(section(withStyle({ layout: "single", padding: "l" }, s), inner));
        break;
      }
      case "timeline": {
        const items = data.timeline ?? [];
        if (!items.length) break;
        const md = [`## ${s.heading?.trim() || "Timeline & Milestones"}`, "",
          ...items.map((i) => `- **${i.title}**${i.date ? ` — ${i.date}` : ""}`)].join("\n");
        out.push(section(withStyle({ layout: "single", padding: "l" }, s), blocks(md)));
        break;
      }
      case "team": {
        const team = data.team ?? [];
        const contributors = data.contributors ?? [];
        if (!team.length && !contributors.length) break;
        const lines = [`## ${s.heading?.trim() || "Team & Leadership"}`, ""];
        for (const t of team) {
          lines.push(`- **${t.displayName}**${t.title ? ` — ${t.title}` : ""}${t.isLead ? " *(Lead)*" : ""}`);
        }
        if (contributors.length) {
          lines.push("", "**Top contributors**", "");
          for (const c of contributors.slice(0, 6)) {
            lines.push(`- ${c.displayName} — ${c.tasksDone} tasks, ${c.hours} h`);
          }
        }
        out.push(section(withStyle({ layout: "single", padding: "l" }, s), blocks(lines.join("\n"))));
        break;
      }
      case "links": {
        const links = data.links ?? [];
        if (!links.length) break;
        const md = [`## ${s.heading?.trim() || "Links"}`, "",
          ...links.map((l) => `- [${l.label}](${l.url})`)].join("\n");
        out.push(section(withStyle({ layout: "single", padding: "l" }, s), blocks(md)));
        break;
      }
      default:
        break;
    }
  }

  return { type: "doc", content: out.length ? out : [{ type: "paragraph" }] };
}

/**
 * Flatten a plan's authored prose to markdown — a lightweight, human-readable
 * representation stored alongside generated posts (e.g. `blogMarkdown`). Data
 * placeholders and media are noted but not expanded.
 */
export function planToMarkdown(plan: SectionPlan): string {
  const out: string[] = [];
  for (const s of plan.sections) {
    switch (s.type) {
      case "hero":
        if (s.heading?.trim()) out.push(`# ${s.heading.trim()}`);
        if (s.subheading?.trim()) out.push(`*${s.subheading.trim()}*`);
        out.push("");
        break;
      case "richText":
        if (s.heading?.trim()) out.push(`## ${s.heading.trim()}`);
        if (s.markdown?.trim()) out.push(s.markdown.trim());
        out.push("");
        break;
      case "columns":
        if (s.heading?.trim()) out.push(`## ${s.heading.trim()}`);
        for (const c of s.columns ?? []) if (c?.markdown?.trim()) out.push(c.markdown.trim());
        out.push("");
        break;
      case "mediaText":
        if (s.heading?.trim()) out.push(`## ${s.heading.trim()}`);
        if (s.imageAlt?.trim() || s.imageCaption?.trim()) out.push(`_[Image: ${(s.imageCaption || s.imageAlt || "").trim()}]_`);
        if (s.markdown?.trim()) out.push(s.markdown.trim());
        out.push("");
        break;
      case "image":
        out.push(`_[Image placeholder: ${(s.imageCaption || s.imageAlt || "").trim()}]_`, "");
        break;
      case "gallery":
        if (s.heading?.trim()) out.push(`## ${s.heading.trim()}`);
        out.push("_[Image gallery placeholder]_", "");
        break;
      case "callout":
        if (s.markdown?.trim()) out.push(`> **${(s.variant || "info").toUpperCase()}:** ${s.markdown.trim().replace(/\n+/g, " ")}`);
        out.push("");
        break;
      case "quote":
        if (s.text?.trim()) out.push(`> ${s.text.trim()}${s.attribution?.trim() ? `\n>\n> — ${s.attribution.trim()}` : ""}`);
        out.push("");
        break;
      case "stats":
        if (s.stats?.length) {
          out.push(s.stats.map((x) => `**${x.value}** ${x.label}`).join(" · "), "");
        }
        break;
      case "cta":
        if (s.label?.trim()) out.push(`[${s.label.trim()}](${s.href?.trim() || "#"})`);
        out.push("");
        break;
      case "divider":
        out.push("---", "");
        break;
      default:
        break;
    }
  }
  return out.join("\n").trim();
}
