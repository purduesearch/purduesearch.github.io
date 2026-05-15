import type { KnownBlock, Block } from "@slack/types";
import type { Task, Member, Project } from "@prisma/client";

type TaskWithAssignees = Task & { assignees: Member[] };
type TaskWithRelations = Task & { assignees: Member[]; project: Project };
type TaskForCard = Task & {
  assignees: Member[];
  subtasks?: { id: string; title: string; status: string }[];
  blockedBy?: { blockingTask: { id: string; title: string; status: string } }[];
  parentTask?: { id: string; title: string } | null;
};

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
  task: TaskForCard,
  project: Project,
  options?: { showSubtasks?: boolean }
): (KnownBlock | Block)[] {
  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";
  const assigneeText = task.assignees && task.assignees.length > 0
    ? task.assignees.map(a => `<@${a.slackId}>`).join(", ")
    : "_Unassigned_";

  // Build contextual info lines for hierarchy, recurrence, and blockers
  const infoLines: string[] = [];
  if (task.parentTask) {
    infoLines.push(`↳ Subtask of *${task.parentTask.title}*`);
  }
  if (task.recurringInterval) {
    const intervals: Record<string, string> = { DAILY: "daily", WEEKLY: "weekly", BIWEEKLY: "bi-weekly", MONTHLY: "monthly" };
    infoLines.push(`🔄 Repeats ${intervals[task.recurringInterval as string] ?? (task.recurringInterval as string).toLowerCase()}`);
  }
  const openBlockers = (task.blockedBy ?? []).filter(b => b.blockingTask.status !== "DONE");
  if (openBlockers.length > 0) {
    infoLines.push(`🚫 Blocked by: ${openBlockers.map(b => `*${b.blockingTask.title}*`).join(", ")}`);
  }
  const subtaskCount = task.subtasks?.length ?? 0;
  if (subtaskCount > 0 && !options?.showSubtasks) {
    infoLines.push(`📋 ${subtaskCount} subtask${subtaskCount > 1 ? "s" : ""}`);
  }

  const blocks: (KnownBlock | Block)[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${task.title}*\n${priorityEmoji(task.priority)} ${task.priority} • ${statusEmoji(task.status)} ${task.status.replace("_", " ")}\n📁 ${project.name} • 👤 ${assigneeText}\n📅 Due: ${formatDate(task.dueDate)}`,
      },
    },
  ];

  if (task.description) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: truncate(task.description, 200) }],
    });
  }

  if (infoLines.length > 0) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: infoLines.join("  •  ") }],
    });
  }

  if (options?.showSubtasks && subtaskCount > 0) {
    const subtaskLines = task.subtasks!.map(s => `${statusEmoji(s.status)} ${s.title}`).join("\n");
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: subtaskLines },
    });
  }

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "static_select",
        action_id: "update_status",
        placeholder: { type: "plain_text", text: "Update Status" },
        options: [
          { text: { type: "plain_text", text: "📋 To Do" }, value: `TODO|${task.id}` },
          { text: { type: "plain_text", text: "🔧 In Progress" }, value: `IN_PROGRESS|${task.id}` },
          { text: { type: "plain_text", text: "🚫 Blocked" }, value: `BLOCKED|${task.id}` },
          { text: { type: "plain_text", text: "✅ Done" }, value: `DONE|${task.id}` },
        ],
        initial_option: {
          text: {
            type: "plain_text",
            text: task.status === "TODO" ? "📋 To Do" : task.status === "IN_PROGRESS" ? "🔧 In Progress" : task.status === "BLOCKED" ? "🚫 Blocked" : "✅ Done"
          },
          value: `${task.status}|${task.id}`
        }
      },
      {
        type: "button",
        text: { type: "plain_text", text: "🙋 Claim", emoji: true },
        action_id: "claim_task",
        value: task.id,
      },
      {
        type: "button",
        text: { type: "plain_text", text: "✅ Complete", emoji: true },
        action_id: "mark_done",
        value: task.id,
        style: "primary",
      },
      {
        type: "button",
        text: { type: "plain_text", text: "⏰ Snooze", emoji: true },
        action_id: "snooze_task",
        value: task.id,
      },
      ...(subtaskCount > 0
        ? [{
            type: "button" as const,
            text: {
              type: "plain_text" as const,
              text: options?.showSubtasks ? "▲ Hide subtasks" : `▼ ${subtaskCount} subtask${subtaskCount > 1 ? "s" : ""}`,
              emoji: true,
            },
            action_id: options?.showSubtasks ? "hide_subtasks" : "show_subtasks",
            value: task.id,
          }]
        : []),
      {
        type: "button",
        text: { type: "plain_text", text: "👁 Dashboard", emoji: true },
        action_id: "view_dashboard",
        url: `${frontendUrl}/clubpm/projects/${task.projectId}`,
        value: task.id,
      },
    ],
  });

  blocks.push({ type: "divider" });

  return blocks;
}

// ── Project Status Card ──────────────────────────────────────

export function buildProjectStatusCard(
  project: Project,
  tasks: (Task & { assignees: Member[] })[]
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
          `*Tasks:*`,
          ...tasks.map(t => {
            const assignees = t.assignees.length > 0 
              ? t.assignees.map(a => `<@${a.slackId}>`).join(", ") 
              : "_Unassigned_";
            return `• ${statusEmoji(t.status)} *${t.title}* — ${assignees}`;
          }),
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
  tasks: TaskWithAssignees[]
): (KnownBlock | Block)[] {
  const taskLines = tasks
    .map(
      (t) =>
        `${statusEmoji(t.status)} *${t.title}* — ${t.assignees && t.assignees.length > 0 ? t.assignees.map(a => `<@${a.slackId}>`).join(", ") : "_Unassigned_"} • Due: ${formatDate(t.dueDate)}`
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
          "*Project Management*",
          "`/pm project` — Create a new project",
          "",
          "*Task Management*",
          "`/pm task` — Create and assign a task (opens modal)",
          "`/pm task done` — Mark a task as complete (opens modal)",
          "`/pm subtask` — Create a subtask under an existing task",
          "`/pm my-tasks` — View your open tasks",
          "",
          "*Project Info*",
          "`/pm status` — Quick project snapshot (opens modal)",
          "`/pm report` — Detailed report: progress, overdue, team workload",
          "`/pm health` — Health scorecard with risk scoring",
          "`/pm milestone` — Create a milestone for this channel's project",
          "`/pm milestones` — Milestone progress view",
          "",
          "*Standups*",
          "`/pm standup` — Open the standup form for this channel's project",
          "",
          "*AI Features*",
          "`/pm drive [url]` — Extract tasks from a Google Drive document",
          "`/pm meeting` — Parse meeting notes into action items",
          "`/pm brief` — Generate a project brief for stakeholders",
          "`/pm sprint` — AI-powered sprint planning",
          "`/pm risks` — Analyze project risks",
          "`/pm email` — Draft a stakeholder status email",
          "`/pm capacity` — Analyze team workload balance",
          "`/pm ask [question]` — Ask AI a question about this project",
          "",
          "*Notifications*",
          "`/pm notify` — Manage your notification preferences",
          "",
          "*Help*",
          "`/pm help` — Show this reference card",
        ].join("\n"),
      },
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

// ── Batched Daily Reminder ───────────────────────────────────

export function buildBatchedReminderDigest(
  member: Member,
  overdueTasks: TaskWithRelations[],
  dueTodayTasks: TaskWithRelations[]
): (KnownBlock | Block)[] {
  const blocks: (KnownBlock | Block)[] = [];

  blocks.push({
    type: "header",
    text: { type: "plain_text", text: "⏰ Daily Task Reminder", emoji: true },
  });

  if (overdueTasks.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*🚨 Overdue (${overdueTasks.length})*\n${overdueTasks
          .map(t => `• ${priorityEmoji(t.priority)} *${t.title}* — ${t.project.name} • was due ${formatDate(t.dueDate)}`)
          .join("\n")}`,
      },
    });
  }

  if (dueTodayTasks.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*📅 Due Today (${dueTodayTasks.length})*\n${dueTodayTasks
          .map(t => `• ${priorityEmoji(t.priority)} *${t.title}* — ${t.project.name}`)
          .join("\n")}`,
      },
    });
  }

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "📋 View My Tasks", emoji: true },
        action_id: "home_create_task",
      },
    ],
  });

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `Hey ${member.displayName} — you have ${overdueTasks.length + dueTodayTasks.length} task(s) needing attention today.` }],
  });

  blocks.push({ type: "divider" });
  return blocks;
}

// ── Escalation Card ──────────────────────────────────────────

export function buildEscalationCard(
  task: TaskWithRelations
): (KnownBlock | Block)[] {
  const daysOverdue = task.dueDate
    ? Math.floor((Date.now() - task.dueDate.getTime()) / 86_400_000)
    : 0;
  const assigneeText =
    task.assignees.length > 0
      ? task.assignees.map(a => `<@${a.slackId}>`).join(", ")
      : "_Unassigned_";

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🚨 *Escalation Alert* — *${task.title}*\n${priorityEmoji(task.priority)} ${task.priority} • overdue by *${daysOverdue} day${daysOverdue !== 1 ? "s" : ""}*\n👤 Assigned to: ${assigneeText}\n📅 Was due: ${formatDate(task.dueDate)}`,
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
        {
          type: "button",
          text: { type: "plain_text", text: "⏰ Snooze", emoji: true },
          action_id: "snooze_task",
          value: task.id,
        },
      ],
    },
    { type: "divider" },
  ];
}

