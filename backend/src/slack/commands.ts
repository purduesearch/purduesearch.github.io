import type { App } from "@slack/bolt";
import { prisma } from "../db/prisma.js";
import { buildHelpCard, buildProjectReport, buildProjectHealth, buildMilestoneView } from "../utils/blockKit.js";
import { openStandupModal, openNewTaskModal, openNewProjectModal, openTaskDoneModal, openSubtaskModal, openDriveParseModal, openMeetingNotesModal, openSprintPlanModal } from "./modals.js";
import { analyzeProjectRisks, generateStakeholderEmail, analyzeTeamCapacity } from "../services/projectAnalysisService.js";
import { generateText } from "../services/geminiService.js";
import { buildRiskReport, buildCapacityReport } from "../utils/blockKit.js";
import { getProjectByChannel } from "../services/projectService.js";
import { getMilestonesForProject } from "../services/milestoneService.js";
import { isAdminBySlackId } from "../services/memberService.js";
import * as labVisits from "../services/labVisitService.js";
import { localDateMinutes, formatRange } from "../services/labScheduleCore.js";
import { parseLocalTime, reminderAt } from "../services/labVisitCore.js";

// ── Command Registration ─────────────────────────────────────

export function registerCommands(app: App): void {
  // /lab is also reachable as "/pm lab ..." below; both call handleLab.
  app.command("/lab", async ({ command, ack, respond }) => {
    await ack();
    try {
      await handleLab(command.text.trim().split(/\s+/).filter(Boolean), command, respond);
    } catch (error) {
      console.error("/lab error:", error);
      await respond({ response_type: "ephemeral", text: `❌ ${error instanceof Error ? error.message : "Something went wrong."}` });
    }
  });

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
            await openTaskDoneModal(client, command.trigger_id, command.user_id);
          } else {
            const isAdmin = await isAdminBySlackId(command.user_id);
            await openNewTaskModal(client, command.trigger_id, command.channel_id, undefined, undefined, undefined, undefined, undefined, isAdmin);
          }
          break;
        }

        case "standup": {
          await openStandupModal(client, command.trigger_id, command.channel_id);
          break;
        }

        case "project": {
          await openNewProjectModal(client, command.trigger_id, command.channel_id, command.user_id);
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

        case "report": {
          const project = await getProjectByChannel(command.channel_id);
          if (!project) { await respond({ response_type: "ephemeral", text: "❌ No project linked to this channel." }); break; }
          await handleReport(project.id, respond);
          break;
        }

        case "health": {
          const project = await getProjectByChannel(command.channel_id);
          if (!project) { await respond({ response_type: "ephemeral", text: "❌ No project linked to this channel." }); break; }
          await handleHealth(project.id, respond);
          break;
        }

        case "milestones": {
          const project = await getProjectByChannel(command.channel_id);
          if (!project) { await respond({ response_type: "ephemeral", text: "❌ No project linked to this channel." }); break; }
          await handleMilestones(project.id, respond);
          break;
        }

        case "milestone": {
          const { openMilestoneModal } = await import("./modals.js");
          await openMilestoneModal(client, command.trigger_id, command.channel_id);
          break;
        }

        case "drive": {
          const url = args[1];
          await openDriveParseModal(client, command.trigger_id, command.channel_id, url);
          break;
        }

        case "sprint": {
          const project = await getProjectByChannel(command.channel_id);
          if (!project) { await respond({ response_type: "ephemeral", text: "❌ No project linked to this channel." }); break; }
          await openSprintPlanModal(client, command.trigger_id, project.id);
          break;
        }

        case "risks": {
          const project = await getProjectByChannel(command.channel_id);
          if (!project) { await respond({ response_type: "ephemeral", text: "❌ No project linked to this channel." }); break; }
          await respond({ response_type: "ephemeral", text: "🔍 Analyzing project risks…" });
          const risks = await analyzeProjectRisks(project.id) as any;
          if (!risks) { await respond({ response_type: "ephemeral", text: "❌ Risk analysis failed." }); break; }
          const riskEmoji: Record<string, string> = { LOW: "🟢", MEDIUM: "🟡", HIGH: "🔴", CRITICAL: "🚨" };
          await respond({
            response_type: "ephemeral",
            blocks: buildRiskReport(project, risks),
            text: `${riskEmoji[risks.overallRisk] ?? "⚪"} Risk: ${risks.overallRisk} — ${risks.topRecommendation}`,
          });
          break;
        }

        case "meeting": {
          const meetingAction = args[1]?.toLowerCase();
          if (meetingAction === "create") {
            const { openEventCreateModal } = await import("./modals.js");
            await openEventCreateModal(client, command.trigger_id, command.channel_id);
          } else if (meetingAction === "list") {
            const { getUpcomingEvents } = await import("../services/eventService.js");
            const upcoming = await getUpcomingEvents(7);
            if (!upcoming.length) {
              await respond({ response_type: "ephemeral", text: "📅 No meetings scheduled in the next 7 days." });
            } else {
              const lines = upcoming.slice(0, 5).map(ev => {
                const d = new Date(ev.startTime);
                const fmt = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                const t   = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                const loc = ev.isVirtual ? "Virtual" : (ev.location ?? "TBD");
                return `• *${ev.title}* — ${fmt} ${t} (${loc})`;
              });
              await respond({ response_type: "ephemeral", text: `📅 *Upcoming Meetings:*\n${lines.join("\n")}` });
            }
          } else if (meetingAction === "notes") {
            const { generateWeeklyMeetingTemplate } = await import("../services/meetingNotesService.js");
            const template = await generateWeeklyMeetingTemplate();
            await respond({
              response_type: "ephemeral",
              text: `*📋 This week's meeting template:*\n\`\`\`${template.agendaTemplate.slice(0, 2800)}\`\`\``,
            });
          } else {
            await openMeetingNotesModal(client, command.trigger_id, command.channel_id);
          }
          break;
        }

        case "outreach": {
          const outreachAction = args[1]?.toLowerCase();
          if (outreachAction === "submit") {
            const { openOutreachSubmitModal } = await import("./modals.js");
            await openOutreachSubmitModal(client, command.trigger_id, command.user_id);
          } else if (outreachAction === "queue") {
            const pending = await prisma.outreachSubmission.count({
              where: { status: { in: ["SUBMITTED", "IN_REVIEW"] } },
            });
            const approved = await prisma.outreachSubmission.count({ where: { status: "APPROVED" } });
            await respond({
              response_type: "ephemeral",
              text: `📢 *Outreach Queue:* ${pending} pending review · ${approved} approved`,
            });
          } else {
            await respond({
              response_type: "ephemeral",
              text: "Usage: `/pm outreach submit` — submit content\n`/pm outreach queue` — check queue status",
            });
          }
          break;
        }

        case "email": {
          const project = await getProjectByChannel(command.channel_id);
          if (!project) { await respond({ response_type: "ephemeral", text: "❌ No project linked to this channel." }); break; }
          await respond({ response_type: "ephemeral", text: "✍️ Drafting stakeholder email…" });
          const email = await generateStakeholderEmail(project.id) as any;
          if (!email) { await respond({ response_type: "ephemeral", text: "❌ Failed to generate email." }); break; }
          await respond({ response_type: "ephemeral", text: `*Subject:* ${email.subject}\n\n${email.body}` });
          break;
        }

        case "capacity": {
          const project = await getProjectByChannel(command.channel_id);
          if (!project) { await respond({ response_type: "ephemeral", text: "❌ No project linked to this channel." }); break; }
          await respond({ response_type: "ephemeral", text: "📊 Analyzing team capacity…" });
          const cap = await analyzeTeamCapacity(project.id) as any;
          if (!cap) { await respond({ response_type: "ephemeral", text: "❌ Capacity analysis failed." }); break; }
          await respond({ response_type: "ephemeral", blocks: buildCapacityReport(project, cap), text: cap.summary });
          break;
        }

        case "ask": {
          const question = args.slice(1).join(" ").trim();
          if (!question) {
            await respond({ response_type: "ephemeral", text: "Usage: `/pm ask <your question about the project>`" });
            break;
          }
          const project = await getProjectByChannel(command.channel_id);
          await respond({ response_type: "ephemeral", text: "🤔 Thinking…" });

          let contextBlock = "";
          if (project) {
            const tasks = await prisma.task.findMany({
              where: { projectId: project.id },
              select: { title: true, status: true, priority: true, dueDate: true },
            });
            const statusCounts: Record<string, number> = {};
            for (const t of tasks) statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
            contextBlock = `\nProject: ${project.name} (status: ${project.status})\nTasks: ${JSON.stringify(statusCounts)}\nTotal tasks: ${tasks.length}`;
          }

          const prompt = `You are a project management assistant for a university engineering club. Answer the following question concisely and helpfully (max 3 sentences).${contextBlock}\n\nQuestion: ${question}`;
          const answer = await generateText(prompt, `ask:${command.channel_id}:${question.slice(0, 32)}`);
          await respond({ response_type: "ephemeral", text: `🤖 *AI Answer:* ${answer}` });
          break;
        }

        case "description": {
          const isAdmin = await isAdminBySlackId(command.user_id);
          if (!isAdmin) {
            await respond({ response_type: "ephemeral", text: "❌ Only admins can edit project descriptions." });
            break;
          }
          const project = await getProjectByChannel(command.channel_id);
          if (!project) {
            await respond({ response_type: "ephemeral", text: "❌ No project is linked to this channel." });
            break;
          }
          const newDesc = args.slice(1).join(" ").trim();
          if (!newDesc) {
            const current = (project as any).description ?? "_No description set._";
            await respond({ response_type: "ephemeral", text: `*Current description for ${(project as any).name}:*\n${current}` });
            break;
          }
          await prisma.project.update({ where: { id: (project as any).id }, data: { description: newDesc } });
          await respond({ response_type: "ephemeral", text: `✅ Description updated for *${(project as any).name}*.` });
          break;
        }

        case "lab": {
          await handleLab(args.slice(1), command, respond);
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

// ── /lab — check in / out of a lab space ─────────────────────
// Decision 10 of the lab overlap/check-in plan. Every reply is ephemeral.

const LAB_HELP = [
  "*Lab check-in*",
  "`/lab in [space]` — Check in (space name or slug; defaults to this channel's project space)",
  "`/lab out [time]` — Check out now, or at a time today (`4:30pm`, `16:30`)",
  "`/lab confirm [time]` — Confirm a visit we closed for you overnight",
  "`/lab who` — Who's in the lab right now",
  "`/lab status` — Your open visit",
].join("\n");

function fmtDuration(min: number): string {
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function closeSummary(r: labVisits.CloseResult, spaceName: string): { text: string; blocks?: unknown[] } {
  if (r.discarded) return { text: `👋 Checked out of *${spaceName}*. That was under 5 minutes, so no time was logged.` };
  if (r.allocations.length) {
    const lines = r.allocations.map(a => `• ${fmtDuration(a.minutes)} → ${a.title}`).join("\n");
    return { text: `👋 Checked out of *${spaceName}*. Logged:\n${lines}` };
  }
  const head = `👋 Checked out of *${spaceName}*. You had no tasks in progress, so ${fmtDuration(r.unallocatedMinutes)} is waiting to be logged.`;
  if (!r.todoTasks.length) return { text: `${head} Log it from the lab banner in Constellation once you have a task.` };
  return {
    text: head,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `${head}\nPick a task to log it to:` } },
      ...r.todoTasks.map(t => ({
        type: "section",
        text: { type: "mrkdwn", text: `*${t.title.slice(0, 150)}*\n${t.projectName}` },
        accessory: {
          type: "button", action_id: "lab_allocate", text: { type: "plain_text", text: "Log here" },
          value: JSON.stringify({ visitId: r.visit.id, taskId: t.id }),
        },
      })),
    ],
  };
}

