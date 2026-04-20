import type { KnownBlock, Block } from "@slack/types";
import type { Task, Member, Project } from "@prisma/client";

type TaskWithAssignee = Task & { assignee: Member | null };
type TaskWithRelations = Task & { assignee: Member | null; project: Project };

// ── Helpers ──────────────────────────────────────────────────

function progressBar(done: number, total: number): string {
  if (total === 0) return "No tasks";
  const pct = Math.round((done / total) * 100);
  const filled = Math.round(pct / 10);
  const empty = 10 - filled;
  return `${"█".repeat(filled)}${"░".repeat(empty)} ${pct}% (${done}/${total})`;
}

function priorityEmoji(priority: string): string {
  const map: Record<string, string> = {
    CRITICAL: "🔴",
    HIGH: "🟠",
    MEDIUM: "🟡",
    LOW: "🟢",
  };
  return map[priority] ?? "⚪";
}

function statusEmoji(status: string): string {
  const map: Record<string, string> = {
    TODO: "📋",
    IN_PROGRESS: "🔧",
    BLOCKED: "🚫",
    DONE: "✅",
  };
  return map[status] ?? "❓";
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return "No date";
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

// ── Task Card ────────────────────────────────────────────────

export function buildTaskCard(
  task: Task,
  assignee: Member | null,
  project: Project
): (KnownBlock | Block)[] {
  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";
  const assigneeText = assignee
    ? `<@${assignee.slackId}>`
    : "_Unassigned_";

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${task.title}*\n${priorityEmoji(task.priority)} ${task.priority} • ${statusEmoji(task.status)} ${task.status.replace("_", " ")}\n📁 ${project.name} • 👤 ${assigneeText}\n📅 Due: ${formatDate(task.dueDate)}`,
      },
    },
    ...(task.description
      ? [
          {
            type: "context" as const,
            elements: [
              {
                type: "mrkdwn" as const,
                text: truncate(task.description, 200),
              },
            ],
          },
        ]
      : []),
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "✅ Mark Done", emoji: true },
          action_id: "mark_done",
          value: task.id,
          style: "primary",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "📝 Add Note", emoji: true },
          action_id: "add_note",
          value: task.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "🔀 Reassign", emoji: true },
          action_id: "reassign",
          value: task.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "👁 View in Dashboard", emoji: true },
          action_id: "view_dashboard",
          url: `${frontendUrl}/projects/${task.projectId}`,
          value: task.id,
        },
      ],
    },
    { type: "divider" },
  ];
}

// ── Project Status Card ──────────────────────────────────────

export function buildProjectStatusCard(
  project: Project,
  tasks: Task[]
): (KnownBlock | Block)[] {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "DONE").length;
  const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const blocked = tasks.filter((t) => t.status === "BLOCKED").length;
  const todo = tasks.filter((t) => t.status === "TODO").length;

  const statusBadge =
    project.status === "ACTIVE"
      ? "🟢 Active"
      : project.status === "PAUSED"
        ? "🟡 Paused"
        : project.status === "COMPLETED"
          ? "✅ Completed"
          : "📦 Archived";

  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `📊 ${project.name}`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          `*Status:* ${statusBadge} • *Type:* ${project.type}`,
          project.description ? `> ${truncate(project.description, 150)}` : "",
          "",
          `*Progress:* ${progressBar(done, total)}`,
          "",
          `📋 TODO: ${todo} • 🔧 In Progress: ${inProgress} • 🚫 Blocked: ${blocked} • ✅ Done: ${done}`,
          "",
          project.targetDate
            ? `🎯 Target: ${formatDate(project.targetDate)}`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    },
    { type: "divider" },
  ];
}

// ── Weekly Digest ────────────────────────────────────────────

export function buildWeeklyDigest(
  member: Member,
  tasks: TaskWithRelations[]
): (KnownBlock | Block)[] {
  const taskLines = tasks
    .map(
      (t) =>
        `${priorityEmoji(t.priority)} *${t.title}* — ${t.project.name} • Due: ${formatDate(t.dueDate)}`
    )
    .join("\n");

  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `📋 Your tasks this week`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Hey ${member.displayName}! Here's what's on your plate this week:\n\n${taskLines}`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `💡 Use \`/pm task done [id]\` to mark tasks complete`,
        },
      ],
    },
    { type: "divider" },
  ];
}

// ── Task Reminder ────────────────────────────────────────────

export function buildTaskReminderCard(
  task: TaskWithRelations
): (KnownBlock | Block)[] {
  const isOverdue = task.dueDate && task.dueDate < new Date();
  const emoji = isOverdue ? "🚨" : "⏰";
  const label = isOverdue ? "OVERDUE" : "Due Today";

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${emoji} *${label}:* ${task.title}\n📁 ${task.project.name} • ${priorityEmoji(task.priority)} ${task.priority}\n📅 Due: ${formatDate(task.dueDate)}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "✅ Mark Done", emoji: true },
          action_id: "mark_done",
          value: task.id,
          style: "primary",
        },
      ],
    },
    { type: "divider" },
  ];
}

// ── Week Ahead Card ──────────────────────────────────────────

export function buildWeekAheadCard(
  project: Project,
  tasks: TaskWithAssignee[]
): (KnownBlock | Block)[] {
  const taskLines = tasks
    .map(
      (t) =>
        `${statusEmoji(t.status)} *${t.title}* — ${t.assignee ? `<@${t.assignee.slackId}>` : "_Unassigned_"} • Due: ${formatDate(t.dueDate)}`
    )
    .join("\n");

  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `📅 Week Ahead — ${project.name}`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Here's what's coming up this week:\n\n${taskLines}`,
      },
    },
    { type: "divider" },
  ];
}

// ── Standup Message ──────────────────────────────────────────

export function buildStandupMessage(
  authorSlackId: string,
  responses: { yesterday: string; today: string; blockers: string }
): (KnownBlock | Block)[] {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "🧍 Standup Update",
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*<@${authorSlackId}>* posted a standup:`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*What I worked on:*\n${responses.yesterday}\n\n*What I'm doing next:*\n${responses.today}\n\n*Blockers:*\n${responses.blockers || "_None_ 🎉"}`,
      },
    },
    { type: "divider" },
  ];
}

// ── Help Card ────────────────────────────────────────────────

export function buildHelpCard(): (KnownBlock | Block)[] {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "📖 /pm Command Reference",
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          "*Task Management*",
          '`/pm task create "Title" @user due:friday` — Create and assign a task',
          "`/pm task done [task-id]` — Mark a task as complete",
          "",
          "*Project Info*",
          "`/pm status [project-name]` — View project health card",
          "",
          "*Standups*",
          "`/pm standup` — Open the standup form for this channel's project",
          "",
          "*Help*",
          "`/pm help` — Show this reference card",
        ].join("\n"),
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "💡 Dates support natural language: `due:friday`, `due:next-week`, `due:jan-30`",
        },
      ],
    },
  ];
}

// ── Auto-detect TODO prompt ──────────────────────────────────

export function buildTodoPrompt(
  messageText: string
): (KnownBlock | Block)[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `📌 It looks like this might be a task:\n> ${truncate(messageText, 200)}\n\nWould you like to turn it into a tracked task?`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "✅ Yes, create task", emoji: true },
          action_id: "create_task_from_message",
          value: messageText,
          style: "primary",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "❌ No thanks", emoji: true },
          action_id: "dismiss_todo_prompt",
        },
      ],
    },
  ];
}
