import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";

export const assetsRouter = Router();
assetsRouter.use(requireAuth);

// ── GET /assets ───────────────────────────────────────────────

assetsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const { kind, tag, q } = req.query;

    const where: Record<string, unknown> = {};
    if (kind && typeof kind === "string") where.kind = kind;
    if (tag && typeof tag === "string") {
      where.tags = { has: tag };
    }
    if (q && typeof q === "string") {
      where.name = { contains: q, mode: "insensitive" };
    }

    const assets = await prisma.outreachAsset.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        uploadedBy: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });
    res.json(assets);
  } catch (error) {
    console.error("GET /assets error:", error);
    res.status(500).json({ error: "Failed to list assets" });
  }
});

// ── GET /assets/:id ───────────────────────────────────────────

assetsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const asset = await prisma.outreachAsset.findUnique({
      where: { id: req.params.id as string },
      include: {
        uploadedBy: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });
    if (!asset) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }
    res.json(asset);
  } catch (error) {
    console.error("GET /assets/:id error:", error);
    res.status(500).json({ error: "Failed to get asset" });
  }
});

// ── POST /assets ──────────────────────────────────────────────

assetsRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { name, kind, url, driveFileId, thumbnailUrl, altText, tags } = req.body as {
      name: string;
      kind: string;
      url: string;
      driveFileId?: string;
      thumbnailUrl?: string;
      altText?: string;
      tags?: string[];
    };

    if (!name?.trim() || !kind || !url?.trim()) {
      res.status(400).json({ error: "name, kind, and url are required" });
      return;
    }

    const asset = await prisma.outreachAsset.create({
      data: {
        name: name.trim(),
        kind,
        url: url.trim(),
        driveFileId: driveFileId ?? null,
        thumbnailUrl: thumbnailUrl ?? null,
        altText: altText ?? null,
        tags: tags ?? [],
        uploadedById: req.session.memberId!,
      },
      include: {
        uploadedBy: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });
    res.status(201).json(asset);
  } catch (error) {
    console.error("POST /assets error:", error);
    res.status(500).json({ error: "Failed to create asset" });
  }
});

// ── PATCH /assets/:id ─────────────────────────────────────────

assetsRouter.patch("/:id", async (req: Request, res: Response) => {
  try {
    const asset = await prisma.outreachAsset.findUnique({ where: { id: req.params.id as string } });
    if (!asset) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }

    // Author or admin
    if (asset.uploadedById !== req.session.memberId) {
      const member = await prisma.member.findUnique({
        where: { id: req.session.memberId },
        select: { isAdmin: true },
      });
      if (!member?.isAdmin) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const { name, altText, tags } = req.body as {
      name?: string;
      altText?: string;
      tags?: string[];
    };

    const updated = await prisma.outreachAsset.update({
      where: { id: req.params.id as string },
      data: {
        ...(name != null ? { name: name.trim() } : {}),
        ...(altText != null ? { altText } : {}),
        ...(tags != null ? { tags } : {}),
      },
      include: {
        uploadedBy: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });
    res.json(updated);
  } catch (error) {
    console.error("PATCH /assets/:id error:", error);
    res.status(500).json({ error: "Failed to update asset" });
  }
});

// ── DELETE /assets/:id ────────────────────────────────────────

assetsRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const asset = await prisma.outreachAsset.findUnique({ where: { id: req.params.id as string } });
    if (!asset) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }

    if (asset.uploadedById !== req.session.memberId) {
      const member = await prisma.member.findUnique({
        where: { id: req.session.memberId },
        select: { isAdmin: true },
      });
      if (!member?.isAdmin) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    await prisma.outreachAsset.delete({ where: { id: req.params.id as string } });
    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /assets/:id error:", error);
    res.status(500).json({ error: "Failed to delete asset" });
  }
});