const TIME_HINT = "Try `4:30pm` or `16:30`.";

async function handleLab(args: string[], command: { user_id: string; channel_id: string }, respond: RespondFn): Promise<void> {
  const reply = (msg: Record<string, unknown>) => respond({ response_type: "ephemeral", ...msg });
  const member = await prisma.member.findUnique({ where: { slackId: command.user_id }, select: { id: true } });
  if (!member) { await reply({ text: "Log in to Constellation first, then try again." }); return; }
  const sub = (args[0] ?? "help").toLowerCase();
  const rest = args.slice(1).join(" ").trim();
  const now = new Date();

  try {
    switch (sub) {
      case "in": {
        let spaces = rest ? await labVisits.findSpaces(rest) : [];
        if (rest && spaces.length === 0) {
          await reply({ text: `❌ No lab space matches "${rest}". Send \`/lab in\` with no name to see the list.` });
          return;
        }
        if (!rest) {
          const project = await getProjectByChannel(command.channel_id);
          if (project) {
            const linked = await prisma.workspace.findMany({
              where: { archivedAt: null, projects: { some: { projectId: project.id } } },
              select: { id: true, name: true, slug: true, timezone: true },
            });
            if (linked.length === 1) spaces = linked;
          }
          if (spaces.length === 0) {
            const today = await labVisits.scheduledSpacesToday(member.id, now);
            if (today.length === 1) spaces = today;
          }
          if (spaces.length === 0) spaces = await labVisits.findSpaces("");
        }
        if (spaces.length !== 1) {
          const list = spaces.map(w => `• *${w.name}* — \`/lab in ${w.slug}\``).join("\n");
          await reply({ text: spaces.length ? `Which space?\n${list}` : "There are no lab spaces yet." });
          return;
        }
        const r = await labVisits.checkIn(member.id, spaces[0].id, "SLACK", now);
        const prev = r.closedPrevious ? `${closeSummary(r.closedPrevious, r.closedPrevious.workspaceName).text}\n` : "";
        const until = r.visit.expectedEndAt
          ? ` Your scheduled time ends at ${labVisits.localClock(r.visit.expectedEndAt, r.workspace.timezone)}.`
          : "";
        await reply({
          text: `${prev}🧪 Checked in to *${r.workspace.name}* at ${labVisits.localClock(now, r.workspace.timezone)}.${until} Use \`/lab out\` when you leave.`,
        });
        return;
      }

      case "out": {
        const mine = await labVisits.getMyVisits(member.id, now);
        if (!mine.open) { await reply({ text: "You're not checked in. Use `/lab in` to start a visit." }); return; }
        let at: Date | undefined;
        if (rest) {
          const tz = mine.open.workspace.timezone;
          at = parseLocalTime(rest, localDateMinutes(now, tz).date, tz) ?? undefined;
          if (!at) { await reply({ text: `❌ I couldn't read "${rest}" as a time. ${TIME_HINT}` }); return; }
        }
        const r = await labVisits.checkOut(member.id, { at, source: "SLACK" }, now);
        await reply(closeSummary(r, r.workspace.name));
        return;
      }

      case "confirm": {
        const mine = await labVisits.getMyVisits(member.id, now);
        const pending = mine.pending[0];
        if (!pending) { await reply({ text: "You have no lab visit waiting for confirmation." }); return; }
        let at: Date | undefined;
        if (rest) {
          // The time is on the visit's own local day, not today.
          const tz = pending.workspace.timezone;
          at = parseLocalTime(rest, localDateMinutes(pending.checkedInAt, tz).date, tz) ?? undefined;
          if (!at) { await reply({ text: `❌ I couldn't read "${rest}" as a time. ${TIME_HINT}` }); return; }
        }
        const r = await labVisits.confirmPending(member.id, { at, source: "SLACK" }, now);
        const s = closeSummary(r, r.workspace.name);
        await reply({ ...s, text: `${s.text.replace("Checked out of", "Confirmed your visit to")}\n_Auto-closed visits don't earn XP._` });
        return;
      }

      case "who": {
        const project = await getProjectByChannel(command.channel_id);
        let spaces = await labVisits.getPresent(project ? { projectId: project.id } : {}, now);
        if (project && spaces.length === 0) spaces = await labVisits.getPresent({}, now);
        const lines = spaces.map(sp => {
          const inNow = sp.checkedIn.map(c => c.member.displayName);
          const sched = sp.scheduled.map(c => `${c.member.displayName} (${formatRange(c.startMin, c.endMin)})`);
          const parts = [
            inNow.length ? `checked in: ${inNow.join(", ")}` : "nobody checked in",
            ...(sched.length ? [`scheduled now: ${sched.join(", ")}`] : []),
          ];
          return `• *${sp.workspace.name}* — ${parts.join("; ")}`;
        });
        await reply({ text: lines.length ? `🧪 *Lab right now*\n${lines.join("\n")}` : "There are no lab spaces yet." });
        return;
      }

      case "status": {
        const mine = await labVisits.getMyVisits(member.id, now);
        const out: string[] = [];
        if (mine.open) {
          const tz = mine.open.workspace.timezone;
          const elapsed = Math.max(0, Math.floor((now.getTime() - mine.open.checkedInAt.getTime()) / 60_000));
          out.push(`🧪 Checked in to *${mine.open.workspace.name}* since ${labVisits.localClock(mine.open.checkedInAt, tz)} (${fmtDuration(elapsed)}). `
            + `Reminder at ${labVisits.localClock(reminderAt(mine.open), tz)}.`);
        } else {
          out.push("You're not checked in.");
        }
        if (mine.pending.length) out.push(`⏳ ${mine.pending.length} visit(s) waiting for \`/lab confirm\`.`);
        const unalloc = mine.unallocated.reduce((n, v) => n + v.unallocatedMinutes, 0);
        if (unalloc) out.push(`📝 ${fmtDuration(unalloc)} of lab time not logged to a task yet. Use the lab banner in Constellation.`);
        await reply({ text: out.join("\n") });
        return;
      }

      case "help":
      default:
        await reply({ text: LAB_HELP });
    }
  } catch (err) {
    if (err instanceof labVisits.LabVisitError) { await reply({ text: `❌ ${err.message}` }); return; }
    throw err;
  }
}
