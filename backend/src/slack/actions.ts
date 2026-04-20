import type { App } from "@slack/bolt";
import { prisma } from "../db/prisma.js";
import { updateTask, getTask, createTask } from "../services/taskService.js";
import { getProjectByChannel } from "../services/projectService.js";
import { buildTaskCard } from "../utils/blockKit.js";
import { openAddNoteModal } from "./modals.js";

// ── Action Registration ──────────────────────────────────────

export function registerActions(app: App): void {
  // ── Mark Done ────────────────────────────────────────────
  app.action("mark_done", async ({ action, ack, respond, body }) => {
    await ack();

    try {
      if (!("value" in action) || !action.value) {
        await respond({ text: "❌ Missing task ID", response_type: "ephemeral" });
        return;
      }

      const taskId = action.value;
      const task = await getTask(taskId);

      if (!task) {
        await respond({
          text: `❌ Task not found: \`${taskId}\``,
          response_type: "ephemeral",
        });
        return;
      }

      await updateTask(taskId, { status: "DONE" });

      await respond({
        response_type: "in_channel",
        replace_original: true,
        text: `✅ ~${task.title}~ — marked complete by <@${body.user.id}>`,
      });
    } catch (error) {
      console.error("mark_done error:", error);
      await respond({
        text: "❌ Failed to mark task as done. Please try again.",
        response_type: "ephemeral",
      });
    }
  });

  // ── Add Note ─────────────────────────────────────────────
  app.action("add_note", async ({ action, ack, body, client }) => {
    await ack();

    try {
      if (!("value" in action) || !action.value) return;
      const taskId = action.value;

      if ("trigger_id" in body && body.trigger_id) {
        await openAddNoteModal(client, body.trigger_id, taskId);
      }
    } catch (error) {
      console.error("add_note error:", error);
    }
  });

  // ── Reassign ─────────────────────────────────────────────
  app.action("reassign", async ({ action, ack, client, body }) => {
    await ack();

    try {
      if (!("value" in action) || !action.value) return;
      const taskId = action.value;

      if ("trigger_id" in body && body.trigger_id) {
        await client.views.open({
          trigger_id: body.trigger_id,
          view: {
            type: "modal",
            callback_id: "reassign_submit",
            private_metadata: taskId,
            title: { type: "plain_text", text: "Reassign Task" },
            submit: { type: "plain_text", text: "Reassign" },
            blocks: [
              {
                type: "input",
                block_id: "user_block",
                label: { type: "plain_text", text: "Assign to" },
                element: {
                  type: "users_select",
                  action_id: "selected_user",
                  placeholder: {
                    type: "plain_text",
                    text: "Select a team member",
                  },
                },
              },
            ],
          },
        });
      }
    } catch (error) {
      console.error("reassign error:", error);
    }
  });

  // ── View Dashboard (link button — no handler needed) ─────
  app.action("view_dashboard", async ({ ack }) => {
    await ack();
    // The button has a `url` property, Slack handles the redirect
  });

  // ── Create Task from Message (TODO auto-detect) ──────────
  app.action(
    "create_task_from_message",
    async ({ action, ack, respond, body }) => {
      await ack();

      try {
        if (!("value" in action) || !action.value) return;

        const messageText = action.value;
        // Strip TODO: or ACTION: prefix
        const title = messageText
          .replace(/^(TODO|ACTION):\s*/i, "")
          .trim()
          .slice(0, 200);

        // Find project for this channel
        const channelId =
          "channel" in body && body.channel ? (body.channel as { id: string }).id : undefined;
        if (!channelId) {
          await respond({
            text: "❌ Could not determine channel",
            response_type: "ephemeral",
          });
          return;
        }

        const project = await getProjectByChannel(channelId);
        if (!project) {
          await respond({
            text: "❌ This channel is not linked to a project.",
            response_type: "ephemeral",
          });
          return;
        }

        // Find or create the member
        let member = await prisma.member.findUnique({
          where: { slackId: body.user.id },
        });

        if (!member) {
          member = await prisma.member.create({
            data: {
              slackId: body.user.id,
              slackHandle: body.user.id,
              displayName: "name" in body.user && typeof body.user.name === "string" ? body.user.name : body.user.id,
            },
          });
        }

        const task = await createTask({
          title,
          projectId: project.id,
          assigneeId: member.id,
        });

        await respond({
          response_type: "in_channel",
          replace_original: true,
          blocks: buildTaskCard(task, member, project),
          text: `✅ Task created: ${title}`,
        });
      } catch (error) {
        console.error("create_task_from_message error:", error);
        await respond({
          text: "❌ Failed to create task. Please try again.",
          response_type: "ephemeral",
        });
      }
    }
  );

  // ── Dismiss TODO prompt ──────────────────────────────────
  app.action("dismiss_todo_prompt", async ({ ack, respond }) => {
    await ack();
    await respond({
      delete_original: true,
    });
  });
}
