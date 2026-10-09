import type { App } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { getProjectByChannel, getProjectsForChannel, addMemberToProject } from "../services/projectService.js";
import { resolveSlackMember, getLeadershipChannelId, getBotUserId } from "../services/memberService.js";
import {
  ensureMembersKnown, addConversationMember, removeConversationMember, joinAndSyncPublicChannel,
} from "../services/slackMembershipService.js";
import {
  buildTodoPrompt,
  buildAiTaskSuggestion,
} from "../utils/blockKit.js";
import { parseTaskFromMessage, type TaskContext } from "../services/aiService.js";
import { storeAiTask } from "../utils/aiTaskCache.js";
import { prisma } from "../db/prisma.js";
import { ingestSlackMessage, applyReaction } from "../services/slackArchiveService.js";
import { deliverSlackPings } from "../services/slackNotifyService.js";

const mentionInviteDays = new Map<string, string>();

// ── Helpers ──────────────────────────────────────────────────

import { extractSuggestedAssignees, type MemberStub } from "./views/taskDraft.js";

// Fetches all Member records whose slackId appears in the given channel.
// Requires channels:read (public) / groups:read (private) scopes.
// Falls back to an empty array on error so the caller can use a fallback list.
async function getChannelMembers(client: WebClient, channelId: string): Promise<MemberStub[]> {
  const slackIds: string[] = [];
  let cursor: string | undefined;
  try {
    do {
      const res = await client.conversations.members({ channel: channelId, limit: 200, ...(cursor ? { cursor } : {}) });
      slackIds.push(...(res.members ?? []));
      cursor = (res.response_metadata?.next_cursor as string | undefined) || undefined;
    } while (cursor);
  } catch (err) {
    console.warn("[events] conversations.members failed (missing scope?):", (err as Error).message);
    return [];
  }
  if (slackIds.length === 0) return [];
  return prisma.member.findMany({
    where: { slackId: { in: slackIds } },
    select: { slackId: true, displayName: true },
  });
}

