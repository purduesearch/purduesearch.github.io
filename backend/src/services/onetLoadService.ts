// Local O*NET reference data only: no downloads, model calls, or evidence writes.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import type { OnetDomain, Prisma } from "@prisma/client";
import { normalizeExample, normalizeText, type OnetSubset } from "./onetCsvCore.js";

export const ONET_VERSION = "31.0";
export const ONET_BATCH_SIZE = 5_000;
type LoadTransaction = Pick<Prisma.TransactionClient,
  "$executeRaw" | "onetOccupation" | "onetElement" | "onetRating" | "onetSoftware" |
  "onetOccupationDwa" | "onetJobTitle" | "onetEmergingTask" | "onetRelatedOccupation" |
  "onetRelease" | "skillOnetLink">;
export interface OnetLoadStore {
  $transaction<T>(run: (tx: LoadTransaction) => Promise<T>, options: { timeout: number; maxWait: number }): Promise<T>;
}
export type OnetLoadReport = {
  version: string;
  sourceSha256: string;
  counts: Record<string, number>;
  danglingLinks: { id: string; skillId: string; kind: string; ref: string }[];
};

function parseSubset(bytes: Buffer): OnetSubset {
  const value = JSON.parse(gunzipSync(bytes).toString("utf8"));
  if (value?.meta?.version !== ONET_VERSION) throw new Error(`Expected O*NET ${ONET_VERSION}`);
  if (value.meta.releasedOn !== "2026-08" || !value.meta.files || typeof value.meta.files !== "object") {
    throw new Error("Invalid O*NET release metadata");
  }
  // Validate the compact format before opening a write transaction.
  const shapes = { occ: "sss", el: "sss", rat: "sssnbb", sw: "sssbb", dwa: "ssss",
    odwa: "ss", jt: "ss", jz: "sn", em: "sss", rel: "sssn" } as const;
  for (const [key, shape] of Object.entries(shapes)) {
    if (!Array.isArray(value[key])) throw new Error(`Invalid O*NET ${key} rows`);
    for (const row of value[key]) {
      if (!Array.isArray(row) || row.length !== shape.length || [...shape].some((type, i) =>
        type === "n" ? typeof row[i] !== "number" || !Number.isFinite(row[i]) :
          typeof row[i] !== (type === "s" ? "string" : "boolean"))) {
        throw new Error(`Invalid O*NET ${key} row`);
      }
    }
  }
  return value as OnetSubset;
}

function domain(id: string): OnetDomain {
  for (const [prefix, name] of [["2.A", "ESSENTIAL_SKILL"], ["2.B", "TRANSFERABLE_SKILL"],
    ["2.C", "KNOWLEDGE"], ["1.D", "WORK_STYLE"], ["2.E", "SOFTWARE_CATEGORY"]] as const) {
    if (id === prefix || id.startsWith(`${prefix}.`)) return name;
  }
  return "OTHER";
}

function elementRows(subset: OnetSubset): Prisma.OnetElementCreateManyInput[] {
  const rows = new Map(subset.el.map(([id, name, description]) => [id, {
    id, name, description, domain: domain(id), parentId: id.includes(".") ? id.slice(0, id.lastIndexOf(".")) : null,
  }]));
  function setActivity(id: string, activityDomain: OnetDomain, parentId?: string, name?: string) {
    const row = rows.get(id);
    if (!row) {
      // DWA names are retained in dwa; GWA/IWA names must come from content-model rows.
      if (!name) throw new Error(`Missing O*NET ${activityDomain} element ${id}`);
      rows.set(id, { id, name, description: "", domain: activityDomain, parentId: parentId ?? null });
    } else {
      if (row.domain === activityDomain && parentId && row.parentId !== parentId) {
        throw new Error(`Conflicting O*NET activity parent for ${id}`);
      }
      row.domain = activityDomain;
      if (parentId) row.parentId = parentId;
    }
  }
  for (const [gwa, iwa, dwa, name] of subset.dwa) {
    setActivity(gwa, "GWA"); setActivity(iwa, "IWA", gwa); setActivity(dwa, "DWA", iwa, name);
  }
  return [...rows.values()];
}

