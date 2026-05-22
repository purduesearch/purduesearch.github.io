import { getProjectByChannel, getProjectsForChannel, addMemberToProject } from "../services/projectService.js";
import { resolveSlackMember, getLeadershipChannelId } from "../services/memberService.js";
import { buildTodoPrompt, buildAiTaskSuggestion, buildMarkDoneFromReactionCard, } from "../utils/blockKit.js";
import { parseTaskFromMessage } from "../services/aiService.js";
import { storeAiTask } from "../utils/aiTaskCache.js";
import { prisma } from "../db/prisma.js";
// Fetches all Member records whose slackId appears in the given channel.
// Requires channels:read (public) / groups:read (private) scopes.
// Falls back to an empty array on error so the caller can use a fallback list.
async function getChannelMembers(client, channelId) {
    const slackIds = [];
    let cursor;
    try {
        do {
            const res = await client.conversations.members({ channel: channelId, limit: 200, ...(cursor ? { cursor } : {}) });
            slackIds.push(...(res.members ?? []));
            cursor = res.response_metadata?.next_cursor || undefined;
        } while (cursor);
    }
    catch (err) {
        console.warn("[events] conversations.members failed (missing scope?):", err.message);
        return [];
    }
    if (slackIds.length === 0)
        return [];
    return prisma.member.findMany({
        where: { slackId: { in: slackIds } },
        select: { slackId: true, displayName: true },
    });
}
// Escape special regex chars in a literal string
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// Strip punctuation used in names/handles for comparison
function normalize(s) {
    return s.toLowerCase().replace(/[.'\-_]/g, "");
}
// Score how well `query` (a handle or fragment) matches a member's name.
// Returns 0 if no meaningful match.
function nameMatchScore(query, member) {
    const q = normalize(query);
    if (q.length < 2)
        return 0;
    const parts = member.displayName.toLowerCase().split(/\s+/);
    const firstName = normalize(parts[0] ?? "");
    const lastName = normalize(parts[parts.length - 1] ?? "");
    const fullCompact = normalize(member.displayName);
    if (fullCompact === q)
        return 100; // exact full name (no spaces)
    if (firstName === q)
        return 90; // exact first name
    if (lastName === q && q.length >= 3)
        return 70; // exact last name
    if (q.length >= 3 && firstName.startsWith(q))
        return 60; // first-name prefix
    if (q.length >= 4 && fullCompact.includes(q))
        return 40; // substring of full name
    return 0;
}
// Find the single best-matching member for a query string (used for @handle lookups).
// Returns null if no member scores above the minimum threshold.
function bestMatch(query, members) {
    let top = null;
    for (const m of members) {
        const s = nameMatchScore(query, m);
        if (s > 0 && (!top || s > top.score))
            top = { member: m, score: s };
    }
    return top && top.score >= 60 ? top.member : null;
}
// Returns whether a member's display name appears naturally in the text.
function nameAppearsInText(member, lowerText) {
    const lowerName = member.displayName.toLowerCase();
    // Full display name verbatim
    if (lowerText.includes(lowerName))
        return true;
    const parts = lowerName.split(/\s+/).filter(p => p.length >= 3);
    // Every significant name part present as a whole word (handles "First Last" split across text)
    if (parts.length >= 2 && parts.every(p => new RegExp(`\\b${escapeRegex(p)}\\b`).test(lowerText))) {
        return true;
    }
    // First name only — require ≥ 4 chars to cut down false positives
    const first = parts[0];
    if (first && first.length >= 4 && new RegExp(`\\b${escapeRegex(first)}\\b`).test(lowerText)) {
        return true;
    }
    return false;
}
// Returns Slack user IDs for people mentioned in the text, drawn from `members`.
// Handles three forms: <@USERID> Slack tags, @handle plain text, and natural
// language name references ("have Henry fix this", "assign to Sarah").
function extractSuggestedAssignees(text, members) {
    if (members.length === 0)
        return [];
    const found = new Set();
    // 1. Explicit Slack <@USERID> tags
    for (const match of text.matchAll(/<@([A-Z0-9]+)(?:\|[^>]+)?>/g)) {
        const member = members.find(m => m.slackId === match[1]);
        if (member)
            found.add(member.slackId);
    }
    // Remove Slack tags before further processing
    const noSlackTags = text.replace(/<@[^>]+>/g, " ");
    // 2. Plain @handle mentions — e.g. "@henry", "@john.smith"
    for (const match of noSlackTags.matchAll(/@([\w.']+)/g)) {
        if (found.size >= 5)
            break;
        const remaining = members.filter(m => !found.has(m.slackId));
        const member = bestMatch(match[1], remaining);
        if (member)
            found.add(member.slackId);
    }
    // 3. Natural language names in the remaining text
    const plainText = noSlackTags.replace(/@[\w.']+/g, " ").toLowerCase();
    for (const member of members) {
        if (found.has(member.slackId))
            continue;
        if (nameAppearsInText(member, plainText))
            found.add(member.slackId);
    }
    return [...found];
}
// ── Event Registration ───────────────────────────────────────
export function registerEvents(app) {
    // ── App Mention: AI task parsing ──────────────────────────
    app.event("app_mention", async ({ event, client }) => {
        try {
            // Strip the @mention prefix (<@BOTID> or <@BOTID|name>)
            const text = event.text.replace(/<@[A-Z0-9]+(?:\|[^>]+)?>/g, "").trim();
            if (!text) {
                await client.chat.postMessage({
                    channel: event.channel,
                    thread_ts: event.ts,
                    text: "👋 Hi! Try: `@bot fix the login bug by Friday` and I'll suggest a task.",
                });
                return;
            }
            // Check channel is linked to a project
            const project = await getProjectByChannel(event.channel);
            if (!project) {
                await client.chat.postMessage({
                    channel: event.channel,
                    thread_ts: event.ts,
                    text: "⚠️ This channel isn't linked to a project. Use `/pm task` to create a task.",
                });
                return;
            }
            const today = new Date().toISOString().split("T")[0];
            // Status/health query detection — answer with risk analysis instead of task suggestion
            const lowerText = text.toLowerCase();
            const isStatusQuery = /\b(status|health|risks?|how.*(project|going)|what.*(missing|blocking|behind))\b/.test(lowerText);
            if (isStatusQuery) {
                try {
                    const { analyzeProjectRisks } = await import("../services/projectAnalysisService.js");
                    const { buildRiskReport } = await import("../utils/blockKit.js");
                    const risks = await analyzeProjectRisks(project.id);
                    if (risks) {
                        await client.chat.postMessage({
                            channel: event.channel,
                            thread_ts: event.ts,
                            blocks: buildRiskReport(project, risks),
                            text: `Risk level: ${risks.overallRisk}`,
                        });
                        return;
                    }
                }
                catch (riskErr) {
                    console.error("app_mention risk analysis error:", riskErr);
                }
            }
            const taskContext = {
                projectName: project.name,
                projectDescription: project.description ?? undefined,
                projectType: project.type ?? undefined,
                existingTasks: (project.tasks ?? [])
                    .filter((t) => t.status !== "DONE")
                    .map((t) => ({ id: t.id, title: t.title, description: t.description })),
            };
            const parsed = await parseTaskFromMessage(text, today, taskContext);
            if (!parsed || !parsed.title) {
                await client.chat.postMessage({
                    channel: event.channel,
                    thread_ts: event.ts,
                    text: "❌ Couldn't parse a task from that. Try `/pm task` to create one manually.",
                });
                return;
            }
            // Prefer channel members (full roster) over project-only members
            const channelMembers = await getChannelMembers(client, event.channel);
            const memberPool = channelMembers.length > 0
                ? channelMembers
                : (project.members ?? []).map((pm) => pm.member);
            const suggestedAssigneeSlackIds = extractSuggestedAssignees(event.text, // use original text (includes @mentions before stripping)
            memberPool);
            const cacheKey = storeAiTask({
                title: parsed.title,
                description: parsed.description,
                priority: parsed.priority,
                dueDate: parsed.dueDate,
                parentTaskId: parsed.parentTaskId,
                suggestedAssigneeSlackIds,
                channelId: event.channel,
            });
            await client.chat.postMessage({
                channel: event.channel,
                thread_ts: event.ts,
                blocks: buildAiTaskSuggestion(parsed, event.channel, cacheKey, suggestedAssigneeSlackIds),
                text: `Suggested task: ${parsed.title}`,
            });
        }
        catch (error) {
            console.error("app_mention event error:", error);
        }
    });
    // ── Message: Auto-detect TODO/ACTION ─────────────────────
    app.message(async ({ message, say }) => {
        try {
            // Only handle regular user messages with text
            if (message.subtype)
                return;
            if (!("text" in message) || !message.text)
                return;
            const text = message.text.trim();
            // Check for TODO: or ACTION: prefix
            if (/^(TODO|ACTION):/i.test(text)) {
                // Check if this channel is linked to a project
                const project = await getProjectByChannel(message.channel);
                if (!project)
                    return; // Not a project channel, ignore
                const threadTs = "ts" in message ? message.ts : undefined;
                await say({
                    ...(threadTs ? { thread_ts: threadTs } : {}),
                    blocks: buildTodoPrompt(text),
                    text: "Would you like to turn this into a task?",
                });
            }
        }
        catch (error) {
            console.error("Message event error:", error);
        }
    });
    // ── Reaction Added: clipboard → create task, ✅ → mark done ──
    app.event("reaction_added", async ({ event, client }) => {
        try {
            if (event.item.type !== "message")
                return;
            const { channel, ts } = event.item;
            if (event.reaction === "clipboard") {
                // Fetch the original message text
                const result = await client.conversations.history({
                    channel,
                    oldest: ts,
                    inclusive: true,
                    limit: 1,
                });
                const msgText = result.messages?.[0]?.text ?? "";
                if (!msgText)
                    return;
                // Only act if this channel is linked to a project
                const project = await getProjectByChannel(channel);
                if (!project)
                    return;
                // Try AI parsing first; fall back to plain prompt if it fails
                const today = new Date().toISOString().split("T")[0];
                const taskContext = {
                    projectName: project.name,
                    projectDescription: project.description ?? undefined,
                    projectType: project.type ?? undefined,
                    existingTasks: (project.tasks ?? [])
                        .filter((t) => t.status !== "DONE")
                        .map((t) => ({ id: t.id, title: t.title, description: t.description })),
                };
                const parsed = await parseTaskFromMessage(msgText, today, taskContext);
                if (parsed?.title) {
                    const channelMembers = await getChannelMembers(client, channel);
                    const memberPool = channelMembers.length > 0
                        ? channelMembers
                        : (project.members ?? []).map((pm) => pm.member);
                    const suggestedAssigneeSlackIds = extractSuggestedAssignees(msgText, memberPool);
                    const cacheKey = storeAiTask({
                        title: parsed.title,
                        description: parsed.description,
                        priority: parsed.priority,
                        dueDate: parsed.dueDate,
                        parentTaskId: parsed.parentTaskId,
                        suggestedAssigneeSlackIds,
                        channelId: channel,
                    });
                    await client.chat.postEphemeral({
                        channel,
                        user: event.user,
                        blocks: buildAiTaskSuggestion(parsed, channel, cacheKey, suggestedAssigneeSlackIds),
                        text: `Suggested task: ${parsed.title}`,
                    });
                }
                else {
                    await client.chat.postEphemeral({
                        channel,
                        user: event.user,
                        blocks: buildTodoPrompt(msgText),
                        text: "Create a task from this message?",
                    });
                }
            }
            else if (event.reaction === "white_check_mark") {
                // Look up task by its announcement message timestamp
                const task = await prisma.task.findFirst({
                    where: { slackMsgTs: ts, status: { not: "DONE" } },
                });
                if (!task)
                    return;
                await client.chat.postEphemeral({
                    channel,
                    user: event.user,
                    blocks: buildMarkDoneFromReactionCard(task),
                    text: `Mark "${task.title}" as done?`,
                });
            }
        }
        catch (error) {
            console.error("reaction_added event error:", error);
        }
    });
    // ── Channel Created: proj-* naming convention ────────────
    app.event("channel_created", async ({ event, client }) => {
        try {
            const channel = event.channel;
            const channelName = channel.name;
            // Check if the channel matches proj-* naming
            if (channelName.startsWith("proj-")) {
                await client.chat.postMessage({
                    channel: channel.id,
                    text: `👋 This channel matches the project naming convention (\`proj-*\`).`,
                    blocks: [
                        {
                            type: "section",
                            text: {
                                type: "mrkdwn",
                                text: `👋 Welcome to *#${channelName}*!\n\nThis channel matches the project naming convention (\`proj-*\`). Would you like to link it to a project?\n\nVisit the dashboard to link this channel to a new or existing project, or use \`/pm help\` to get started.`,
                            },
                        },
                    ],
                });
            }
        }
        catch (error) {
            console.error("channel_created event error:", error);
        }
    });
    // ── Member Joined Channel: Auto-add to linked projects + admin grant ───
    app.event("member_joined_channel", async ({ event, client }) => {
        try {
            const { user: slackUserId, channel: channelId } = event;
            // Grant admin if this is the leadership channel
            const leadershipId = await getLeadershipChannelId(client);
            if (leadershipId && channelId === leadershipId) {
                const member = await resolveSlackMember(slackUserId, client);
                await prisma.member.update({
                    where: { id: member.id },
                    data: { isAdmin: true },
                });
                console.log(`🔑 [admin] GRANTED: ${member.displayName} (${slackUserId}) joined #leadership`);
                return;
            }
            // Find all projects linked to this channel via notification targets
            const projects = await getProjectsForChannel(channelId);
            if (projects.length === 0)
                return;
            const member = await resolveSlackMember(slackUserId, client);
            // Don't auto-add bots as project members (assignee picker would show them).
            if (member.isBot)
                return;
            await Promise.all(projects.map((p) => addMemberToProject(p.id, member.id)));
            const projectNames = projects.map((p) => `*${p.name}*`).join(", ");
            await client.chat.postMessage({
                channel: channelId,
                text: `👤 <@${slackUserId}> has been auto-added to project${projects.length > 1 ? "s" : ""} ${projectNames} as a Contributor.`,
            });
        }
        catch (error) {
            console.error("member_joined_channel event error:", error);
        }
    });
    // ── Member Left Channel: Revoke admin if leaving leadership ─────────
    app.event("member_left_channel", async ({ event, client }) => {
        try {
            const { user: slackUserId, channel: channelId } = event;
            const leadershipId = await getLeadershipChannelId(client);
            if (!leadershipId || channelId !== leadershipId)
                return;
            const member = await prisma.member.findUnique({
                where: { slackId: slackUserId },
                select: { id: true, displayName: true, isAdmin: true },
            });
            if (!member?.isAdmin)
                return; // already not admin, nothing to do
            await prisma.member.update({
                where: { id: member.id },
                data: { isAdmin: false },
            });
            console.log(`🔒 [admin] REVOKED: ${member.displayName} (${slackUserId}) left #leadership`);
        }
        catch (error) {
            console.error("member_left_channel event error:", error);
        }
    });
    // ── File Shared: Offer image → task analysis ──────────────
    app.event("file_shared", async ({ event, client }) => {
        try {
            const fileInfo = await client.files.info({ file: event.file_id });
            const file = fileInfo.file;
            if (!file || !file.mimetype?.startsWith("image/"))
                return;
            const channelId = file.channels?.[0] ?? event.channel_id;
            if (!channelId)
                return;
            const project = await getProjectByChannel(channelId);
            if (!project)
                return;
            await client.chat.postEphemeral({
                channel: channelId,
                user: event.user_id,
                text: "🖼️ Looks like you shared an image! Want me to analyze it and suggest a task?",
                blocks: [
                    {
                        type: "section",
                        text: { type: "mrkdwn", text: "🖼️ I can analyze this image and suggest a task (e.g., for a bug screenshot). Want me to?" },
                    },
                    {
                        type: "actions",
                        elements: [
                            {
                                type: "button",
                                text: { type: "plain_text", text: "🤖 Analyze & Create Task" },
                                action_id: "open_image_task_modal",
                                value: JSON.stringify({ channelId, fileUrl: file.url_private, fileType: file.mimetype }),
                                style: "primary",
                            },
                            { type: "button", text: { type: "plain_text", text: "Dismiss" }, action_id: "dismiss_todo_prompt", value: "dismiss" },
                        ],
                    },
                ],
            });
        }
        catch (err) {
            console.error("file_shared error:", err);
        }
    });
}
//# sourceMappingURL=events.js.map