// ── App Home ─────────────────────────────────────────────────

export function buildAppHome(
  member: Member,
  tasks: (Task & { project: Project; assignees: Member[] })[],
  frontendUrl: string
): (KnownBlock | Block)[] {
  const now = new Date();
  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + 7);

  const overdueTasks = tasks.filter(
    (t) => t.dueDate && t.dueDate < now && t.status !== "DONE"
  );

  const overdueIds = new Set(overdueTasks.map((t) => t.id));

  const inProgressTasks = tasks.filter(
    (t) => t.status === "IN_PROGRESS" && !overdueIds.has(t.id)
  );

  const upcomingTasks = tasks
    .filter(
      (t) =>
        t.dueDate &&
        t.dueDate >= now &&
        t.dueDate <= endOfWeek &&
        t.status !== "DONE" &&
        !overdueIds.has(t.id)
    )
    .sort((a, b) => (a.dueDate as Date).getTime() - (b.dueDate as Date).getTime())
    .slice(0, 5);

  const blocks: (KnownBlock | Block)[] = [];

  // 1. Header
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: `🏠 ${member.displayName}`,
      emoji: true,
    },
  });

  // 2. Quick Actions
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: "*Quick Actions*" },
  });
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "➕ New Task", emoji: true },
        action_id: "home_create_task",
        style: "primary",
      },
      {
        type: "button",
        text: { type: "plain_text", text: "📋 New Subtask", emoji: true },
        action_id: "home_create_subtask",
      },
      {
        type: "button",
        text: { type: "plain_text", text: "🧍 Standup", emoji: true },
        action_id: "home_standup",
      },
      {
        type: "button",
        text: { type: "plain_text", text: "🔄 Refresh", emoji: true },
        action_id: "home_refresh",
      },
    ],
  });
  blocks.push({ type: "divider" });

  // 3. Needs Attention (overdue)
  if (overdueTasks.length > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "*🔥 Needs Attention*" },
    });
    for (const t of overdueTasks.slice(0, 5)) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${priorityEmoji(t.priority)} *${t.title}* — ${t.project.name}\n📅 Due: ${formatDate(t.dueDate)} ${statusEmoji(t.status)} ${t.status.replace(/_/g, " ")}`,
        },
      });
    }
    blocks.push({ type: "divider" });
  }

  // 4. In Progress
  if (inProgressTasks.length > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "*🔧 In Progress*" },
    });
    for (const t of inProgressTasks.slice(0, 5)) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${priorityEmoji(t.priority)} *${t.title}* — ${t.project.name}\n📅 Due: ${formatDate(t.dueDate)} ${statusEmoji(t.status)} ${t.status.replace(/_/g, " ")}`,
        },
      });
    }
    blocks.push({ type: "divider" });
  }

  // 5. Due in Next 7 Days
  if (upcomingTasks.length > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "*📅 Due in Next 7 Days*" },
    });
    for (const t of upcomingTasks) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${priorityEmoji(t.priority)} *${t.title}* — ${t.project.name}\n📅 Due: ${formatDate(t.dueDate)} ${statusEmoji(t.status)} ${t.status.replace(/_/g, " ")}`,
        },
      });
    }
    blocks.push({ type: "divider" });
  }

  // 6. All caught up
  if (overdueTasks.length === 0 && inProgressTasks.length === 0 && upcomingTasks.length === 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "✅ *You're all caught up!* No overdue or upcoming tasks." },
    });
    blocks.push({ type: "divider" });
  }

  // 7. Footer
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `<${frontendUrl}/clubpm|📊 Open Dashboard>` }],
  });

  return blocks;
}

// ── AI Task Suggestion Card ──────────────────────────────────

export function buildAiTaskSuggestion(
  parsed: { title: string; description?: string; priority?: string; dueDate?: string },
  channelId: string,
  cacheKey: string,
  suggestedAssigneeSlackIds: string[] = []
): (KnownBlock | Block)[] {
  const lines: string[] = [`📋 *Suggested task:* ${parsed.title}`];
  if (parsed.description) lines.push(`_${parsed.description}_`);
  if (parsed.priority) lines.push(`Priority: ${priorityEmoji(parsed.priority)} ${parsed.priority}`);
  if (parsed.dueDate) lines.push(`Due: ${parsed.dueDate}`);
  if (suggestedAssigneeSlackIds.length > 0) {
    lines.push(`Suggested: ${suggestedAssigneeSlackIds.map(id => `<@${id}>`).join(", ")}`);
  }

  // Cache key + channel fits comfortably within Slack's 255-char button value limit
  const value = JSON.stringify({ k: cacheKey, c: channelId });

  return [
    { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Create Task" },
          style: "primary",
          action_id: "ai_create_task",
          value,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Dismiss" },
          action_id: "dismiss_todo_prompt",
          value: "dismiss",
        },
      ],
    },
    { type: "divider" },
  ];
}

// ── Standup DM Prompt ────────────────────────────────────────

export function buildStandupDmPrompt(
  displayName: string,
  projectChannels: { name: string; channelId: string }[]
): (KnownBlock | Block)[] {
  const blocks: (KnownBlock | Block)[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `📋 Good morning, *${displayName}*! Time for your daily standup.`,
      },
    },
  ];

  if (projectChannels.length === 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Use `/pm standup` in a project channel to post your standup.",
      },
    });
  } else {
    blocks.push({
      type: "actions",
      elements: projectChannels.slice(0, 3).map((pc) => ({
        type: "button" as const,
        text: { type: "plain_text" as const, text: `📝 ${pc.name}`.slice(0, 25) },
        action_id: "standup_from_dm",
        value: pc.channelId,
      })),
    });
  }

  return blocks;
}

// ── Stale Tasks Card ─────────────────────────────────────────

export function buildStaleTasksCard(
  project: { name: string },
  staleTasks: {
    id: string;
    title: string;
    status: string;
    updatedAt: Date;
    assignees: { displayName: string }[];
  }[]
): (KnownBlock | Block)[] {
  const taskLines = staleTasks.slice(0, 8).map((t) => {
    const daysStale = Math.floor((Date.now() - t.updatedAt.getTime()) / 86_400_000);
    const assigneeStr =
      t.assignees.length > 0
        ? t.assignees.map((a) => a.displayName).join(", ")
        : "Unassigned";
    return `• *${t.title}*\n  ${statusEmoji(t.status)} ${t.status.replace("_", " ")} — stale ${daysStale}d — ${assigneeStr}`;
  });

  return [
    {
      type: "header",
      text: { type: "plain_text", text: `⚠️ Stale Tasks: ${project.name}`, emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `These ${staleTasks.length} task${staleTasks.length > 1 ? "s have" : " has"} had no updates in 5+ days:\n\n${taskLines.join("\n\n")}`,
      },
    },
    { type: "divider" },
  ];
}

// ── Project Report ───────────────────────────────────────────

type MilestoneStub = {
  title: string;
  dueDate: Date | null;
  completionPct: number;
  taskCounts: { total: number; done: number };
};

export function buildProjectReport(
  project: Project,
  tasks: (Task & { assignees: Member[] })[],
  milestones: MilestoneStub[],
  statusCounts: Record<string, number>,
  overdueCount: number
): (KnownBlock | Block)[] {
  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const done = statusCounts.DONE ?? 0;
  const inProgress = statusCounts.IN_PROGRESS ?? 0;
  const blocked = statusCounts.BLOCKED ?? 0;
  const todo = statusCounts.TODO ?? 0;
  const now = new Date();
  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";

  const blocks: (KnownBlock | Block)[] = [];

  blocks.push({
    type: "header",
    text: { type: "plain_text", text: `📊 Report: ${project.name}`, emoji: true },
  });

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: [
        `*Progress:* ${progressBar(done, total)}`,
        `📋 Todo: ${todo}  •  🔧 In Progress: ${inProgress}  •  🚫 Blocked: ${blocked}  •  ✅ Done: ${done}`,
        project.targetDate ? `🎯 Target: ${formatDate(project.targetDate)}` : "",
      ].filter(Boolean).join("\n"),
    },
  });
  blocks.push({ type: "divider" });

  // Overdue tasks
  const overdueTasks = tasks
    .filter(t => !t.parentTaskId && t.dueDate && t.dueDate < now && t.status !== "DONE")
    .slice(0, 5);
  if (overdueCount > 0) {
    const lines = overdueTasks.map(t => {
      const daysOver = Math.floor((now.getTime() - (t.dueDate as Date).getTime()) / 86_400_000);
      const assignees = t.assignees.length > 0 ? t.assignees.map(a => `<@${a.slackId}>`).join(", ") : "_Unassigned_";
      return `• ${priorityEmoji(t.priority)} *${truncate(t.title, 55)}* — ${assignees} — ${daysOver}d overdue`;
    });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*🚨 Overdue (${overdueCount})*${overdueCount > 5 ? " — showing first 5" : ""}\n${lines.join("\n")}`,
      },
    });
    blocks.push({ type: "divider" });
  }

  // Blocked tasks
  const blockedTasks = tasks.filter(t => !t.parentTaskId && t.status === "BLOCKED").slice(0, 4);
  if (blockedTasks.length > 0) {
    const lines = blockedTasks.map(t => {
      const assignees = t.assignees.length > 0 ? t.assignees.map(a => `<@${a.slackId}>`).join(", ") : "_Unassigned_";
      return `• *${truncate(t.title, 55)}* — ${assignees}`;
    });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*🚫 Blocked (${blockedTasks.length})*\n${lines.join("\n")}` },
    });
    blocks.push({ type: "divider" });
  }

  // Milestones
  if (milestones.length > 0) {
    const lines = milestones.slice(0, 5).map(m => {
      const isComplete = m.taskCounts.total > 0 && m.taskCounts.done === m.taskCounts.total;
      const isOverdue = m.dueDate && m.dueDate < now && !isComplete;
      const badge = isComplete ? "✅" : isOverdue ? "⚠️" : "🏁";
      return `${badge} *${truncate(m.title, 40)}* — ${m.completionPct}% • Due: ${m.dueDate ? formatDate(m.dueDate) : "No date"}`;
    });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*🏁 Milestones*\n${lines.join("\n")}` },
    });
    blocks.push({ type: "divider" });
  }

  // Team workload (open tasks only)
  const workload: Record<string, { slackId: string; name: string; count: number }> = {};
  for (const task of tasks) {
    if (task.parentTaskId || task.status === "DONE") continue;
    if (task.assignees.length === 0) {
      workload["__unassigned__"] = { slackId: "", name: "Unassigned", count: (workload["__unassigned__"]?.count ?? 0) + 1 };
    } else {
      for (const a of task.assignees) {
        workload[a.id] = { slackId: a.slackId, name: a.displayName, count: (workload[a.id]?.count ?? 0) + 1 };
      }
    }
  }
  const sortedWorkload = Object.entries(workload).sort((a, b) => b[1].count - a[1].count).slice(0, 6);
  if (sortedWorkload.length > 0) {
    const lines = sortedWorkload.map(([id, w]) =>
      `• ${id === "__unassigned__" ? "_Unassigned_" : `<@${w.slackId}>`}: ${w.count} task${w.count !== 1 ? "s" : ""}`
    );
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*👥 Team Workload (open)*\n${lines.join("\n")}` },
    });
    blocks.push({ type: "divider" });
  }

  // Recent completions
  const recentDone = tasks
    .filter(t => !t.parentTaskId && t.status === "DONE")
    .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
    .slice(0, 5);
  if (recentDone.length > 0) {
    const lines = recentDone.map(t => `• *${truncate(t.title, 65)}*`);
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*✅ Recently Completed*\n${lines.join("\n")}` },
    });
    blocks.push({ type: "divider" });
  }

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `<${frontendUrl}/clubpm/projects/${project.id}|📊 View Full Dashboard>` }],
  });

  return blocks;
}

