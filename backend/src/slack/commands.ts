import type { App } from "@slack/bolt";
import { prisma } from "../db/prisma.js";
import { createTask, updateTask, getTask } from "../services/taskService.js";
import {
  getProjectByChannel,
  findProjectByName,
} from "../services/projectService.js";
import { buildTaskCard, buildProjectStatusCard, buildHelpCard } from "../utils/blockKit.js";
import { extractDueDate } from "../utils/dateParser.js";
import { openStandupModal, openNewTaskModal } from "./modals.js";

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
          if (action === "create") {
            await handleTaskCreate(app, command, respond);
          } else if (action === "done") {
            await handleTaskDone(args[2], command, respond);
          } else {
            // Open the full task creation modal instead
            await openNewTaskModal(client, command.trigger_id, command.channel_id);
          }
          break;
        }

        case "status": {
          const projectName = args.slice(1).join(" ");
          await handleStatus(projectName, command, respond);
          break;
        }

        case "standup": {
          await openStandupModal(client, command.trigger_id, command.channel_id);
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

async function handleTaskCreate(
  _app: App,
  command: { text: string; channel_id: string; user_id: string },
  respond: (msg: Record<string, unknown>) => Promise<unknown>
): Promise<void> {
  const text = command.text;

  // Parse: /pm task create "Title" @user due:friday
  const titleMatch = text.match(/"([^"]+)"/);
  const title = titleMatch?.[1];
  if (!title) {
    await respond({
      response_type: "ephemeral",
      text: '❌ Please provide a task title in quotes: `/pm task create "My Task" @user due:friday`',
    });
    return;
  }

  // Find the project for this channel
  const project = await getProjectByChannel(command.channel_id);
  if (!project) {
    await respond({
      response_type: "ephemeral",
      text: "❌ This channel is not linked to a project. Link it first in the dashboard.",
    });
    return;
  }

  // Parse assignee (@user mention)
  const userMatch = text.match(/<@(\w+)(?:\|[^>]*)?>/);
  let assigneeId: string | undefined;
  if (userMatch?.[1]) {
    const member = await prisma.member.findUnique({
      where: { slackId: userMatch[1] },
    });
    if (member) {
      assigneeId = member.id;
    }
  }

  // Parse due date
  const dueDate = extractDueDate(text) ?? undefined;

  // Create task
  const task = await createTask({
    title,
    projectId: project.id,
    assigneeId,
    dueDate,
    slackMsgTs: undefined,
  });

  const assignee = assigneeId
    ? await prisma.member.findUnique({ where: { id: assigneeId } })
    : null;

  await respond({
    response_type: "in_channel",
    blocks: buildTaskCard(task, assignee, project),
    text: `✅ Task created: ${title}`,
  });
}

async function handleTaskDone(
  taskId: string | undefined,
  _command: { user_id: string },
  respond: (msg: Record<string, unknown>) => Promise<unknown>
): Promise<void> {
  if (!taskId) {
    await respond({
      response_type: "ephemeral",
      text: "❌ Please provide a task ID: `/pm task done [task-id]`",
    });
    return;
  }

  const task = await getTask(taskId);
  if (!task) {
    await respond({
      response_type: "ephemeral",
      text: `❌ Task not found: \`${taskId}\``,
    });
    return;
  }

  await updateTask(taskId, { status: "DONE" });

  await respond({
    response_type: "in_channel",
    text: `✅ Task completed: ~${task.title}~`,
  });
}

async function handleStatus(
  projectName: string,
  command: { channel_id: string },
  respond: (msg: Record<string, unknown>) => Promise<unknown>
): Promise<void> {
  let project;
  if (projectName) {
    project = await findProjectByName(projectName);
  } else {
    project = await getProjectByChannel(command.channel_id);
  }

  if (!project) {
    await respond({
      response_type: "ephemeral",
      text: projectName
        ? `❌ Project not found: "${projectName}"`
        : "❌ This channel is not linked to a project.",
    });
    return;
  }

  await respond({
    response_type: "ephemeral",
    blocks: buildProjectStatusCard(project, project.tasks),
  });
}
