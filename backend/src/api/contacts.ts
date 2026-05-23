import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import * as aiOutreachService from "../services/aiOutreachService.js";

export const contactsRouter = Router();
contactsRouter.use(requireAuth);

const CONTACT_INCLUDE = {
  owner: { select: { id: true, displayName: true, avatarUrl: true } },
  campaign: { select: { id: true, name: true, color: true } },
  _count: { select: { interactions: true } },
} as const;

// ── GET /contacts ─────────────────────────────────────────────

contactsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const { type, stage, campaign, q } = req.query as Record<string, string | undefined>;

    const where: Record<string, unknown> = {};
    if (type)     where.contactType = type;
    if (stage)    where.stage = stage;
    if (campaign) where.campaignId = campaign;
    if (q) {
      where.OR = [
        { name:         { contains: q, mode: "insensitive" } },
        { organization: { contains: q, mode: "insensitive" } },
        { email:        { contains: q, mode: "insensitive" } },
      ];
    }

    const contacts = await prisma.outreachContact.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: CONTACT_INCLUDE,
    });
    res.json(contacts);
  } catch (error) {
    console.error("GET /contacts error:", error);
    res.status(500).json({ error: "Failed to list contacts" });
  }
});

// ── GET /contacts/:id ─────────────────────────────────────────

contactsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const contact = await prisma.outreachContact.findUnique({
      where: { id: req.params.id as string },
      include: {
        ...CONTACT_INCLUDE,
        interactions: {
          orderBy: { occurredAt: "desc" },
          include: { member: { select: { id: true, displayName: true, avatarUrl: true } } },
        },
      },
    });
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    res.json(contact);
  } catch (error) {
    console.error("GET /contacts/:id error:", error);
    res.status(500).json({ error: "Failed to get contact" });
  }
});

// ── POST /contacts ────────────────────────────────────────────

contactsRouter.post("/", async (req: Request, res: Response) => {
  try {
    const {
      name, email, phone, organization, role,
      contactType, stage, tags, notes, nextFollowUpAt, campaignId,
    } = req.body as {
      name: string;
      email?: string;
      phone?: string;
      organization?: string;
      role?: string;
      contactType: string;
      stage?: string;
      tags?: string[];
      notes?: string;
      nextFollowUpAt?: string | null;
      campaignId?: string | null;
    };

    if (!name?.trim() || !contactType) {
      res.status(400).json({ error: "name and contactType are required" });
      return;
    }

    const contact = await prisma.outreachContact.create({
      data: {
        name: name.trim(),
        email:        email?.trim()        ?? null,
        phone:        phone?.trim()        ?? null,
        organization: organization?.trim() ?? null,
        role:         role?.trim()         ?? null,
        contactType,
        stage:        stage ?? "COLD",
        tags:         Array.isArray(tags) ? tags : [],
        notes:        notes?.trim() ?? null,
        nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : null,
        campaignId:   campaignId ?? null,
        ownerId:      req.session.memberId!,
      },
      include: CONTACT_INCLUDE,
    });
    res.status(201).json(contact);
  } catch (error) {
    console.error("POST /contacts error:", error);
    res.status(500).json({ error: "Failed to create contact" });
  }
});

// ── PATCH /contacts/:id ───────────────────────────────────────

contactsRouter.patch("/:id", async (req: Request, res: Response) => {
  try {
    const contact = await prisma.outreachContact.findUnique({
      where: { id: req.params.id as string },
    });
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    // Owner or admin
    if (contact.ownerId !== req.session.memberId) {
      const member = await prisma.member.findUnique({
        where: { id: req.session.memberId },
        select: { isAdmin: true },
      });
      if (!member?.isAdmin) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const {
      name, email, phone, organization, role,
      contactType, stage, tags, notes,
      nextFollowUpAt, lastContactedAt, campaignId,
    } = req.body as {
      name?: string;
      email?: string | null;
      phone?: string | null;
      organization?: string | null;
      role?: string | null;
      contactType?: string;
      stage?: string;
      tags?: string[];
      notes?: string | null;
      nextFollowUpAt?: string | null;
      lastContactedAt?: string | null;
      campaignId?: string | null;
    };

    const updated = await prisma.outreachContact.update({
      where: { id: req.params.id as string },
      data: {
        ...(name        != null ? { name: name.trim() }               : {}),
        ...(email       !== undefined ? { email }                      : {}),
        ...(phone       !== undefined ? { phone }                      : {}),
        ...(organization !== undefined ? { organization }              : {}),
        ...(role        !== undefined ? { role }                       : {}),
        ...(contactType != null ? { contactType }                      : {}),
        ...(stage       != null ? { stage }                            : {}),
        ...(tags        != null ? { tags }                             : {}),
        ...(notes       !== undefined ? { notes }                      : {}),
        ...(nextFollowUpAt  !== undefined ? { nextFollowUpAt:  nextFollowUpAt  ? new Date(nextFollowUpAt)  : null } : {}),
        ...(lastContactedAt !== undefined ? { lastContactedAt: lastContactedAt ? new Date(lastContactedAt) : null } : {}),
        ...(campaignId  !== undefined ? { campaignId }                 : {}),
      },
      include: CONTACT_INCLUDE,
    });
    res.json(updated);
  } catch (error) {
    console.error("PATCH /contacts/:id error:", error);
    res.status(500).json({ error: "Failed to update contact" });
  }
});

// ── DELETE /contacts/:id ──────────────────────────────────────

contactsRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const contact = await prisma.outreachContact.findUnique({
      where: { id: req.params.id as string },
    });
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    if (contact.ownerId !== req.session.memberId) {
      const member = await prisma.member.findUnique({
        where: { id: req.session.memberId },
        select: { isAdmin: true },
      });
      if (!member?.isAdmin) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    await prisma.outreachContact.delete({ where: { id: req.params.id as string } });
    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /contacts/:id error:", error);
    res.status(500).json({ error: "Failed to delete contact" });
  }
});

