import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";

export const brandVoicesRouter = Router();
brandVoicesRouter.use(requireAuth);

// ── GET /brand-voices ─────────────────────────────────────────

brandVoicesRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const voices = await prisma.brandVoice.findMany({ orderBy: { name: "asc" } });
    res.json(voices);
  } catch (error) {
    console.error("GET /brand-voices error:", error);
    res.status(500).json({ error: "Failed to list brand voices" });
  }
});

// ── POST /brand-voices ────────────────────────────────────────

brandVoicesRouter.post("/", async (req: Request, res: Response) => {
  try {
    const member = await prisma.member.findUnique({
      where: { id: req.session.memberId },
      select: { isAdmin: true },
    });
    if (!member?.isAdmin) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { name, description, examples, isDefault } = req.body as {
      name: string;
      description: string;
      examples?: string[];
      isDefault?: boolean;
    };

    if (!name?.trim() || !description?.trim()) {
      res.status(400).json({ error: "name and description are required" });
      return;
    }

    if (isDefault) {
      await prisma.brandVoice.updateMany({ data: { isDefault: false } });
    }

    const voice = await prisma.brandVoice.create({
      data: {
        name: name.trim(),
        description: description.trim(),
        examples: examples ?? [],
        isDefault: isDefault ?? false,
      },
    });
    res.status(201).json(voice);
  } catch (error) {
    console.error("POST /brand-voices error:", error);
    res.status(500).json({ error: "Failed to create brand voice" });
  }
});

// ── PATCH /brand-voices/:id ───────────────────────────────────

brandVoicesRouter.patch("/:id", async (req: Request, res: Response) => {
  try {
    const member = await prisma.member.findUnique({
      where: { id: req.session.memberId },
      select: { isAdmin: true },
    });
    if (!member?.isAdmin) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const voice = await prisma.brandVoice.findUnique({ where: { id: req.params.id as string } });
    if (!voice) {
      res.status(404).json({ error: "Brand voice not found" });
      return;
    }

    const { name, description, examples, isDefault } = req.body as {
      name?: string;
      description?: string;
      examples?: string[];
      isDefault?: boolean;
    };

    if (isDefault) {
      await prisma.brandVoice.updateMany({ data: { isDefault: false } });
    }

    const updated = await prisma.brandVoice.update({
      where: { id: req.params.id as string },
      data: {
        ...(name != null ? { name: name.trim() } : {}),
        ...(description != null ? { description: description.trim() } : {}),
        ...(examples != null ? { examples } : {}),
        ...(isDefault != null ? { isDefault } : {}),
      },
    });
    res.json(updated);
  } catch (error) {
    console.error("PATCH /brand-voices/:id error:", error);
    res.status(500).json({ error: "Failed to update brand voice" });
  }
});

// ── DELETE /brand-voices/:id ──────────────────────────────────

brandVoicesRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const member = await prisma.member.findUnique({
      where: { id: req.session.memberId },
      select: { isAdmin: true },
    });
    if (!member?.isAdmin) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const voice = await prisma.brandVoice.findUnique({ where: { id: req.params.id as string } });
    if (!voice) {
      res.status(404).json({ error: "Brand voice not found" });
      return;
    }

    await prisma.brandVoice.delete({ where: { id: req.params.id as string } });
    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /brand-voices/:id error:", error);
    res.status(500).json({ error: "Failed to delete brand voice" });
  }
});