async function batches<T>(rows: T[], insert: (data: T[]) => PromiseLike<unknown>) {
  for (let start = 0; start < rows.length; start += ONET_BATCH_SIZE) {
    await insert(rows.slice(start, start + ONET_BATCH_SIZE));
  }
}

/** Hash the exact gzip bytes recorded in OnetRelease, then atomically replace reference rows. */
export async function loadOnetFile(path: string | URL, store?: OnetLoadStore): Promise<OnetLoadReport> {
  const bytes = await readFile(path);
  const subset = parseSubset(bytes);
  const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
  const elements = elementRows(subset);
  const zones = new Map(subset.jz);
  const occupations = subset.occ.map(([code, title, description]) => ({ code, title, description, jobZone: zones.get(code) ?? null }));
  const ratings = subset.rat.map(([occupationCode, elementId, scale, value, suppress, notRelevant]) =>
    ({ occupationCode, elementId, scale, value, suppress, notRelevant }));
  const software = subset.sw.map(([occupationCode, example, categoryId, hot, inDemand]) =>
    ({ occupationCode, example, exampleNorm: normalizeExample(example), categoryId, hot, inDemand }));
  const dwas = subset.odwa.map(([occupationCode, dwaId]) => ({ occupationCode, dwaId }));
  const titles = subset.jt.map(([occupationCode, title]) => ({ occupationCode, title, titleNorm: normalizeText(title) }));
  const emerging = subset.em.map(([occupationCode, task, category]) => ({ occupationCode, task, category }));
  const related = subset.rel.map(([occupationCode, relatedCode, tier, rank]) => ({ occupationCode, relatedCode, tier, rank }));
  const counts = { occupations: occupations.length, elements: elements.length, ratings: ratings.length,
    software: software.length, occupationDwas: dwas.length, jobTitles: titles.length,
    emergingTasks: emerging.length, relatedOccupations: related.length };
  const db: OnetLoadStore = store ?? (await import("../db/prisma.js")).prisma;
  return db.$transaction(async tx => {
    // Also serializes skill-link/catalog writers using the established catalog lock.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('skills-catalog'))`;
    await tx.onetRating.deleteMany();
    await tx.onetSoftware.deleteMany();
    await tx.onetOccupationDwa.deleteMany();
    await tx.onetJobTitle.deleteMany();
    await tx.onetEmergingTask.deleteMany();
    await tx.onetRelatedOccupation.deleteMany();
    await tx.onetElement.deleteMany();
    await tx.onetOccupation.deleteMany();
    await batches(occupations, data => tx.onetOccupation.createMany({ data }));
    await batches(elements, data => tx.onetElement.createMany({ data }));
    await batches(ratings, data => tx.onetRating.createMany({ data }));
    await batches(software, data => tx.onetSoftware.createMany({ data }));
    await batches(dwas, data => tx.onetOccupationDwa.createMany({ data }));
    await batches(titles, data => tx.onetJobTitle.createMany({ data }));
    await batches(emerging, data => tx.onetEmergingTask.createMany({ data }));
    await batches(related, data => tx.onetRelatedOccupation.createMany({ data }));
    // Release history remains even though the current reference tables are replaced.
    await tx.onetRelease.updateMany({ where: { active: true }, data: { active: false } });
    const release = { releasedOn: subset.meta.releasedOn, sourceSha256, counts, active: true, loadedAt: new Date() };
    await tx.onetRelease.upsert({ where: { version: subset.meta.version },
      create: { version: subset.meta.version, ...release }, update: release });
    const elementIds = new Set(elements.map(row => row.id));
    const dwaIds = new Set(elements.filter(row => row.domain === "DWA").map(row => row.id));
    const examples = new Set(software.map(row => row.exampleNorm));
    const links = await tx.skillOnetLink.findMany({ select: { id: true, skillId: true, kind: true, ref: true } });
    const danglingLinks = links.filter(link => !(link.kind === "SOFTWARE" ? examples :
      link.kind === "DWA" ? dwaIds : elementIds).has(link.ref));
    return { version: subset.meta.version, sourceSha256, counts, danglingLinks };
  }, { timeout: 300_000, maxWait: 20_000 });
}
