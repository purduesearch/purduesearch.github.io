import type { App } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { prisma } from "../db/prisma.js";
import { createTask, updateTask, getTask, reassignTaskFromSlack, createSubtask } from "../services/taskService.js";
import { resolveSlackMember } from "../services/memberService.js";
import { getProjectByChannel } from "../services/projectService.js";
import { getMilestonesForProject } from "../services/milestoneService.js";
import { buildTaskCard, buildStandupMessage, buildProjectReport, buildProjectHealth, buildMilestoneView } from "../utils/blockKit.js";
import { logAuditEvent } from "../services/activityService.js";


// ── Modal Openers ────────────────────────────────────────────

export async function openStandupModal(
  client: WebClient,
  triggerId: string,
  channelId: string
): Promise<void> {
  await client.views.open({
    trigger_id: triggerId,
    view: {
      type: "modal",
      callback_id: "standup_submit",
      private_metadata: channelId,
      title: { type: "plain_text", text: "Daily Standup" },
      submit: { type: "plain_text", text: "Post Standup" },
      blocks: [
        {
          type: "input",
          block_id: "yesterday_block",
          label: { type: "plain_text", text: "What did you work on?" },
          element: {
            type: "plain_text_input",
            action_id: "yesterday",
            multiline: true,
            placeholder: {
              type: "plain_text",
              text: "Describe what you accomplished...",
            },
          },
        },
        {
          type: "input",
          block_id: "today_block",
          label: { type: "plain_text", text: "What are you doing next?" },
          element: {
            type: "plain_text_input",
            action_id: "today",
            multiline: true,
            placeholder: {
              type: "plain_text",
              text: "What's your plan for today...",
            },
          },
        },
        {
          type: "input",
          block_id: "blockers_block",
          label: { type: "plain_text", text: "Any blockers?" },
          optional: true,
          element: {
            type: "plain_text_input",
            action_id: "blockers",
            multiline: true,
            placeholder: {
              type: "plain_text",
              text: "Anything blocking your progress...",
            },
          },
        },
      ],
    },
  });
}

