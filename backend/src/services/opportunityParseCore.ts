// Opportunity source parsers (pure). No DB, no network.
//
// Each parser takes already-decoded JSON from one source and returns normalized postings.
// They are defensive: a malformed item is skipped, malformed input returns [], nothing throws.

export interface ParsedOpportunity {
  externalId: string;
  title: string;
  company: string;
  location: string | null;
  url: string;
  postedAt: Date | null;
  closesAt: Date | null;
  employmentType: string | null;
  description: string;
}

export const MAX_DESCRIPTION = 20_000;
const MAX_TITLE = 300;
const MAX_COMPANY = 200;
const MAX_LOCATION = 200;
const MAX_EXTERNAL_ID = 200;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-",
  hellip: "...", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', bull: "*", middot: "*",
};

function decodeEntitiesOnce(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return " ";
      try { return String.fromCodePoint(code); } catch { return " "; }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

const BLOCK_TAGS = "p|div|br|li|ul|ol|h[1-6]|tr|table|section|article|header|footer|blockquote|pre|hr";

/** HTML to plain text: scripts/styles dropped, block tags become newlines, entities decoded, whitespace collapsed. */
export function stripHtml(html: string): string {
  if (typeof html !== "string" || !html) return "";
  let s = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(new RegExp(`</?(?:${BLOCK_TAGS})\\b[^>]*>`, "gi"), "\n")
    .replace(/<[^>]*>/g, " ");
  s = decodeEntitiesOnce(s);
  return s
    .replace(/ /g, " ")
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Greenhouse `content` is HTML that was entity-escaped once: decode first, then strip. */
export function stripEscapedHtml(escaped: string): string {
  if (typeof escaped !== "string") return "";
  return stripHtml(decodeEntitiesOnce(escaped));
}

function str(v: unknown, max: number): string | null {
  if (typeof v === "number" && Number.isFinite(v)) v = String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function httpUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t.length > 2000) return null;
  try {
    const u = new URL(t);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function toDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = typeof v === "number" ? new Date(v) : typeof v === "string" ? new Date(v.trim()) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

interface RawPosting {
  externalId: unknown;
  title: unknown;
  company: unknown;
  url: unknown;
  location: string | null;
  postedAt: Date | null;
  closesAt: Date | null;
  employmentType: string | null;
  description: string;
}

function build(p: RawPosting): ParsedOpportunity | null {
  const externalId = str(p.externalId, MAX_EXTERNAL_ID);
  const title = str(p.title, MAX_TITLE);
  const company = str(p.company, MAX_COMPANY);
  const url = httpUrl(p.url);
  if (!externalId || !title || !company || !url) return null;
  const description = p.description.length > MAX_DESCRIPTION ? p.description.slice(0, MAX_DESCRIPTION) : p.description;
  return { externalId, title, company, url, location: p.location, postedAt: p.postedAt, closesAt: p.closesAt, employmentType: p.employmentType, description };
}

function each(items: unknown, fn: (item: unknown) => ParsedOpportunity | null): ParsedOpportunity[] {
  if (!Array.isArray(items)) return [];
  const out: ParsedOpportunity[] = [];
  for (const item of items) {
    try {
      const r = fn(item);
      if (r) out.push(r);
    } catch {
      /* skip malformed item */
    }
  }
  return out;
}

/** USAJOBS Search API: SearchResult.SearchResultItems[].MatchedObjectDescriptor */
export function parseUsajobs(json: unknown): ParsedOpportunity[] {
  const items = obj(obj(json)?.SearchResult)?.SearchResultItems;
  return each(items, (raw) => {
    const item = obj(raw);
    const d = obj(item?.MatchedObjectDescriptor);
    if (!item || !d) return null;
    const schedule = Array.isArray(d.PositionSchedule) ? obj(d.PositionSchedule[0])?.Name : null;
    const details = obj(obj(d.UserArea)?.Details);
    const descHtml = [details?.JobSummary, d.QualificationSummary].filter((x) => typeof x === "string").join("\n\n");
    return build({
      externalId: item.MatchedObjectId ?? d.PositionID,
      title: d.PositionTitle,
      company: d.OrganizationName ?? d.DepartmentName,
      url: d.PositionURI,
      location: str(d.PositionLocationDisplay, MAX_LOCATION),
      postedAt: toDate(d.PublicationStartDate),
      closesAt: toDate(d.ApplicationCloseDate),
      employmentType: str(schedule, 100),
      description: stripHtml(descHtml),
    });
  });
}

/** Greenhouse board: { jobs: [...] } from /v1/boards/{token}/jobs?content=true. `company` is the board's display name. */
export function parseGreenhouse(json: unknown, company: string): ParsedOpportunity[] {
  return each(obj(json)?.jobs, (raw) => {
    const j = obj(raw);
    if (!j) return null;
    return build({
      externalId: j.id,
      title: j.title,
      company: j.company_name ?? company,
      url: j.absolute_url,
      location: str(obj(j.location)?.name, MAX_LOCATION),
      postedAt: toDate(j.first_published ?? j.updated_at),
      closesAt: null,
      employmentType: null,
      description: stripEscapedHtml(typeof j.content === "string" ? j.content : ""),
    });
  });
}

/** Lever postings: a top-level array. createdAt is epoch milliseconds. */
export function parseLever(json: unknown, company: string): ParsedOpportunity[] {
  return each(json, (raw) => {
    const j = obj(raw);
    if (!j) return null;
    const cats = obj(j.categories);
    let description = typeof j.descriptionPlain === "string" ? j.descriptionPlain : stripHtml(typeof j.description === "string" ? j.description : "");
    if (Array.isArray(j.lists)) {
      for (const l of j.lists) {
        const li = obj(l);
        if (li) description += `\n\n${str(li.text, 300) ?? ""}\n${stripHtml(typeof li.content === "string" ? li.content : "")}`;
      }
    }
    if (typeof j.additionalPlain === "string") description += `\n\n${j.additionalPlain}`;
    return build({
      externalId: j.id,
      title: j.text,
      company,
      url: j.hostedUrl ?? j.applyUrl,
      location: str(cats?.location, MAX_LOCATION),
      postedAt: toDate(j.createdAt),
      closesAt: null,
      employmentType: str(cats?.commitment, 100),
      description: description.trim(),
    });
  });
}

/** Ashby job board: { jobs: [...] }. Unlisted jobs are skipped. */
export function parseAshby(json: unknown, company: string): ParsedOpportunity[] {
  return each(obj(json)?.jobs, (raw) => {
    const j = obj(raw);
    if (!j || j.isListed === false) return null;
    const description = typeof j.descriptionPlain === "string" ? j.descriptionPlain : stripHtml(typeof j.descriptionHtml === "string" ? j.descriptionHtml : "");
    return build({
      externalId: j.id,
      title: j.title,
      company,
      url: j.jobUrl ?? j.applyUrl,
      location: str(j.location, MAX_LOCATION),
      postedAt: toDate(j.publishedAt),
      closesAt: null,
      employmentType: str(j.employmentType, 100),
      description,
    });
  });
}
