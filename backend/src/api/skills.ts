// Member skills API (/api/skills) and the unauthenticated portfolio (/api/public/portfolio).
// Members only ever read and write their own rows; identity is req.memberId.

import { Router, type Request, type Response } from "express";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "./auth.js";
import {
  addManualEvidence, createDispute, endorsePeer, getMemberProfileSkills, getMyEvidence, getMySkills, getPublicPortfolio, removePeerEndorsement, removeSelfClaim,
  setPortfolio, setProjectVisibility, setSelfClaim, setSkillVisibility,
} from "../services/skillMemberService.js";
import { TaxonomyError } from "../services/skillTaxonomyService.js";

export const skillsRouter = Router();
export const publicPortfolioRouter = Router();

const STATUS: Record<TaxonomyError["code"], number> = { INVALID: 400, NOT_FOUND: 404, ALIAS_TAKEN: 409, CYCLE: 409, CONFLICT: 409, NOT_PENDING: 409, FORBIDDEN: 403 };

/** Known errors become 4xx with their message; anything else is logged and returned as an opaque 500. */
export function sendSkillError(res: Response, err: unknown): void {
  if (err instanceof TaxonomyError) { res.status(STATUS[err.code]).json({ error: err.message, code: err.code }); return; }
  console.error("[skills] request failed:", err);
  res.status(500).json({ error: "Something went wrong" });
}

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response) => { fn(req, res).catch((e) => sendSkillError(res, e)); };

// Small per-member throttle on writes so the tables cannot be spammed.
const writes = new Map<string, number[]>();
function throttled(req: Request, res: Response, next: () => void): void {
  const id = req.memberId!;
  const now = Date.now();
  const recent = (writes.get(id) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 30) { res.status(429).json({ error: "Too many changes; try again in a minute" }); return; }
  recent.push(now); writes.set(id, recent);
  next();
}

skillsRouter.use(requireAuth);

skillsRouter.get("/taxonomy", wrap(async (_req, res) => {
  const skills = await prisma.skill.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true, type: true, aliases: { select: { alias: true } } } });
  res.json({ skills: skills.map((s) => ({ id: s.id, name: s.name, type: s.type, aliases: s.aliases.map((a) => a.alias) })) });
}));

skillsRouter.get("/me", wrap(async (req, res) => { res.json(await getMySkills(req.memberId!)); }));
skillsRouter.get("/me/:skillId/evidence", wrap(async (req, res) => { res.json({ evidence: await getMyEvidence(req.memberId!, String(req.params.skillId)) }); }));

skillsRouter.put("/me/claims/:skillId", throttled, wrap(async (req, res) => {
  await setSelfClaim(req.memberId!, { skillId: req.params.skillId, level: req.body?.level, note: req.body?.note });
  res.json({ ok: true });
}));
skillsRouter.delete("/me/claims/:skillId", throttled, wrap(async (req, res) => { await removeSelfClaim(req.memberId!, String(req.params.skillId)); res.json({ ok: true }); }));

skillsRouter.post("/me/disputes", throttled, wrap(async (req, res) => { res.status(201).json(await createDispute(req.memberId!, req.body ?? {})); }));

skillsRouter.put("/me/visibility/skills/:skillId", throttled, wrap(async (req, res) => { await setSkillVisibility(req.memberId!, String(req.params.skillId), req.body?.isPublic); res.json({ ok: true }); }));
skillsRouter.put("/me/visibility/projects/:projectId", throttled, wrap(async (req, res) => { await setProjectVisibility(req.memberId!, String(req.params.projectId), req.body?.isPublic); res.json({ ok: true }); }));
skillsRouter.put("/me/portfolio", throttled, wrap(async (req, res) => { res.json(await setPortfolio(req.memberId!, req.body ?? {})); }));

skillsRouter.post("/me/evidence", throttled, wrap(async (req, res) => { res.status(201).json(await addManualEvidence(req.memberId!, req.memberId!, req.body ?? {})); }));

/** Another member's skills as teammates see them (profile page). Hidden/disputed skills and other projects' work are left out. */
skillsRouter.get("/members/:memberId", wrap(async (req, res) => {
  const viewer = await prisma.member.findUnique({ where: { id: req.memberId! }, select: { id: true, isAdmin: true, role: true } });
  if (!viewer) throw new TaxonomyError("FORBIDDEN", "Not signed in");
  res.json(await getMemberProfileSkills({ id: viewer.id, isAdmin: viewer.isAdmin || viewer.role === "ADMIN" }, String(req.params.memberId)));
}));

skillsRouter.post("/endorse", throttled, wrap(async (req, res) => { await endorsePeer(req.memberId!, req.body ?? {}); res.json({ ok: true }); }));
skillsRouter.delete("/endorse/:memberId/:skillId", throttled, wrap(async (req, res) => { await removePeerEndorsement(req.memberId!, String(req.params.memberId), String(req.params.skillId)); res.json({ ok: true }); }));

// ── Public portfolio: no auth, answers 404 for anything not explicitly enabled ──

publicPortfolioRouter.get("/:slug", wrap(async (req, res) => {
  const portfolio = await getPublicPortfolio(String(req.params.slug));
  if (!portfolio) { res.status(404).json({ error: "Not found" }); return; }
  res.setHeader("Cache-Control", "public, max-age=300");
  res.setHeader("X-Robots-Tag", "noindex");
  res.json(portfolio);
}));