export async function openNewTaskModal(
  client: WebClient,
  triggerId: string,
  channelId: string,
  initialTitle?: string,
  initialDescription?: string,
  initialDueDate?: string,      // ISO "YYYY-MM-DD"
  initialAssignees?: string[],  // Slack user IDs
  initialParentTaskId?: string
): Promise<void> {
  // Get all active projects for the dropdown
  const projects = await prisma.project.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const projectOptions = projects.map((p) => ({
    text: { type: "plain_text" as const, text: p.name },
    value: p.id,
  }));

  // Try to pre-select the current channel's project
  const channelProject = await getProjectByChannel(channelId);

  // Fetch open tasks to allow picking a parent task
  const openTasks = await prisma.task.findMany({
    where: { status: { not: "DONE" }, parentTaskId: null },
    include: { project: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const parentTaskOptions = openTasks.map((t) => ({
    text: { type: "plain_text" as const, text: `${t.title} — ${t.project.name}`.slice(0, 75) },
    value: t.id,
  }));

  await client.views.open({
    trigger_id: triggerId,
    view: {
      type: "modal",
      callback_id: "new_task_submit",
      private_metadata: channelId,
      title: { type: "plain_text", text: "Create Task" },
      submit: { type: "plain_text", text: "Create" },
      blocks: [
        {
          type: "input",
          block_id: "title_block",
          label: { type: "plain_text", text: "Title" },
          element: {
            type: "plain_text_input",
            action_id: "title",
            placeholder: { type: "plain_text", text: "Task title..." },
            ...(initialTitle ? { initial_value: initialTitle } : {}),
          },
        },
        {
          type: "input",
          block_id: "description_block",
          label: { type: "plain_text", text: "Description" },
          optional: true,
          element: {
            type: "plain_text_input",
            action_id: "description",
            multiline: true,
            placeholder: { type: "plain_text", text: "Detailed description..." },
            ...(initialDescription ? { initial_value: initialDescription } : {}),
          },
        },
        {
          type: "input",
          block_id: "project_block",
          label: { type: "plain_text", text: "Project" },
          element: {
            type: "static_select",
            action_id: "project",
            placeholder: { type: "plain_text", text: "Select a project" },
            options: projectOptions.length > 0 ? projectOptions : [
              { text: { type: "plain_text", text: "No projects available" }, value: "none" },
            ],
            ...(channelProject
              ? {
                  initial_option: {
                    text: { type: "plain_text", text: channelProject.name },
                    value: channelProject.id,
                  },
                }
              : {}),
          },
        },
        {
          type: "input",
          block_id: "assignee_block",
          label: { type: "plain_text", text: "Assignee" },
          optional: true,
          element: {
            type: "multi_users_select",
            action_id: "assignees",
            placeholder: { type: "plain_text", text: "Select team members" },
            ...(initialAssignees && initialAssignees.length > 0
              ? { initial_users: initialAssignees }
              : {}),
          },
        },
        {
          type: "input",
          block_id: "due_date_block",
          label: { type: "plain_text", text: "Due Date" },
          optional: true,
          element: {
            type: "datepicker",
            action_id: "due_date",
            placeholder: { type: "plain_text", text: "Select a date" },
            ...(initialDueDate ? { initial_date: initialDueDate } : {}),
          },
        },
        ...(parentTaskOptions.length > 0
          ? [
              (() => {
                const preselected = initialParentTaskId
                  ? parentTaskOptions.find(o => o.value === initialParentTaskId)
                  : undefined;
                return {
                  type: "input" as const,
                  block_id: "parent_task_block",
                  label: { type: "plain_text" as const, text: "Parent Task (Make this a subtask)" },
                  optional: true,
                  element: {
                    type: "static_select" as const,
                    action_id: "parent_task",
                    placeholder: { type: "plain_text" as const, text: "Select a parent task" },
                    options: parentTaskOptions as any,
                    ...(preselected ? { initial_option: preselected } : {}),
                  },
                };
              })(),
            ]
          : []),
        {
          type: "input",
          block_id: "priority_block",
          label: { type: "plain_text", text: "Priority" },
          element: {
            type: "static_select",
            action_id: "priority",
            initial_option: {
              text: { type: "plain_text", text: "🟡 Medium" },
              value: "MEDIUM",
            },
            options: [
              {
                text: { type: "plain_text", text: "🟢 Low" },
                value: "LOW",
              },
              {
                text: { type: "plain_text", text: "🟡 Medium" },
                value: "MEDIUM",
              },
              {
                text: { type: "plain_text", text: "🟠 High" },
                value: "HIGH",
              },
              {
                text: { type: "plain_text", text: "🔴 Critical" },
                value: "CRITICAL",
              },
            ],
          },
        },
        // Fetch open milestones for the channel's project, add block if any exist
        ...(await (async () => {
          if (!channelProject) return [];
          const channelMilestones = await prisma.milestone.findMany({
            where: {
              projectId: channelProject.id,
              status: { notIn: ["COMPLETED", "CANCELLED"] },
            },
            select: { id: true, title: true },
            orderBy: { dueDate: "asc" },
          });
          if (channelMilestones.length === 0) return [];
          const milestoneOptions = channelMilestones.map((m) => ({
            text: { type: "plain_text" as const, text: `🎯 ${m.title}` },
            value: m.id,
          }));
          return [
            {
              type: "input" as const,
              block_id: "milestone_block",
              optional: true,
              label: { type: "plain_text" as const, text: "Milestone" },
              element: {
                type: "static_select" as const,
                action_id: "milestone",
                placeholder: {
                  type: "plain_text" as const,
                  text: "Link to a milestone (optional)",
                },
                options: milestoneOptions as any,
              },
            },
          ];
        })()),
      ],
    },
  });
}

export async function openNewProjectModal(
  client: WebClient,
  triggerId: string,
  channelId?: string
): Promise<void> {
  await client.views.open({
    trigger_id: triggerId,
    view: {
      type: "modal",
      callback_id: "new_project_submit",
      private_metadata: channelId || "",
      title: { type: "plain_text", text: "Create Project" },
      submit: { type: "plain_text", text: "Create" },
      blocks: [
        {
          type: "input",
          block_id: "name_block",
          label: { type: "plain_text", text: "Project Name" },
          element: {
            type: "plain_text_input",
            action_id: "name",
            placeholder: { type: "plain_text", text: "e.g. Lunar Rover" },
          },
        },
        {
          type: "input",
          block_id: "description_block",
          label: { type: "plain_text", text: "Description" },
          optional: true,
          element: {
            type: "plain_text_input",
            action_id: "description",
            multiline: true,
            placeholder: { type: "plain_text", text: "What is this project about?" },
          },
        },
        {
          type: "input",
          block_id: "type_block",
          label: { type: "plain_text", text: "Project Type" },
          element: {
            type: "static_select",
            action_id: "type",
            placeholder: { type: "plain_text", text: "Select type" },
            options: [
              { text: { type: "plain_text", text: "Engineering" }, value: "ENGINEERING" },
              { text: { type: "plain_text", text: "Research" }, value: "RESEARCH" },
              { text: { type: "plain_text", text: "Hybrid" }, value: "HYBRID" },
            ],
          },
        },
        {
          type: "input",
          block_id: "channel_block",
          label: { type: "plain_text", text: "Link Slack Channel" },
          optional: true,
          element: {
            type: "channels_select",
            action_id: "channel",
            placeholder: { type: "plain_text", text: "Select a channel" },
            ...(channelId ? { initial_channel: channelId } : {}),
          },
        },
        {
          type: "input",
          block_id: "drive_link_block",
          label: { type: "plain_text", text: "Google Drive Link" },
          hint: { type: "plain_text", text: "Paste the shared Google Drive folder link for project files." },
          element: {
            type: "plain_text_input",
            action_id: "drive_link",
            placeholder: { type: "plain_text", text: "https://drive.google.com/drive/folders/..." },
          },
        },
        {
          type: "input",
          block_id: "target_date_block",
          label: { type: "plain_text", text: "Target Completion Date" },
          optional: true,
          element: {
            type: "datepicker",
            action_id: "target_date",
            placeholder: { type: "plain_text", text: "Select a date" },
          },
        },
      ],
    },
  });
}


export async function openAddNoteModal(
  client: WebClient,
  triggerId: string,
  taskId: string
): Promise<void> {
  const task = await getTask(taskId);

  await client.views.open({
    trigger_id: triggerId,
    view: {
      type: "modal",
      callback_id: "add_note_submit",
      private_metadata: taskId,
      title: { type: "plain_text", text: "Add Note" },
      submit: { type: "plain_text", text: "Save Note" },
      blocks: [
        ...(task
          ? [
              {
                type: "section" as const,
                text: {
                  type: "mrkdwn" as const,
                  text: `*Task:* ${task.title}`,
                },
              },
              { type: "divider" as const },
            ]
          : []),
        {
          type: "input",
          block_id: "note_block",
          label: { type: "plain_text", text: "Note" },
          element: {
            type: "plain_text_input",
            action_id: "note",
            multiline: true,
            placeholder: {
              type: "plain_text",
              text: "Add your note...",
            },
          },
        },
      ],
    },
  });
}

// ── Report / Health / Milestones Picker ──────────────────────

async function buildProjectPickerModal(
  triggerId: string,
  callbackId: string,
  title: string,
  submitLabel: string
) {
  const projects = await prisma.project.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const options = projects.map(p => ({
    text: { type: "plain_text" as const, text: p.name },
    value: p.id,
  }));
  if (options.length === 0) {
    options.push({ text: { type: "plain_text", text: "No active projects" }, value: "none" });
  }

  return {
    trigger_id: triggerId,
    view: {
      type: "modal" as const,
      callback_id: callbackId,
      title: { type: "plain_text" as const, text: title },
      submit: { type: "plain_text" as const, text: submitLabel },
      blocks: [
        {
          type: "input" as const,
          block_id: "project_block",
          label: { type: "plain_text" as const, text: "Select a project" },
          element: {
            type: "static_select" as const,
            action_id: "project_id",
            placeholder: { type: "plain_text" as const, text: "Choose a project..." },
            options,
          },
        },
      ],
    },
  };
}

export async function openReportModal(client: WebClient, triggerId: string): Promise<void> {
  const payload = await buildProjectPickerModal(triggerId, "report_submit", "Project Report", "View Report 📊");
  await client.views.open(payload);
}

export async function openHealthModal(client: WebClient, triggerId: string): Promise<void> {
  const payload = await buildProjectPickerModal(triggerId, "health_submit", "Health Check", "Check Health 🏥");
  await client.views.open(payload);
}

export async function openMilestonesModal(client: WebClient, triggerId: string): Promise<void> {
  const payload = await buildProjectPickerModal(triggerId, "milestones_submit", "Milestones", "View Milestones 🏁");
  await client.views.open(payload);
}

// ── Modal Registration ───────────────────────────────────────

export function registerModals(app: App): void {
  // ── Standup Submission ────────────────────────────────────
  app.view("standup_submit", async ({ ack, body, view, client }) => {
    await ack();

    try {
      const channelId = view.private_metadata;
      const userId = body.user.id;

      const yesterday =
        view.state.values.yesterday_block?.yesterday?.value ?? "";
      const today = view.state.values.today_block?.today?.value ?? "";
      const blockers =
        view.state.values.blockers_block?.blockers?.value ?? "None";

      // Post standup message to channel (skip if no channel, e.g. from home tab)
      const blocks = buildStandupMessage(userId, {
        yesterday,
        today,
        blockers,
      });

      if (channelId) {
        await client.chat.postMessage({
          channel: channelId,
          blocks,
          text: `Standup update from <@${userId}>`,
        });
      }

      // Log as ProjectUpdate if channel is linked
      const project = await getProjectByChannel(channelId);
      if (project) {
        const member = await resolveSlackMember(userId);

        await prisma.projectUpdate.create({
          data: {
            projectId: project.id,
            authorId: member.id,
            content: `**Standup**\n\n**Worked on:** ${yesterday}\n\n**Next:** ${today}\n\n**Blockers:** ${blockers}`,
          },
        });

        logAuditEvent({
          projectId: project.id,
          memberId:  member.id,
          source:    "SLACK",
          eventType: "STANDUP_POSTED",
          payload:   { preview: `${yesterday} / ${today}`.slice(0, 120) },
        }).catch(console.error);
      }
    } catch (error) {
      console.error("Standup submission error:", error);
    }
  });

  // ── New Task Submission ──────────────────────────────────
  app.view("new_task_submit", async ({ ack, view, client }) => {
    await ack();

    try {
      const channelId = view.private_metadata;
      const values = view.state.values;

      const title = values.title_block?.title?.value ?? "Untitled";
      const description =
        values.description_block?.description?.value ?? undefined;
      const projectId =
        values.project_block?.project?.selected_option?.value ?? "";
      const assigneeSlackIds =
        values.assignee_block?.assignees?.selected_users ?? [];
      const dueDateStr =
        values.due_date_block?.due_date?.selected_date ?? undefined;
      const priority =
        (values.priority_block?.priority?.selected_option?.value as
          | "LOW"
          | "MEDIUM"
          | "HIGH"
          | "CRITICAL") ?? "MEDIUM";
      const parentTaskId =
        values.parent_task_block?.parent_task?.selected_option?.value ?? undefined;
      const milestoneId =
        values.milestone_block?.milestone?.selected_option?.value ?? undefined;

      if (!projectId || projectId === "none") return;

      // Resolve assignees
      const assigneeIds = await Promise.all(
        assigneeSlackIds.map(slackId => resolveSlackMember(slackId, client).then(m => m.id))
      );

      // Parse due date
      const dueDate = dueDateStr ? new Date(dueDateStr) : undefined;

      // Create task
      const task = await createTask({
        title,
        description,
        projectId,
        assigneeIds,
        dueDate,
        priority,
        parentTaskId,
        milestoneId,
      });

      if (task.milestoneId) {
        const { refreshMilestoneHealth } = await import("../services/milestoneService.js");
        refreshMilestoneHealth(task.milestoneId).catch(console.error);
      }

      // Fetch full task with relations for the card
      const fullTask = await getTask(task.id);
      if (fullTask) {
        const project = await prisma.project.findUnique({
          where: { id: projectId },
        });
        if (project) {
          const result = await client.chat.postMessage({
            channel: channelId,
            blocks: buildTaskCard(fullTask, project),
            text: `✅ New task created: ${title}`,
          });
          if (result.ts) {
            await prisma.task.update({
              where: { id: task.id },
              data: { slackMsgTs: result.ts as string },
            });
          }
        }
      }

      const actor = await resolveSlackMember(view.user?.id ?? body.user.id).catch(() => null);
      logAuditEvent({
        projectId,
        taskId:   task.id,
        memberId: actor?.id ?? null,
        source:   "SLACK",
        eventType: "TASK_CREATED",
        payload: {
          taskTitle:     task.title,
          priority:      task.priority,
          assigneeNames: fullTask?.assignees?.map((a: any) => a.displayName) ?? [],
        },
      }).catch(console.error);
    } catch (error) {
      console.error("New task submission error:", error);
    }
  });

  // ── Add Note Submission ──────────────────────────────────
  app.view("add_note_submit", async ({ ack, body, view }) => {
    await ack();

    try {
      const taskId = view.private_metadata;
      const note = view.state.values.note_block?.note?.value ?? "";
      const userId = body.user.id;

      const task = await getTask(taskId);
      if (!task) return;

      // Append note to task description
      const existingDesc = task.description ?? "";
      const timestamp = new Date().toLocaleString("en-US", {
        dateStyle: "short",
        timeStyle: "short",
      });
      const updatedDesc = existingDesc
        ? `${existingDesc}\n\n---\n📝 Note by <@${userId}> (${timestamp}):\n${note}`
        : `📝 Note by <@${userId}> (${timestamp}):\n${note}`;

      await updateTask(taskId, { description: updatedDesc });

      // Also log as a project update
      let member = await prisma.member.findUnique({
        where: { slackId: userId },
      });

      if (member && task.projectId) {
        await prisma.projectUpdate.create({
          data: {
            projectId: task.projectId,
            authorId: member.id,
            content: `📝 Note on task "${task.title}": ${note}`,
          },
        });

        logAuditEvent({
          taskId:   taskId,
          memberId: member.id,
          source:   "SLACK",
          eventType: "TASK_NOTE_ADDED",
          payload:  { taskTitle: task.title, preview: note.slice(0, 120) },
        }).catch(console.error);
      }
    } catch (error) {
      console.error("Add note submission error:", error);
    }
  });

  // ── Reassign Submission ──────────────────────────────────
  app.view("reassign_submit", async ({ ack, body, view, client }) => {
    await ack();

    try {
      const taskId = view.private_metadata;
      const selectedUserId =
        view.state.values.user_block?.selected_user?.selected_user;

      if (!selectedUserId) return;

      const member = await resolveSlackMember(selectedUserId, client);
      const prevTask = await getTask(taskId);
      const prevAssigneeNames = prevTask?.assignees?.map((a: any) => a.displayName) ?? [];

      await reassignTaskFromSlack(taskId, member.id);

      const task = await getTask(taskId);
      if (task) {
        // Notify in DM to the assigner
        await client.chat.postMessage({
          channel: body.user.id,
          text: `✅ Task "${task.title}" has been reassigned to <@${selectedUserId}>.`,
        });
      }

      const actor = await resolveSlackMember(body.user.id).catch(() => null);
      logAuditEvent({
        taskId:   taskId,
        memberId: actor?.id ?? null,
        source:   "SLACK",
        eventType: "TASK_REASSIGNED",
        payload: {
          taskTitle: prevTask?.title ?? "",
          fromName:  prevAssigneeNames.join(", ") || null,
          toName:    member.displayName,
        },
      }).catch(console.error);
    } catch (error) {
      console.error("Reassign submission error:", error);
    }
  });

  // ── New Project Submission ────────────────────────────────
  app.view("new_project_submit", async ({ ack, view, client, body }) => {
    await ack();

    try {
      const values = view.state.values;
      const name = values.name_block?.name?.value ?? "Untitled Project";
      const description = values.description_block?.description?.value ?? null;
      const type = (values.type_block?.type?.selected_option?.value as any) ?? "ENGINEERING";
      const driveLink = values.drive_link_block?.drive_link?.value ?? null;
      const slackChannel = values.channel_block?.channel?.selected_channel ?? null;
      const targetDateStr = values.target_date_block?.target_date?.selected_date ?? null;
      const targetDate = targetDateStr ? new Date(targetDateStr) : null;

      const project = await prisma.project.create({
        data: {
          name,
          description,
          driveLink,
          type,
          slackChannel,
          targetDate,
        },
      });

      const projectActor = await resolveSlackMember(body.user.id).catch(() => null);
      logAuditEvent({
        projectId: project.id,
        memberId:  projectActor?.id ?? null,
        source:    "SLACK",
        eventType: "PROJECT_CREATED",
        payload:   { projectName: project.name },
      }).catch(console.error);

      // Create a notification target for the linked channel (new architecture)
      if (slackChannel) {
        await prisma.projectNotificationTarget.create({
          data: {
            projectId: project.id,
            type: "CHANNEL",
            slackChannelId: slackChannel,
            eventTypes: ["TASK_CREATED", "STATUS_CHANGED", "MILESTONE_CREATED"],
          },
        });
      }

      // Notify the user
      await client.chat.postMessage({
        channel: body.user.id,
        text: `✅ Project *${name}* created successfully!\nView it on the dashboard: ${process.env.FRONTEND_URL}/clubpm/projects/${project.id}`,
      });

      // If a channel was linked, post a welcome message there
      if (slackChannel) {
        await client.chat.postMessage({
          channel: slackChannel,
          text: `🚀 This channel is now linked to the project *${name}*! Use \`/pm\` to manage tasks.`,
        });
      }
    } catch (error: any) {
      console.error("New project submission error:", error);
      // DM the user with a meaningful error
      const msg = error?.code === "P2002"
        ? "❌ That Slack channel is already linked to another project. Please pick a different channel or leave it blank."
        : `❌ Failed to create project: ${error?.message ?? "Unknown error"}`;
      try {
        await client.chat.postMessage({ channel: body.user.id, text: msg });
      } catch { /* silent */ }
    }
  });

  // ── Snooze Task Submission ─────────────────────────────────
  app.view("snooze_submit", async ({ ack, view, client, body }) => {
    await ack();

    try {
      const taskId = view.private_metadata;
      const values = view.state.values;
      const dateStr = values.date_block?.due_date?.selected_date;

      if (!dateStr) return;
      const dueDate = new Date(dateStr);

      await updateTask(taskId, { dueDate });

      const task = await getTask(taskId);
      if (task) {
        // Notify in DM
        await client.chat.postMessage({
          channel: body.user.id,
          text: `✅ Task "${task.title}" has been snoozed to ${dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`,
        });
      }

      const snoozeActor = await resolveSlackMember(body.user.id).catch(() => null);
      logAuditEvent({
        taskId:   taskId,
        memberId: snoozeActor?.id ?? null,
        source:   "SLACK",
        eventType: "TASK_SNOOZED",
        payload:  { taskTitle: task?.title ?? "", newDueDate: dateStr },
      }).catch(console.error);
    } catch (error) {
      console.error("Snooze submission error:", error);
    }
  });

  // ── Task Done Submission ──────────────────────────────────
  app.view("task_done_submit", async ({ ack, view, client, body }) => {
    await ack();
    try {
      const taskId = view.state.values.task_block?.task_id?.selected_option?.value;
      if (!taskId || taskId === "none") return;

      const task = await getTask(taskId);
      if (!task) return;

      await updateTask(taskId, { status: "DONE" });

      await client.chat.postMessage({
        channel: body.user.id,
        text: `✅ Task marked as done: *${task.title}*`,
      });

      const doneActor = await resolveSlackMember(body.user.id).catch(() => null);
      logAuditEvent({
        taskId:   taskId,
        memberId: doneActor?.id ?? null,
        source:   "SLACK",
        eventType: "TASK_COMPLETED",
        payload:  { taskTitle: task.title },
      }).catch(console.error);
    } catch (error) {
      console.error("task_done_submit error:", error);
    }
  });

  // ── Status View Submission ────────────────────────────────
  app.view("status_view_submit", async ({ ack, view, client, body }) => {
    await ack();
    try {
      const projectId = view.state.values.project_block?.project_id?.selected_option?.value;
      if (!projectId || projectId === "none") return;

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          tasks: { include: { assignees: true } },
          members: { include: { member: true } },
        },
      });
      if (!project) return;

      const { buildProjectStatusCard } = await import("../utils/blockKit.js");
      await client.chat.postMessage({
        channel: body.user.id,
        blocks: buildProjectStatusCard(project, project.tasks),
        text: `Status for ${project.name}`,
      });
    } catch (error) {
      console.error("status_view_submit error:", error);
    }
  });

  // ── Notify Preferences Submission ────────────────────────
  app.view("notify_submit", async ({ ack, body, view }) => {
    await ack();
    try {
      const selected: { value: string }[] =
        view.state.values.prefs_block?.prefs?.selected_options ?? [];
      const prefs = selected.map(o => o.value);

      await prisma.member.update({
        where: { slackId: body.user.id },
        data: { notificationPrefs: prefs },
      });
    } catch (error) {
      console.error("notify_submit error:", error);
    }
  });

  // ── Report Submission ─────────────────────────────────────
  app.view("report_submit", async ({ ack, view, client, body }) => {
    await ack();
    try {
      const projectId = view.state.values.project_block?.project_id?.selected_option?.value;
      if (!projectId || projectId === "none") return;

      const [project, milestones] = await Promise.all([
        prisma.project.findUnique({
          where: { id: projectId },
          include: { tasks: { include: { assignees: true } } },
        }),
        getMilestonesForProject(projectId),
      ]);
      if (!project) return;

      const now = new Date();
      const topLevel = project.tasks.filter(t => !t.parentTaskId);
      const statusCounts: Record<string, number> = { TODO: 0, IN_PROGRESS: 0, BLOCKED: 0, DONE: 0 };
      for (const t of topLevel) statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
      const overdueCount = topLevel.filter(t => t.status !== "DONE" && t.dueDate && t.dueDate < now).length;

      await client.chat.postMessage({
        channel: body.user.id,
        blocks: buildProjectReport(project, project.tasks, milestones, statusCounts, overdueCount),
        text: `Report for ${project.name}`,
      });
    } catch (error) {
      console.error("report_submit error:", error);
    }
  });

  // ── Health Submission ─────────────────────────────────────
  app.view("health_submit", async ({ ack, view, client, body }) => {
    await ack();
    try {
      const projectId = view.state.values.project_block?.project_id?.selected_option?.value;
      if (!projectId || projectId === "none") return;

      const [project, milestones] = await Promise.all([
        prisma.project.findUnique({
          where: { id: projectId },
          include: { tasks: { include: { assignees: true } } },
        }),
        getMilestonesForProject(projectId),
      ]);
      if (!project) return;

      const now = new Date();
      const topLevel = project.tasks.filter(t => !t.parentTaskId);
      const statusCounts: Record<string, number> = { TODO: 0, IN_PROGRESS: 0, BLOCKED: 0, DONE: 0 };
      for (const t of topLevel) statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
      const overdueCount = topLevel.filter(t => t.status !== "DONE" && t.dueDate && t.dueDate < now).length;

      await client.chat.postMessage({
        channel: body.user.id,
        blocks: buildProjectHealth(project, project.tasks, milestones, statusCounts, overdueCount),
        text: `Health check for ${project.name}`,
      });
    } catch (error) {
      console.error("health_submit error:", error);
    }
  });

  // ── Milestones Submission ──────────────────────────────────
  app.view("milestones_submit", async ({ ack, view, client, body }) => {
    await ack();
    try {
      const projectId = view.state.values.project_block?.project_id?.selected_option?.value;
      if (!projectId || projectId === "none") return;

      const [project, milestones] = await Promise.all([
        prisma.project.findUnique({ where: { id: projectId } }),
        getMilestonesForProject(projectId),
      ]);
      if (!project) return;

      await client.chat.postMessage({
        channel: body.user.id,
        blocks: buildMilestoneView(project, milestones),
        text: `Milestones for ${project.name}`,
      });
    } catch (error) {
      console.error("milestones_submit error:", error);
    }
  });

  // ── Subtask Submission ────────────────────────────────────
  app.view("subtask_submit", async ({ ack, view, client }) => {
    await ack();

    try {
      const channelId = view.private_metadata;
      const values = view.state.values;
      const parentTaskId = values.parent_block?.parent_task?.selected_option?.value;
      const title = values.title_block?.title?.value ?? "Untitled";
      const assigneeSlackIds = values.assignee_block?.assignees?.selected_users ?? [];

      if (!parentTaskId || parentTaskId === "none") return;

      const assigneeIds = await Promise.all(
        assigneeSlackIds.map((slackId: string) => resolveSlackMember(slackId, client).then(m => m.id))
      );

      const subtask = await createSubtask(parentTaskId, { title, assigneeIds });

      if (channelId) {
        await client.chat.postMessage({
          channel: channelId,
          blocks: buildTaskCard(subtask, subtask.project),
          text: `✅ Subtask created: ${title}`,
        });
      }
    } catch (error) {
      console.error("subtask_submit error:", error);
    }
  });

  // ── Milestone Submission ───────────────────────────────────
  app.view("milestone_submit", async ({ ack, view, client }) => {
    await ack();
    try {
      const channelId = view.private_metadata;
      const v = view.state.values;
      const projectId = v.project_block?.project?.selected_option?.value;
      const title = v.title_block?.title?.value ?? "Untitled Milestone";
      const description = v.description_block?.description?.value ?? null;
      const dueDateStr = v.due_date_block?.due_date?.selected_date;
      const ownerSlackId = v.owner_block?.owner?.selected_user ?? null;

      if (!projectId || projectId === "none" || !dueDateStr) return;

      let ownerId: string | null = null;
      if (ownerSlackId) {
        try {
          const owner = await resolveSlackMember(ownerSlackId, client);
          ownerId = owner.id;
        } catch {
          // owner resolution failed, proceed without owner
        }
      }

      await prisma.milestone.create({
        data: {
          projectId,
          title,
          description,
          dueDate: new Date(dueDateStr),
          ownerId,
        },
      });

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { notificationTargets: { where: { type: "CHANNEL" } } },
      });
      const targetChannel =
        project?.notificationTargets?.[0]?.slackChannelId ?? channelId;

      const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";
      const dateStr = new Date(dueDateStr).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });

      await client.chat.postMessage({
        channel: targetChannel,
        text: `🎯 New milestone: *${title}* — target ${dateStr}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: [
                `🎯 *New Milestone Created*`,
                `*${title}*`,
                description ? `_${description}_` : null,
                `Target: *${dateStr}*`,
                ownerSlackId ? `Owner: <@${ownerSlackId}>` : null,
              ]
                .filter(Boolean)
                .join("\n"),
            },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "View Dashboard" },
                url: `${frontendUrl}/clubpm/projects/${projectId}?tab=milestones`,
                action_id: "view_milestone_project",
              },
            ],
          },
        ],
      });
    } catch (error) {
      console.error("milestone_submit error:", error);
    }
  });
}

// ── Subtask Modal Builder ────────────────────────────────────

export async function openSubtaskModal(
  client: WebClient,
  triggerId: string,
  channelId: string
): Promise<void> {
  const openTasks = await prisma.task.findMany({
    where: { status: { not: "DONE" }, parentTaskId: null },
    include: { project: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const parentOptions = openTasks.map(t => ({
    text: { type: "plain_text" as const, text: `${t.title} — ${t.project.name}`.slice(0, 75) },
    value: t.id,
  }));

  if (parentOptions.length === 0) {
    parentOptions.push({ text: { type: "plain_text", text: "No open tasks available" }, value: "none" });
  }

  await client.views.open({
    trigger_id: triggerId,
    view: {
      type: "modal",
      callback_id: "subtask_submit",
      private_metadata: channelId,
      title: { type: "plain_text", text: "Create Subtask" },
      submit: { type: "plain_text", text: "Create" },
      blocks: [
        {
          type: "input",
          block_id: "parent_block",
          label: { type: "plain_text", text: "Parent Task" },
          element: {
            type: "static_select",
            action_id: "parent_task",
            placeholder: { type: "plain_text", text: "Select a parent task" },
            options: parentOptions as any,
          },
        },
        {
          type: "input",
          block_id: "title_block",
          label: { type: "plain_text", text: "Subtask Title" },
          element: {
            type: "plain_text_input",
            action_id: "title",
            placeholder: { type: "plain_text", text: "Subtask title..." },
          },
        },
        {
          type: "input",
          block_id: "assignee_block",
          label: { type: "plain_text", text: "Assignee" },
          optional: true,
          element: {
            type: "multi_users_select",
            action_id: "assignees",
            placeholder: { type: "plain_text", text: "Select team members" },
          },
        },
      ],
    },
  });
}

// ── Notify Preferences Modal ─────────────────────────────────

export async function openNotifyModal(
  client: WebClient,
  triggerId: string,
  member: { notificationPrefs: string[] }
): Promise<void> {
  const allOptions = [
    { text: { type: "plain_text" as const, text: "⏰ Daily reminders (overdue + due today)" }, value: "daily_reminders" },
    { text: { type: "plain_text" as const, text: "📋 Monday weekly digest" }, value: "weekly_digest" },
    { text: { type: "plain_text" as const, text: "📊 Project health summaries" }, value: "project_updates" },
    { text: { type: "plain_text" as const, text: "🧍 Daily standup prompts (weekdays 9:15 AM)" }, value: "standup_prompts" },
  ];

  const initialOptions = allOptions.filter(o => member.notificationPrefs.includes(o.value));

  await client.views.open({
    trigger_id: triggerId,
    view: {
      type: "modal",
      callback_id: "notify_submit",
      title: { type: "plain_text", text: "Notification Settings" },
      submit: { type: "plain_text", text: "Save" },
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: "Choose which notifications to receive:" },
        },
        {
          type: "input",
          block_id: "prefs_block",
          optional: true,
          label: { type: "plain_text", text: "Notification types" },
          element: {
            type: "checkboxes",
            action_id: "prefs",
            options: allOptions,
            ...(initialOptions.length > 0 ? { initial_options: initialOptions } : {}),
          },
        },
      ],
    },
  });
}

// ── Snooze Modal Builder ─────────────────────────────────────

export async function openSnoozeModal(
  client: WebClient,
  triggerId: string,
  taskId: string
): Promise<void> {
  const task = await getTask(taskId);
  if (!task) return;

  await client.views.open({
    trigger_id: triggerId,
    view: {
      type: "modal",
      callback_id: "snooze_submit",
      private_metadata: taskId,
      title: { type: "plain_text", text: "Snooze Task" },
      submit: { type: "plain_text", text: "Save" },
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Select a new due date for *${task.title}*:`,
          },
        },
        {
          type: "input",
          block_id: "date_block",
          label: { type: "plain_text", text: "New Due Date" },
          element: {
            type: "datepicker",
            action_id: "due_date",
            initial_date: task.dueDate
              ? task.dueDate.toISOString().split("T")[0]
              : new Date().toISOString().split("T")[0],
            placeholder: {
              type: "plain_text",
              text: "Select a date",
            },
          },
        },
      ],
    },
  });
}

