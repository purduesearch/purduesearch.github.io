import { Router, type Request, type Response } from "express";
import type { DocAccessLevel } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "./auth.js";
import {
  resolveDocAccess, atLeast, docRefToWhere, type DocRef,
} from "../services/docAccessService.js";

export const docAccessRouter = Router();
docAccessRouter.use(requireAuth);

const LEVELS: DocAccessLevel[] = ["VIEW", "COMMENT", "EDIT", "OWNER"];

// Maps the client's docType/docId pair onto a DocRef. Unknown types are
// rejected rather than defaulted, so a typo cannot silently target a post.
function toRef(docType: string, docId: string): DocRef | null {
  if (docType === "BLOG_POST") return { postId: docId };
  if (docType === "PRESS_KIT") return { pressKitId: docId };
  if (docType === "COURSE_SECTION") return { courseSectionId: docId };
  return null;
}

// Everything here requires EDIT on the document; granting OWNER additionally
// requires OWNER, so an editor cannot promote themselves past their grantor.
async function requireSharer(req: Request, res: Response) {
  const ref = toRef(String(req.params.docType), String(req.params.docId));
  if (!ref) { res.status(400).json({ error: "Unknown document type" }); return null; }
  const level = await resolveDocAccess(req.memberId!, ref);
  if (!atLeast(level, "EDIT")) { res.status(403).json({ error: "Forbidden" }); return null; }
  return { ref, level: level! };
}

docAccessRouter.get("/:docType/:docId/access", async (req, res) => {
  const ctx = await requireSharer(req, res);
  if (!ctx) return;
  const where = docRefToWhere(ctx.ref);
  const [grants, share] = await Promise.all([
    prisma.docAccessGrant.findMany({
      where,
      include: { member: { select: { id: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.docShareSettings.findFirst({ where, select: { clubLevel: true } }),
  ]);
  res.json({ grants, clubLevel: share?.clubLevel ?? null, myLevel: ctx.level });
});

docAccessRouter.put("/:docType/:docId/access/:memberId", async (req, res) => {
  const ctx = await requireSharer(req, res);
  if (!ctx) return;
  const level = req.body?.level as DocAccessLevel;
  if (!LEVELS.includes(level)) { res.status(400).json({ error: "Invalid level" }); return; }
  if (level === "OWNER" && ctx.level !== "OWNER") {
    res.status(403).json({ error: "Only an owner can grant ownership" }); return;
  }
  const where = docRefToWhere(ctx.ref);
  const memberId = String(req.params.memberId);
  const existing = await prisma.docAccessGrant.findFirst({ where: { ...where, memberId } });
  const row = existing
    ? await prisma.docAccessGrant.update({ where: { id: existing.id }, data: { level } })
    : await prisma.docAccessGrant.create({
        data: { ...where, memberId, level, grantedById: req.memberId! },
      });
  res.json(row);
});

docAccessRouter.delete("/:docType/:docId/access/:memberId", async (req, res) => {
  const ctx = await requireSharer(req, res);
  if (!ctx) return;
  const where = docRefToWhere(ctx.ref);
  await prisma.docAccessGrant.deleteMany({
    where: { ...where, memberId: String(req.params.memberId) },
  });
  res.json({ ok: true });
});

docAccessRouter.put("/:docType/:docId/club-access", async (req, res) => {
  const ctx = await requireSharer(req, res);
  if (!ctx) return;
  const where = docRefToWhere(ctx.ref);
  const level = req.body?.level as DocAccessLevel | null;

  if (level === null) {
    await prisma.docShareSettings.deleteMany({ where });
    res.json({ clubLevel: null });
    return;
  }
  if (!level || level === "OWNER" || !LEVELS.includes(level)) {
    res.status(400).json({ error: "Club access must be VIEW, COMMENT or EDIT" });
    return;
  }
  const existing = await prisma.docShareSettings.findFirst({ where });
  const row = existing
    ? await prisma.docShareSettings.update({
        where: { id: existing.id }, data: { clubLevel: level, setById: req.memberId! },
      })
    : await prisma.docShareSettings.create({
        data: { ...where, clubLevel: level, setById: req.memberId! },
      });
  res.json({ clubLevel: row.clubLevel });
});