// ── POST /contacts/:id/interactions ──────────────────────────

contactsRouter.post("/:id/interactions", async (req: Request, res: Response) => {
  try {
    const contact = await prisma.outreachContact.findUnique({
      where: { id: req.params.id as string },
    });
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    const { type, summary, occurredAt } = req.body as {
      type: string;
      summary: string;
      occurredAt?: string;
    };

    if (!type || !summary?.trim()) {
      res.status(400).json({ error: "type and summary are required" });
      return;
    }

    const interaction = await prisma.contactInteraction.create({
      data: {
        contactId:  req.params.id as string,
        type,
        summary:    summary.trim(),
        occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
        memberId:   req.session.memberId!,
      },
      include: {
        member: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    // Update lastContactedAt on the contact
    await prisma.outreachContact.update({
      where: { id: req.params.id as string },
      data:  { lastContactedAt: interaction.occurredAt },
    });

    res.status(201).json(interaction);
  } catch (error) {
    console.error("POST /contacts/:id/interactions error:", error);
    res.status(500).json({ error: "Failed to log interaction" });
  }
});

// ── DELETE /contacts/:id/interactions/:iid ────────────────────

contactsRouter.delete("/:id/interactions/:iid", async (req: Request, res: Response) => {
  try {
    await prisma.contactInteraction.delete({
      where: { id: req.params.iid as string },
    });
    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /contacts/:id/interactions/:iid error:", error);
    res.status(500).json({ error: "Failed to delete interaction" });
  }
});

// ── POST /contacts/import — CSV bulk import ───────────────────

contactsRouter.post("/import", async (req: Request, res: Response) => {
  try {
    const { rows, contactType, campaignId } = req.body as {
      rows: { name: string; email?: string; phone?: string; organization?: string; role?: string }[];
      contactType: string;
      campaignId?: string;
    };

    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: "rows array is required" });
      return;
    }
    if (!contactType) {
      res.status(400).json({ error: "contactType is required" });
      return;
    }

    const created = await prisma.outreachContact.createMany({
      data: rows.map(r => ({
        name:         (r.name ?? "").trim(),
        email:        r.email?.trim()        ?? null,
        phone:        r.phone?.trim()        ?? null,
        organization: r.organization?.trim() ?? null,
        role:         r.role?.trim()         ?? null,
        contactType,
        stage:        "COLD",
        tags:         [],
        ownerId:      req.session.memberId!,
        campaignId:   campaignId ?? null,
      })).filter(r => r.name),
      skipDuplicates: false,
    });

    res.status(201).json({ created: created.count });
  } catch (error) {
    console.error("POST /contacts/import error:", error);
    res.status(500).json({ error: "Failed to import contacts" });
  }
});

// ── POST /contacts/:id/email-template ────────────────────────
// Returns a personalized mailto: URL with AI-generated body

contactsRouter.post("/:id/email-template", async (req: Request, res: Response) => {
  try {
    const contact = await prisma.outreachContact.findUnique({
      where: { id: req.params.id as string },
      include: { campaign: { select: { name: true, goalType: true } } },
    });
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    const { intent } = req.body as { intent: string }; // e.g. "sponsor intro", "press release"
    if (!intent?.trim()) {
      res.status(400).json({ error: "intent is required" });
      return;
    }

    const body = await aiOutreachService.generateEmailTemplate(
      contact.name,
      contact.organization ?? undefined,
      contact.contactType,
      intent,
      contact.campaign?.name
    );

    const subjectMap: Record<string, string> = {
      "sponsor intro": `Partnership Opportunity — Purdue SEARCH`,
      "press release": `News from Purdue SEARCH`,
      "follow-up":     `Following Up — Purdue SEARCH`,
    };
    const subject = subjectMap[intent.toLowerCase()] ?? `Purdue SEARCH — ${intent}`;

    const mailto = `mailto:${encodeURIComponent(contact.email ?? "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    res.json({ subject, body, mailto });
  } catch (error) {
    console.error("POST /contacts/:id/email-template error:", error);
    res.status(500).json({ error: "Failed to generate email template" });
  }
});
