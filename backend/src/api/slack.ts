import { Router, type Request, type Response } from "express";
import { WebClient } from "@slack/web-api";
import { requireAuth } from "./auth.js";
import { boltApp } from "../slack/bolt.js";
import { getBotUserId } from "../services/memberService.js";
import {
  getSlackUserToken,
  clearSlackUserToken,
  isDeadTokenError,
  slackErrorCode,
} from "../services/slackUserTokenService.js";

export const slackRouter = Router();

slackRouter.use(requireAuth);

type Channel = { id: string; name: string; botIsMember: boolean; isPrivate: boolean };

/** Every channel the bot can see: all public channels plus private ones it's in. */
async function listChannelsAsBot(): Promise<{ id: string; name: string; isPrivate: boolean }[]> {
  const out: { id: string; name: string; isPrivate: boolean }[] = [];
  let cursor: string | undefined;
  do {
    const result = await boltApp.client.conversations.list({
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 200,
      cursor,
    });
    for (const ch of result.channels ?? []) {
      if (ch.id && ch.name) out.push({ id: ch.id, name: ch.name, isPrivate: !!ch.is_private });
    }
    cursor = result.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return out;
}

/** Channels the signed-in user is a member of, via their own OAuth token. */
async function listChannelsAsUser(
  userToken: string
): Promise<{ id: string; name: string; isPrivate: boolean }[]> {
  const client = new WebClient(userToken);
  const out: { id: string; name: string; isPrivate: boolean }[] = [];
  let cursor: string | undefined;
  do {
    const result = await client.users.conversations({
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 200,
      cursor,
    });
    for (const ch of result.channels ?? []) {
      if (ch.id && ch.name) out.push({ id: ch.id, name: ch.name, isPrivate: !!ch.is_private });
    }
    cursor = result.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return out;
}

/** Channel ids the bot has actually joined, so the UI knows when to offer an invite. */
async function botChannelIdSet(): Promise<Set<string>> {
  const ids = new Set<string>();
  const botUserId = await getBotUserId(boltApp.client);
  if (!botUserId) return ids;
  let cursor: string | undefined;
  do {
    const result = await boltApp.client.users.conversations({
      user: botUserId,
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 200,
      cursor,
    });
    for (const ch of result.channels ?? []) {
      if (ch.id) ids.add(ch.id);
    }
    cursor = result.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return ids;
}

// ── GET /api/slack/channels ──────────────────────────────────
// Lists channels the project picker can link to.
//
// Prefers the signed-in user's OAuth token (resolved from the Member row via
// req.memberId — NOT from req.session, which Bearer-authenticated clients don't
// have and which expires after 7 days) so private channels the bot hasn't
// joined yet still appear.
//
// When that token is missing or dead, falls back to the bot token rather than
// returning 401 with an empty list: the bot can see every public channel plus
// the private ones it's in, which covers almost every project channel. The
// response carries `needsSlackAuth` so the UI can offer a "Reconnect Slack"
// prompt for the private-channel case instead of silently showing nothing.
//
// Response: { channels: Channel[], needsSlackAuth: boolean, source, warning? }

slackRouter.get("/channels", async (req: Request, res: Response) => {
  try {
    const userToken = await getSlackUserToken(req);

    let raw: { id: string; name: string; isPrivate: boolean }[] = [];
    let source: "user" | "bot" = "user";
    let needsSlackAuth = false;
    let warning: string | undefined;

    if (userToken) {
      try {
        raw = await listChannelsAsUser(userToken);
      } catch (err) {
        const code = slackErrorCode(err);
        console.warn(`[slack/channels] user token failed (${code}) — falling back to bot token`);
        if (isDeadTokenError(code) && req.memberId) {
          await clearSlackUserToken(req.memberId);
        }
        source = "bot";
        needsSlackAuth = true;
        warning =
          code === "missing_scope"
            ? "Your Slack sign-in predates the channel permissions. Reconnect Slack to see private channels."
            : "Your Slack session expired. Reconnect Slack to see private channels.";
        raw = await listChannelsAsBot();
      }
    } else {
      source = "bot";
      needsSlackAuth = true;
      warning = "Reconnect Slack to also see private channels you're a member of.";
      raw = await listChannelsAsBot();
    }

    const botIds = await botChannelIdSet();
    const channels: Channel[] = raw
      .map((c) => ({ ...c, botIsMember: botIds.has(c.id) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ channels, needsSlackAuth, source, warning });
  } catch (error) {
    console.error("List Slack channels error:", error);
    res.status(500).json({
      error: "Failed to list Slack channels",
      detail: slackErrorCode(error),
    });
  }
});

// ── POST /api/slack/channels/:id/invite-bot ──────────────────
// Invites the bot to a channel using the signed-in user's token.
// Used by the channel picker before linking a channel the bot isn't yet in.

slackRouter.post("/channels/:id/invite-bot", async (req: Request, res: Response) => {
  try {
    const channelId = req.params.id as string;

    const botUserId = await getBotUserId(boltApp.client);
    if (!botUserId) {
      res.status(500).json({ ok: false, error: "could_not_resolve_bot_user" });
      return;
    }

    const userToken = await getSlackUserToken(req);

    // Without a user token, try to self-join with the bot token. That needs the
    // `channels:join` bot scope, which slack-manifest.yaml does not currently
    // request — if it isn't granted this returns `missing_scope`, which the UI
    // turns into "run /invite @Club PM in #channel". Private channels always
    // require a human to invite the bot regardless.
    if (!userToken) {
      try {
        await boltApp.client.conversations.join({ channel: channelId });
        res.json({ ok: true, joinedAsBot: true });
      } catch (err) {
        const code = slackErrorCode(err);
        if (code === "already_in_channel") {
          res.json({ ok: true, alreadyInChannel: true });
          return;
        }
        res.status(400).json({ ok: false, error: code, needsSlackAuth: true });
      }
      return;
    }

    const userClient = new WebClient(userToken);
    try {
      await userClient.conversations.invite({ channel: channelId, users: botUserId });
      res.json({ ok: true });
    } catch (err) {
      const code = slackErrorCode(err);
      if (code === "already_in_channel") {
        res.json({ ok: true, alreadyInChannel: true });
        return;
      }
      if (isDeadTokenError(code) && req.memberId) {
        await clearSlackUserToken(req.memberId);
        res.status(400).json({ ok: false, error: code, needsSlackAuth: true });
        return;
      }
      res.status(400).json({ ok: false, error: code });
    }
  } catch (error) {
    console.error("Invite bot to channel error:", error);
    res.status(500).json({ ok: false, error: "Failed to invite bot" });
  }
});
