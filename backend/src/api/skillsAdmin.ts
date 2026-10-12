// Admin skills API (/api/admin/skills): staffing search, review queues, taxonomy, run control.
// All routes require an admin. Results are advisory and carry the evidence behind them.

import { Router, type Request, type Response } from "express";
import { prisma } from "../db/prisma.js";
import { requireAdmin, requireAuth } from "./auth.js";
import { sendSkillError } from "./skills.js";
import {
  addAlias, addEdge, createSkill, getPerson, listDisagreements, listDisputes, listRuns, listTaxonomy, patchSkill, recomputeEverything,
  removeAlias, removeEdge, resolveDispute, runStatusPanel, searchPeople, ADVISORY,
} from "../services/skillAdminService.js";
import { addManualEvidence, endorseAsManager } from "../services/skillMemberService.js";
import { approveProposal, listProposals, loadAliasIndex, mergeProposal, rejectProposal, TaxonomyError } from "../services/skillTaxonomyService.js";
import { resolveSkillName } from "../services/skillMatchCore.js";
import { runWeeklySkillRun } from "../services/skillPipelineService.js";
import { askSkills, embedMissingEvidence } from "../services/skillSearchService.js";
import { aiRateLimit } from "../middleware/aiRateLimit.js";
import type { Band, Provenance } from "../services/skillViewCore.js";

export const skillsAdminRouter = Router();
skillsAdminRouter.use(requireAuth, requireAdmin);

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response) => { fn(req, res).catch((e) => sendSkillError(res, e)); };
const one = (v: unknown) => (Array.isArray(v) ? String(v[0]) : typeof v === "string" ? v : undefined);
const num = (v: unknown, name: string): number | undefined => {
  const s = one(v);
  if (s === undefined || s === "") return undefined;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new TaxonomyError("INVALID", `${name} must be a number`);
  return n;
};
const SKILL_TYPES = ["TOOL", "TECHNIQUE", "DOMAIN", "SOFT_SKILL"];

skillsAdminRouter.get("/status", wrap(async (_req, res) => { res.json(await runStatusPanel()); }));
skillsAdminRouter.get("/runs", wrap(async (req, res) => { res.json({ runs: await listRuns(num(req.query.limit, "limit") ?? 20) }); }));

/** Start a run. A dry run answers inline with the estimate; a real run starts in the background (202). */
skillsAdminRouter.post("/runs", wrap(async (req, res) => {
  const memberId = typeof req.body?.memberId === "string" ? req.body.memberId : undefined;
  const sinceDays = req.body?.sinceDays === undefined ? undefined : Number(req.body.sinceDays);
  if (sinceDays !== undefined && !(sinceDays >= 1 && sinceDays <= 730)) throw new TaxonomyError("INVALID", "sinceDays must be 1-730");
  if (memberId && !await prisma.member.findFirst({ where: { id: memberId, isBot: false }, select: { id: true } })) throw new TaxonomyError("NOT_FOUND", "Member not found");
  const opts = {
    trigger: "MANUAL" as const, memberIds: memberId ? [memberId] : undefined, startedById: req.memberId,
    since: sinceDays ? new Date(Date.now() - sinceDays * 86_400_000) : undefined, dryRun: req.body?.dryRun === true,
  };
  if (!opts.dryRun) {
    if (!process.env.GEMINI_API_KEY) { res.status(503).json({ error: "GEMINI_API_KEY is not configured on the server" }); return; }
    if (await prisma.skillRun.findFirst({ where: { status: "RUNNING", leaseUntil: { gt: new Date() } }, select: { id: true } })) { res.status(409).json({ error: "A skills run is already in progress" }); return; }
    runWeeklySkillRun(opts).then((s) => console.log("[skills] manual run", s.status, JSON.stringify(s.counts))).catch((e) => console.error("[skills] manual run failed:", e));
    res.status(202).json({ started: true, scope: memberId ? "one member" : "everyone", message: "Run started; watch the status panel." });
    return;
  }
  res.json(await runWeeklySkillRun(opts));
}));

skillsAdminRouter.post("/recompute", wrap(async (_req, res) => { res.json(await recomputeEverything()); }));

// ── Search ───────────────────────────────────────────────────

/** ?skill=PCB design,CAD: ids, slugs or names/aliases, comma separated. */
async function resolveSkillQuery(raw: string): Promise<string[]> {
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const index = await loadAliasIndex();
  const ids: string[] = [], unknown: string[] = [];
  for (const p of parts) {
    const direct = await prisma.skill.findFirst({ where: { OR: [{ id: p }, { slug: p.toLowerCase() }] }, select: { id: true } });
    const id = direct?.id ?? resolveSkillName(p, index);
    if (id) ids.push(id); else unknown.push(p);
  }
  if (unknown.length) throw new TaxonomyError("NOT_FOUND", `Unknown skill: ${unknown.join(", ")}`);
  return ids;
}

skillsAdminRouter.get("/search", wrap(async (req, res) => {
  const skill = one(req.query.skill);
  if (!skill) throw new TaxonomyError("INVALID", "skill is required");
  const band = one(req.query.minConfidence);
  if (band && !["LOW", "MEDIUM", "HIGH"].includes(band)) throw new TaxonomyError("INVALID", "minConfidence must be LOW, MEDIUM or HIGH");
  const prov = one(req.query.provenance)?.split(",").filter(Boolean) ?? [];
  if (prov.some((p) => !["AI_INFERRED", "SELF_CLAIMED", "PEER_ENDORSED", "MANAGER_VERIFIED"].includes(p))) throw new TaxonomyError("INVALID", "bad provenance");
  res.json(await searchPeople({
    skillIds: await resolveSkillQuery(skill), includeChildren: one(req.query.children) !== "0", minLevel: num(req.query.minLevel, "minLevel"),
    activeWithinDays: num(req.query.activeWithinDays, "activeWithinDays"), minConfidence: band as Band | undefined, provenances: prov as Provenance[], limit: num(req.query.limit, "limit"),
  }));
}));

