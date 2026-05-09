import type { App } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { prisma } from "../db/prisma.js";
import { createTask, updateTask, getTask } from "../services/taskService.js";
import { getProjectByChannel } from "../services/projectService.js";
import { buildTaskCard, buildStandupMessage } from "../utils/blockKit.js";


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
  initialTitle?: string
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
            placeholder: {
              type: "plain_text",
              text: "Detailed description...",
            },
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
            placeholder: {
              type: "plain_text",
              text: "Select team members",
            },
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
          },
        },
        ...(parentTaskOptions.length > 0
          ? [
              {
                type: "input" as const,
                block_id: "parent_task_block",
                label: { type: "plain_text" as const, text: "Parent Task (Make this a subtask)" },
                optional: true,
                element: {
                  type: "static_select" as const,
                  action_id: "parent_task",
                  placeholder: { type: "plain_text" as const, text: "Select a parent task" },
                  options: parentTaskOptions as any,
                },
              },
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

      // Post standup message to channel
      const blocks = buildStandupMessage(userId, {
        yesterday,
        today,
        blockers,
      });

      await client.chat.postMessage({
        channel: channelId,
        blocks,
        text: `Standup update from <@${userId}>`,
      });

      // Log as ProjectUpdate if channel is linked
      const project = await getProjectByChannel(channelId);
      if (project) {
        let member = await prisma.member.findUnique({
          where: { slackId: userId },
        });

        if (!member) {
          member = await prisma.member.create({
            data: {
              slackId: userId,
              slackHandle: userId,
              displayName: body.user.id,
            },
          });
        }

        await prisma.projectUpdate.create({
          data: {
            projectId: project.id,
            authorId: member.id,
            content: `**Standup**\n\n**Worked on:** ${yesterday}\n\n**Next:** ${today}\n\n**Blockers:** ${blockers}`,
          },
        });
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

      if (!projectId || projectId === "none") return;

      // Resolve assignees
      const assigneeIds: string[] = [];
      for (const slackId of assigneeSlackIds) {
        let member = await prisma.member.findUnique({
          where: { slackId },
        });
        if (!member) {
          const userInfo = await client.users.info({ user: slackId });
          const profile = userInfo.user?.profile;
          member = await prisma.member.create({
            data: {
              slackId,
              slackHandle: userInfo.user?.name ?? slackId,
              displayName:
                profile?.display_name || profile?.real_name || slackId,
              avatarUrl: profile?.image_72 ?? undefined,
            },
          });
        }
        assigneeIds.push(member.id);
      }

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
      });

      // Fetch full task with relations for the card
      const fullTask = await getTask(task.id);
      if (fullTask) {
        const project = await prisma.project.findUnique({
          where: { id: projectId },
        });
        if (project) {
          await client.chat.postMessage({
            channel: channelId,
            blocks: buildTaskCard(fullTask, project),
            text: `✅ New task created: ${title}`,
          });
        }
      }
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

      // Find or create member
      let member = await prisma.member.findUnique({
        where: { slackId: selectedUserId },
      });

      if (!member) {
        const userInfo = await client.users.info({ user: selectedUserId });
        const profile = userInfo.user?.profile;
        member = await prisma.member.create({
          data: {
            slackId: selectedUserId,
            slackHandle: userInfo.user?.name ?? selectedUserId,
            displayName:
              profile?.display_name || profile?.real_name || selectedUserId,
            avatarUrl: profile?.image_72 ?? undefined,
          },
        });
      }

      await updateTask(taskId, { assigneeIds: [member.id] });

      const task = await getTask(taskId);
      if (task) {
        // Notify in DM to the assigner
        await client.chat.postMessage({
          channel: body.user.id,
          text: `✅ Task "${task.title}" has been reassigned to <@${selectedUserId}>.`,
        });
      }
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
      const slackChannel = values.channel_block?.channel?.selected_channel ?? null;
      const targetDateStr = values.target_date_block?.target_date?.selected_date ?? null;
      const targetDate = targetDateStr ? new Date(targetDateStr) : null;

      const project = await prisma.project.create({
        data: {
          name,
          description,
          type,
          slackChannel,
          targetDate,
        },
      });

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
