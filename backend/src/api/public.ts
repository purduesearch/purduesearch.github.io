import { Router, type Request, type Response } from "express";
import { prisma } from "../db/prisma.js";
import * as pollService from "../services/pollService.js";

export const publicRouter = Router();

// ── Simple in-memory IP rate limiter (token-bucket) ──────────

const RATE_WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const ipLog = new Map<string, number[]>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const log = ipLog.get(ip) ?? [];
  const recent = log.filter(t => now - t < RATE_WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    ipLog.set(ip, recent);
    return false;
  }
  recent.push(now);
  ipLog.set(ip, recent);
  // Prune expired entries to bound memory growth
  for (const [k, timestamps] of ipLog) {
    if (timestamps.every(t => now - t >= RATE_WINDOW_MS)) ipLog.delete(k);
  }
  return true;
}

// ── RSVP endpoints (no auth required) ───────────────────────

publicRouter.get("/events/:eventId/rsvp-info", async (req: Request, res: Response) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.eventId as string },
      select: {
        id: true, title: true, description: true,
        startTime: true, endTime: true,
        location: true, isVirtual: true,
        _count: { select: { rsvps: true } },
      },
    });
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.json(event);
  } catch (error) {
    console.error("GET /public/events/:eventId/rsvp-info error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

publicRouter.post("/events/:eventId/rsvp", async (req: Request, res: Response) => {
  try {
    const ip = (req.ip ?? req.socket.remoteAddress ?? "unknown").toString();
    if (!rateLimit(ip)) {
      res.status(429).json({ error: "Too many requests — try again in a minute" });
      return;
    }

    const eventId = req.params.eventId as string;
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const { name, email, authToken } = req.body as {
      name?: string;
      email?: string;
      authToken?: string;
    };

    let rsvp: { id: string };

    if (authToken) {
      // Verify the HMAC-signed Bearer token issued at Slack OAuth time
      const { verifyBearerToken } = await import("./auth.js");
      const memberId = await verifyBearerToken(authToken);
      if (!memberId) {
        res.status(401).json({ error: "Invalid or expired auth token" });
        return;
      }
      rsvp = await prisma.eventRsvp.upsert({
        where: { eventId_memberId: { eventId, memberId } },
        create: { eventId, memberId, attended: true },
        update: { attended: true, attendedAt: new Date() },
        select: { id: true },
      });
    } else {
      if (!name?.trim() || !email?.trim()) {
        res.status(400).json({ error: "Name and email are required" });
        return;
      }
      rsvp = await prisma.eventRsvp.upsert({
        where: { eventId_guestEmail: { eventId, guestEmail: email.trim().toLowerCase() } },
        create: {
          eventId,
          guestName:  name.trim(),
          guestEmail: email.trim().toLowerCase(),
          attended:   true,
        },
        update: { attended: true, attendedAt: new Date(), guestName: name.trim() },
        select: { id: true },
      });
    }

    res.status(201).json({ ok: true, rsvpId: rsvp.id });
  } catch (error) {
    console.error("POST /public/events/:eventId/rsvp error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Meeting poll (when2meet) shareable link ──────────────────

type LoadedPoll = NonNullable<Awaited<ReturnType<typeof pollService.getPollByToken>>>;

function publicSerializePoll(poll: LoadedPoll) {
  const responders = pollService.respondersFrom(poll);
  const agg = pollService.aggregate(poll.slotStarts, responders);
  return {
    id:               poll.id,
    token:            poll.publicToken,
    title:            poll.title,
    description:      poll.description,
    timezone:         poll.timezone,
    slotMinutes:      poll.slotMinutes,
    slotStarts:       poll.slotStarts,
    responseDeadline: poll.responseDeadline,
    audience:         poll.audience,
    status:           poll.status,
    finalStart:       poll.finalStart,
    finalEnd:         poll.finalEnd,
    organizerName:    poll.organizer?.displayName ?? null,
    projectName:      poll.project?.name ?? null,
    aggregate:        agg,
    responders:       responders.map(r => ({ name: r.name, isGuest: !r.memberId, avatarUrl: r.avatarUrl ?? null })),
    canGuestRespond:  poll.audience === "ANYONE" && poll.status === "OPEN",
  };
}

// GET /public/polls/:token — heatmap + candidate slots (link-holders may view)
publicRouter.get("/polls/:token", async (req: Request, res: Response) => {
  try {
    const poll = await pollService.getPollByToken(req.params.token as string);
    if (!poll) { res.status(404).json({ error: "Poll not found" }); return; }
    res.json(publicSerializePoll(poll as LoadedPoll));
  } catch (error) {
    console.error("GET /public/polls/:token error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /public/polls/:token/response — respond as guest, or as a member via token
publicRouter.put("/polls/:token/response", async (req: Request, res: Response) => {
  try {
    const ip = (req.ip ?? req.socket.remoteAddress ?? "unknown").toString();
    if (!rateLimit(ip)) {
      res.status(429).json({ error: "Too many requests — try again in a minute" });
      return;
    }

    const poll = await pollService.getPollByToken(req.params.token as string);
    if (!poll) { res.status(404).json({ error: "Poll not found" }); return; }
    if (poll.status !== "OPEN") { res.status(409).json({ error: "Poll is closed" }); return; }

    const { authToken, guestName, slots } = req.body as {
      authToken?: string; guestName?: string; slots?: string[];
    };

    const shape: pollService.PollAccessShape = {
      audience: poll.audience,
      organizerId: poll.organizerId,
      invitedMemberIds: poll.invitedMembers.map(m => m.id),
    };

    if (authToken) {
      // Logged-in member responding through the shared link.
      const { verifyBearerToken } = await import("./auth.js");
      const memberId = await verifyBearerToken(authToken);
      if (!memberId) { res.status(401).json({ error: "Invalid or expired auth token" }); return; }
      const ctx = await pollService.resolveContext(memberId, poll);
      if (!pollService.canRespond(shape, ctx).ok) {
        res.status(403).json({ error: "Not allowed to respond to this poll" });
        return;
      }
      await pollService.upsertResponse(poll.id, { memberId, slots: slots ?? [] });
    } else {
      // Anonymous guest — only permitted on ANYONE polls, needs a name.
      if (!pollService.canRespond(shape, { memberId: null }).ok) {
        res.status(403).json({ error: "This poll is not open to guests" });
        return;
      }
      if (!guestName?.trim()) { res.status(400).json({ error: "Name is required" }); return; }
      await pollService.upsertResponse(poll.id, { guestName: guestName.trim(), slots: slots ?? [] });
    }

    const fresh = await pollService.getPollByToken(req.params.token as string);
    res.json(publicSerializePoll(fresh as LoadedPoll));
  } catch (error) {
    console.error("PUT /public/polls/:token/response error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /public/campaigns/:slug ──────────────────────────────

publicRouter.get("/campaigns/:slug", async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug as string;
    const campaign = await prisma.campaign.findUnique({
      where: { slug },
      include: {
        owner: { select: { displayName: true, avatarUrl: true } },
        submissions: {
          where:   { status: "PUBLISHED" },
          orderBy: { publishedAt: "desc" },
          take:    20,
          select: {
            id: true, title: true, content: true, mediaUrls: true,
            type: true, platform: true, publishedAt: true,
          },
        },
      },
    });

    if (!campaign || !campaign.isPublic) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.json({
      id:          campaign.id,
      name:        campaign.name,
      description: campaign.description,
      startDate:   campaign.startDate,
      endDate:     campaign.endDate,
      goalType:    campaign.goalType,
      goalTarget:  campaign.goalTarget,
      goalProgress: campaign.goalProgress,
      color:       campaign.color,
      owner:       campaign.owner ? { displayName: campaign.owner.displayName, avatarUrl: campaign.owner.avatarUrl } : null,
      submissions: campaign.submissions,
    });
  } catch (error) {
    console.error("GET /public/campaigns/:slug error:", error);
    res.status(500).json({ error: "Failed to load campaign" });
  }
});

// ── GET /public/outreach/published ───────────────────────────

publicRouter.get("/outreach/published", async (req: Request, res: Response) => {
  try {
    const { program, limit } = req.query as { program?: string; limit?: string };
    const take = Math.min(50, parseInt(limit ?? "20", 10) || 20);

    const submissions = await prisma.outreachSubmission.findMany({
      where: {
        status: "PUBLISHED",
        ...(program ? { project: { programTag: program } } : {}),
      },
      orderBy: { publishedAt: "desc" },
      take,
      select: {
        id: true, title: true, content: true, mediaUrls: true,
        type: true, platform: true, publishedAt: true,
        project: { select: { name: true, programTag: true } },
      },
    });

    res.json(submissions);
  } catch (error) {
    console.error("GET /public/outreach/published error:", error);
    res.status(500).json({ error: "Failed to load published outreach" });
  }
});

// ── GET /public/blog — list published blog posts ─────────────
// A post is public once its BlogPost.status is PUBLISHED (see blogService.publishPost).

publicRouter.get("/blog", async (_req: Request, res: Response) => {
  try {
    const posts = await prisma.blogPost.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 50,
      select: {
        id: true, title: true, slug: true, excerpt: true,
        authorName: true, linkUrl: true,
        coverImageUrl: true, publishedAt: true, readingTimeMin: true,
        tags: { select: { name: true, slug: true } },
        categories: { select: { name: true, slug: true } },
        createdBy: { select: { displayName: true, avatarUrl: true } },
      },
    });
    res.json(posts);
  } catch (error) {
    console.error("GET /public/blog error:", error);
    res.status(500).json({ error: "Failed to load blog list" });
  }
});

// ── GET /public/blog/:slug — full post ───────────────────────

publicRouter.get("/blog/:slug", async (req: Request, res: Response) => {
  try {
    const post = await prisma.blogPost.findUnique({
      where: { slug: req.params.slug as string },
      select: {
        id: true, title: true, slug: true, renderedHtml: true, excerpt: true,
        authorName: true,
        coverImageUrl: true, publishedAt: true, createdAt: true, readingTimeMin: true,
        status: true,
        metaDescription: true, canonicalUrl: true,
        ogTitle: true, ogDescription: true, ogImageUrl: true,
        tags: { select: { name: true, slug: true } },
        categories: { select: { name: true, slug: true } },
        createdBy: { select: { displayName: true, avatarUrl: true } },
        authors: { select: { role: true, member: { select: { displayName: true, avatarUrl: true } } } },
      },
    });
    if (!post || post.status !== "PUBLISHED" || !post.renderedHtml) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(post);
  } catch (error) {
    console.error("GET /public/blog/:slug error:", error);
    res.status(500).json({ error: "Failed to load blog post" });
  }
});

// ── Newsletter unsubscribe ───────────────────────────────────

publicRouter.get("/newsletter/unsubscribe/:token", async (req: Request, res: Response) => {
  try {
    const subscriber = await prisma.newsletterSubscriber.findUnique({
      where:  { unsubscribeToken: req.params.token as string },
    });
    if (!subscriber) {
      res.status(404).send(`<html><body style="font-family: sans-serif; padding: 40px; text-align: center;"><h1>Link not found</h1></body></html>`);
      return;
    }
    if (!subscriber.unsubscribedAt) {
      await prisma.newsletterSubscriber.update({
        where: { id: subscriber.id },
        data:  { unsubscribedAt: new Date() },
      });
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<html><body style="font-family: sans-serif; padding: 40px; text-align: center; background: #f8fafb;">
      <h1 style="color: #0096a8;">Unsubscribed</h1>
      <p>You won't receive any more Purdue SEARCH newsletters at ${subscriber.email}.</p>
      <p style="font-size: 12px; color: #888; margin-top: 30px;">Changed your mind? Contact us to resubscribe.</p>
    </body></html>`);
  } catch (error) {
    console.error("GET /public/newsletter/unsubscribe error:", error);
    res.status(500).send("Server error");
  }
});

// ── Newsletter open tracking pixel ───────────────────────────

const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

publicRouter.get("/newsletter/track/open/:sendId.png", async (req: Request, res: Response) => {
  try {
    const sendId = req.params.sendId as string;
    // Fire-and-forget increment
    prisma.newsletterSend.update({
      where: { id: sendId },
      data:  { opens: { increment: 1 } },
    }).catch(() => { /* ignore unknown send IDs */ });
  } catch {
    /* ignore */
  }
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.send(PIXEL_PNG);
});

// ── GET /public/press-kit/:projectId/:token ──────────────────

publicRouter.get("/press-kit/:projectId/:token", async (req: Request, res: Response) => {
  try {
    const project = await prisma.project.findUnique({
      where:  { id: req.params.projectId as string },
      select: { pressKitToken: true },
    });
    if (!project || !project.pressKitToken || project.pressKitToken !== req.params.token) {
      res.status(404).send("Not found");
      return;
    }
    const { buildPressKitHtml } = await import("../services/pressKitService.js");
    const html = await buildPressKitHtml(req.params.projectId as string);
    if (!html) {
      res.status(404).send("Not found");
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (error) {
    console.error("GET /public/press-kit error:", error);
    res.status(500).send("Server error");
  }
});

// ── POST /public/campaigns/:slug/signup ──────────────────────

publicRouter.post("/campaigns/:slug/signup", async (req: Request, res: Response) => {
  try {
    const ip = (req.ip ?? req.socket.remoteAddress ?? "unknown").toString();
    if (!rateLimit(ip)) {
      res.status(429).json({ error: "Too many requests — try again in a minute" });
      return;
    }

    const slug = req.params.slug as string;
    const campaign = await prisma.campaign.findUnique({
      where:  { slug },
      select: { id: true, isPublic: true },
    });
    if (!campaign || !campaign.isPublic) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const { name, email, role } = req.body as { name?: string; email?: string; role?: string };
    if (!name?.trim() || !email?.trim()) {
      res.status(400).json({ error: "Name and email are required" });
      return;
    }

    await prisma.outreachContact.create({
      data: {
        name:        name.trim(),
        email:       email.trim(),
        role:        role?.trim() ?? null,
        contactType: "PROSPECT",
        stage:       "COLD",
        campaignId:  campaign.id,
        tags:        ["self-signup"],
      },
    });

    res.status(201).json({ ok: true });
  } catch (error) {
    console.error("POST /public/campaigns/:slug/signup error:", error);
    res.status(500).json({ error: "Failed to record signup" });
  }
});