// ── Project Health ────────────────────────────────────────────

export function buildProjectHealth(
  project: Project,
  tasks: (Task & { assignees: Member[] })[],
  milestones: MilestoneStub[],
  statusCounts: Record<string, number>,
  overdueCount: number
): (KnownBlock | Block)[] {
  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const done = statusCounts.DONE ?? 0;
  const blocked = statusCounts.BLOCKED ?? 0;
  const now = new Date();

  let score = 100;
  const issues: string[] = [];
  const positives: string[] = [];

  const overdueDeduction = Math.min(overdueCount * 5, 30);
  if (overdueCount > 0) {
    score -= overdueDeduction;
    issues.push(`🚨 ${overdueCount} overdue task${overdueCount > 1 ? "s" : ""} (−${overdueDeduction} pts)`);
  }

  const blockedDeduction = Math.min(blocked * 3, 15);
  if (blocked > 0) {
    score -= blockedDeduction;
    issues.push(`🚫 ${blocked} blocked task${blocked > 1 ? "s" : ""} (−${blockedDeduction} pts)`);
  }

  const unassignedCount = tasks.filter(
    t => !t.parentTaskId && t.status !== "DONE" && t.assignees.length === 0
  ).length;
  const unassignedDeduction = Math.min(unassignedCount * 2, 10);
  if (unassignedCount > 0) {
    score -= unassignedDeduction;
    issues.push(`👤 ${unassignedCount} unassigned task${unassignedCount > 1 ? "s" : ""} (−${unassignedDeduction} pts)`);
  }

  const overdueMilestones = milestones.filter(
    m => m.dueDate && m.dueDate < now && m.taskCounts.done < m.taskCounts.total
  ).length;
  if (overdueMilestones > 0) {
    const mDeduction = Math.min(overdueMilestones * 10, 20);
    score -= mDeduction;
    issues.push(`🏁 ${overdueMilestones} overdue milestone${overdueMilestones > 1 ? "s" : ""} (−${mDeduction} pts)`);
  }

  score = Math.max(0, score);

  if (done > 0) positives.push(`✅ ${done} task${done > 1 ? "s" : ""} completed`);
  if (total > 0) positives.push(`📊 ${Math.round((done / total) * 100)}% overall completion`);
  if (project.targetDate) positives.push(`🎯 Target: ${formatDate(project.targetDate)}`);

  const verdict = score >= 80 ? "🟢 Healthy" : score >= 50 ? "🟡 At Risk" : "🔴 Critical";
  const filled = Math.round(score / 10);
  const healthBar = `${"█".repeat(filled)}${"░".repeat(10 - filled)}`;

  const blocks: (KnownBlock | Block)[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `🏥 Health Check: ${project.name}`, emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Status:* ${verdict}\n\`${healthBar}\` ${score}/100` },
    },
  ];

  if (issues.length > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*⚠️ Issues:*\n${issues.join("\n")}` },
    });
  } else {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "✅ No issues detected — project is on track!" },
    });
  }

  if (positives.length > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Highlights:*\n${positives.join("\n")}` },
    });
  }

  blocks.push({ type: "divider" });
  return blocks;
}

