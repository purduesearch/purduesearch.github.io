import cron from "node-cron";
import { sendAllDueDateReminders, postAllProjectHealthSummaries, postAllWeekAheadSummaries, sendStandupPrompts, sendMilestoneAlerts, sendCombinedMondayDigest, } from "../services/notificationService.js";
import { syncAdminStatus } from "../services/memberService.js";
import { prisma } from "../db/prisma.js";
import { queueDm } from "../services/dmBatcher.js";
// ── Helper: notify admin project members via DM batcher ───────
async function notifyProjectAdmins(projectId, eventTypeKey, messageText) {
    // Check if this event type is enabled for this project.
    // Empty eventTypes array = all enabled (backward compatible).
    const target = await prisma.projectNotificationTarget.findFirst({
        where: { projectId },
    });
    if (target &&
        target.eventTypes.length > 0 &&
        !target.eventTypes.includes(eventTypeKey)) {
        return;
    }
    // Find all admin members of the project
    const adminMembers = await prisma.projectMember.findMany({
        where: { projectId, member: { isAdmin: true } },
        include: { member: { select: { slackId: true, displayName: true } } },
    });
    for (const pm of adminMembers) {
        if (pm.member.slackId) {
            queueDm(pm.member.slackId, messageText);
        }
    }
}
// ── Scheduler ────────────────────────────────────────────────
export function startScheduler(app) {
    // ── Monday 9:00 AM — Combined weekly digest + standup prompt DMs ──
    // Merges the personal task digest with the standup prompt into one message.
    cron.schedule("0 9 * * 1", async () => {
        console.log("📬 Running Monday combined digest + standup prompt...");
        try {
            await sendCombinedMondayDigest(app);
            console.log("✅ Monday combined digest sent");
        }
        catch (error) {
            console.error("❌ Monday digest error:", error);
        }
    });
    // ── Tue–Fri 9:15 AM — Standup prompts only (not Monday, covered above) ──
    cron.schedule("15 9 * * 2-5", async () => {
        console.log("📋 Sending standup prompts...");
        try {
            await sendStandupPrompts(app);
            console.log("✅ Standup prompts sent");
        }
        catch (error) {
            console.error("❌ Standup prompt error:", error);
        }
    });
    // ── Sunday 6:00 PM — Combined project health + week-ahead summaries ──
    // Merged from Friday 4PM (health) + Sunday 6PM (week-ahead) into one Sunday send.
    cron.schedule("0 18 * * 0", async () => {
        console.log("📊📅 Running Sunday combined health + week-ahead summaries...");
        try {
            await postAllProjectHealthSummaries(app);
            await postAllWeekAheadSummaries(app);
            console.log("✅ Combined health + week-ahead summaries posted");
        }
        catch (error) {
            console.error("❌ Combined health/week-ahead error:", error);
        }
    });
    // ── Daily 8:00 AM — Due today / overdue reminders (to individual members) ──
    cron.schedule("0 8 * * *", async () => {
        console.log("⏰ Running daily due date reminders...");
        try {
            await sendAllDueDateReminders(app);
            console.log("✅ Due date reminders sent");
        }
        catch (error) {
            console.error("❌ Due date reminder error:", error);
        }
    });
    // ── Daily 8:30 AM — Escalation notices → admin DMs only ──────────
    cron.schedule("30 8 * * *", async () => {
        console.log("🚨 Running escalation checks (admin DMs)...");
        try {
            const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000);
            const oneDayAgo = new Date(Date.now() - 86_400_000);
            const tasks = await prisma.task.findMany({
                where: {
                    status: { not: "DONE" },
                    dueDate: { lt: threeDaysAgo },
                    OR: [
                        { escalatedAt: null },
                        { escalatedAt: { lt: oneDayAgo } },
                    ],
                },
                include: { project: true },
            });
            for (const task of tasks) {
                const msg = `🚨 *Escalation:* "${task.title}" is overdue by 3+ days in *${task.project.name}*. No recent activity.`;
                await notifyProjectAdmins(task.projectId, "escalations", msg);
                await prisma.task.update({ where: { id: task.id }, data: { escalatedAt: new Date() } });
            }
            console.log(`✅ Escalation notices queued for ${tasks.length} task(s)`);
        }
        catch (error) {
            console.error("❌ Escalation error:", error);
        }
    });
    // ── Weekdays 10:00 AM — Stale task warnings → admin DMs only ─────
    cron.schedule("0 10 * * 1-5", async () => {
        console.log("⚠️ Checking for stale tasks (admin DMs)...");
        try {
            const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000);
            const staleTasks = await prisma.task.findMany({
                where: {
                    status: { not: "DONE" },
                    updatedAt: { lt: fiveDaysAgo },
                },
                include: { project: true },
            });
            // Group by project
            const byProject = new Map();
            for (const task of staleTasks) {
                const bucket = byProject.get(task.projectId) ?? [];
                bucket.push(task);
                byProject.set(task.projectId, bucket);
            }
            for (const [projectId, tasks] of byProject) {
                const project = tasks[0].project;
                const list = tasks.slice(0, 5).map(t => `• ${t.title}`).join("\n");
                const extra = tasks.length > 5 ? `\n_…and ${tasks.length - 5} more_` : "";
                const msg = `⚠️ *${tasks.length} stale task${tasks.length > 1 ? "s" : ""} in ${project.name}* (no updates in 5+ days):\n${list}${extra}`;
                await notifyProjectAdmins(projectId, "stale_tasks", msg);
            }
            console.log(`✅ Stale task warnings queued for ${byProject.size} project(s)`);
        }
        catch (error) {
            console.error("❌ Stale task warning error:", error);
        }
    });
    // ── Daily 8:45 AM — Milestone health sweep → admin DMs ───────────
    cron.schedule("45 8 * * *", async () => {
        console.log("🎯 Running milestone health sweep (admin DMs)...");
        try {
            const { refreshAllMilestoneHealth } = await import("../services/milestoneService.js");
            const changed = await refreshAllMilestoneHealth();
            for (const m of changed) {
                let msg;
                if (m.status === "COMPLETED") {
                    msg = `🎉 Milestone *${m.title}* has been completed!`;
                }
                else if (m.status === "AT_RISK" || m.status === "BEHIND") {
                    const icon = m.status === "BEHIND" ? "🚨" : "⚠️";
                    msg = `${icon} Milestone *${m.title}* is ${m.status.toLowerCase().replace("_", " ")}.`;
                }
                else {
                    continue;
                }
                await notifyProjectAdmins(m.projectId, "milestone_alerts", msg);
            }
            // Also send Slack channel celebration for completions (existing behavior)
            if (changed.length > 0) {
                await sendMilestoneAlerts(app, changed);
            }
            console.log(`✅ Milestone health: ${changed.length} status change(s)`);
        }
        catch (error) {
            console.error("❌ Milestone health error:", error);
        }
    });
    // ── Friday 3:45 PM — AI risk report → admin DMs ──────────────────
    cron.schedule("45 15 * * 5", async () => {
        console.log("🤖 Running AI risk analysis (admin DMs)...");
        try {
            const { analyzeProjectRisks } = await import("../services/projectAnalysisService.js");
            const projects = await prisma.project.findMany({
                where: { status: "ACTIVE" },
                select: { id: true, name: true },
            });
            for (const project of projects) {
                const risks = await analyzeProjectRisks(project.id);
                if (!risks || risks.overallRisk === "LOW")
                    continue;
                const msg = `🤖 *AI Risk Report — ${project.name}*\nRisk level: *${risks.overallRisk}*\n${risks.summary ?? ""}`;
                await notifyProjectAdmins(project.id, "ai_risk", msg);
            }
        }
        catch (err) {
            console.error("AI risk report error:", err);
        }
    });
    // ── Wednesday 10:30 AM — AI capacity check → admin DMs ───────────
    cron.schedule("30 10 * * 3", async () => {
        console.log("📊 Running capacity analysis (admin DMs)...");
        try {
            const { analyzeTeamCapacity } = await import("../services/projectAnalysisService.js");
            const projects = await prisma.project.findMany({
                where: { status: "ACTIVE" },
                select: { id: true, name: true },
            });
            for (const project of projects) {
                const cap = await analyzeTeamCapacity(project.id);
                if (!cap || cap.balanceScore > 75)
                    continue;
                const msg = `⚖️ *Capacity Check — ${project.name}*\n${cap.summary ?? "Balance score below threshold."}`;
                await notifyProjectAdmins(project.id, "ai_capacity", msg);
            }
        }
        catch (err) {
            console.error("Capacity analysis error:", err);
        }
    });
    // ── Sunday 8:00 PM — AI dependency inference → admin DMs ─────────
    cron.schedule("0 20 * * 0", async () => {
        console.log("🔗 Inferring task dependencies (admin DMs)...");
        try {
            const { inferTaskDependencies } = await import("../services/projectAnalysisService.js");
            const projects = await prisma.project.findMany({
                where: { status: "ACTIVE" },
                select: { id: true, name: true },
            });
            for (const project of projects) {
                const result = await inferTaskDependencies(project.id);
                if (!result?.dependencies?.length)
                    continue;
                const highConf = result.dependencies.filter((d) => d.confidence >= 0.85);
                if (!highConf.length)
                    continue;
                const deps = highConf.slice(0, 5).map((d) => `• ${d.summary ?? d.taskTitle}`).join("\n");
                const msg = `🔗 *AI detected ${highConf.length} likely task dependenc${highConf.length > 1 ? "ies" : "y"} in ${project.name}*\n${deps}`;
                await notifyProjectAdmins(project.id, "ai_deps", msg);
            }
        }
        catch (err) {
            console.error("Dependency inference error:", err);
        }
    });
    // ── Tuesday 6:30 AM — Auto-generate and DM meeting template to admins ──
    cron.schedule("30 6 * * 2", async () => {
        console.log("📋 Generating Tuesday meeting template for admins...");
        try {
            const { generateWeeklyMeetingTemplate } = await import("../services/meetingNotesService.js");
            const template = await generateWeeklyMeetingTemplate();
            const admins = await prisma.member.findMany({
                where: { isAdmin: true, isBot: false },
                select: { slackId: true, displayName: true },
            });
            for (const admin of admins) {
                if (!admin.slackId)
                    continue;
                queueDm(admin.slackId, `*📋 Leadership Meeting Template — ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}*\n\n${template.agendaTemplate.slice(0, 2900)}`);
            }
            console.log(`✅ Meeting template DMed to ${admins.length} admin(s)`);
        }
        catch (error) {
            console.error("❌ Meeting template error:", error);
        }
    });
    // ── Daily 9:00 AM — DM event reminders for today's meetings to attendees ──
    cron.schedule("0 9 * * *", async () => {
        console.log("📅 Sending event reminders for today...");
        try {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date();
            endOfDay.setHours(23, 59, 59, 999);
            const events = await prisma.event.findMany({
                where: { startTime: { gte: startOfDay, lte: endOfDay } },
                include: {
                    attendees: { select: { slackId: true } },
                    organizer: { select: { slackId: true } },
                    project: { select: { name: true } },
                },
            });
            for (const ev of events) {
                const time = ev.startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                const location = ev.isVirtual ? "Virtual" : (ev.location ?? "TBD");
                const projectNote = ev.project ? ` · _${ev.project.name}_` : "";
                const msg = `📅 *Reminder:* "${ev.title}" is today at *${time}* (${location})${projectNote}`;
                const recipients = new Set();
                ev.attendees.forEach(a => a.slackId && recipients.add(a.slackId));
                if (ev.organizer?.slackId)
                    recipients.add(ev.organizer.slackId);
                for (const slackId of recipients) {
                    queueDm(slackId, msg);
                }
            }
            console.log(`✅ Event reminders sent for ${events.length} event(s) today`);
        }
        catch (error) {
            console.error("❌ Event reminder error:", error);
        }
    });
    // ── Every 6 hours — Re-sync admin status from leadership channel ──
    cron.schedule("0 */6 * * *", async () => {
        try {
            await syncAdminStatus(app);
        }
        catch (error) {
            console.error("❌ Admin sync error:", error);
        }
    });
    // ── Daily 3:00 AM — Clean up read notifications older than 90 days ─
    cron.schedule("0 3 * * *", async () => {
        try {
            const { deleteOldNotifications } = await import("../services/notificationCrud.js");
            const deleted = await deleteOldNotifications(90);
            if (deleted > 0)
                console.log(`🗑️  Cleaned up ${deleted} old notification(s)`);
        }
        catch (err) {
            console.error("❌ Notification cleanup error:", err);
        }
    });
    console.log("  📅 Scheduled: Monday 9AM         — Combined digest + standup DMs");
    console.log("  📅 Scheduled: Tue–Fri 9:15AM     — Standup prompt DMs");
    console.log("  📅 Scheduled: Sunday 6PM          — Combined health + week-ahead (channels)");
    console.log("  📅 Scheduled: Daily 8AM           — Due date reminder DMs");
    console.log("  📅 Scheduled: Daily 8:30AM        — Escalation → admin DMs");
    console.log("  📅 Scheduled: Weekdays 10AM       — Stale tasks → admin DMs");
    console.log("  📅 Scheduled: Daily 8:45AM        — Milestone health → admin DMs");
    console.log("  📅 Scheduled: Friday 3:45PM       — AI risk → admin DMs");
    console.log("  📅 Scheduled: Wednesday 10:30AM   — AI capacity → admin DMs");
    console.log("  📅 Scheduled: Sunday 8PM          — AI dependency → admin DMs");
    console.log("  📅 Scheduled: Daily 3AM           — Notification cleanup (90 days)");
    console.log("  📅 Scheduled: Tuesday 6:30AM      — Meeting template DMs → admins");
    console.log("  📅 Scheduled: Daily 9AM           — Event reminders → attendees");
}
//# sourceMappingURL=scheduler.js.map