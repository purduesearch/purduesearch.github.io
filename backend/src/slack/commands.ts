import type { App } from "@slack/bolt";
import { prisma } from "../db/prisma.js";
import { buildHelpCard, buildProjectReport, buildProjectHealth, buildMilestoneView } from "../utils/blockKit.js";
import { openStandupModal, openNewTaskModal, openNewProjectModal, openTaskDoneModal, openStatusModal, openSubtaskModal, openNotifyModal, openReportModal, openHealthModal, openMilestonesModal } from "./modals.js";
import { getProjectByChannel } from "../services/projectService.js";
import { getMilestonesForProject } from "../services/milestoneService.js";

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

        case "subtask": {
          await openSubtaskModal(client, command.trigger_id, command.channel_id);
          break;
        }

        case "my-tasks": {
          await handleMyTasks(command, respond);
          break;
        }

        case "notify": {
          const member = await prisma.member.findUnique({
            where: { slackId: command.user_id },
          });
          if (!member) {
            await respond({ response_type: "ephemeral", text: "❌ You are not registered as a member yet." });
            break;
          }
          await openNotifyModal(client, command.trigger_id, member);
          break;
        }

        case "report": {
          const project = await getProjectByChannel(command.channel_id);
          if (project) {
            await handleReport(project.id, respond);
          } else {
            await openReportModal(client, command.trigger_id);
          }
          break;
        }

        case "health": {
          const project = await getProjectByChannel(command.channel_id);
          if (project) {
            await handleHealth(project.id, respond);
          } else {
            await openHealthModal(client, command.trigger_id);
          }
          break;
        }

        case "milestones": {
          const project = await getProjectByChannel(command.channel_id);
          if (project) {
            await handleMilestones(project.id, respond);
          } else {
            await openMilestonesModal(client, command.trigger_id);
          }
          break;
        }

        case "milestone": {
          const { openMilestoneModal } = await import("./modals.js");
          await openMilestoneModal(client, command.trigger_id, command.channel_id);
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


type RespondFn = (msg: Record<string, unknown>) => Promise<unknown>;

async function fetchReportData(projectId: string) {
  const [project, milestones] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      include: { tasks: { include: { assignees: true } } },
    }),
    getMilestonesForProject(projectId),
  ]);
  if (!project) return null;
  const now = new Date();
  const topLevel = project.tasks.filter((t: any) => !t.parentTaskId);
  const statusCounts: Record<string, number> = { TODO: 0, IN_PROGRESS: 0, BLOCKED: 0, DONE: 0 };
  for (const t of topLevel) statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
  const overdueCount = topLevel.filter((t: any) => t.status !== "DONE" && t.dueDate && t.dueDate < now).length;
  return { project, milestones, statusCounts, overdueCount };
}

async function handleReport(projectId: string, respond: RespondFn): Promise<void> {
  const data = await fetchReportData(projectId);
  if (!data) return;
  const { project, milestones, statusCounts, overdueCount } = data;
  await respond({
    response_type: "ephemeral",
    blocks: buildProjectReport(project, project.tasks, milestones, statusCounts, overdueCount),
  });
}

async function handleHealth(projectId: string, respond: RespondFn): Promise<void> {
  const data = await fetchReportData(projectId);
  if (!data) return;
  const { project, milestones, statusCounts, overdueCount } = data;
  await respond({
    response_type: "ephemeral",
    blocks: buildProjectHealth(project, project.tasks, milestones, statusCounts, overdueCount),
  });
}

async function handleMilestones(projectId: string, respond: RespondFn): Promise<void> {
  const [project, milestones] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    getMilestonesForProject(projectId),
  ]);
  if (!project) return;
  await respond({
    response_type: "ephemeral",
    blocks: buildMilestoneView(project, milestones),
  });
}

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
