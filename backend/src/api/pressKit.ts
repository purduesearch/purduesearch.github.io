import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import {
  DEFAULT_PRESS_KIT_CONFIG, normalizePressKitConfig, generatePressKitContent,
  renderPressKitInnerHtml, ensurePressKitToken,
} from "../services/pressKitService.js";
import type { PMDoc } from "../services/blogRender.js";
import type { Prisma } from "@prisma/client";

export const pressKitRouter = Router();
pressKitRouter.use(requireAuth);

// Project access: member of the project, or admin. Leads implicitly satisfy membership.
async function hasProjectAccess(memberId: string, projectId: string): Promise<boolean> {
  const [membership, me] = await Promise.all([
    prisma.projectMember.findUnique({ where: { projectId_memberId: { projectId, memberId } }, select: { memberId: true } }),
    prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } }),
  ]);
  return !!membership || !!me?.isAdmin;
}

async function getOrCreateKit(projectId: string, memberId: string) {
  return prisma.projectPressKit.upsert({
    where: { projectId },
    update: {},
    create: { projectId, createdById: memberId, config: DEFAULT_PRESS_KIT_CONFIG as unknown as Prisma.InputJsonValue },
  });
}

// GET /api/projects/:projectId/press-kit — fetch (lazily create) the kit
pressKitRouter.get("/projects/:projectId/press-kit", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params as { projectId: string };
    if (!(await hasProjectAccess(req.memberId!, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const kit = await getOrCreateKit(projectId, req.memberId!);
    const token = await ensurePressKitToken(projectId);
    res.json({
      id: kit.id, projectId, status: kit.status, config: normalizePressKitConfig(kit.config),
      contentJson: kit.contentJson, generatedAt: kit.generatedAt, token,
    });
  } catch (e) { console.error("GET press-kit error:", e); res.status(500).json({ error: "Failed to load press kit" }); }
});

// POST /api/projects/:projectId/press-kit/generate — snapshot-then-replace
pressKitRouter.post("/projects/:projectId/press-kit/generate", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params as { projectId: string };
    if (!(await hasProjectAccess(req.memberId!, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const kit = await getOrCreateKit(projectId, req.memberId!);
    const config = normalizePressKitConfig({ ...normalizePressKitConfig(kit.config), ...(req.body ?? {}) });

    const doc = await generatePressKitContent(projectId, config);
    if (!doc) { res.status(404).json({ error: "Project not found" }); return; }

    // Snapshot the prior doc before overwriting (only after we know we have a new one).
    if (kit.contentJson) {
      await prisma.pressKitRevision.create({
        data: { pressKitId: kit.id, contentJson: kit.contentJson as Prisma.InputJsonValue, authorId: req.memberId! },
      });
    }

    const updated = await prisma.projectPressKit.update({
      where: { id: kit.id },
      data: {
        contentJson: doc as unknown as Prisma.InputJsonValue,
        contentYjs: null,               // force collab to re-seed from the new contentJson
        config: config as unknown as Prisma.InputJsonValue,
        generatedAt: new Date(),
        status: "DRAFT",
      },
    });
    res.json({ id: updated.id, config, contentJson: updated.contentJson, generatedAt: updated.generatedAt, status: updated.status });
  } catch (e) { console.error("POST press-kit/generate error:", e); res.status(500).json({ error: "Failed to generate press kit" }); }
});

// PATCH /api/projects/:projectId/press-kit — update config only
pressKitRouter.patch("/projects/:projectId/press-kit", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params as { projectId: string };
    if (!(await hasProjectAccess(req.memberId!, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const kit = await getOrCreateKit(projectId, req.memberId!);
    const config = normalizePressKitConfig({ ...normalizePressKitConfig(kit.config), ...(req.body ?? {}) });
    await prisma.projectPressKit.update({ where: { id: kit.id }, data: { config: config as unknown as Prisma.InputJsonValue } });
    res.json({ config });
  } catch (e) { console.error("PATCH press-kit error:", e); res.status(500).json({ error: "Failed to update press kit" }); }
});

// PATCH /api/projects/:projectId/press-kit/content — save edited body.
// REST fallback for persistence when the realtime collab server is unreachable
// (WS blocked / proxy misconfigured). Writes contentJson only — never
// contentYjs — so it can't corrupt a live CRDT, and onLoadDocument prefers
// contentYjs when present, keeping collab authoritative whenever it is up.
pressKitRouter.patch("/projects/:projectId/press-kit/content", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params as { projectId: string };
    if (!(await hasProjectAccess(req.memberId!, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const contentJson = (req.body ?? {}).contentJson;
    if (!contentJson || typeof contentJson !== "object") { res.status(400).json({ error: "contentJson (object) required" }); return; }
    const kit = await getOrCreateKit(projectId, req.memberId!);
    await prisma.projectPressKit.update({
      where: { id: kit.id },
      data: { contentJson: contentJson as Prisma.InputJsonValue },
    });
    res.json({ ok: true });
  } catch (e) { console.error("PATCH press-kit/content error:", e); res.status(500).json({ error: "Failed to save press kit" }); }
});

// POST /api/projects/:projectId/press-kit/publish — snapshot rendered HTML, mark PUBLISHED
pressKitRouter.post("/projects/:projectId/press-kit/publish", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params as { projectId: string };
    if (!(await hasProjectAccess(req.memberId!, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const kit = await prisma.projectPressKit.findUnique({ where: { projectId } });
    if (!kit || !kit.contentJson) { res.status(400).json({ error: "Nothing to publish — generate first" }); return; }
    const html = renderPressKitInnerHtml(kit.contentJson as unknown as PMDoc);
    await prisma.projectPressKit.update({ where: { id: kit.id }, data: { renderedHtml: html, status: "PUBLISHED" } });
    const token = await ensurePressKitToken(projectId);
    const url = `${req.protocol}://${req.get("host")}/api/public/press-kit/${projectId}/${token}`;
    res.json({ status: "PUBLISHED", token, url });
  } catch (e) { console.error("POST press-kit/publish error:", e); res.status(500).json({ error: "Failed to publish press kit" }); }
});

// GET revisions
pressKitRouter.get("/projects/:projectId/press-kit/revisions", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params as { projectId: string };
    if (!(await hasProjectAccess(req.memberId!, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const kit = await prisma.projectPressKit.findUnique({ where: { projectId }, select: { id: true } });
    if (!kit) { res.json([]); return; }
    const revs = await prisma.pressKitRevision.findMany({
      where: { pressKitId: kit.id }, orderBy: { createdAt: "desc" }, take: 30,
      include: { author: { select: { displayName: true } } },
    });
    res.json(revs.map((r) => ({ id: r.id, createdAt: r.createdAt, author: r.author.displayName })));
  } catch (e) { console.error("GET press-kit/revisions error:", e); res.status(500).json({ error: "Failed to load revisions" }); }
});

// POST restore a revision (snapshots current first)
pressKitRouter.post("/projects/:projectId/press-kit/revisions/:revId/restore", async (req: Request, res: Response) => {
  try {
    const { projectId, revId } = req.params as { projectId: string; revId: string };
    if (!(await hasProjectAccess(req.memberId!, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const kit = await prisma.projectPressKit.findUnique({ where: { projectId } });
    const rev = await prisma.pressKitRevision.findUnique({ where: { id: revId } });
    if (!kit || !rev || rev.pressKitId !== kit.id) { res.status(404).json({ error: "Revision not found" }); return; }
    if (kit.contentJson) {
      await prisma.pressKitRevision.create({
        data: { pressKitId: kit.id, contentJson: kit.contentJson as Prisma.InputJsonValue, authorId: req.memberId! },
      });
    }
    const updated = await prisma.projectPressKit.update({
      where: { id: kit.id },
      data: { contentJson: rev.contentJson as Prisma.InputJsonValue, contentYjs: null, status: "DRAFT" },
    });
    res.json({ contentJson: updated.contentJson });
  } catch (e) { console.error("POST press-kit restore error:", e); res.status(500).json({ error: "Failed to restore revision" }); }
});
