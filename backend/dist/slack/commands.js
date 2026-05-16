import { prisma } from "../db/prisma.js";
import { buildHelpCard, buildProjectReport, buildProjectHealth, buildMilestoneView } from "../utils/blockKit.js";
import { openStandupModal, openNewTaskModal, openNewProjectModal, openTaskDoneModal, openStatusModal, openSubtaskModal, openNotifyModal, openReportModal, openHealthModal, openMilestonesModal, openDriveParseModal, openMeetingNotesModal, openSprintPlanModal } from "./modals.js";
import { analyzeProjectRisks, generateProjectBrief, generateStakeholderEmail, analyzeTeamCapacity } from "../services/projectAnalysisService.js";
import { generateText } from "../services/geminiService.js";
import { buildRiskReport, buildCapacityReport } from "../utils/blockKit.js";
import { getProjectByChannel } from "../services/projectService.js";
import { getMilestonesForProject } from "../services/milestoneService.js";
import { isAdminBySlackId } from "../services/memberService.js";
// ── Command Registration ─────────────────────────────────────
export function registerCommands(app) {
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
                    }
                    else {
                        const isAdmin = await isAdminBySlackId(command.user_id);
                        await openNewTaskModal(client, command.trigger_id, command.channel_id, undefined, undefined, undefined, undefined, undefined, isAdmin);
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
                    }
                    else {
                        await openReportModal(client, command.trigger_id);
                    }
                    break;
                }
                case "health": {
                    const project = await getProjectByChannel(command.channel_id);
                    if (project) {
                        await handleHealth(project.id, respond);
                    }
                    else {
                        await openHealthModal(client, command.trigger_id);
                    }
                    break;
                }
                case "milestones": {
                    const project = await getProjectByChannel(command.channel_id);
                    if (project) {
                        await handleMilestones(project.id, respond);
                    }
                    else {
                        await openMilestonesModal(client, command.trigger_id);
                    }
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
                case "brief": {
                    const project = await getProjectByChannel(command.channel_id);
                    if (!project) {
                        await respond({ response_type: "ephemeral", text: "❌ No project linked to this channel." });
                        break;
                    }
                    await respond({ response_type: "ephemeral", text: "⏳ Generating project brief…" });
                    const brief = await generateProjectBrief(project.id);
                    if (!brief) {
                        await respond({ response_type: "ephemeral", text: "❌ Failed to generate brief." });
                        break;
                    }
                    await client.chat.postMessage({
                        channel: command.channel_id,
                        blocks: [
                            { type: "section", text: { type: "mrkdwn", text: `*📄 Project Brief — ${project.name}*\n> ${brief.tldr}` } },
                            { type: "section", text: { type: "mrkdwn", text: brief.markdown.slice(0, 2900) } },
                        ],
                        text: brief.tldr,
                    });
                    break;
                }
                case "sprint": {
                    const project = await getProjectByChannel(command.channel_id);
                    if (!project) {
                        await respond({ response_type: "ephemeral", text: "❌ No project linked to this channel." });
                        break;
                    }
                    await openSprintPlanModal(client, command.trigger_id, project.id);
                    break;
                }
                case "risks": {
                    const project = await getProjectByChannel(command.channel_id);
                    if (!project) {
                        await respond({ response_type: "ephemeral", text: "❌ No project linked to this channel." });
                        break;
                    }
                    await respond({ response_type: "ephemeral", text: "🔍 Analyzing project risks…" });
                    const risks = await analyzeProjectRisks(project.id);
                    if (!risks) {
                        await respond({ response_type: "ephemeral", text: "❌ Risk analysis failed." });
                        break;
                    }
                    const riskEmoji = { LOW: "🟢", MEDIUM: "🟡", HIGH: "🔴", CRITICAL: "🚨" };
                    await respond({
                        response_type: "ephemeral",
                        blocks: buildRiskReport(project, risks),
                        text: `${riskEmoji[risks.overallRisk] ?? "⚪"} Risk: ${risks.overallRisk} — ${risks.topRecommendation}`,
                    });
                    break;
                }
                case "meeting": {
                    await openMeetingNotesModal(client, command.trigger_id, command.channel_id);
                    break;
                }
                case "email": {
                    const project = await getProjectByChannel(command.channel_id);
                    if (!project) {
                        await respond({ response_type: "ephemeral", text: "❌ No project linked to this channel." });
                        break;
                    }
                    await respond({ response_type: "ephemeral", text: "✍️ Drafting stakeholder email…" });
                    const email = await generateStakeholderEmail(project.id);
                    if (!email) {
                        await respond({ response_type: "ephemeral", text: "❌ Failed to generate email." });
                        break;
                    }
                    await respond({ response_type: "ephemeral", text: `*Subject:* ${email.subject}\n\n${email.body}` });
                    break;
                }
                case "capacity": {
                    const project = await getProjectByChannel(command.channel_id);
                    if (!project) {
                        await respond({ response_type: "ephemeral", text: "❌ No project linked to this channel." });
                        break;
                    }
                    await respond({ response_type: "ephemeral", text: "📊 Analyzing team capacity…" });
                    const cap = await analyzeTeamCapacity(project.id);
                    if (!cap) {
                        await respond({ response_type: "ephemeral", text: "❌ Capacity analysis failed." });
                        break;
                    }
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
                        const statusCounts = {};
                        for (const t of tasks)
                            statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
                        contextBlock = `\nProject: ${project.name} (status: ${project.status})\nTasks: ${JSON.stringify(statusCounts)}\nTotal tasks: ${tasks.length}`;
                    }
                    const prompt = `You are a project management assistant for a university engineering club. Answer the following question concisely and helpfully (max 3 sentences).${contextBlock}\n\nQuestion: ${question}`;
                    const answer = await generateText(prompt, `ask:${command.channel_id}:${question.slice(0, 32)}`);
                    await respond({ response_type: "ephemeral", text: `🤖 *AI Answer:* ${answer}` });
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
        }
        catch (error) {
            console.error("Command error:", error);
            const message = error instanceof Error ? error.message : "An unexpected error occurred";
            await respond({
                response_type: "ephemeral",
                text: `❌ Error: ${message}`,
            });
        }
    });
}
async function fetchReportData(projectId) {
    const [project, milestones] = await Promise.all([
        prisma.project.findUnique({
            where: { id: projectId },
            include: { tasks: { include: { assignees: true } } },
        }),
        getMilestonesForProject(projectId),
    ]);
    if (!project)
        return null;
    const now = new Date();
    const topLevel = project.tasks.filter((t) => !t.parentTaskId);
    const statusCounts = { TODO: 0, IN_PROGRESS: 0, BLOCKED: 0, DONE: 0 };
    for (const t of topLevel)
        statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
    const overdueCount = topLevel.filter((t) => t.status !== "DONE" && t.dueDate && t.dueDate < now).length;
    return { project, milestones, statusCounts, overdueCount };
}
async function handleReport(projectId, respond) {
    const data = await fetchReportData(projectId);
    if (!data)
        return;
    const { project, milestones, statusCounts, overdueCount } = data;
    await respond({
        response_type: "ephemeral",
        blocks: buildProjectReport(project, project.tasks, milestones, statusCounts, overdueCount),
    });
}
async function handleHealth(projectId, respond) {
    const data = await fetchReportData(projectId);
    if (!data)
        return;
    const { project, milestones, statusCounts, overdueCount } = data;
    await respond({
        response_type: "ephemeral",
        blocks: buildProjectHealth(project, project.tasks, milestones, statusCounts, overdueCount),
    });
}
async function handleMilestones(projectId, respond) {
    const [project, milestones] = await Promise.all([
        prisma.project.findUnique({ where: { id: projectId } }),
        getMilestonesForProject(projectId),
    ]);
    if (!project)
        return;
    await respond({
        response_type: "ephemeral",
        blocks: buildMilestoneView(project, milestones),
    });
}
async function handleMyTasks(command, respond) {
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
//# sourceMappingURL=commands.js.map