/** Natural-language staffing question: structured filters + embedding search, answered with cited evidence. */
skillsAdminRouter.post("/ask", aiRateLimit, wrap(async (req, res) => {
  const projectId = typeof req.body?.projectId === "string" ? req.body.projectId : null;
  res.json(await askSkills({ question: String(req.body?.question ?? ""), asker: { id: req.memberId!, isAdmin: true }, projectId }));
}));
skillsAdminRouter.post("/embed-missing", wrap(async (_req, res) => { res.json(await embedMissingEvidence()); }));

skillsAdminRouter.get("/people/:memberId", wrap(async (req, res) => { res.json(await getPerson(String(req.params.memberId))); }));
skillsAdminRouter.get("/disagreements", wrap(async (_req, res) => { res.json({ advisory: ADVISORY, items: await listDisagreements() }); }));
skillsAdminRouter.post("/endorse", wrap(async (req, res) => { await endorseAsManager(req.memberId!, req.body ?? {}); res.json({ ok: true }); }));
skillsAdminRouter.post("/people/:memberId/evidence", wrap(async (req, res) => { res.status(201).json(await addManualEvidence(String(req.params.memberId), req.memberId!, req.body ?? {})); }));

// ── Review queues ────────────────────────────────────────────

skillsAdminRouter.get("/disputes", wrap(async (req, res) => {
  const status = (one(req.query.status) ?? "OPEN").toUpperCase();
  if (!["OPEN", "UPHELD", "DISMISSED"].includes(status)) throw new TaxonomyError("INVALID", "bad status");
  res.json({ disputes: await listDisputes(status as "OPEN" | "UPHELD" | "DISMISSED") });
}));
skillsAdminRouter.post("/disputes/:id/resolve", wrap(async (req, res) => {
  const decision = req.body?.decision;
  if (decision !== "UPHELD" && decision !== "DISMISSED") throw new TaxonomyError("INVALID", "decision must be UPHELD or DISMISSED");
  await resolveDispute(String(req.params.id), req.memberId!, decision, typeof req.body?.resolution === "string" ? req.body.resolution : null);
  res.json({ ok: true });
}));

skillsAdminRouter.get("/proposals", wrap(async (req, res) => {
  const status = (one(req.query.status) ?? "PENDING").toUpperCase();
  if (!["PENDING", "APPROVED", "REJECTED", "MERGED"].includes(status)) throw new TaxonomyError("INVALID", "bad status");
  res.json({ proposals: await listProposals(status as "PENDING") });
}));
skillsAdminRouter.post("/proposals/:id/approve", wrap(async (req, res) => {
  const b = req.body ?? {};
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined);
  res.json(await approveProposal(String(req.params.id), req.memberId!, {
    name: typeof b.name === "string" ? b.name : undefined,
    type: SKILL_TYPES.includes(b.type) ? b.type : undefined,
    parentIds: strings(b.parentIds), aliases: strings(b.aliases),
  }));
}));
skillsAdminRouter.post("/proposals/:id/reject", wrap(async (req, res) => { await rejectProposal(String(req.params.id), req.memberId!); res.json({ ok: true }); }));
skillsAdminRouter.post("/proposals/:id/merge", wrap(async (req, res) => {
  if (typeof req.body?.skillId !== "string") throw new TaxonomyError("INVALID", "skillId is required");
  await mergeProposal(String(req.params.id), req.body.skillId, req.memberId!);
  res.json({ ok: true });
}));

// ── Taxonomy ─────────────────────────────────────────────────

skillsAdminRouter.get("/taxonomy", wrap(async (_req, res) => { res.json({ skills: await listTaxonomy() }); }));
skillsAdminRouter.post("/taxonomy", wrap(async (req, res) => {
  const b = req.body ?? {};
  if (!SKILL_TYPES.includes(b.type)) throw new TaxonomyError("INVALID", "bad type");
  res.status(201).json(await createSkill({
    name: String(b.name ?? ""), type: b.type, description: typeof b.description === "string" ? b.description : null,
    aliases: Array.isArray(b.aliases) ? b.aliases.map(String) : [], parentIds: Array.isArray(b.parentIds) ? b.parentIds.map(String) : [],
  }));
}));
skillsAdminRouter.patch("/taxonomy/:id", wrap(async (req, res) => { await patchSkill(String(req.params.id), req.body ?? {}); res.json({ ok: true }); }));
skillsAdminRouter.post("/taxonomy/:id/aliases", wrap(async (req, res) => { await addAlias(String(req.params.id), String(req.body?.alias ?? "")); res.status(201).json({ ok: true }); }));
skillsAdminRouter.delete("/aliases/:id", wrap(async (req, res) => { await removeAlias(String(req.params.id)); res.json({ ok: true }); }));
skillsAdminRouter.post("/taxonomy/:id/edges", wrap(async (req, res) => {
  const kind = req.body?.kind;
  if (!["PARENT", "RELATED", "PREREQUISITE"].includes(kind) || typeof req.body?.toId !== "string") throw new TaxonomyError("INVALID", "toId and kind (PARENT, RELATED, PREREQUISITE) are required");
  await addEdge(String(req.params.id), req.body.toId, kind);
  res.status(201).json({ ok: true });
}));
skillsAdminRouter.delete("/edges/:id", wrap(async (req, res) => { await removeEdge(String(req.params.id)); res.json({ ok: true }); }));
