import { prisma } from "../db/prisma.js";
import { createTask, updateTask, getTask, reassignTaskFromSlack } from "../services/taskService.js";
import { resolveSlackMember } from "../services/memberService.js";
import { getProjectByChannel } from "../services/projectService.js";
import { getMilestonesForProject } from "../services/milestoneService.js";
import { buildTaskCard, buildStandupMessage, buildProjectReport, buildProjectHealth, buildMilestoneView, buildDriveTaskPreview } from "../utils/blockKit.js";
import { fetchDriveFileAsText, extractFileId } from "../services/driveService.js";
import { generateJsonFromImage, generateJsonFromDocument } from "../services/geminiService.js";
import { driveToTasksPrompt, meetingNotesToTasksPrompt, imageToTaskPrompt } from "../utils/aiPrompts.js";
import { logAuditEvent } from "../services/activityService.js";
// ── Modal Openers ────────────────────────────────────────────
export async function openStandupModal(client, triggerId, channelId) {
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
export async function openNewTaskModal(client, triggerId, channelId, initialTitle, initialDescription, initialDueDate, // ISO "YYYY-MM-DD"
initialAssignees, // Slack user IDs
initialParentTaskId, isAdminUser) {
    // Get all active projects for the dropdown
    const projects = await prisma.project.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
    });
    const projectOptions = projects.map((p) => ({
        text: { type: "plain_text", text: p.name },
        value: p.id,
    }));
    // Try to pre-select the current channel's project
    const channelProject = await getProjectByChannel(channelId);
    // Build tag options from the channel project (fall back to empty)
    let tagOptions = [];
    try {
        if (channelProject?.id) {
            const tags = await prisma.tag.findMany({ where: { projectId: channelProject.id } });
            tagOptions = tags.map(t => ({ text: { type: "plain_text", text: t.name }, value: t.id }));
        }
    }
    catch { /* no project resolved — leave empty */ }
    // Fetch open tasks to allow picking a parent task
    const openTasks = await prisma.task.findMany({
        where: { status: { not: "DONE" }, parentTaskId: null },
        include: { project: true },
        orderBy: { createdAt: "desc" },
        take: 100,
    });
    const parentTaskOptions = openTasks.map((t) => ({
        text: { type: "plain_text", text: `${t.title} — ${t.project.name}`.slice(0, 75) },
        value: t.id,
    }));
    await client.views.open({
        trigger_id: triggerId,
        view: {
            type: "modal",
            callback_id: "new_task_submit",
            private_metadata: JSON.stringify({
                channelId,
                isAdminUser: isAdminUser ?? false,
                // Non-admins with a channel project are locked to it; store so the handler can read it
                lockedProjectId: (!isAdminUser && channelProject) ? channelProject.id : undefined,
            }),
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
                // Admins (or users in channels without a linked project) get the full project picker.
                // Non-admins with a linked channel project see a locked read-only display; the projectId
                // travels through private_metadata.lockedProjectId instead of form values.
                ...(!isAdminUser && channelProject
                    ? [
                        {
                            type: "section",
                            block_id: "project_block",
                            text: { type: "mrkdwn", text: `*Project:* ${channelProject.name}` },
                        },
                    ]
                    : [
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
                    ]),
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
                                type: "input",
                                block_id: "parent_task_block",
                                label: { type: "plain_text", text: "Parent Task (Make this a subtask)" },
                                optional: true,
                                element: {
                                    type: "static_select",
                                    action_id: "parent_task",
                                    placeholder: { type: "plain_text", text: "Select a parent task" },
                                    options: parentTaskOptions,
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
                {
                    type: "input", block_id: "tags_block",
                    label: { type: "plain_text", text: "Tags" }, optional: true,
                    element: {
                        type: "multi_static_select", action_id: "tags",
                        placeholder: { type: "plain_text", text: "Select tags" },
                        options: tagOptions.length > 0 ? tagOptions
                            : [{ text: { type: "plain_text", text: "No tags yet" }, value: "none" }],
                    },
                },
                {
                    type: "input", block_id: "estimated_hours_block",
                    label: { type: "plain_text", text: "Estimated Hours" }, optional: true,
                    element: { type: "plain_text_input", action_id: "estimated_hours",
                        placeholder: { type: "plain_text", text: "e.g. 4" } },
                },
                {
                    type: "input", block_id: "story_points_block",
                    label: { type: "plain_text", text: "Story Points" }, optional: true,
                    element: { type: "plain_text_input", action_id: "story_points",
                        placeholder: { type: "plain_text", text: "e.g. 3" } },
                },
                {
                    type: "input", block_id: "recurrence_block",
                    label: { type: "plain_text", text: "Recurring" }, optional: true,
                    element: {
                        type: "static_select", action_id: "recurrence",
                        placeholder: { type: "plain_text", text: "Does not repeat" },
                        options: [
                            { text: { type: "plain_text", text: "Does not repeat" }, value: "NONE" },
                            { text: { type: "plain_text", text: "Daily" }, value: "DAILY" },
                            { text: { type: "plain_text", text: "Weekly" }, value: "WEEKLY" },
                            { text: { type: "plain_text", text: "Biweekly" }, value: "BIWEEKLY" },
                            { text: { type: "plain_text", text: "Monthly" }, value: "MONTHLY" },
                        ],
                    },
                },
                {
                    type: "input", block_id: "recurrence_end_block",
                    label: { type: "plain_text", text: "Repeat Until" }, optional: true,
                    element: { type: "datepicker", action_id: "recurrence_end",
                        placeholder: { type: "plain_text", text: "No end date" } },
                },
                // Fetch open milestones for the channel's project, add block if any exist
                ...(await (async () => {
                    if (!channelProject)
                        return [];
                    const channelMilestones = await prisma.milestone.findMany({
                        where: {
                            projectId: channelProject.id,
                            status: { notIn: ["COMPLETED", "CANCELLED"] },
                        },
                        select: { id: true, title: true },
                        orderBy: { dueDate: "asc" },
                    });
                    if (channelMilestones.length === 0)
                        return [];
                    const milestoneOptions = channelMilestones.map((m) => ({
                        text: { type: "plain_text", text: `🎯 ${m.title}` },
                        value: m.id,
                    }));
                    return [
                        {
                            type: "input",
                            block_id: "milestone_block",
                            optional: true,
                            label: { type: "plain_text", text: "Milestone" },
                            element: {
                                type: "static_select",
                                action_id: "milestone",
                                placeholder: {
                                    type: "plain_text",
                                    text: "Link to a milestone (optional)",
                                },
                                options: milestoneOptions,
                            },
                        },
                    ];
                })()),
            ],
        },
    });
}
export async function openNewProjectModal(client, triggerId, channelId, userId) {
    if (userId) {
        const member = await prisma.member.findUnique({ where: { slackId: userId }, select: { isAdmin: true } });
        if (!member?.isAdmin) {
            await client.chat.postEphemeral({
                channel: channelId ?? userId,
                user: userId,
                text: "❌ Only admins can create projects.",
            });
            return;
        }
    }
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
export async function openAddNoteModal(client, triggerId, taskId) {
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
                            type: "section",
                            text: {
                                type: "mrkdwn",
                                text: `*Task:* ${task.title}`,
                            },
                        },
                        { type: "divider" },
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
async function buildProjectPickerModal(triggerId, callbackId, title, submitLabel) {
    const projects = await prisma.project.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
    });
    const options = projects.map(p => ({
        text: { type: "plain_text", text: p.name },
        value: p.id,
    }));
    if (options.length === 0) {
        options.push({ text: { type: "plain_text", text: "No active projects" }, value: "none" });
    }
    return {
        trigger_id: triggerId,
        view: {
            type: "modal",
            callback_id: callbackId,
            title: { type: "plain_text", text: title },
            submit: { type: "plain_text", text: submitLabel },
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
    };
}
export async function openReportModal(client, triggerId) {
    const payload = await buildProjectPickerModal(triggerId, "report_submit", "Project Report", "View Report 📊");
    await client.views.open(payload);
}
export async function openHealthModal(client, triggerId) {
    const payload = await buildProjectPickerModal(triggerId, "health_submit", "Health Check", "Check Health 🏥");
    await client.views.open(payload);
}
export async function openMilestonesModal(client, triggerId) {
    const payload = await buildProjectPickerModal(triggerId, "milestones_submit", "Milestones", "View Milestones 🏁");
    await client.views.open(payload);
}
// ── Modal Registration ───────────────────────────────────────
export function registerModals(app) {
    // ── Standup Submission ────────────────────────────────────
    app.view("standup_submit", async ({ ack, body, view, client }) => {
        await ack();
        try {
            const channelId = view.private_metadata;
            const userId = body.user.id;
            const yesterday = view.state.values.yesterday_block?.yesterday?.value ?? "";
            const today = view.state.values.today_block?.today?.value ?? "";
            const blockers = view.state.values.blockers_block?.blockers?.value ?? "None";
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
                    memberId: member.id,
                    source: "SLACK",
                    eventType: "STANDUP_POSTED",
                    payload: { preview: `${yesterday} / ${today}`.slice(0, 120) },
                }).catch(console.error);
            }
        }
        catch (error) {
            console.error("Standup submission error:", error);
        }
    });
    // ── New Task Submission ──────────────────────────────────
    app.view("new_task_submit", async ({ ack, body, view, client }) => {
        await ack();
        try {
            const meta = (() => { try {
                return JSON.parse(view.private_metadata);
            }
            catch {
                return { channelId: view.private_metadata };
            } })();
            const channelId = meta.channelId ?? view.private_metadata;
            const values = view.state.values;
            const title = values.title_block?.title?.value ?? "Untitled";
            const description = values.description_block?.description?.value ?? undefined;
            // Non-admins with a locked project don't have a project dropdown; fall back to metadata.
            const projectId = values.project_block?.project?.selected_option?.value
                || meta.lockedProjectId
                || "";
            const assigneeSlackIds = values.assignee_block?.assignees?.selected_users ?? [];
            const dueDateStr = values.due_date_block?.due_date?.selected_date ?? undefined;
            const priority = values.priority_block?.priority?.selected_option?.value ?? "MEDIUM";
            const parentTaskId = values.parent_task_block?.parent_task?.selected_option?.value ?? undefined;
            const milestoneId = values.milestone_block?.milestone?.selected_option?.value ?? undefined;
            const tagIds = (values.tags_block?.tags?.selected_options ?? [])
                .map((o) => o.value).filter((v) => v !== "none").slice(0, 5);
            const estimatedHours = parseFloat(values.estimated_hours_block?.estimated_hours?.value ?? "") || undefined;
            const storyPoints = parseInt(values.story_points_block?.story_points?.value ?? "") || undefined;
            const recurrence = values.recurrence_block?.recurrence?.selected_option?.value;
            const isRecurring = recurrence && recurrence !== "NONE" ? true : undefined;
            const recurrencePattern = isRecurring ? recurrence : undefined;
            const recurrenceEndRaw = values.recurrence_end_block?.recurrence_end?.selected_date;
            const recurrenceEndDate = recurrenceEndRaw ? new Date(recurrenceEndRaw) : undefined;
            if (!projectId || projectId === "none")
                return;
            // Resolve assignees
            const assigneeIds = await Promise.all(assigneeSlackIds.map(slackId => resolveSlackMember(slackId, client).then(m => m.id)));
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
                tagIds,
                estimatedHours,
                storyPoints,
                isRecurring,
                recurrencePattern,
                recurrenceEndDate,
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
                            data: { slackMsgTs: result.ts },
                        });
                    }
                }
            }
            const actor = await resolveSlackMember(body.user.id).catch(() => null);
            logAuditEvent({
                projectId,
                taskId: task.id,
                memberId: actor?.id ?? null,
                source: "SLACK",
                eventType: "TASK_CREATED",
                payload: {
                    taskTitle: task.title,
                    priority: task.priority,
                    assigneeNames: fullTask?.assignees?.map((a) => a.displayName) ?? [],
                },
            }).catch(console.error);
            // DM each assigned member (except submitter)
            if (assigneeIds.length > 0) {
                (async () => {
                    try {
                        const { queueDm } = await import("../services/dmBatcher.js");
                        for (const assigneeId of assigneeIds) {
                            const assigneeMember = await prisma.member.findUnique({ where: { id: assigneeId }, select: { slackId: true, id: true } });
                            if (!assigneeMember?.slackId)
                                continue;
                            if (actor && assigneeMember.id === actor.id)
                                continue; // skip self-assignment
                            queueDm(assigneeMember.slackId, `📋 *${actor?.displayName ?? "Someone"}* assigned you to a new task: *${title}*`);
                        }
                    }
                    catch (err) {
                        console.error("new_task_submit DM error:", err);
                    }
                })();
            }
        }
        catch (error) {
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
            if (!task)
                return;
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
                    taskId: taskId,
                    memberId: member.id,
                    source: "SLACK",
                    eventType: "TASK_NOTE_ADDED",
                    payload: { taskTitle: task.title, preview: note.slice(0, 120) },
                }).catch(console.error);
            }
        }
        catch (error) {
            console.error("Add note submission error:", error);
        }
    });
    // ── Reassign Submission ──────────────────────────────────
    app.view("reassign_submit", async ({ ack, body, view, client }) => {
        await ack();
        try {
            const taskId = view.private_metadata;
            const selectedUserId = view.state.values.user_block?.selected_user?.selected_user;
            if (!selectedUserId)
                return;
            const member = await resolveSlackMember(selectedUserId, client);
            const prevTask = await getTask(taskId);
            const prevAssigneeNames = prevTask?.assignees?.map((a) => a.displayName) ?? [];
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
                taskId: taskId,
                memberId: actor?.id ?? null,
                source: "SLACK",
                eventType: "TASK_REASSIGNED",
                payload: {
                    taskTitle: prevTask?.title ?? "",
                    fromName: prevAssigneeNames.join(", ") || null,
                    toName: member.displayName,
                },
            }).catch(console.error);
            // DM the new assignee
            (async () => {
                try {
                    const { queueDm } = await import("../services/dmBatcher.js");
                    if (member.slackId && actor?.id !== member.id) {
                        queueDm(member.slackId, `📋 *${actor?.displayName ?? "Someone"}* assigned you to: *${task?.title ?? "a task"}*`);
                    }
                }
                catch (err) {
                    console.error("reassign_submit assignee DM error:", err);
                }
            })();
        }
        catch (error) {
            console.error("Reassign submission error:", error);
        }
    });
    // ── New Project Submission ────────────────────────────────
    app.view("new_project_submit", async ({ ack, view, client, body }) => {
        await ack();
        try {
            // Server-side admin guard — the modal opener already checks this, but we
            // enforce it here too so a lingering or replayed modal can't bypass it.
            const submitter = await prisma.member.findUnique({
                where: { slackId: body.user.id },
                select: { isAdmin: true },
            });
            if (!submitter?.isAdmin) {
                await client.chat.postMessage({
                    channel: body.user.id,
                    text: "❌ Only admins can create projects.",
                });
                return;
            }
            const values = view.state.values;
            const name = values.name_block?.name?.value ?? "Untitled Project";
            const description = values.description_block?.description?.value ?? null;
            const type = values.type_block?.type?.selected_option?.value ?? "ENGINEERING";
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
                memberId: projectActor?.id ?? null,
                source: "SLACK",
                eventType: "PROJECT_CREATED",
                payload: { projectName: project.name },
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
        }
        catch (error) {
            console.error("New project submission error:", error);
            // DM the user with a meaningful error
            const msg = error?.code === "P2002"
                ? "❌ That Slack channel is already linked to another project. Please pick a different channel or leave it blank."
                : `❌ Failed to create project: ${error?.message ?? "Unknown error"}`;
            try {
                await client.chat.postMessage({ channel: body.user.id, text: msg });
            }
            catch { /* silent */ }
        }
    });
    // ── Snooze Task Submission ─────────────────────────────────
    app.view("snooze_submit", async ({ ack, view, client, body }) => {
        await ack();
        try {
            const taskId = view.private_metadata;
            const values = view.state.values;
            const dateStr = values.date_block?.due_date?.selected_date;
            if (!dateStr)
                return;
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
                taskId: taskId,
                memberId: snoozeActor?.id ?? null,
                source: "SLACK",
                eventType: "TASK_SNOOZED",
                payload: { taskTitle: task?.title ?? "", newDueDate: dateStr },
            }).catch(console.error);
        }
        catch (error) {
            console.error("Snooze submission error:", error);
        }
    });
    // ── Task Done Submission ──────────────────────────────────
    app.view("task_done_submit", async ({ ack, view, client, body }) => {
        await ack();
        try {
            const taskId = view.state.values.task_block?.task_id?.selected_option?.value;
            if (!taskId || taskId === "none")
                return;
            const task = await getTask(taskId);
            if (!task)
                return;
            await updateTask(taskId, { status: "DONE" });
            await client.chat.postMessage({
                channel: body.user.id,
                text: `✅ Task marked as done: *${task.title}*`,
            });
            const doneActor = await resolveSlackMember(body.user.id).catch(() => null);
            logAuditEvent({
                taskId: taskId,
                memberId: doneActor?.id ?? null,
                source: "SLACK",
                eventType: "TASK_COMPLETED",
                payload: { taskTitle: task.title },
            }).catch(console.error);
        }
        catch (error) {
            console.error("task_done_submit error:", error);
        }
    });
    // ── Status View Submission ────────────────────────────────
    app.view("status_view_submit", async ({ ack, view, client, body }) => {
        await ack();
        try {
            const projectId = view.state.values.project_block?.project_id?.selected_option?.value;
            if (!projectId || projectId === "none")
                return;
            const project = await prisma.project.findUnique({
                where: { id: projectId },
                include: {
                    tasks: { include: { assignees: true } },
                    members: { include: { member: true } },
                },
            });
            if (!project)
                return;
            const { buildProjectStatusCard } = await import("../utils/blockKit.js");
            await client.chat.postMessage({
                channel: body.user.id,
                blocks: buildProjectStatusCard(project, project.tasks),
                text: `Status for ${project.name}`,
            });
        }
        catch (error) {
            console.error("status_view_submit error:", error);
        }
    });
    // ── Notify Preferences Submission ────────────────────────
    app.view("notify_submit", async ({ ack, body, view }) => {
        await ack();
        try {
            const selected = view.state.values.prefs_block?.prefs?.selected_options ?? [];
            const prefs = selected.map(o => o.value);
            await prisma.member.update({
                where: { slackId: body.user.id },
                data: { notificationPrefs: prefs },
            });
        }
        catch (error) {
            console.error("notify_submit error:", error);
        }
    });
    // ── Report Submission ─────────────────────────────────────
    app.view("report_submit", async ({ ack, view, client, body }) => {
        await ack();
        try {
            const projectId = view.state.values.project_block?.project_id?.selected_option?.value;
            if (!projectId || projectId === "none")
                return;
            const [project, milestones] = await Promise.all([
                prisma.project.findUnique({
                    where: { id: projectId },
                    include: { tasks: { include: { assignees: true } } },
                }),
                getMilestonesForProject(projectId),
            ]);
            if (!project)
                return;
            const now = new Date();
            const topLevel = project.tasks.filter(t => !t.parentTaskId);
            const statusCounts = { TODO: 0, IN_PROGRESS: 0, BLOCKED: 0, DONE: 0 };
            for (const t of topLevel)
                statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
            const overdueCount = topLevel.filter(t => t.status !== "DONE" && t.dueDate && t.dueDate < now).length;
            await client.chat.postMessage({
                channel: body.user.id,
                blocks: buildProjectReport(project, project.tasks, milestones, statusCounts, overdueCount),
                text: `Report for ${project.name}`,
            });
        }
        catch (error) {
            console.error("report_submit error:", error);
        }
    });
    // ── Health Submission ─────────────────────────────────────
    app.view("health_submit", async ({ ack, view, client, body }) => {
        await ack();
        try {
            const projectId = view.state.values.project_block?.project_id?.selected_option?.value;
            if (!projectId || projectId === "none")
                return;
            const [project, milestones] = await Promise.all([
                prisma.project.findUnique({
                    where: { id: projectId },
                    include: { tasks: { include: { assignees: true } } },
                }),
                getMilestonesForProject(projectId),
            ]);
            if (!project)
                return;
            const now = new Date();
            const topLevel = project.tasks.filter(t => !t.parentTaskId);
            const statusCounts = { TODO: 0, IN_PROGRESS: 0, BLOCKED: 0, DONE: 0 };
            for (const t of topLevel)
                statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
            const overdueCount = topLevel.filter(t => t.status !== "DONE" && t.dueDate && t.dueDate < now).length;
            await client.chat.postMessage({
                channel: body.user.id,
                blocks: buildProjectHealth(project, project.tasks, milestones, statusCounts, overdueCount),
                text: `Health check for ${project.name}`,
            });
        }
        catch (error) {
            console.error("health_submit error:", error);
        }
    });
    // ── Milestones Submission ──────────────────────────────────
    app.view("milestones_submit", async ({ ack, view, client, body }) => {
        await ack();
        try {
            const projectId = view.state.values.project_block?.project_id?.selected_option?.value;
            if (!projectId || projectId === "none")
                return;
            const [project, milestones] = await Promise.all([
                prisma.project.findUnique({ where: { id: projectId } }),
                getMilestonesForProject(projectId),
            ]);
            if (!project)
                return;
            await client.chat.postMessage({
                channel: body.user.id,
                blocks: buildMilestoneView(project, milestones),
                text: `Milestones for ${project.name}`,
            });
        }
        catch (error) {
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
            const description = values.description_block?.description?.value ?? undefined;
            const assigneeSlackIds = values.assignee_block?.assignees?.selected_users ?? [];
            const dueDateStr = values.due_date_block?.due_date?.selected_date ?? undefined;
            const priority = values.priority_block?.priority?.selected_option?.value ?? "MEDIUM";
            const tagIds = (values.tags_block?.tags?.selected_options ?? [])
                .map((o) => o.value).filter((v) => v !== "none");
            const estimatedHours = parseFloat(values.estimated_hours_block?.estimated_hours?.value ?? "") || undefined;
            const storyPoints = parseInt(values.story_points_block?.story_points?.value ?? "") || undefined;
            if (!parentTaskId || parentTaskId === "none")
                return;
            // Look up parent to get projectId
            const parentTask = await prisma.task.findUnique({ where: { id: parentTaskId } });
            if (!parentTask)
                return;
            const assigneeIds = await Promise.all(assigneeSlackIds.map((slackId) => resolveSlackMember(slackId, client).then(m => m.id)));
            const dueDate = dueDateStr ? new Date(dueDateStr) : undefined;
            const subtask = await createTask({
                title,
                description,
                projectId: parentTask.projectId,
                assigneeIds,
                dueDate,
                priority,
                parentTaskId,
                tagIds,
                estimatedHours,
                storyPoints,
            });
            const fullSubtask = await getTask(subtask.id);
            if (fullSubtask && channelId) {
                await client.chat.postMessage({
                    channel: channelId,
                    blocks: buildTaskCard(fullSubtask, fullSubtask.project),
                    text: `✅ Subtask created: ${title}`,
                });
            }
        }
        catch (error) {
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
            if (!projectId || projectId === "none" || !dueDateStr)
                return;
            let ownerId = null;
            if (ownerSlackId) {
                try {
                    const owner = await resolveSlackMember(ownerSlackId, client);
                    ownerId = owner.id;
                }
                catch {
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
            const targetChannel = project?.notificationTargets?.[0]?.slackChannelId ?? channelId;
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
        }
        catch (error) {
            console.error("milestone_submit error:", error);
        }
    });
}
// ── Subtask Modal Builder ────────────────────────────────────
export async function openSubtaskModal(client, triggerId, channelId) {
    const openTasks = await prisma.task.findMany({
        where: { status: { not: "DONE" }, parentTaskId: null },
        include: { project: true },
        orderBy: { createdAt: "desc" },
        take: 100,
    });
    const parentOptions = openTasks.map(t => ({
        text: { type: "plain_text", text: `${t.title} — ${t.project.name}`.slice(0, 75) },
        value: t.id,
    }));
    if (parentOptions.length === 0) {
        parentOptions.push({ text: { type: "plain_text", text: "No open tasks available" }, value: "none" });
    }
    // Fetch tags scoped to the channel project if available
    const channelProject = await getProjectByChannel(channelId).catch(() => null);
    let tagOptions = [];
    try {
        if (channelProject?.id) {
            const tags = await prisma.tag.findMany({ where: { projectId: channelProject.id } });
            tagOptions = tags.map(t => ({ text: { type: "plain_text", text: t.name }, value: t.id }));
        }
    }
    catch { /* ignore */ }
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
                        options: parentOptions,
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
                    block_id: "description_block",
                    label: { type: "plain_text", text: "Description" },
                    optional: true,
                    element: {
                        type: "plain_text_input",
                        action_id: "description",
                        multiline: true,
                        placeholder: { type: "plain_text", text: "Detailed description..." },
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
                        initial_option: { text: { type: "plain_text", text: "🟡 Medium" }, value: "MEDIUM" },
                        options: [
                            { text: { type: "plain_text", text: "🟢 Low" }, value: "LOW" },
                            { text: { type: "plain_text", text: "🟡 Medium" }, value: "MEDIUM" },
                            { text: { type: "plain_text", text: "🟠 High" }, value: "HIGH" },
                            { text: { type: "plain_text", text: "🔴 Critical" }, value: "CRITICAL" },
                        ],
                    },
                },
                {
                    type: "input", block_id: "tags_block",
                    label: { type: "plain_text", text: "Tags" }, optional: true,
                    element: {
                        type: "multi_static_select", action_id: "tags",
                        placeholder: { type: "plain_text", text: "Select tags" },
                        options: tagOptions.length > 0 ? tagOptions
                            : [{ text: { type: "plain_text", text: "No tags yet" }, value: "none" }],
                    },
                },
                {
                    type: "input", block_id: "estimated_hours_block",
                    label: { type: "plain_text", text: "Estimated Hours" }, optional: true,
                    element: { type: "plain_text_input", action_id: "estimated_hours",
                        placeholder: { type: "plain_text", text: "e.g. 4" } },
                },
                {
                    type: "input", block_id: "story_points_block",
                    label: { type: "plain_text", text: "Story Points" }, optional: true,
                    element: { type: "plain_text_input", action_id: "story_points",
                        placeholder: { type: "plain_text", text: "e.g. 3" } },
                },
            ],
        },
    });
}
// ── Notify Preferences Modal ─────────────────────────────────
export async function openNotifyModal(client, triggerId, member) {
    const allOptions = [
        { text: { type: "plain_text", text: "⏰ Daily reminders (overdue + due today)" }, value: "daily_reminders" },
        { text: { type: "plain_text", text: "📋 Monday weekly digest" }, value: "weekly_digest" },
        { text: { type: "plain_text", text: "📊 Project health summaries" }, value: "project_updates" },
        { text: { type: "plain_text", text: "🧍 Daily standup prompts (weekdays 9:15 AM)" }, value: "standup_prompts" },
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
export async function openSnoozeModal(client, triggerId, taskId) {
    const task = await getTask(taskId);
    if (!task)
        return;
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
export async function openTaskDoneModal(client, triggerId, userId) {
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
        text: { type: "plain_text", text: `${t.title} — ${t.project.name}`.slice(0, 75) },
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
export async function openStatusModal(client, triggerId) {
    const projects = await prisma.project.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
    });
    const options = projects.map(p => ({
        text: { type: "plain_text", text: p.name },
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
export async function openMilestoneModal(client, triggerId, channelId) {
    const channelProject = await getProjectByChannel(channelId);
    const projects = await prisma.project.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
    });
    const projectOptions = projects.map((p) => ({
        text: { type: "plain_text", text: p.name },
        value: p.id,
    }));
    const safeOptions = projectOptions.length > 0
        ? projectOptions
        : [{ text: { type: "plain_text", text: "No active projects" }, value: "none" }];
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
                        options: safeOptions,
                        ...(channelProject && projectOptions.find((o) => o.value === channelProject.id)
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
// ── AI Modal Openers ─────────────────────────────────────────
export async function openDriveParseModal(client, triggerId, channelId, prefillUrl) {
    await client.views.open({
        trigger_id: triggerId,
        view: {
            type: "modal",
            callback_id: "drive_parse_submit",
            private_metadata: JSON.stringify({ channelId }),
            title: { type: "plain_text", text: "Parse Drive Document" },
            submit: { type: "plain_text", text: "Extract Tasks" },
            close: { type: "plain_text", text: "Cancel" },
            blocks: [
                {
                    type: "input",
                    block_id: "url_block",
                    label: { type: "plain_text", text: "Google Drive / Docs / Sheets URL" },
                    element: {
                        type: "plain_text_input",
                        action_id: "drive_url",
                        placeholder: { type: "plain_text", text: "https://docs.google.com/document/d/..." },
                        ...(prefillUrl ? { initial_value: prefillUrl } : {}),
                    },
                },
                {
                    type: "input",
                    block_id: "note_block",
                    optional: true,
                    label: { type: "plain_text", text: "What should I look for? (optional)" },
                    element: {
                        type: "plain_text_input",
                        action_id: "note",
                        placeholder: { type: "plain_text", text: "e.g. Focus on action items for the hardware team" },
                    },
                },
            ],
        },
    });
}
export async function openMeetingNotesModal(client, triggerId, channelId) {
    await client.views.open({
        trigger_id: triggerId,
        view: {
            type: "modal",
            callback_id: "meeting_notes_submit",
            private_metadata: JSON.stringify({ channelId }),
            title: { type: "plain_text", text: "Parse Meeting Notes" },
            submit: { type: "plain_text", text: "Extract Action Items" },
            close: { type: "plain_text", text: "Cancel" },
            blocks: [
                {
                    type: "input",
                    block_id: "notes_block",
                    label: { type: "plain_text", text: "Meeting Notes" },
                    element: {
                        type: "plain_text_input",
                        action_id: "notes",
                        multiline: true,
                        placeholder: { type: "plain_text", text: "Paste your meeting notes here..." },
                    },
                },
                {
                    type: "input",
                    block_id: "attendees_block",
                    optional: true,
                    label: { type: "plain_text", text: "Attendees (optional)" },
                    element: {
                        type: "multi_users_select",
                        action_id: "attendees",
                        placeholder: { type: "plain_text", text: "Select attendees" },
                    },
                },
            ],
        },
    });
}
export async function openSprintPlanModal(client, triggerId, projectId) {
    await client.views.open({
        trigger_id: triggerId,
        view: {
            type: "modal",
            callback_id: "sprint_plan_submit",
            private_metadata: JSON.stringify({ projectId }),
            title: { type: "plain_text", text: "Plan Sprint" },
            submit: { type: "plain_text", text: "Generate Plan" },
            close: { type: "plain_text", text: "Cancel" },
            blocks: [
                {
                    type: "input",
                    block_id: "capacity_block",
                    label: { type: "plain_text", text: "Team Capacity (story points)" },
                    element: {
                        type: "plain_text_input",
                        action_id: "capacity_points",
                        initial_value: "40",
                        placeholder: { type: "plain_text", text: "40" },
                    },
                },
                {
                    type: "input",
                    block_id: "days_block",
                    label: { type: "plain_text", text: "Sprint Length (days)" },
                    element: {
                        type: "plain_text_input",
                        action_id: "sprint_days",
                        initial_value: "14",
                        placeholder: { type: "plain_text", text: "14" },
                    },
                },
            ],
        },
    });
}
export async function openImageTaskModal(client, triggerId, channelId, fileUrl, userNote) {
    await client.views.open({
        trigger_id: triggerId,
        view: {
            type: "modal",
            callback_id: "image_task_submit",
            private_metadata: JSON.stringify({ channelId, fileUrl }),
            title: { type: "plain_text", text: "Create Task from Image" },
            submit: { type: "plain_text", text: "Analyze & Create" },
            close: { type: "plain_text", text: "Cancel" },
            blocks: [
                {
                    type: "section",
                    text: { type: "mrkdwn", text: `📎 Image: \`${fileUrl.split("/").pop() ?? "uploaded file"}\`` },
                },
                {
                    type: "input",
                    block_id: "note_block",
                    optional: true,
                    label: { type: "plain_text", text: "What's wrong here? (optional)" },
                    element: {
                        type: "plain_text_input",
                        action_id: "note",
                        initial_value: userNote,
                        placeholder: { type: "plain_text", text: "Describe the issue visible in this screenshot..." },
                    },
                },
            ],
        },
    });
}
// ── AI Modal Submission Handlers ──────────────────────────────
export function registerAiModals(app) {
    // Drive parse submit
    app.view("drive_parse_submit", async ({ ack, body, view, client }) => {
        await ack();
        try {
            const { channelId } = JSON.parse(view.private_metadata);
            const driveUrl = view.state.values.url_block?.drive_url?.value ?? "";
            if (!driveUrl)
                return;
            const fileId = extractFileId(driveUrl);
            if (!fileId) {
                await client.chat.postEphemeral({ channel: channelId, user: body.user.id, text: "❌ Couldn't parse a file ID from that URL." });
                return;
            }
            const project = await getProjectByChannel(channelId);
            if (!project) {
                await client.chat.postEphemeral({ channel: channelId, user: body.user.id, text: "❌ No project linked to this channel." });
                return;
            }
            await client.chat.postEphemeral({ channel: channelId, user: body.user.id, text: "⏳ Fetching and analyzing document…" });
            const fileResult = await fetchDriveFileAsText(fileId);
            if (!fileResult) {
                await client.chat.postEphemeral({ channel: channelId, user: body.user.id, text: "❌ Couldn't fetch that file. Make sure the service account has access." });
                return;
            }
            const existingTasks = await prisma.task.findMany({ where: { projectId: project.id, status: { not: "DONE" } }, select: { title: true } });
            const today = new Date().toISOString().split("T")[0];
            const result = await generateJsonFromDocument(fileResult.text, driveToTasksPrompt(project.name, project.description ?? "", existingTasks.map(t => t.title), today));
            if (!result?.tasks?.length) {
                await client.chat.postEphemeral({ channel: channelId, user: body.user.id, text: "🤷 No actionable tasks found in that document." });
                return;
            }
            await client.chat.postEphemeral({
                channel: channelId,
                user: body.user.id,
                text: `📄 Found ${result.tasks.length} task(s) in *${fileResult.name}*`,
                blocks: buildDriveTaskPreview(result.tasks, channelId),
            });
        }
        catch (err) {
            console.error("drive_parse_submit error:", err);
        }
    });
    // Meeting notes submit
    app.view("meeting_notes_submit", async ({ ack, body, view, client }) => {
        await ack();
        try {
            const { channelId } = JSON.parse(view.private_metadata);
            const notes = view.state.values.notes_block?.notes?.value ?? "";
            const attendeeIds = (view.state.values.attendees_block?.attendees?.selected_users ?? []);
            const project = await getProjectByChannel(channelId);
            if (!project)
                return;
            await client.chat.postEphemeral({ channel: channelId, user: body.user.id, text: "⏳ Parsing meeting notes…" });
            const attendeeNames = attendeeIds.length > 0
                ? (await prisma.member.findMany({ where: { slackId: { in: attendeeIds } }, select: { displayName: true } })).map(m => m.displayName)
                : [];
            const today = new Date().toISOString().split("T")[0];
            const result = await generateJsonFromDocument(notes, meetingNotesToTasksPrompt(project.name, attendeeNames, today));
            if (!result?.tasks?.length) {
                await client.chat.postEphemeral({ channel: channelId, user: body.user.id, text: "🤷 No action items found in those notes." });
                return;
            }
            await client.chat.postEphemeral({
                channel: channelId,
                user: body.user.id,
                text: `📝 Found ${result.tasks.length} action item(s)\n> ${result.summary ?? ""}`,
                blocks: buildDriveTaskPreview(result.tasks, channelId),
            });
        }
        catch (err) {
            console.error("meeting_notes_submit error:", err);
        }
    });
    // Sprint plan submit
    app.view("sprint_plan_submit", async ({ ack, body, view, client }) => {
        await ack();
        try {
            const { projectId } = JSON.parse(view.private_metadata);
            const capacityPoints = parseInt(view.state.values.capacity_block?.capacity_points?.value ?? "40") || 40;
            const sprintDays = parseInt(view.state.values.days_block?.sprint_days?.value ?? "14") || 14;
            const { generateSprintPlan } = await import("../services/projectAnalysisService.js");
            const plan = await generateSprintPlan(projectId, capacityPoints, sprintDays);
            if (!plan)
                return;
            const lines = (plan.sprintTasks ?? []).slice(0, 15).map((t) => `• \`${t.taskId}\` — ${t.reason}`);
            await client.chat.postEphemeral({
                channel: body.user.id,
                user: body.user.id,
                text: `🏃 *Sprint Plan (${sprintDays}d, ${plan.totalPoints ?? "?"}pts)*\n*Theme:* ${plan.focusTheme}\n\n${lines.join("\n")}${plan.risksInPlan?.length ? `\n\n⚠️ Risks: ${plan.risksInPlan.join(", ")}` : ""}`,
            });
        }
        catch (err) {
            console.error("sprint_plan_submit error:", err);
        }
    });
    // Image task submit
    app.view("image_task_submit", async ({ ack, body, view, client }) => {
        await ack();
        try {
            const { channelId, fileUrl } = JSON.parse(view.private_metadata);
            const note = view.state.values.note_block?.note?.value ?? "";
            const project = await getProjectByChannel(channelId);
            if (!project)
                return;
            // Download file as base64 using bot token
            const fileResp = await fetch(fileUrl, { headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` } });
            if (!fileResp.ok) {
                await client.chat.postEphemeral({ channel: channelId, user: body.user.id, text: "❌ Couldn't download the image." });
                return;
            }
            const buffer = await fileResp.arrayBuffer();
            const base64 = Buffer.from(buffer).toString("base64");
            const contentType = fileResp.headers.get("content-type") ?? "image/jpeg";
            const mimeType = (contentType.startsWith("image/png") ? "image/png" : contentType.startsWith("image/webp") ? "image/webp" : "image/jpeg");
            const result = await generateJsonFromImage(base64, mimeType, imageToTaskPrompt(project.name, note));
            if (!result) {
                await client.chat.postEphemeral({ channel: channelId, user: body.user.id, text: "❌ Couldn't analyze the image." });
                return;
            }
            if (result.hasTask) {
                const isAdminUser = await import("../services/memberService.js").then(m => m.isAdminBySlackId(body.user.id));
                await openNewTaskModal(client, ("trigger_id" in body ? body.trigger_id : "") ?? "", channelId, result.title, result.description, undefined, undefined, undefined, isAdminUser);
            }
            else {
                await client.chat.postEphemeral({ channel: channelId, user: body.user.id, text: `🖼️ ${result.screenshotDescription}\n\nNo specific task detected.` });
            }
        }
        catch (err) {
            console.error("image_task_submit error:", err);
        }
    });
}
// ── Event Create Modal ───────────────────────────────────────
export async function openEventCreateModal(client, triggerId, channelId) {
    const projects = await prisma.project.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
    });
    await client.views.open({
        trigger_id: triggerId,
        view: {
            type: "modal",
            callback_id: "event_create_submit",
            private_metadata: channelId,
            title: { type: "plain_text", text: "Create Event" },
            submit: { type: "plain_text", text: "Create" },
            close: { type: "plain_text", text: "Cancel" },
            blocks: [
                {
                    type: "input",
                    block_id: "event_title",
                    label: { type: "plain_text", text: "Title" },
                    element: { type: "plain_text_input", action_id: "value", placeholder: { type: "plain_text", text: "e.g. Weekly Leadership Meeting" } },
                },
                {
                    type: "input",
                    block_id: "event_type",
                    label: { type: "plain_text", text: "Type" },
                    element: {
                        type: "static_select",
                        action_id: "value",
                        initial_option: { text: { type: "plain_text", text: "Meeting" }, value: "MEETING" },
                        options: [
                            { text: { type: "plain_text", text: "Meeting" }, value: "MEETING" },
                            { text: { type: "plain_text", text: "Deadline" }, value: "DEADLINE" },
                            { text: { type: "plain_text", text: "Workshop" }, value: "WORKSHOP" },
                            { text: { type: "plain_text", text: "Social" }, value: "SOCIAL" },
                            { text: { type: "plain_text", text: "Other" }, value: "OTHER" },
                        ],
                    },
                },
                {
                    type: "input",
                    block_id: "event_date",
                    label: { type: "plain_text", text: "Date" },
                    element: { type: "datepicker", action_id: "value" },
                },
                {
                    type: "input",
                    block_id: "event_time",
                    label: { type: "plain_text", text: "Time (HH:MM)" },
                    element: { type: "plain_text_input", action_id: "value", placeholder: { type: "plain_text", text: "19:00" } },
                },
                {
                    type: "input",
                    block_id: "event_location",
                    optional: true,
                    label: { type: "plain_text", text: "Location" },
                    element: { type: "plain_text_input", action_id: "value", placeholder: { type: "plain_text", text: "Room 123 or Zoom link" } },
                },
                ...(projects.length > 0 ? [{
                        type: "input",
                        block_id: "event_project",
                        optional: true,
                        label: { type: "plain_text", text: "Linked Project" },
                        element: {
                            type: "static_select",
                            action_id: "value",
                            placeholder: { type: "plain_text", text: "None" },
                            options: projects.map(p => ({ text: { type: "plain_text", text: p.name }, value: p.id })),
                        },
                    }] : []),
                {
                    type: "input",
                    block_id: "event_recurring",
                    optional: true,
                    label: { type: "plain_text", text: "Recurrence" },
                    element: {
                        type: "static_select",
                        action_id: "value",
                        placeholder: { type: "plain_text", text: "None (one-time)" },
                        options: [
                            { text: { type: "plain_text", text: "Weekly" }, value: "weekly" },
                            { text: { type: "plain_text", text: "Biweekly" }, value: "biweekly" },
                            { text: { type: "plain_text", text: "Monthly" }, value: "monthly" },
                        ],
                    },
                },
            ],
        },
    });
}
// ── Outreach Submit Modal ────────────────────────────────────
export async function openOutreachSubmitModal(client, triggerId, _slackUserId) {
    await client.views.open({
        trigger_id: triggerId,
        view: {
            type: "modal",
            callback_id: "outreach_submit_modal",
            title: { type: "plain_text", text: "Submit Content" },
            submit: { type: "plain_text", text: "Submit" },
            close: { type: "plain_text", text: "Cancel" },
            blocks: [
                {
                    type: "input",
                    block_id: "submission_title",
                    label: { type: "plain_text", text: "Title" },
                    element: { type: "plain_text_input", action_id: "value", placeholder: { type: "plain_text", text: "Brief title for this content" } },
                },
                {
                    type: "input",
                    block_id: "submission_type",
                    label: { type: "plain_text", text: "Content Type" },
                    element: {
                        type: "static_select",
                        action_id: "value",
                        options: [
                            { text: { type: "plain_text", text: "Social Post" }, value: "SOCIAL_POST" },
                            { text: { type: "plain_text", text: "Announcement" }, value: "ANNOUNCEMENT" },
                            { text: { type: "plain_text", text: "Event Promo" }, value: "EVENT_PROMO" },
                            { text: { type: "plain_text", text: "Newsletter" }, value: "NEWSLETTER" },
                            { text: { type: "plain_text", text: "Photo" }, value: "PHOTO" },
                            { text: { type: "plain_text", text: "Video" }, value: "VIDEO" },
                        ],
                    },
                },
                {
                    type: "input",
                    block_id: "submission_content",
                    optional: true,
                    label: { type: "plain_text", text: "Content / Caption" },
                    element: { type: "plain_text_input", action_id: "value", multiline: true, placeholder: { type: "plain_text", text: "Post text, caption, or description…" } },
                },
                {
                    type: "input",
                    block_id: "submission_platform",
                    label: { type: "plain_text", text: "Platforms" },
                    element: {
                        type: "multi_static_select",
                        action_id: "value",
                        placeholder: { type: "plain_text", text: "Select platforms" },
                        options: [
                            { text: { type: "plain_text", text: "Instagram" }, value: "instagram" },
                            { text: { type: "plain_text", text: "LinkedIn" }, value: "linkedin" },
                            { text: { type: "plain_text", text: "Twitter" }, value: "twitter" },
                            { text: { type: "plain_text", text: "Website" }, value: "website" },
                        ],
                    },
                },
                {
                    type: "input",
                    block_id: "submission_status",
                    label: { type: "plain_text", text: "Save as" },
                    element: {
                        type: "static_select",
                        action_id: "value",
                        initial_option: { text: { type: "plain_text", text: "Submit for Review" }, value: "SUBMITTED" },
                        options: [
                            { text: { type: "plain_text", text: "Draft (save for later)" }, value: "DRAFT" },
                            { text: { type: "plain_text", text: "Submit for Review" }, value: "SUBMITTED" },
                        ],
                    },
                },
            ],
        },
    });
}
//# sourceMappingURL=modals.js.map