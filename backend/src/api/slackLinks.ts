import { SlackEntityType } from "@prisma/client";
import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import { listBacklinks, unlinkItem } from "../services/slackItemLinkService.js";
import { refreshCardsSoon } from "../services/slackCardService.js";

export const slackLinksRouter = Router();
slackLinksRouter.use(requireAuth);

slackLinksRouter.get("/", async (req: Request, res: Response) => {
  const { entityType, entityId } = req.query;
  if (typeof entityType !== "string" || !Object.values(SlackEntityType).includes(entityType as SlackEntityType)) {
    res.status(400).json({ error: "Invalid entityType" });
    return;
  }
  if (typeof entityId !== "string" || !entityId.trim()) {
    res.status(400).json({ error: "entityId is required" });
    return;
  }
  try {
    res.json(await listBacklinks(req.memberId!, entityType as SlackEntityType, entityId));
  } catch (error) {
    console.error("GET /slack-links error:", error);
    res.status(500).json({ error: "Failed to fetch Slack mentions" });
  }
});

slackLinksRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    // Keep the entity reference before unlinkItem removes the row, so the live
    // context card can remove the corresponding item on its next refresh.
    const link = await prisma.slackItemLink.findUnique({
      where: { id }, select: { entityType: true, entityId: true },
    });
    if (!link) {
      res.status(404).json({ error: "Link not found" });
      return;
    }
    await unlinkItem(id, req.memberId!);
    refreshCardsSoon(link.entityType, link.entityId);
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Only the linker or an admin can unlink this item") {
      res.status(403).json({ error: message });
      return;
    }
    if (message === "Link not found" || (error as { code?: string })?.code === "P2025") {
      res.status(404).json({ error: "Link not found" });
      return;
    }
    console.error("DELETE /slack-links error:", error);
    res.status(500).json({ error: "Failed to unlink Slack mention" });
  }
});
