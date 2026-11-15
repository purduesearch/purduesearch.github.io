// Local O*NET data only. Catalog writes share the catalog's transaction and lock.
import type { OnetLinkKind, OnetLinkRelation, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { proposeLinks, compareText } from "./onetLinkCore.js";
import { CURATED_LINKS } from "./skillOnetCurated.js";

export type OnetLinkDb = Pick<Prisma.TransactionClient, "skill" | "skillOnetLink" | "onetSoftware" | "onetElement" | "onetRating" | "$executeRaw">;
export interface OnetLinkStore extends OnetLinkDb {
  $transaction<T>(run: (tx: OnetLinkDb) => Promise<T>, options: { timeout: number; maxWait: number }): Promise<T>;
}
type Store = OnetLinkDb | OnetLinkStore;
export class OnetLinkError extends Error {
  constructor(public code: "INVALID" | "NOT_FOUND" | "FORBIDDEN", message: string) { super(message); }
}

/** Injected transactions must already hold skills-catalog; never open a nested transaction. */
async function mutate<T>(db: Store, run: (tx: OnetLinkDb) => Promise<T>): Promise<T> {
  if ("$transaction" in db) return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('skills-catalog'))`;
    return run(tx);
  }, { timeout: 30_000, maxWait: 20_000 });
  return run(db);
}
type LinkInput = { skillId: string; kind: OnetLinkKind; ref: string; relation: OnetLinkRelation };
type Actor = { id: string; isAdmin: boolean };
function assertAdmin(actor: Actor) {
  if (actor?.isAdmin !== true || !actor.id) throw new OnetLinkError("FORBIDDEN", "Administrator access required");
}
function validateShape(input: Omit<LinkInput, "relation"> & { relation?: OnetLinkRelation }) {
  if (!input || typeof input.skillId !== "string" || !input.skillId.trim() ||
    !["SOFTWARE", "ELEMENT", "DWA"].includes(input.kind) || typeof input.ref !== "string" || !input.ref.trim() || input.ref !== input.ref.trim()) {
    throw new OnetLinkError("INVALID", "A skill, valid link kind, and exact reference are required");
  }
}
async function requireSkill(db: OnetLinkDb, skillId: string) {
  const skill = await db.skill.findUnique({ where: { id: skillId }, include: { aliases: true } });
  if (!skill) throw new OnetLinkError("NOT_FOUND", "Skill not found");
  return skill;
}
async function validRef(db: OnetLinkDb, kind: OnetLinkKind, ref: string): Promise<boolean> {
  if (kind === "SOFTWARE") return !!await db.onetSoftware.findFirst({ where: { exampleNorm: ref }, select: { id: true } });
  const element = await db.onetElement.findUnique({ where: { id: ref }, select: { domain: true } });
  return !!element && (kind === "DWA" ? element.domain === "DWA" : element.domain !== "DWA");
}

export async function setLink(actor: Actor, input: LinkInput, db: Store = prisma) {
  assertAdmin(actor); validateShape(input);
  if (!["EXACT", "BROADER", "RELATED"].includes(input.relation)) throw new OnetLinkError("INVALID", "Invalid link relation");
  return mutate(db, async tx => {
    await requireSkill(tx, input.skillId);
    if (!await validRef(tx, input.kind, input.ref)) throw new OnetLinkError("INVALID", "Reference does not exist for this link kind");
    return tx.skillOnetLink.upsert({ where: { skillId_kind_ref: { skillId: input.skillId, kind: input.kind, ref: input.ref } },
      create: { ...input, origin: "ADMIN", createdById: actor.id }, update: { relation: input.relation, origin: "ADMIN", createdById: actor.id } });
  });
}
export async function removeLink(actor: Actor, input: Omit<LinkInput, "relation">, db: Store = prisma) {
  assertAdmin(actor); validateShape(input);
  return mutate(db, async tx => {
    await requireSkill(tx, input.skillId);
    return tx.skillOnetLink.deleteMany({ where: input });
  });
}

export async function autoLink(skillId: string, db: Store = prisma) {
  return mutate(db, async tx => {
    const skill = await requireSkill(tx, skillId);
    const [software, elements] = await Promise.all([
      tx.onetSoftware.findMany({ select: { example: true }, distinct: ["example"] }),
      tx.onetElement.findMany({ select: { id: true, name: true, domain: true } }),
    ]);
    const proposals = proposeLinks([skill], software, elements);
    for (const proposal of proposals) {
      const { reason: _reason, ...data } = proposal;
      // Empty update preserves every reviewed/admin decision, including RELATED.
      await tx.skillOnetLink.upsert({ where: { skillId_kind_ref: { skillId, kind: data.kind, ref: data.ref } }, create: { ...data, origin: "AUTO" }, update: {} });
    }
    return proposals;
  });
}

export async function applyCuratedLinks(db: Store = prisma) {
  return mutate(db, async tx => {
    const skills = await tx.skill.findMany({ where: { slug: { in: [...new Set(CURATED_LINKS.map(link => link.slug))] } }, select: { id: true, slug: true } });
    const bySlug = new Map(skills.map(skill => [skill.slug, skill.id]));
    const report = { applied: 0, skipped: 0 };
    for (const link of CURATED_LINKS) {
      const skillId = bySlug.get(link.slug);
      if (!skillId || !await validRef(tx, link.kind, link.ref)) { report.skipped++; continue; }
      const where = { skillId, kind: link.kind, ref: link.ref };
      // Serialized with admin writes; update only automatic or curated rows.
      const existing = await tx.skillOnetLink.findUnique({ where: { skillId_kind_ref: where } });
      if (existing?.origin === "ADMIN") { report.skipped++; continue; }
      await tx.skillOnetLink.upsert({ where: { skillId_kind_ref: where }, create: { ...where, relation: link.relation, origin: "CURATED" }, update: { relation: link.relation, origin: "CURATED" } });
      report.applied++;
    }
    return report;
  });
}

export async function listUnlinked(db: OnetLinkDb = prisma) {
  return db.skill.findMany({ where: { status: "ACTIVE", canonicalId: null, onetLinks: { none: {} } },
    select: { id: true, slug: true, name: true, type: true }, orderBy: [{ name: "asc" }, { id: "asc" }] });
}

export interface SkillDemand {
  software: { hot: boolean; inDemandOccupations: number; occupationsListed: number; examples: string[] };
  topOccupations: { occupationCode: string; title: string; importance: number; elementId: string }[];
}
/** Counts refer to O*NET's listed occupations, never vacancies or inferred proficiency. */
export async function getSkillDemand(skillIds: string[], db: OnetLinkDb = prisma): Promise<Record<string, SkillDemand>> {
  const ids = [...new Set(skillIds)].sort(compareText);
  if (!ids.length) return {};
  const links = await db.skillOnetLink.findMany({ where: { skillId: { in: ids } } });
  const softwareRefs = [...new Set(links.filter(link => link.kind === "SOFTWARE").map(link => link.ref))];
  const elementRefs = [...new Set(links.filter(link => link.kind === "ELEMENT").map(link => link.ref))];
  const [software, ratings] = await Promise.all([
    softwareRefs.length ? db.onetSoftware.findMany({ where: { exampleNorm: { in: softwareRefs } } }) : [],
    elementRefs.length ? db.onetRating.findMany({ where: { elementId: { in: elementRefs }, scale: "IM", suppress: false, notRelevant: false }, include: { occupation: { select: { title: true } } } }) : [],
  ]);
  return Object.fromEntries(ids.map(skillId => {
    const own = links.filter(link => link.skillId === skillId);
    const sw = new Set(own.filter(link => link.kind === "SOFTWARE").map(link => link.ref));
    const el = new Set(own.filter(link => link.kind === "ELEMENT").map(link => link.ref));
    const examples = software.filter(row => sw.has(row.exampleNorm));
    const occupations = new Map<string, SkillDemand["topOccupations"][number]>();
    for (const row of ratings) {
      if (!el.has(row.elementId) || row.scale !== "IM" || row.suppress || row.notRelevant || !Number.isFinite(row.value)) continue;
      const entry = { occupationCode: row.occupationCode, title: row.occupation.title, importance: row.value, elementId: row.elementId };
      const old = occupations.get(row.occupationCode);
      if (!old || entry.importance > old.importance || (entry.importance === old.importance && compareText(entry.elementId, old.elementId) < 0)) occupations.set(row.occupationCode, entry);
    }
    return [skillId, {
      software: { hot: examples.some(row => row.hot), inDemandOccupations: new Set(examples.filter(row => row.inDemand).map(row => row.occupationCode)).size,
        occupationsListed: new Set(examples.map(row => row.occupationCode)).size, examples: [...new Set(examples.map(row => row.example))].sort(compareText) },
      topOccupations: [...occupations.values()].sort((a, b) => b.importance - a.importance || compareText(a.occupationCode, b.occupationCode)).slice(0, 10),
    }];
  }));
}