// ── Milestone View ────────────────────────────────────────────

export function buildMilestoneView(
  project: Project,
  milestones: MilestoneStub[]
): (KnownBlock | Block)[] {
  const now = new Date();
  const blocks: (KnownBlock | Block)[] = [];

  blocks.push({
    type: "header",
    text: { type: "plain_text", text: `🏁 Milestones: ${project.name}`, emoji: true },
  });

  if (milestones.length === 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "No milestones created yet. Use the dashboard to add milestones." },
    });
    blocks.push({ type: "divider" });
    return blocks;
  }

  for (const m of milestones.slice(0, 10)) {
    const { total, done } = m.taskCounts;
    const isComplete = total > 0 && done === total;
    const isOverdue = !isComplete && m.dueDate && m.dueDate < now;
    const daysUntil = m.dueDate
      ? Math.ceil((m.dueDate.getTime() - now.getTime()) / 86_400_000)
      : null;

    let badge: string;
    let timeInfo: string;
    if (isComplete) {
      badge = "✅";
      timeInfo = "Complete";
    } else if (isOverdue) {
      badge = "⚠️";
      timeInfo = `${Math.abs(daysUntil ?? 0)}d overdue`;
    } else if (daysUntil !== null && daysUntil <= 7) {
      badge = "🔶";
      timeInfo = daysUntil === 0 ? "Due today" : `${daysUntil}d remaining`;
    } else {
      badge = "🟢";
      timeInfo = daysUntil !== null ? `${daysUntil}d remaining` : "No date";
    }

    const due = m.dueDate ? formatDate(m.dueDate) : "No date";
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${badge} *${truncate(m.title, 50)}*\n${progressBar(done, total)} • ${due} • ${timeInfo}`,
      },
    });
  }

  blocks.push({ type: "divider" });
  return blocks;
}

// ── Milestone Celebration Card ────────────────────────────────

export function buildMilestoneCelebrationCard(
  title: string,
  projectName: string
): (KnownBlock | Block)[] {
  return [
    { type: "header", text: { type: "plain_text", text: "🎉 Milestone Complete!", emoji: true } },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${title}* in *${projectName}* has been completed. All linked tasks are done!`,
      },
    },
    { type: "divider" },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Completed at <!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} {time}|just now>`,
        },
      ],
    },
  ];
}

// ── Milestone Alert Card ──────────────────────────────────────

export function buildMilestoneAlertCard(m: {
  title: string;
  status: string;
}): (KnownBlock | Block)[] {
  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";
  const emoji = m.status === "BEHIND" ? "🚨" : "⚠️";
  const label = m.status === "BEHIND" ? "Behind schedule" : "At risk";
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${emoji} *Milestone Alert* — *${m.title}* is *${label}*.\nReview progress and reallocate tasks if needed.`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View Dashboard", emoji: true },
          url: `${frontendUrl}/clubpm`,
          style: "danger",
          action_id: "view_milestone_dashboard",
        },
      ],
    },
  ];
}

