import { Router, type Request, type Response } from "express";
import { WebClient } from "@slack/web-api";
import { requireAuth } from "./auth.js";
import { boltApp } from "../slack/bolt.js";
import { getBotUserId } from "../services/memberService.js";

export const slackRouter = Router();

slackRouter.use(requireAuth);

// ── GET /api/slack/channels ──────────────────────────────────
// Lists channels the SIGNED-IN USER is a member of (public + private).
// Uses the user's OAuth token so private channels the bot hasn't joined yet
// still appear. Each entry includes `botIsMember` so the UI can prompt the
// user to invite the bot when needed.

slackRouter.get("/channels", async (req: Request, res: Response) => {
  try {
    const userToken = req.session.slackAccessToken;
    if (!userToken) {
      res.status(401).json({ error: "Missing Slack user token — re-authenticate" });
      return;
    }

    const userClient = new WebClient(userToken);
    const botUserId = await getBotUserId(boltApp.client);

    // Channels the user is in
    const userChannels: { id: string; name: string }[] = [];
    let cursor: string | undefined;
    do {
      const result = await userClient.users.conversations({
        types: "public_channel,private_channel",
        exclude_archived: true,
        limit: 200,
        cursor,
      });
      for (const ch of result.channels ?? []) {
        if (ch.id && ch.name) userChannels.push({ id: ch.id, name: ch.name });
      }
      cursor = result.response_metadata?.next_cursor || undefined;
    } while (cursor);

    // Channels the bot is in (single call, then intersect)
    const botChannelIds = new Set<string>();
    if (botUserId) {
      cursor = undefined;
      do {
        const result = await boltApp.client.users.conversations({
          user: botUserId,
          types: "public_channel,private_channel",
          exclude_archived: true,
          limit: 200,
          cursor,
        });
        for (const ch of result.channels ?? []) {
          if (ch.id) botChannelIds.add(ch.id);
        }
        cursor = result.response_metadata?.next_cursor || undefined;
      } while (cursor);
    }

    const channels = userChannels
      .map(c => ({ ...c, botIsMember: botChannelIds.has(c.id) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json(channels);
  } catch (error) {
    console.error("List Slack channels error:", error);
    res.status(500).json({ error: "Failed to list Slack channels" });
  }
});

// ── POST /api/slack/channels/:id/invite-bot ──────────────────
// Invites the bot to a channel using the signed-in user's token.
// Used by the channel picker before linking a private channel the bot
// isn't yet in.

slackRouter.post("/channels/:id/invite-bot", async (req: Request, res: Response) => {
  try {
    const userToken = req.session.slackAccessToken;
    if (!userToken) {
      res.status(401).json({ error: "Missing Slack user token — re-authenticate" });
      return;
    }

    const botUserId = await getBotUserId(boltApp.client);
    if (!botUserId) {
      res.status(500).json({ error: "Could not resolve bot user ID" });
      return;
    }

    const userClient = new WebClient(userToken);
    try {
      await userClient.conversations.invite({
        channel: req.params.id as string,
        users: botUserId,
      });
      res.json({ ok: true });
    } catch (err: any) {
      // Slack's error code lives at err.data.error
      const code = err?.data?.error ?? err?.message ?? "unknown_error";
      if (code === "already_in_channel") {
        res.json({ ok: true, alreadyInChannel: true });
        return;
      }
      res.status(400).json({ ok: false, error: code });
    }
  } catch (error) {
    console.error("Invite bot to channel error:", error);
    res.status(500).json({ error: "Failed to invite bot" });
  }
});