export function registerEvents(app: App): void {
  // ── Message: archive + auto-detect TODO/ACTION ────────────
  // The archive call runs FIRST and in its own try/catch. The two concerns get
  // independent error boundaries in both directions: an archive bug must not
  // break the TODO prompt that works today, and a failure in the TODO logic
  // must not lose a message from the archive.
  app.message(async ({ message, say, client, body }) => {
    // Whose authorization delivered this event. For a DM, or a private channel
    // the bot is not in, theirs is the only token that can see the conversation.
    const authorizedUserId = (body as { authorizations?: { user_id?: string }[] }).authorizations?.[0]?.user_id;

    let result: Awaited<ReturnType<typeof ingestSlackMessage>> = null;
    try {
      result = await ingestSlackMessage(message as never, client);
      if (result?.event === "new") {
        await ensureMembersKnown(result.channelId, result.convKind, authorizedUserId);
      }
    } catch (error) {
      console.error("[slackArchive] ingest failed:", error);
    }

    // User-token events can see a mention where the bot cannot receive app_mention.
    try {
      const authorizations = (body as { authorizations?: { is_bot?: boolean }[] }).authorizations ?? [];
      const msg = message as { text?: string; user?: string; bot_id?: string; subtype?: string; channel: string };
      if (result?.event === "new" && !msg.subtype && !msg.bot_id && msg.user && authorizations.some(auth => auth.is_bot === false)) {
        const botId = await getBotUserId(app.client);
        if (botId && msg.user !== botId && msg.text?.includes(`<@${botId}>`)) {
          const membership = await prisma.slackConversationMember.findFirst({ where: { slackChannelId: msg.channel, slackUserId: botId } });
          const day = new Date().toISOString().slice(0, 10);
          for (const [key, date] of mentionInviteDays) if (date !== day) mentionInviteDays.delete(key);
          const key = `${msg.channel}:${msg.user}`;
          if (!membership && mentionInviteDays.get(key) !== day) {
            mentionInviteDays.set(key, day);
            try {
              const dm = await app.client.conversations.open({ users: msg.user });
              if (!dm.channel?.id) throw new Error("Unable to open mention invitation DM");
              await app.client.chat.postMessage({ channel: dm.channel.id, text: "Invite me with /invite @Constellation to use me there." });
            } catch (error) { mentionInviteDays.delete(key); throw error; }
          }
        }
      }
    } catch (error) { console.error("[mentions] invitation failed", error); }

    // Mirror Slack's pings into Constellation. Live path ONLY — backfill never
    // notifies (D10). Separate error boundary: a ping bug must not lose the
    // archive row, and an archive bug must not block the TODO prompt below.
    if (result) {
      try {
        await deliverSlackPings(result, client);
      } catch (error) {
        console.error("[slackPortal] ping delivery failed:", error);
      }
    }

    try {
      // Only handle regular user messages with text
      if (message.subtype) return;
      // ignoreSelf is off (bolt.ts). Never let a bot message — ours or another
      // app's — trigger the TODO prompt.
      if ((message as { bot_id?: string }).bot_id) return;
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

  // ── Reaction Added: clipboard → create task, ✅ → mark done ──
  app.event("reaction_added", async ({ event, client }) => {
    try {
      if (event.item.type !== "message") return;

      const { channel, ts } = event.item as { channel: string; ts: string };

      // Mirror the reaction into the archive before the clipboard/✅ flows below.
      try {
        await applyReaction(channel, ts, `:${event.reaction}:`, event.user, true);
      } catch (error) {
        console.error("[slackArchive] reaction_added failed:", error);
      }

      // Our own bot's reactions now reach this handler (ignoreSelf: false).
      if (event.user === (await getBotUserId(client))) return;

      if (event.reaction === "clipboard") {
        // Fetch the original message text
        const result = await client.conversations.history({
          channel,
          oldest: ts,
          inclusive: true,
          limit: 1,
        });

        const msgText = result.messages?.[0]?.text ?? "";
        if (!msgText) return;

        // Only act if this channel is linked to a project
        const project = await getProjectByChannel(channel);
        if (!project) return;

        // Try AI parsing first; fall back to plain prompt if it fails
        const today = new Date().toISOString().split("T")[0];
        const taskContext: TaskContext = {
          projectName: project.name,
          projectDescription: project.description ?? undefined,
          projectType: (project as any).type ?? undefined,
          existingTasks: (project.tasks ?? [])
            .filter((t: any) => t.status !== "DONE")
            .map((t: any) => ({ id: t.id, title: t.title, description: t.description })),
        };
        const parsed = await parseTaskFromMessage(msgText, today, taskContext);

        if (parsed?.title) {
          const channelMembers = await getChannelMembers(client, channel);
          const memberPool: MemberStub[] = channelMembers.length > 0
            ? channelMembers
            : (project.members ?? []).map((pm: any) => pm.member as MemberStub);

          const suggestedAssigneeSlackIds = extractSuggestedAssignees(
            msgText,
            memberPool
          );

          const cacheKey = storeAiTask({
            title: parsed.title,
            description: parsed.description,
            priority: parsed.priority,
            dueDate: parsed.dueDate,
            parentTaskId: parsed.parentTaskId,
            suggestedAssigneeSlackIds,
            channelId: channel,
          });

          await client.chat.postEphemeral({
            channel,
            user: event.user,
            blocks: buildAiTaskSuggestion(parsed, channel, cacheKey, suggestedAssigneeSlackIds),
            text: `Suggested task: ${parsed.title}`,
          });
        } else {
          await client.chat.postEphemeral({
            channel,
            user: event.user,
            blocks: buildTodoPrompt(msgText),
            text: "Create a task from this message?",
          });
        }
      }
    } catch (error) {
      console.error("reaction_added event error:", error);
    }
  });

  // ── Reaction Removed: keep the archive in sync ────────────
  app.event("reaction_removed", async ({ event }) => {
    try {
      if (event.item.type !== "message") return;
      const { channel, ts } = event.item as { channel: string; ts: string };
      await applyReaction(channel, ts, `:${event.reaction}:`, event.user, false);
    } catch (error) {
      console.error("reaction_removed event error:", error);
    }
  });

  // ── Channel Created: portal auto-join ────────────────────
  app.event("channel_created", async ({ event, client }) => {
    // Portal: the bot joins every new public channel so it can read it.
    // channel_created only fires for public channels.
    try {
      await joinAndSyncPublicChannel(event.channel.id, client, event.channel.name);
    } catch (err) {
      console.error("[slackPortal] auto-join failed:", err);
    }
  });

  // ── Member Joined Channel: Auto-add to linked projects + admin grant ───
  app.event("member_joined_channel", async ({ event, client }) => {
    try {
      const { user: slackUserId, channel: channelId } = event;

      await addConversationMember(channelId, slackUserId);

      // Grant admin if this is the leadership channel
      const leadershipId = await getLeadershipChannelId(client);
      if (leadershipId && channelId === leadershipId) {
        const member = await resolveSlackMember(slackUserId, client);
        await prisma.member.update({
          where: { id: member.id },
          data: { isAdmin: true },
        });
        console.log(`🔑 [admin] GRANTED: ${member.displayName} (${slackUserId}) joined #leadership`);
        return;
      }

      // Find all projects linked to this channel via notification targets
      const projects = await getProjectsForChannel(channelId);
      if (projects.length === 0) return;

      const member = await resolveSlackMember(slackUserId, client);
      // Don't auto-add bots as project members (assignee picker would show them).
      if (member.isBot) return;
      await Promise.all(projects.map((p) => addMemberToProject(p.id, member.id)));

      const projectNames = projects.map((p) => `*${p.name}*`).join(", ");
      await client.chat.postMessage({
        channel: channelId,
        text: `👤 <@${slackUserId}> has been auto-added to project${projects.length > 1 ? "s" : ""} ${projectNames} as a Contributor.`,
      });
    } catch (error) {
      console.error("member_joined_channel event error:", error);
    }
  });

  // ── Member Left Channel: Revoke admin if leaving leadership ─────────
  app.event("member_left_channel", async ({ event, client }) => {
    try {
      const { user: slackUserId, channel: channelId } = event;

      await removeConversationMember(channelId, slackUserId);

      const leadershipId = await getLeadershipChannelId(client);
      if (!leadershipId || channelId !== leadershipId) return;

      const member = await prisma.member.findUnique({
        where: { slackId: slackUserId },
        select: { id: true, displayName: true, isAdmin: true },
      });
      if (!member?.isAdmin) return; // already not admin, nothing to do

      await prisma.member.update({
        where: { id: member.id },
        data: { isAdmin: false },
      });
      console.log(`🔒 [admin] REVOKED: ${member.displayName} (${slackUserId}) left #leadership`);
    } catch (error) {
      console.error("member_left_channel event error:", error);
    }
  });

  // ── File Shared: Offer image → task analysis ──────────────
  app.event("file_shared", async ({ event, client }) => {
    try {
      const fileInfo = await client.files.info({ file: (event as any).file_id });
      const file = fileInfo.file as any;
      if (!file || !file.mimetype?.startsWith("image/")) return;

      const channelId = file.channels?.[0] ?? (event as any).channel_id;
      if (!channelId) return;
      const project = await getProjectByChannel(channelId);
      if (!project) return;

      await client.chat.postEphemeral({
        channel: channelId,
        user: (event as any).user_id,
        text: "🖼️ Looks like you shared an image! Want me to analyze it and suggest a task?",
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: "🖼️ I can analyze this image and suggest a task (e.g., for a bug screenshot). Want me to?" },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "🤖 Analyze & Create Task" },
                action_id: "open_image_task_modal",
                value: JSON.stringify({ channelId, fileUrl: file.url_private, fileType: file.mimetype }),
                style: "primary",
              },
              { type: "button", text: { type: "plain_text", text: "Dismiss" }, action_id: "dismiss_todo_prompt", value: "dismiss" },
            ],
          },
        ],
      });
    } catch (err) {
      console.error("file_shared error:", err);
    }
  });
}