// ── Mark Done from Reaction Card ─────────────────────────────

export function buildMarkDoneFromReactionCard(task: {
  id: string;
  title: string;
}): (KnownBlock | Block)[] {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: `✅ Mark *${task.title}* as done?` },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Mark Done" },
          style: "primary",
          action_id: "mark_done",
          value: task.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Dismiss" },
          action_id: "dismiss_todo_prompt",
          value: "dismiss",
        },
      ],
    },
  ];
}

// ── AI Risk Report ────────────────────────────────────────────

export function buildRiskReport(
  project: { name: string },
  risks: { overallRisk: string; riskScore: number; risks: Array<{ category: string; description: string; affectedTasks: string[]; severity: string }>; topRecommendation: string }
): (KnownBlock | Block)[] {
  const riskEmoji: Record<string, string> = { LOW: "🟢", MEDIUM: "🟡", HIGH: "🔴", CRITICAL: "🚨" };
  const emoji = riskEmoji[risks.overallRisk] ?? "⚪";

  const blocks: (KnownBlock | Block)[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `${emoji} AI Risk Analysis: ${project.name}`, emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Risk Level:* ${emoji} ${risks.overallRisk} (score: ${risks.riskScore}/100)\n*Top Action:* ${risks.topRecommendation}`,
      },
    },
  ];

  if (risks.risks.length > 0) {
    const severityEmoji: Record<string, string> = { LOW: "🟢", MEDIUM: "🟡", HIGH: "🔴" };
    const lines = risks.risks.slice(0, 5).map(r =>
      `${severityEmoji[r.severity] ?? "⚪"} *${r.category}*: ${r.description}`
    );
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Risks Identified:*\n${lines.join("\n")}` },
    });
  }

  blocks.push({ type: "divider" });
  return blocks;
}

