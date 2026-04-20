import type { App } from "@slack/bolt";
import { prisma } from "../db/prisma.js";
import { getProjectByChannel, addMemberToProject } from "../services/projectService.js";
import { buildTodoPrompt } from "../utils/blockKit.js";

// ── Event Registration ───────────────────────────────────────

export function registerEvents(app: App): void {
  // ── Message: Auto-detect TODO/ACTION ─────────────────────
  app.message(async ({ message, say }) => {
    try {
      // Only handle regular user messages with text
      if (message.subtype) return;
      if (!("text" in message) || !message.text) return;

      const text = message.text.trim();

      // Check for TODO: or ACTION: prefix
      if (/^(TODO|ACTION):/i.test(text)) {
        // Check if this channel is linked to a project
        const project = await getProjectByChannel(message.channel);
        if (!project) return; // Not a project channel, ignore

        const threadTs = "ts" in message ? message.ts : undefined;
        await say({
          ...(threadTs ? { thread_ts: threadTs } : {}),
          blocks: buildTodoPrompt(text),
          text: "Would you like to turn this into a task?",
        });
      }
    } catch (error) {
      console.error("Message event error:", error);
    }
  });

  // ── Channel Created: proj-* naming convention ────────────
  app.event("channel_created", async ({ event, client }) => {
    try {
      const channel = event.channel;
      const channelName = channel.name;

      // Check if the channel matches proj-* naming
      if (channelName.startsWith("proj-")) {
        await client.chat.postMessage({
          channel: channel.id,
          text: `👋 This channel matches the project naming convention (\`proj-*\`).`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `👋 Welcome to *#${channelName}*!\n\nThis channel matches the project naming convention (\`proj-*\`). Would you like to link it to a project?\n\nVisit the dashboard to link this channel to a new or existing project, or use \`/pm help\` to get started.`,
              },
            },
          ],
        });
      }
    } catch (error) {
      console.error("channel_created event error:", error);
    }
  });

  // ── Member Joined Channel: Auto-add to project ──────────
  app.event("member_joined_channel", async ({ event, client }) => {
    try {
      const { user: slackUserId, channel: channelId } = event;

      // Check if this channel is linked to a project
      const project = await getProjectByChannel(channelId);
      if (!project) return;

      // Find or create the member
      let member = await prisma.member.findUnique({
        where: { slackId: slackUserId },
      });

      if (!member) {
        // Fetch user info from Slack
        const userInfo = await client.users.info({ user: slackUserId });
        const profile = userInfo.user?.profile;

        member = await prisma.member.create({
          data: {
            slackId: slackUserId,
            slackHandle: userInfo.user?.name ?? slackUserId,
            displayName:
              profile?.display_name || profile?.real_name || slackUserId,
            avatarUrl: profile?.image_72 ?? undefined,
          },
        });
      }

      // Add to project
      await addMemberToProject(project.id, member.id);

      // Notify the channel
      await client.chat.postMessage({
        channel: channelId,
        text: `👤 <@${slackUserId}> has been auto-added to project *${project.name}* as a Contributor.`,
      });
    } catch (error) {
      console.error("member_joined_channel event error:", error);
    }
  });
}
