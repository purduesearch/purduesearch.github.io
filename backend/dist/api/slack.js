import { Router } from "express";
import { requireAuth } from "./auth.js";
import { boltApp } from "../slack/bolt.js";
export const slackRouter = Router();
slackRouter.use(requireAuth);
// ── GET /api/slack/channels ──────────────────────────────────
slackRouter.get("/channels", async (_req, res) => {
    try {
        const channels = [];
        let cursor;
        do {
            const result = await boltApp.client.conversations.list({
                types: "public_channel,private_channel",
                exclude_archived: true,
                limit: 200,
                cursor,
            });
            for (const ch of result.channels ?? []) {
                if (ch.id && ch.name)
                    channels.push({ id: ch.id, name: ch.name });
            }
            cursor = result.response_metadata?.next_cursor || undefined;
        } while (cursor);
        channels.sort((a, b) => a.name.localeCompare(b.name));
        res.json(channels);
    }
    catch (error) {
        console.error("List Slack channels error:", error);
        res.status(500).json({ error: "Failed to list Slack channels" });
    }
});
//# sourceMappingURL=slack.js.map