// ── Task Done Picker Modal ────────────────────────────────────

export async function openTaskDoneModal(
  client: WebClient,
  triggerId: string,
  userId: string
): Promise<void> {
  // Get open tasks for this user's channel or all tasks assigned to them
  const member = await prisma.member.findUnique({ where: { slackId: userId } });

  const tasks = await prisma.task.findMany({
    where: member
      ? { assignees: { some: { id: member.id } }, status: { not: "DONE" } }
      : { status: { not: "DONE" } },
    include: { project: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const options = tasks.map(t => ({
    text: { type: "plain_text" as const, text: `${t.title} — ${t.project.name}`.slice(0, 75) },
    value: t.id,
  }));

  if (options.length === 0) {
    options.push({ text: { type: "plain_text", text: "No open tasks found" }, value: "none" });
  }

  await client.views.open({
    trigger_id: triggerId,
    view: {
      type: "modal",
      callback_id: "task_done_submit",
      title: { type: "plain_text", text: "Mark Task Done" },
      submit: { type: "plain_text", text: "Mark Done ✅" },
      blocks: [
        {
          type: "input",
          block_id: "task_block",
          label: { type: "plain_text", text: "Select a task to complete" },
          element: {
            type: "static_select",
            action_id: "task_id",
            placeholder: { type: "plain_text", text: "Choose a task..." },
            options,
          },
        },
      ],
    },
  });
}

// ── Status Picker Modal ───────────────────────────────────────

export async function openStatusModal(
  client: WebClient,
  triggerId: string
): Promise<void> {
  const projects = await prisma.project.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const options = projects.map(p => ({
    text: { type: "plain_text" as const, text: p.name },
    value: p.id,
  }));

  if (options.length === 0) {
    options.push({ text: { type: "plain_text", text: "No active projects" }, value: "none" });
  }

  await client.views.open({
    trigger_id: triggerId,
    view: {
      type: "modal",
      callback_id: "status_view_submit",
      title: { type: "plain_text", text: "Project Status" },
      submit: { type: "plain_text", text: "View Status 📊" },
      blocks: [
        {
          type: "input",
          block_id: "project_block",
          label: { type: "plain_text", text: "Select a project" },
          element: {
            type: "static_select",
            action_id: "project_id",
            placeholder: { type: "plain_text", text: "Choose a project..." },
            options,
          },
        },
      ],
    },
  });
}

// ── Milestone Creation Modal ──────────────────────────────────

export async function openMilestoneModal(
  client: WebClient,
  triggerId: string,
  channelId: string
): Promise<void> {
  const channelProject = await getProjectByChannel(channelId);
  const projects = await prisma.project.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const projectOptions = projects.map((p) => ({
    text: { type: "plain_text" as const, text: p.name },
    value: p.id,
  }));

  const safeOptions = projectOptions.length > 0
    ? projectOptions
    : [{ text: { type: "plain_text" as const, text: "No active projects" }, value: "none" }];

  await client.views.open({
    trigger_id: triggerId,
    view: {
      type: "modal",
      callback_id: "milestone_submit",
      private_metadata: channelId,
      title: { type: "plain_text", text: "Create Milestone" },
      submit: { type: "plain_text", text: "Create" },
      blocks: [
        {
          type: "input",
          block_id: "project_block",
          label: { type: "plain_text", text: "Project" },
          element: {
            type: "static_select",
            action_id: "project",
            placeholder: { type: "plain_text", text: "Select a project" },
            options: safeOptions as any,
            ...(channelProject && projectOptions.find((o) => o.value === channelProject.id)
              ? {
                  initial_option: {
                    text: { type: "plain_text" as const, text: channelProject.name },
                    value: channelProject.id,
                  },
                }
              : {}),
          },
        },
        {
          type: "input",
          block_id: "title_block",
          label: { type: "plain_text", text: "Milestone Title" },
          element: {
            type: "plain_text_input",
            action_id: "title",
            placeholder: { type: "plain_text", text: "e.g. Alpha Release" },
          },
        },
        {
          type: "input",
          block_id: "description_block",
          optional: true,
          label: { type: "plain_text", text: "Acceptance Criteria" },
          element: {
            type: "plain_text_input",
            action_id: "description",
            multiline: true,
            placeholder: { type: "plain_text", text: "What does done look like for this milestone?" },
          },
        },
        {
          type: "input",
          block_id: "due_date_block",
          label: { type: "plain_text", text: "Target Date" },
          element: {
            type: "datepicker",
            action_id: "due_date",
            placeholder: { type: "plain_text", text: "Select target date" },
          },
        },
        {
          type: "input",
          block_id: "owner_block",
          optional: true,
          label: { type: "plain_text", text: "Owner" },
          element: {
            type: "users_select",
            action_id: "owner",
            placeholder: { type: "plain_text", text: "Assign an owner" },
          },
        },
      ],
    },
  });
}
