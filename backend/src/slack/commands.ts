import type { App } from "@slack/bolt";
import { prisma } from "../db/prisma.js";
import { buildHelpCard } from "../utils/blockKit.js";
import { openStandupModal, openNewTaskModal, openNewProjectModal, openTaskDoneModal, openStatusModal } from "./modals.js";

// ── Command Registration ─────────────────────────────────────

export function registerCommands(app: App): void {
  app.command("/pm", async ({ command, ack, respond, client }) => {
    await ack();

    const text = command.text.trim();
    const args = text.split(/\s+/);
    const subcommand = args[0]?.toLowerCase() ?? "help";

    try {
      switch (subcommand) {
        case "task": {
          const action = args[1]?.toLowerCase();
          if (action === "done") {
            // Open modal with task picker instead of text-based lookup
            await openTaskDoneModal(client, command.trigger_id, command.user_id);
          } else {
            // Always open the full task creation modal
            await openNewTaskModal(client, command.trigger_id, command.channel_id);
          }
          break;
        }

        case "status": {
          // Open modal with project picker
          await openStatusModal(client, command.trigger_id);
          break;
        }

        case "standup": {
          await openStandupModal(client, command.trigger_id, command.channel_id);
          break;
        }

        case "project": {
          await openNewProjectModal(client, command.trigger_id, command.channel_id);
          break;
        }

        case "my-tasks": {
          await handleMyTasks(command, respond);
          break;
        }

        case "help":
        default: {
          await respond({
            response_type: "ephemeral",
            blocks: buildHelpCard(),
          });
          break;
        }
      }
    } catch (error) {
      console.error("Command error:", error);
      const message =
        error instanceof Error ? error.message : "An unexpected error occurred";
      await respond({
        response_type: "ephemeral",
        text: `❌ Error: ${message}`,
      });
    }
  });
}

// ── Subcommand Handlers ──────────────────────────────────────


async function handleMyTasks(
  command: { user_id: string },
  respond: (msg: Record<string, unknown>) => Promise<unknown>
): Promise<void> {
  const member = await prisma.member.findUnique({
    where: { slackId: command.user_id },
  });

  if (!member) {
    await respond({
      response_type: "ephemeral",
      text: "❌ You are not registered as a member yet. Join a project channel first.",
    });
    return;
  }

  const tasks = await prisma.task.findMany({
    where: { assignees: { some: { id: member.id } }, status: { not: "DONE" } },
    include: { project: true, assignees: true },
    orderBy: [
      { dueDate: "asc" },
      { priority: "desc" }
    ],
  });

  if (tasks.length === 0) {
    await respond({
      response_type: "ephemeral",
      text: "🎉 You have no open tasks! Great job.",
    });
    return;
  }

  const { buildWeeklyDigest } = await import("../utils/blockKit.js");
  
  await respond({
    response_type: "ephemeral",
    blocks: buildWeeklyDigest(member, tasks),
  });
}
