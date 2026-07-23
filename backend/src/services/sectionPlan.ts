// Shared "section plan" pipeline for AI-generated blog posts and press kits.
//
// The AI never emits raw TipTap JSON. Instead it returns a validated, high-level
// SectionPlan — an ordered list of typed sections (hero / rich text / columns /
// quote / cta) it authored, plus placeholder references (stats / timeline / team
// / links) whose data is filled in deterministically from live project data.
// `buildDocFromPlan` maps every entry into a schema-valid `section` node set, so
// the output is always well-formed and co-editable, and factual data (numbers,
// rosters, dates) is never hallucinated by the model.
//
// Keep the section-node shapes in sync with the client node defs
// (src/components/clubpm/blog/*), the collab schema mirror
// (backend/src/collab/blogSchema.ts), and the renderer (blogRender.ts).

import { markdownToTiptapJson, type PMDoc, type PMNode } from "./blogRender.js";

// ── Plan schema (AI output) ──────────────────────────────────

export type PlanSectionType =
  | "hero" | "richText" | "columns" | "quote" | "cta"
  | "stats" | "timeline" | "team" | "links";

export interface PlanSection {
  type: PlanSectionType;
  heading?: string;                 // richText/columns/data-section band title, or hero H1
  subheading?: string;              // hero only
  align?: "left" | "center";        // hero only
  overlay?: boolean;                // hero only
  markdown?: string;                // richText body (block markdown)
  columns?: { markdown: string }[]; // columns body (2–3 tracks)
  text?: string;                    // quote body
  attribution?: string;             // quote attribution
  label?: string;                   // cta button label
  href?: string;                    // cta link
  style?: "solid" | "outline";      // cta style
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
  "hero", "richText", "columns", "quote", "cta", "stats", "timeline", "team", "links",
];

const MAX_SECTIONS = 24;

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
    const text = clampStr(o.text, 1200);           if (text !== undefined) sec.text = text;
    const attr = clampStr(o.attribution, 200);     if (attr !== undefined) sec.attribution = attr;
    const label = clampStr(o.label, 120);          if (label !== undefined) sec.label = label;
    const href = clampStr(o.href, 500);            if (href !== undefined) sec.href = href;
    if (o.style === "outline" || o.style === "solid") sec.style = o.style;

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

/** Block nodes parsed from markdown (headings/lists/tables/bold/links/etc.). */
function blocks(md: string | undefined): PMNode[] {
  if (!md || !md.trim()) return [];
  return markdownToTiptapJson(md).content ?? [];
}

/**
 * Build a section-based TipTap document from a plan. Prose sections come straight
 * from the plan; placeholder sections (stats/timeline/team/links) are rendered
 * from `data` and silently skipped when their data is absent.
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
          { layout: "single", padding: "xl", width: "fullBleed" },
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
        out.push(section({ layout: "single", padding: "l" }, inner));
        break;
      }
      case "columns": {
        const filled = (s.columns ?? [])
          .map((c) => (c?.markdown ?? "").trim())
          .filter(Boolean);
        if (!filled.length) break;
        if (filled.length === 1) {
          // Only one column has content — render as a plain single section.
          out.push(section({ layout: "single", padding: "l" }, blocks(filled[0])));
          break;
        }
        // A heading above a grid can't be a grid cell, so it gets its own band.
        if (s.heading?.trim()) out.push(section({ layout: "single", padding: "s" }, [h2(s.heading.trim())]));
        const n = Math.min(filled.length, 3);
        out.push(section(
          { layout: n >= 3 ? "cols3" : "cols2", padding: "l" },
          filled.slice(0, n).map((md) => {
            const cb = blocks(md);
            return { type: "column", content: cb.length ? cb : [{ type: "paragraph" }] };
          }),
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
        out.push(section({ layout: "single", padding: "l" }, inner));
        break;
      }
      case "cta": {
        const label = (s.label ?? "").trim();
        if (!label) break;
        out.push(section({ layout: "single", padding: "l" }, [{ type: "ctaButton", attrs: {
          label,
          href: (s.href ?? "").trim(),
          style: s.style === "outline" ? "outline" : "solid",
          align: "center",
        } }]));
        break;
      }
      case "stats": {
        const stats = data.stats ?? [];
        if (!stats.length) break;
        const inner: PMNode[] = [];
        if (s.heading?.trim()) inner.push(h2(s.heading.trim()));
        inner.push({ type: "statBand", attrs: { stats } });
        out.push(section({ layout: "single", padding: "l" }, inner));
        break;
      }
      case "timeline": {
        const items = data.timeline ?? [];
        if (!items.length) break;
        const md = [`## ${s.heading?.trim() || "Timeline & Milestones"}`, "",
          ...items.map((i) => `- **${i.title}**${i.date ? ` — ${i.date}` : ""}`)].join("\n");
        out.push(section({ layout: "single", padding: "l" }, blocks(md)));
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
        out.push(section({ layout: "single", padding: "l" }, blocks(lines.join("\n"))));
        break;
      }
      case "links": {
        const links = data.links ?? [];
        if (!links.length) break;
        const md = [`## ${s.heading?.trim() || "Links"}`, "",
          ...links.map((l) => `- [${l.label}](${l.url})`)].join("\n");
        out.push(section({ layout: "single", padding: "l" }, blocks(md)));
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
 * placeholders are omitted since their content lives in live project data.
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
      case "quote":
        if (s.text?.trim()) out.push(`> ${s.text.trim()}${s.attribution?.trim() ? `\n>\n> — ${s.attribution.trim()}` : ""}`);
        out.push("");
        break;
      case "cta":
        if (s.label?.trim()) out.push(`[${s.label.trim()}](${s.href?.trim() || "#"})`);
        out.push("");
        break;
      default:
        break;
    }
  }
  return out.join("\n").trim();
}
