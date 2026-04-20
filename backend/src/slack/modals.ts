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
  channelId: string
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
            type: "users_select",
            action_id: "assignee",
            placeholder: {
              type: "plain_text",
              text: "Select a team member",
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
      const assigneeSlackId =
        values.assignee_block?.assignee?.selected_user ?? undefined;
      const dueDateStr =
        values.due_date_block?.due_date?.selected_date ?? undefined;
      const priority =
        (values.priority_block?.priority?.selected_option?.value as
          | "LOW"
          | "MEDIUM"
          | "HIGH"
          | "CRITICAL") ?? "MEDIUM";

      if (!projectId || projectId === "none") return;

      // Resolve assignee
      let assigneeId: string | undefined;
      if (assigneeSlackId) {
        let member = await prisma.member.findUnique({
          where: { slackId: assigneeSlackId },
        });
        if (!member) {
          const userInfo = await client.users.info({ user: assigneeSlackId });
          const profile = userInfo.user?.profile;
          member = await prisma.member.create({
            data: {
              slackId: assigneeSlackId,
              slackHandle: userInfo.user?.name ?? assigneeSlackId,
              displayName:
                profile?.display_name || profile?.real_name || assigneeSlackId,
              avatarUrl: profile?.image_72 ?? undefined,
            },
          });
        }
        assigneeId = member.id;
      }

      // Parse due date
      const dueDate = dueDateStr ? new Date(dueDateStr) : undefined;

      // Create task
      const task = await createTask({
        title,
        description,
        projectId,
        assigneeId,
        dueDate,
        priority,
      });

      // Fetch full task with relations for the card
      const fullTask = await getTask(task.id);
      if (fullTask) {
        const project = await prisma.project.findUnique({
          where: { id: projectId },
        });
        if (project) {
          const assignee = assigneeId
            ? await prisma.member.findUnique({ where: { id: assigneeId } })
            : null;

          await client.chat.postMessage({
            channel: channelId,
            blocks: buildTaskCard(fullTask, assignee, project),
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

      await updateTask(taskId, { assigneeId: member.id });

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
}