// ── AI Capacity Report ────────────────────────────────────────

export function buildCapacityReport(
  project: { name: string },
  cap: { overloaded: Array<{ member: string; recommendation: string }>; underloaded: Array<{ member: string; suggestion: string }>; balanceScore: number; summary: string }
): (KnownBlock | Block)[] {
  const scoreEmoji = cap.balanceScore >= 75 ? "🟢" : cap.balanceScore >= 50 ? "🟡" : "🔴";
  const blocks: (KnownBlock | Block)[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `⚖️ Capacity Analysis: ${project.name}`, emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `${scoreEmoji} *Balance Score:* ${cap.balanceScore}/100\n${cap.summary}` },
    },
  ];

  if (cap.overloaded.length > 0) {
    const lines = cap.overloaded.map(o => `• *${o.member}*: ${o.recommendation}`);
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*🔴 Overloaded:*\n${lines.join("\n")}` },
    });
  }

  if (cap.underloaded.length > 0) {
    const lines = cap.underloaded.map(u => `• *${u.member}*: ${u.suggestion}`);
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*🟢 Underloaded:*\n${lines.join("\n")}` },
    });
  }

  blocks.push({ type: "divider" });
  return blocks;
}

// ── Drive Task Preview ────────────────────────────────────────

export function buildDriveTaskPreview(
  tasks: Array<{ title: string; description?: string | null; priority?: string | null; dueDate?: string | null; suggestedAssigneeName?: string | null; sourceContext?: string | null }>,
  channelId: string
): (KnownBlock | Block)[] {
  const priorityEmoji: Record<string, string> = { CRITICAL: "🔴", HIGH: "🟠", MEDIUM: "🟡", LOW: "🟢" };
  const blocks: (KnownBlock | Block)[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `📄 Extracted Tasks (${tasks.length})`, emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: "Review the tasks below. Click *Add Task* to create each one." },
    },
  ];

  for (const task of tasks.slice(0, 10)) {
    const badge = priorityEmoji[task.priority ?? "MEDIUM"] ?? "⚪";
    const meta: string[] = [];
    if (task.dueDate) meta.push(`📅 ${task.dueDate}`);
    if (task.suggestedAssigneeName) meta.push(`👤 ${task.suggestedAssigneeName}`);
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${badge} *${truncate(task.title, 70)}*${meta.length ? `\n${meta.join(" • ")}` : ""}${task.description ? `\n_${truncate(task.description, 100)}_` : ""}`,
      },
      accessory: {
        type: "button",
        text: { type: "plain_text", text: "Add Task" },
        style: "primary",
        action_id: "ai_create_drive_task",
        value: JSON.stringify({ title: task.title, description: task.description, priority: task.priority, dueDate: task.dueDate, channelId }),
      },
    } as KnownBlock);
  }

  blocks.push({ type: "divider" });
  return blocks;
}

// ── Dependency Suggestions ────────────────────────────────────

export function buildDependencySuggestionsBlocks(
  dependencies: Array<{ blockedTaskId: string; blockingTaskId: string; confidence: number; reason: string }>,
  _projectId: string
): (KnownBlock | Block)[] {
  const blocks: (KnownBlock | Block)[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "🔗 Suggested Task Dependencies", emoji: true },
    },
  ];

  for (const dep of dependencies.slice(0, 8)) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${dep.blockingTaskId}* → blocks → *${dep.blockedTaskId}*\n_${dep.reason}_ (${Math.round(dep.confidence * 100)}% confidence)`,
      },
      accessory: {
        type: "button",
        text: { type: "plain_text", text: "Apply" },
        style: "primary",
        action_id: "ai_apply_dep",
        value: JSON.stringify({ blockingTaskId: dep.blockingTaskId, blockedTaskId: dep.blockedTaskId }),
      },
    } as KnownBlock);
  }

  blocks.push({ type: "divider" });
  return blocks;
}

// ── Standup Digest ────────────────────────────────────────────

export function buildStandupDigestBlocks(
  synthesis: { digest: string; blockers: Array<{ member: string; issue: string }>; momentum: string; callout: string },
  projectName: string
): (KnownBlock | Block)[] {
  const momentumEmoji: Record<string, string> = { STALLED: "🔴", SLOW: "🟡", STEADY: "🟢", STRONG: "💪" };
  const emoji = momentumEmoji[synthesis.momentum] ?? "⚪";

  const blocks: (KnownBlock | Block)[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `📊 Standup Digest — ${projectName}`, emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `${emoji} *Momentum:* ${synthesis.momentum}\n\n${synthesis.digest}` },
    },
  ];

  if (synthesis.blockers.length > 0) {
    const lines = synthesis.blockers.map(b => `• *${b.member}*: ${b.issue}`);
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*🚫 Blockers:*\n${lines.join("\n")}` },
    });
  }

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `💡 ${synthesis.callout}` }],
  });

  blocks.push({ type: "divider" });
  return blocks;
}
