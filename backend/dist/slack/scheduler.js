import cron from "node-cron";
import { sendAllWeeklyDigests, sendAllDueDateReminders, postAllProjectHealthSummaries, postAllWeekAheadSummaries, sendAllEscalations, sendStandupPrompts, sendAllStaleTaskWarnings, } from "../services/notificationService.js";
import { syncAdminStatus } from "../services/memberService.js";
// ── Scheduler ────────────────────────────────────────────────
export function startScheduler(app) {
    // Monday 9:00 AM — Personal task digest DMs
    // Cron: minute hour day-of-month month day-of-week
    cron.schedule("0 9 * * 1", async () => {
        console.log("📬 Running Monday weekly digest...");
        try {
            await sendAllWeeklyDigests(app);
            console.log("✅ Weekly digests sent");
        }
        catch (error) {
            console.error("❌ Weekly digest error:", error);
        }
    });
    // Friday 4:00 PM — Project health summary to channels
    cron.schedule("0 16 * * 5", async () => {
        console.log("📊 Running Friday project health summary...");
        try {
            await postAllProjectHealthSummaries(app);
            console.log("✅ Project health summaries posted");
        }
        catch (error) {
            console.error("❌ Project health summary error:", error);
        }
    });
    // Daily 8:00 AM — Due today / overdue reminders
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
    // Sunday 6:00 PM — Week ahead summary to project channels
    cron.schedule("0 18 * * 0", async () => {
        console.log("📅 Running Sunday week-ahead summary...");
        try {
            await postAllWeekAheadSummaries(app);
            console.log("✅ Week-ahead summaries posted");
        }
        catch (error) {
            console.error("❌ Week-ahead summary error:", error);
        }
    });
    // Daily 8:30 AM — Escalate tasks overdue 3+ days with no activity
    cron.schedule("30 8 * * *", async () => {
        console.log("🚨 Running escalation checks...");
        try {
            await sendAllEscalations(app);
            console.log("✅ Escalation notices sent");
        }
        catch (error) {
            console.error("❌ Escalation error:", error);
        }
    });
    // Weekdays 9:15 AM — Standup prompts (opt-in via /pm notify)
    cron.schedule("15 9 * * 1-5", async () => {
        console.log("📋 Sending standup prompts...");
        try {
            await sendStandupPrompts(app);
            console.log("✅ Standup prompts sent");
        }
        catch (error) {
            console.error("❌ Standup prompt error:", error);
        }
    });
    // Weekdays 10:00 AM — Stale task warnings to project channels
    cron.schedule("0 10 * * 1-5", async () => {
        console.log("⚠️ Checking for stale tasks...");
        try {
            await sendAllStaleTaskWarnings(app);
            console.log("✅ Stale task warnings sent");
        }
        catch (error) {
            console.error("❌ Stale task warning error:", error);
        }
    });
    // Daily 8:45 AM — Milestone health sweep + at-risk / completion alerts
    cron.schedule("45 8 * * *", async () => {
        console.log("🎯 Running milestone health sweep...");
        try {
            const { refreshAllMilestoneHealth } = await import("../services/milestoneService.js");
            const { sendMilestoneAlerts } = await import("../services/notificationService.js");
            const changed = await refreshAllMilestoneHealth();
            if (changed.length > 0) {
                await sendMilestoneAlerts(app, changed);
            }
            console.log(`✅ Milestone health: ${changed.length} status change(s)`);
        }
        catch (error) {
            console.error("❌ Milestone health error:", error);
        }
    });
    // Every 6 hours — re-sync admin status from leadership channel
    cron.schedule("0 */6 * * *", async () => {
        try {
            await syncAdminStatus(app);
        }
        catch (error) {
            console.error("❌ Admin sync error:", error);
        }
    });
    // Friday 3:45 PM — AI risk report on all active projects (before health summaries)
    cron.schedule("45 15 * * 5", async () => {
        console.log("🤖 Running AI risk analysis on all active projects…");
        try {
            const { analyzeProjectRisks } = await import("../services/projectAnalysisService.js");
            const { buildRiskReport } = await import("../utils/blockKit.js");
            const { prisma: db } = await import("../db/prisma.js");
            const projects = await db.project.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
            for (const project of projects) {
                const risks = await analyzeProjectRisks(project.id);
                if (!risks || risks.overallRisk === "LOW")
                    continue;
                const notifTarget = await db.projectNotificationTarget.findFirst({ where: { projectId: project.id } });
                if (!notifTarget)
                    continue;
                await app.client.chat.postMessage({
                    channel: notifTarget.slackChannelId,
                    blocks: buildRiskReport(project, risks),
                    text: `⚠️ ${project.name} risk level: ${risks.overallRisk}`,
                });
            }
        }
        catch (err) {
            console.error("AI risk report error:", err);
        }
    });
    // Wednesday 10:30 AM — Capacity rebalancing check (mid-sprint)
    cron.schedule("30 10 * * 3", async () => {
        console.log("📊 Running capacity analysis…");
        try {
            const { analyzeTeamCapacity } = await import("../services/projectAnalysisService.js");
            const { buildCapacityReport } = await import("../utils/blockKit.js");
            const { prisma: db } = await import("../db/prisma.js");
            const projects = await db.project.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
            for (const project of projects) {
                const cap = await analyzeTeamCapacity(project.id);
                if (!cap || cap.balanceScore > 75)
                    continue;
                const notifTarget = await db.projectNotificationTarget.findFirst({ where: { projectId: project.id } });
                if (!notifTarget)
                    continue;
                await app.client.chat.postMessage({
                    channel: notifTarget.slackChannelId,
                    text: `⚖️ *Capacity Check — ${project.name}*\n${cap.summary}`,
                    blocks: buildCapacityReport(project, cap),
                });
            }
        }
        catch (err) {
            console.error("Capacity analysis error:", err);
        }
    });
    // Sunday 8 PM — AI-powered dependency inference (before week starts)
    cron.schedule("0 20 * * 0", async () => {
        console.log("🔗 Inferring task dependencies…");
        try {
            const { inferTaskDependencies } = await import("../services/projectAnalysisService.js");
            const { buildDependencySuggestionsBlocks } = await import("../utils/blockKit.js");
            const { prisma: db } = await import("../db/prisma.js");
            const projects = await db.project.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
            for (const project of projects) {
                const result = await inferTaskDependencies(project.id);
                if (!result?.dependencies?.length)
                    continue;
                const highConf = result.dependencies.filter((d) => d.confidence >= 0.85);
                if (!highConf.length)
                    continue;
                const notifTarget = await db.projectNotificationTarget.findFirst({ where: { projectId: project.id } });
                if (!notifTarget)
                    continue;
                await app.client.chat.postMessage({
                    channel: notifTarget.slackChannelId,
                    text: `🔗 AI detected ${highConf.length} likely task dependenc${highConf.length > 1 ? "ies" : "y"} in *${project.name}*`,
                    blocks: buildDependencySuggestionsBlocks(highConf, project.id),
                });
            }
        }
        catch (err) {
            console.error("Dependency inference error:", err);
        }
    });
    console.log("  📅 Scheduled: Monday 9AM      — Weekly digest DMs");
    console.log("  📅 Scheduled: Friday 4PM      — Project health summaries");
    console.log("  📅 Scheduled: Daily 8AM       — Due date reminders");
    console.log("  📅 Scheduled: Sunday 6PM      — Week ahead summaries");
    console.log("  📅 Scheduled: Daily 8:30AM    — Escalation checks");
    console.log("  📅 Scheduled: Weekdays 9:15AM — Standup prompts");
    console.log("  📅 Scheduled: Weekdays 10AM   — Stale task warnings");
    console.log("  📅 Scheduled: Daily 8:45AM    — Milestone health sweep");
    console.log("  📅 Scheduled: Friday 3:45PM   — AI risk report");
    console.log("  📅 Scheduled: Wednesday 10:30AM — AI capacity check");
    console.log("  📅 Scheduled: Sunday 8PM      — AI dependency inference");
}
//# sourceMappingURL=scheduler.js.map