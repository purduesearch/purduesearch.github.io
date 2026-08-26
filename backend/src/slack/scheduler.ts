import cron from "node-cron";
import type { App } from "@slack/bolt";
import {
  sendAllDueDateReminders,
  postAllProjectHealthSummaries,
  postAllWeekAheadSummaries,
  sendStandupPrompts,
  sendMilestoneAlerts,
  sendCombinedMondayDigest,
} from "../services/notificationService.js";
import { syncAdminStatus } from "../services/memberService.js";
import { prisma } from "../db/prisma.js";
import { queueDm } from "../services/dmBatcher.js";
import { createNotification } from "../services/notificationCrud.js";
import { sweepVaultTmpDir } from "../api/vault.js";
import { remindNonResponders } from "../api/meetingPolls.js";
import * as pollService from "../services/pollService.js";
import { EXCLUDE_TRAINING } from "../services/trainingSandboxService.js";

// ── Helper: notify admin project members via DM batcher ───────

async function notifyProjectAdmins(
  projectId: string,
  eventTypeKey: string,
  messageText: string
): Promise<void> {
  // Check if this event type is enabled for this project.
  // Empty eventTypes array = all enabled (backward compatible).
  const target = await prisma.projectNotificationTarget.findFirst({
    where: { projectId },
  });
  if (
    target &&
    target.eventTypes.length > 0 &&
    !target.eventTypes.includes(eventTypeKey)
  ) {
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

export function startScheduler(app: App): void {

  // ── Monday 9:00 AM — Combined weekly digest + standup prompt DMs ──
  // Merges the personal task digest with the standup prompt into one message.
  cron.schedule("0 9 * * 1", async () => {
    console.log("📬 Running Monday combined digest + standup prompt...");
    try {
      await sendCombinedMondayDigest(app);
      console.log("✅ Monday combined digest sent");
    } catch (error) {
      console.error("❌ Monday digest error:", error);
    }
  });

  // ── Tue–Fri 9:15 AM — Standup prompts only (not Monday, covered above) ──
  cron.schedule("15 9 * * 2-5", async () => {
    console.log("📋 Sending standup prompts...");
    try {
      await sendStandupPrompts(app);
      console.log("✅ Standup prompts sent");
    } catch (error) {
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
    } catch (error) {
      console.error("❌ Combined health/week-ahead error:", error);
    }
  });

  // ── Daily 8:00 AM — Due today / overdue reminders (to individual members) ──
  cron.schedule("0 8 * * *", async () => {
    console.log("⏰ Running daily due date reminders...");
    try {
      await sendAllDueDateReminders(app);
      console.log("✅ Due date reminders sent");
    } catch (error) {
      console.error("❌ Due date reminder error:", error);
    }
  });

  // ── Daily 8:15 AM — Safety-training certificate expiry ───────────
  //
  // Nags at 30 days out, 7 days out, and once lapsed. A lapsed certificate also
  // reopens its course section so the member can upload the new one where they
  // uploaded the last one.
  cron.schedule("15 8 * * *", async () => {
    console.log("📜 Checking safety-training certificate expiry...");
    try {
      const trainingService = await import("../services/trainingService.js");
      const progressService = await import("../services/courseProgressService.js");

      const now = new Date();
      const candidates = await trainingService.findExpiringCertificates(now);
      let sent = 0;

      for (const cert of candidates) {
        if (!cert.expiresOn) continue;
        const threshold = trainingService.dueReminder(cert.expiresOn, cert.lastRemindedAt, now);
        if (!threshold) continue;

        const when = cert.expiresOn.toISOString().slice(0, 10);
        const message =
          threshold === "LAPSED"
            ? `Your ${cert.training.name} training expired on ${when}. Upload a new certificate to get back to current.`
            : `Your ${cert.training.name} training expires on ${when}. Renew it and upload the new certificate.`;

        await createNotification({
          type: "TRAINING_EXPIRING",
          recipientId: cert.memberId,
          message,
          metadata: { certificateId: cert.id, sectionId: cert.sectionId, threshold },
        });
        if (cert.member.slackId) queueDm(cert.member.slackId, message);

        // Only a lapse reopens the section — a 30-day warning must not undo
        // someone's course completion while they are still compliant.
        if (threshold === "LAPSED" && cert.sectionId) {
          await progressService.reopenSectionForMember(cert.sectionId, cert.memberId);
        }

        await prisma.trainingCertificate.update({
          where: { id: cert.id },
          data: { lastRemindedAt: now },
        });
        sent++;
      }
      console.log(`✅ Training expiry: ${sent} reminder(s) sent`);
    } catch (error) {
      console.error("❌ Training expiry check error:", error);
    }
  });

  // ── Daily 8:30 AM — Escalation notices → admin DMs only ──────────
  cron.schedule("30 8 * * *", async () => {
    console.log("🚨 Running escalation checks (admin DMs)...");
    try {
      const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000);
      const oneDayAgo    = new Date(Date.now() - 86_400_000);

      const tasks = await prisma.task.findMany({
        where: {
          status:  { not: "DONE" },
          dueDate: { lt: threeDaysAgo },
          project: { is: EXCLUDE_TRAINING },
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
    } catch (error) {
      console.error("❌ Escalation error:", error);
    }
  });

  // ── Daily 3:30 AM — Sweep orphaned vault upload temp files ──────
  cron.schedule("30 3 * * *", async () => {
    console.log("🧹 Sweeping vault upload temp dir...");
    try {
      await sweepVaultTmpDir();
    } catch (error) {
      console.error("❌ Vault tmp sweep error:", error);
    }
  });

  // ── Daily 3:45 AM — Drop training projects untouched for 30 days ──
  cron.schedule("45 3 * * *", async () => {
    try {
      const cutoff = new Date(Date.now() - 30 * 86_400_000);
      const stale = await prisma.project.findMany({
        where: { trainingForMemberId: { not: null }, updatedAt: { lt: cutoff } },
        select: { id: true },
      });
      for (const p of stale) await prisma.project.delete({ where: { id: p.id } });
      if (stale.length) console.log(`🧹 Removed ${stale.length} stale training projects`);
    } catch (error) {
      console.error("❌ Training project sweep error:", error);
    }
  });

  // ── Daily 3:00 AM — Auto-archive nudges → admin + creator DMs ────
  cron.schedule("0 3 * * *", async () => {
    console.log("🗄️ Running auto-archive nudge sweep...");
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

      const tasks = await prisma.task.findMany({
        where: {
          status:          "DONE",
          archivedAt:      null,
          archiveNudgedAt: null,
          project: { is: EXCLUDE_TRAINING },
          OR: [
            { rewardGrantedAt: { lte: sevenDaysAgo } },
            { rewardGrantedAt: null, updatedAt: { lte: sevenDaysAgo } },
          ],
        },
        include: { project: true, createdBy: true },
      });

      // Group by project
      const byProject = new Map<string, typeof tasks>();
      for (const task of tasks) {
        const bucket = byProject.get(task.projectId) ?? [];
        bucket.push(task);
        byProject.set(task.projectId, bucket);
      }

      for (const [projectId, projectTasks] of byProject) {
        const project = projectTasks[0].project;
        const list = projectTasks.slice(0, 5).map(t => `• ${t.title}`).join("\n");
        const extra = projectTasks.length > 5 ? `\n_…and ${projectTasks.length - 5} more_` : "";
        const msg = `🗄️ *${projectTasks.length} task${projectTasks.length > 1 ? "s" : ""} in ${project.name}* have been DONE for 7+ days and can be archived:\n${list}${extra}`;
        await notifyProjectAdmins(projectId, "auto_archive", msg);
      }

      for (const task of tasks) {
        if (task.createdBy?.slackId) {
          queueDm(task.createdBy.slackId, `🗄️ Your task *"${task.title}"* in *${task.project.name}* has been DONE for 7+ days. Consider archiving it.`);
        }
        if (task.createdById) {
          await createNotification({
            type:        "SYSTEM",
            recipientId: task.createdById,
            projectId:   task.projectId,
            taskId:      task.id,
            message:     `Task "${task.title}" has been DONE for 7+ days. Consider archiving it.`,
          });
        }
      }

      await prisma.task.updateMany({
        where: { id: { in: tasks.map(t => t.id) } },
        data:  { archiveNudgedAt: new Date() },
      });

      console.log(`✅ Auto-archive nudges queued for ${tasks.length} task(s) across ${byProject.size} project(s)`);
    } catch (error) {
      console.error("❌ Auto-archive nudge error:", error);
    }
  });

  // ── Weekdays 10:00 AM — Stale task warnings → admin DMs only ─────
  cron.schedule("0 10 * * 1-5", async () => {
    console.log("⚠️ Checking for stale tasks (admin DMs)...");
    try {
      const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000);

      const staleTasks = await prisma.task.findMany({
        where: {
          status:    { not: "DONE" },
          updatedAt: { lt: fiveDaysAgo },
          project: { is: EXCLUDE_TRAINING },
        },
        include: { project: true },
      });

      // Group by project
      const byProject = new Map<string, typeof staleTasks>();
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
    } catch (error) {
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
        let msg: string;
        if (m.status === "COMPLETED") {
          msg = `🎉 Milestone *${m.title}* has been completed!`;
        } else if (m.status === "AT_RISK" || m.status === "BEHIND") {
          const icon = m.status === "BEHIND" ? "🚨" : "⚠️";
          msg = `${icon} Milestone *${m.title}* is ${m.status.toLowerCase().replace("_", " ")}.`;
        } else {
          continue;
        }
        await notifyProjectAdmins(m.projectId, "milestone_alerts", msg);
      }

      // Also send Slack channel celebration for completions (existing behavior)
      if (changed.length > 0) {
        await sendMilestoneAlerts(app, changed);
      }
      console.log(`✅ Milestone health: ${changed.length} status change(s)`);
    } catch (error) {
      console.error("❌ Milestone health error:", error);
    }
  });

  // ── Friday 3:45 PM — AI risk report → admin DMs ──────────────────
  cron.schedule("45 15 * * 5", async () => {
    console.log("🤖 Running AI risk analysis (admin DMs)...");
    try {
      const { analyzeProjectRisks } = await import("../services/projectAnalysisService.js");
      const projects = await prisma.project.findMany({
        where:  { status: "ACTIVE", ...EXCLUDE_TRAINING },
        select: { id: true, name: true },
      });

      for (const project of projects) {
        const risks = await analyzeProjectRisks(project.id) as any;
        if (!risks || risks.overallRisk === "LOW") continue;

        const msg = `🤖 *AI Risk Report — ${project.name}*\nRisk level: *${risks.overallRisk}*\n${risks.summary ?? ""}`;
        await notifyProjectAdmins(project.id, "ai_risk", msg);
      }
    } catch (err) {
      console.error("AI risk report error:", err);
    }
  });

  // ── Wednesday 10:30 AM — AI capacity check → admin DMs ───────────
  cron.schedule("30 10 * * 3", async () => {
    console.log("📊 Running capacity analysis (admin DMs)...");
    try {
      const { analyzeTeamCapacity } = await import("../services/projectAnalysisService.js");
      const projects = await prisma.project.findMany({
        where:  { status: "ACTIVE", ...EXCLUDE_TRAINING },
        select: { id: true, name: true },
      });

      for (const project of projects) {
        const cap = await analyzeTeamCapacity(project.id) as any;
        if (!cap || cap.balanceScore > 75) continue;

        const msg = `⚖️ *Capacity Check — ${project.name}*\n${cap.summary ?? "Balance score below threshold."}`;
        await notifyProjectAdmins(project.id, "ai_capacity", msg);
      }
    } catch (err) {
      console.error("Capacity analysis error:", err);
    }
  });

  // ── Sunday 8:00 PM — AI dependency inference → admin DMs ─────────
  cron.schedule("0 20 * * 0", async () => {
    console.log("🔗 Inferring task dependencies (admin DMs)...");
    try {
      const { inferTaskDependencies } = await import("../services/projectAnalysisService.js");
      const projects = await prisma.project.findMany({
        where:  { status: "ACTIVE", ...EXCLUDE_TRAINING },
        select: { id: true, name: true },
      });

      for (const project of projects) {
        const result = await inferTaskDependencies(project.id) as any;
        if (!result?.dependencies?.length) continue;
        const highConf = result.dependencies.filter((d: any) => d.confidence >= 0.85);
        if (!highConf.length) continue;

        const deps = highConf.slice(0, 5).map((d: any) => `• ${d.summary ?? d.taskTitle}`).join("\n");
        const msg = `🔗 *AI detected ${highConf.length} likely task dependenc${highConf.length > 1 ? "ies" : "y"} in ${project.name}*\n${deps}`;
        await notifyProjectAdmins(project.id, "ai_deps", msg);
      }
    } catch (err) {
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
        if (!admin.slackId) continue;
        queueDm(admin.slackId, `*📋 Leadership Meeting Template — ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}*\n\n${template.agendaTemplate.slice(0, 2900)}`);
      }
      console.log(`✅ Meeting template DMed to ${admins.length} admin(s)`);
    } catch (error) {
      console.error("❌ Meeting template error:", error);
    }
  });

  // ── Daily 9:00 AM — DM event reminders for today's meetings to attendees ──
  cron.schedule("0 9 * * *", async () => {
    console.log("📅 Sending event reminders for today...");
    try {
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const endOfDay   = new Date(); endOfDay.setHours(23, 59, 59, 999);

      const events = await prisma.event.findMany({
        where: { startTime: { gte: startOfDay, lte: endOfDay } },
        include: {
          attendees: { select: { slackId: true } },
          organizer: { select: { slackId: true } },
          project:   { select: { name: true } },
        },
      });

      for (const ev of events) {
        const time = ev.startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        const location = ev.isVirtual ? "Virtual" : (ev.location ?? "TBD");
        const projectNote = ev.project ? ` · _${ev.project.name}_` : "";
        const msg = `📅 *Reminder:* "${ev.title}" is today at *${time}* (${location})${projectNote}`;

        const recipients = new Set<string>();
        ev.attendees.forEach(a => a.slackId && recipients.add(a.slackId));
        if (ev.organizer?.slackId) recipients.add(ev.organizer.slackId);

        for (const slackId of recipients) {
          queueDm(slackId, msg);
        }
      }
      console.log(`✅ Event reminders sent for ${events.length} event(s) today`);
    } catch (error) {
      console.error("❌ Event reminder error:", error);
    }
  });

  // ── Thursday 11:00 AM — Member Spotlight auto-draft suggestion ──
  cron.schedule("0 11 * * 4", async () => {
    console.log("🌟 Generating member spotlight draft suggestion...");
    try {
      const { generateMemberSpotlight } = await import("../services/aiOutreachService.js");

      // Pick a member who hasn't been spotlighted recently (no SOCIAL_POST in last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
      const recentlySpotlighted = await prisma.outreachSubmission.findMany({
        where: {
          type:      "SOCIAL_POST",
          status:    { not: "DRAFT" },
          createdAt: { gte: thirtyDaysAgo },
          title:     { contains: "Spotlight", mode: "insensitive" },
        },
        select: { authorId: true },
      });
      const recentIds = new Set(recentlySpotlighted.map(s => s.authorId));

      const candidate = await prisma.member.findFirst({
        where: {
          isBot:   false,
          id:      { notIn: [...recentIds] },
          slackId: { not: undefined },
        },
        orderBy: { createdAt: "asc" }, // oldest member first (fair rotation)
        select: { id: true, displayName: true, title: true, bio: true, slackId: true },
      });
      if (!candidate) return;

      const milestones = await prisma.milestone.findMany({
        where:   { status: "COMPLETED", project: { members: { some: { memberId: candidate.id } } } },
        orderBy: { completedAt: "desc" },
        take:    3,
        select:  { title: true },
      });

      const draft = await generateMemberSpotlight(
        candidate.displayName,
        candidate.title ?? undefined,
        candidate.bio   ?? undefined,
        milestones.map(m => m.title)
      );

      // Find first admin to own the draft
      const admin = await prisma.member.findFirst({
        where: { isAdmin: true, isBot: false },
        select: { id: true, slackId: true },
      });
      if (!admin) return;

      await prisma.outreachSubmission.create({
        data: {
          title:    `Member Spotlight — ${candidate.displayName}`,
          content:  draft,
          type:     "SOCIAL_POST",
          status:   "DRAFT",
          platform: ["instagram", "linkedin"],
          authorId: admin.id,
        },
      });

      if (admin.slackId) {
        queueDm(
          admin.slackId,
          `🌟 Auto-created a *Member Spotlight* draft for *${candidate.displayName}*. Review it in Outreach Hub → Board.`
        );
      }
      console.log(`✅ Member spotlight draft created for ${candidate.displayName}`);
    } catch (err) {
      console.error("❌ Member spotlight error:", err);
    }
  });

  // ── Monday 10:00 AM — Outreach Weekly Slack post (AI narrative) ──
  cron.schedule("0 10 * * 1", async () => {
    const channelId = process.env.OUTREACH_CHANNEL_ID;
    if (!channelId) return; // Skip if no outreach channel configured

    console.log("📊 Generating Outreach Weekly Slack digest...");
    try {
      const oneWeekAgo = new Date(Date.now() - 7 * 86_400_000);

      const [published, metrics, contacts, upcoming] = await Promise.all([
        prisma.outreachSubmission.findMany({
          where: { status: "PUBLISHED", publishedAt: { gte: oneWeekAgo } },
          select: { title: true, type: true, platform: true },
        }),
        prisma.postMetric.findMany({
          where: { recordedAt: { gte: oneWeekAgo } },
          select: { platform: true, impressions: true, likes: true, comments: true, shares: true },
        }),
        prisma.outreachContact.groupBy({ by: ["stage"], _count: { id: true } }),
        prisma.outreachSubmission.findMany({
          where: {
            status:      { in: ["APPROVED", "IN_REVIEW", "SUBMITTED"] },
            scheduledAt: { gte: new Date(), lte: new Date(Date.now() + 7 * 86_400_000) },
          },
          select: { title: true, scheduledAt: true, platform: true },
          orderBy: { scheduledAt: "asc" },
          take: 5,
        }),
      ]);

      const { generateWeeklyDigest } = await import("../services/aiOutreachService.js");

      const funnel = contacts.reduce<Record<string, number>>(
        (acc, g) => ({ ...acc, [g.stage]: g._count.id }),
        {}
      );

      const narrative = await generateWeeklyDigest(
        published.map(s => ({ title: s.title, type: s.type, platforms: s.platform })),
        metrics.map(m => ({
          platform:    m.platform,
          impressions: m.impressions ?? 0,
          likes:       m.likes       ?? 0,
          comments:    m.comments    ?? 0,
          shares:      m.shares      ?? 0,
        })),
        funnel
      );

      const upcomingBlock = upcoming.length > 0
        ? `\n\n*📅 This week's planned posts:*\n${upcoming.map(s => {
            const date = s.scheduledAt ? new Date(s.scheduledAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "TBD";
            return `• "${s.title}" — ${date} (${s.platform.join(", ")})`;
          }).join("\n")}`
        : "";

      const message = `*📣 Outreach Weekly — ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}*\n\n${narrative}${upcomingBlock}`;

      await app.client.chat.postMessage({
        channel: channelId,
        text:    message,
      });

      console.log("✅ Outreach Weekly Slack digest posted");
    } catch (err) {
      console.error("❌ Outreach Weekly digest error:", err);
    }
  });

  // ── Daily 9:05 AM — CRM follow-up reminders → contact owners ────
  cron.schedule("5 9 * * *", async () => {
    console.log("📇 Sending CRM follow-up reminders...");
    try {
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);

      const contacts = await prisma.outreachContact.findMany({
        where: {
          nextFollowUpAt: { lte: endOfToday },
          owner: { isNot: null },
        },
        include: {
          owner: { select: { slackId: true, displayName: true } },
        },
      });

      // Group by owner slackId
      const byOwner = new Map<string, typeof contacts>();
      for (const c of contacts) {
        const sid = c.owner?.slackId;
        if (!sid) continue;
        const bucket = byOwner.get(sid) ?? [];
        bucket.push(c);
        byOwner.set(sid, bucket);
      }

      for (const [slackId, ownerContacts] of byOwner) {
        const lines = ownerContacts.slice(0, 8).map(c => {
          const due = c.nextFollowUpAt!;
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const isOverdue = due < today;
          const label = isOverdue ? "overdue" : "today";
          const org = c.organization ? ` (${c.organization})` : "";
          return `• *${c.name}*${org} — follow-up ${label}`;
        });
        const extra = ownerContacts.length > 8 ? `\n_…and ${ownerContacts.length - 8} more_` : "";
        const msg = `📇 *CRM Follow-up Reminders* — you have ${ownerContacts.length} contact${ownerContacts.length > 1 ? "s" : ""} to follow up with:\n${lines.join("\n")}${extra}\n\n_Open the Outreach Hub → CRM tab to log interactions._`;
        queueDm(slackId, msg);
      }
      console.log(`✅ CRM follow-up reminders sent to ${byOwner.size} member(s) for ${contacts.length} contact(s)`);
    } catch (err) {
      console.error("❌ CRM follow-up reminder error:", err);
    }
  });

  // ── Every 6 hours — Re-sync admin status from leadership channel ──
  cron.schedule("0 */6 * * *", async () => {
    try {
      await syncAdminStatus(app);
    } catch (error) {
      console.error("❌ Admin sync error:", error);
    }
  });

  // ── Daily 3:00 AM — Clean up read notifications older than 90 days ─
  cron.schedule("0 3 * * *", async () => {
    try {
      const { deleteOldNotifications } = await import("../services/notificationCrud.js");
      const deleted = await deleteOldNotifications(90);
      if (deleted > 0) console.log(`🗑️  Cleaned up ${deleted} old notification(s)`);
    } catch (err) {
      console.error("❌ Notification cleanup error:", err);
    }
  });

  // ── Every hour — Auto-publish APPROVED submissions past scheduledAt ──
  cron.schedule("0 * * * *", async () => {
    try {
      const now = new Date();
      const due = await prisma.outreachSubmission.findMany({
        where: {
          status:      "APPROVED",
          scheduledAt: { lte: now },
        },
        include: {
          author: { select: { slackId: true, displayName: true } },
        },
      });
      if (due.length === 0) return;

      await prisma.outreachSubmission.updateMany({
        where: { id: { in: due.map(s => s.id) } },
        data:  { status: "PUBLISHED" },
      });

      const { handleBlogPostPublished } = await import("../services/rewardService.js");
      for (const submission of due) {
        if (submission.author?.slackId) {
          queueDm(
            submission.author.slackId,
            `✅ Your post *"${submission.title}"* has been auto-published. Time to cross-post!`
          );
        }
        // Engagement: BLOG_POST_PUBLISHED reward fires for every published submission's author
        if (submission.authorId) {
          handleBlogPostPublished(submission.authorId, submission.id).catch(err =>
            console.error("[reward] handleBlogPostPublished:", err));
          // Challenge hook
          import("../services/challengeService.js").then(({ recordEvent }) =>
            recordEvent(submission.authorId!, "BLOG_PUBLISHED", 1)
          ).catch(err => console.error("[challenge] BLOG_PUBLISHED:", err));
        }
      }
      console.log(`✅ Auto-published ${due.length} submission(s)`);
    } catch (err) {
      console.error("❌ Auto-publish error:", err);
    }
  });

  // ── Every hour — Instantiate due RecurringTemplate(s) into DRAFTs ──
  cron.schedule("5 * * * *", async () => {
    try {
      const { CronExpressionParser } = await import("cron-parser");
      const now = new Date();
      const due = await prisma.recurringTemplate.findMany({
        where: {
          active: true,
          nextRunAt: { lte: now },
        },
        include: {
          templateSubmission: true,
          owner: { select: { slackId: true } },
        },
      });
      if (due.length === 0) return;

      function substitute(text: string, vals: Record<string, string>): string {
        return text.replace(/\{\{(\w+)\}\}/g, (_m, k) => vals[k] ?? `{{${k}}}`);
      }

      for (const rec of due) {
        const tmpl = rec.templateSubmission;
        if (!tmpl.isTemplate) continue;
        const vals = (rec.defaultValues as Record<string, string> | null) ?? {};
        try {
          await prisma.outreachSubmission.create({
            data: {
              title:     substitute(tmpl.title, vals),
              content:   tmpl.content ? substitute(tmpl.content, vals) : null,
              type:      tmpl.type,
              status:    "DRAFT",
              platform:  tmpl.platform,
              mediaUrls: tmpl.mediaUrls,
              authorId:  rec.ownerId,
              campaignId: tmpl.campaignId,
              projectId:  tmpl.projectId,
              isTemplate: false,
            },
          });

          // Recompute nextRunAt from cron expression
          let nextRunAt: Date;
          try {
            nextRunAt = CronExpressionParser.parse(rec.cronExpression).next().toDate();
          } catch {
            // Bad cron — deactivate to prevent infinite errors
            await prisma.recurringTemplate.update({
              where: { id: rec.id },
              data:  { active: false, lastRunAt: now },
            });
            continue;
          }

          await prisma.recurringTemplate.update({
            where: { id: rec.id },
            data:  { lastRunAt: now, nextRunAt },
          });

          if (rec.owner?.slackId) {
            queueDm(rec.owner.slackId, `🔁 Recurring template *${tmpl.title}* spawned a new DRAFT in Outreach Hub. Review & schedule it.`);
          }
        } catch (err) {
          console.error(`❌ Recurring template ${rec.id} failed:`, err);
        }
      }
      console.log(`✅ Instantiated ${due.length} recurring template(s)`);
    } catch (err) {
      console.error("❌ Recurring template cron error:", err);
    }
  });

  // ── Hourly :20 — Meeting poll reminders to invited non-responders ──
  // Fires once per poll (reminderSentAt gate) when its response deadline is
  // within the next 24 hours.
  cron.schedule("20 * * * *", async () => {
    try {
      const now  = new Date();
      const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const polls = await prisma.meetingPoll.findMany({
        where: {
          status:           "OPEN",
          reminderSentAt:   null,
          responseDeadline: { gte: now, lte: soon },
        },
        select: { id: true },
      });
      if (polls.length === 0) return;

      let totalNudged = 0;
      for (const p of polls) {
        const poll = await pollService.getPoll(p.id);
        if (!poll) continue;
        totalNudged += await remindNonResponders(poll, null);
        await prisma.meetingPoll.update({ where: { id: p.id }, data: { reminderSentAt: now } });
      }
      console.log(`✅ Meeting poll reminders: ${totalNudged} member(s) across ${polls.length} poll(s)`);
    } catch (err) {
      console.error("❌ Meeting poll reminder cron error:", err);
    }
  });

  // ── Daily 8:10 AM — Auto-create EVENT_PROMO drafts 7/3/1 days before events ──
  cron.schedule("10 8 * * *", async () => {
    console.log("📣 Checking for upcoming events needing outreach drafts...");
    try {
      const now = new Date();
      const targetsInDays = [7, 3, 1];

      for (const days of targetsInDays) {
        const windowStart = new Date(now);
        windowStart.setDate(windowStart.getDate() + days);
        windowStart.setHours(0, 0, 0, 0);
        const windowEnd = new Date(windowStart);
        windowEnd.setHours(23, 59, 59, 999);

        const events = await prisma.event.findMany({
          where: {
            startTime:   { gte: windowStart, lte: windowEnd },
            type:        { not: "MEETING" },
            isRecurring: false,
          },
          select: { id: true, title: true, startTime: true, type: true },
        });

        for (const event of events) {
          // Skip if an EVENT_PROMO submission already references this event
          const existing = await prisma.outreachSubmission.findFirst({
            where: {
              type:      "EVENT_PROMO",
              eventId:   event.id,
              status:    { not: "DRAFT" },
            },
          });
          if (existing) continue;

          // Check if a DRAFT already exists for this event
          const existingDraft = await prisma.outreachSubmission.findFirst({
            where: { type: "EVENT_PROMO", eventId: event.id, status: "DRAFT" },
          });
          if (existingDraft) continue;

          // Find first admin to own the draft
          const admin = await prisma.member.findFirst({
            where: { isAdmin: true, isBot: false },
            select: { id: true, slackId: true },
          });
          if (!admin) continue;

          const eventDate = event.startTime
            ? event.startTime.toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : "upcoming";

          await prisma.outreachSubmission.create({
            data: {
              title:    `[Auto] Promote: ${event.title}`,
              content:  `Join us for ${event.title} on ${eventDate}! Stay tuned for more details.`,
              type:     "EVENT_PROMO",
              status:   "DRAFT",
              platform: ["instagram", "linkedin"],
              authorId: admin.id,
              eventId:  event.id,
            },
          });

          if (admin.slackId) {
            queueDm(
              admin.slackId,
              `📣 Auto-created an EVENT_PROMO draft for *${event.title}* (${days} day${days !== 1 ? "s" : ""} away). Please review and submit it in the Outreach Hub.`
            );
          }
        }
      }
      console.log("✅ Event promo draft check complete");
    } catch (err) {
      console.error("❌ Event promo draft error:", err);
    }
  });

  console.log("  📅 Scheduled: Monday 9AM         — Combined digest + standup DMs");
  console.log("  📅 Scheduled: Tue–Fri 9:15AM     — Standup prompt DMs");
  console.log("  📅 Scheduled: Sunday 6PM          — Combined health + week-ahead (channels)");
  console.log("  📅 Scheduled: Daily 8AM           — Due date reminder DMs");
  console.log("  📅 Scheduled: Daily 8:30AM        — Escalation → admin DMs");
  console.log("  📅 Scheduled: Daily 3AM           — Auto-archive nudges → admin + creator DMs");
  console.log("  📅 Scheduled: Weekdays 10AM       — Stale tasks → admin DMs");
  console.log("  📅 Scheduled: Daily 8:45AM        — Milestone health → admin DMs");
  console.log("  📅 Scheduled: Friday 3:45PM       — AI risk → admin DMs");
  console.log("  📅 Scheduled: Wednesday 10:30AM   — AI capacity → admin DMs");
  console.log("  📅 Scheduled: Sunday 8PM          — AI dependency → admin DMs");
  console.log("  📅 Scheduled: Daily 3AM           — Notification cleanup (90 days)");
  console.log("  📅 Scheduled: Tuesday 6:30AM      — Meeting template DMs → admins");
  console.log("  📅 Scheduled: Daily 9AM           — Event reminders → attendees");
  console.log("  📅 Scheduled: Hourly              — Auto-publish APPROVED outreach submissions");
  console.log("  📅 Scheduled: Hourly :05          — Instantiate recurring template DRAFTs");
  console.log("  📅 Scheduled: Daily 8:10AM        — Auto-create EVENT_PROMO drafts (7/3/1 day lead)");
  console.log("  📅 Scheduled: Thursday 11AM       — Member Spotlight auto-draft (fair rotation)");
  console.log("  📅 Scheduled: Monday 10AM         — Outreach Weekly Slack digest (AI narrative)");
  console.log("  📅 Scheduled: Daily 9:05AM        — CRM follow-up reminders → contact owners");

  // ── Engagement crons ──────────────────────────────────────

  // Midnight UTC — refresh every member's shop rotation for the new day
  cron.schedule("0 0 * * *", async () => {
    console.log("🛒 Rotating shop slots for all members...");
    try {
      const { rotateAll } = await import("../services/shopService.js");
      await rotateAll();
      console.log("✅ Shop rotation complete");
    } catch (err) {
      console.error("❌ Shop rotation error:", err);
    }
  });

  // Friday 5:00 PM — Kudos digest to the club channel
  cron.schedule("0 17 * * 5", async () => {
    if (!process.env.SLACK_CLUB_CHANNEL_ID) return;
    try {
      const { getWeeklyKudos } = await import("../services/kudosService.js");
      const kudos = await getWeeklyKudos();
      if (kudos.length === 0) return;
      const lines = kudos
        .slice(0, 30) // cap message length
        .map((k: any) => `❤️ *${k.from.displayName}* → *${k.to.displayName}*`)
        .join("\n");
      const extra = kudos.length > 30 ? `\n…and ${kudos.length - 30} more` : "";
      await app.client.chat.postMessage({
        channel: process.env.SLACK_CLUB_CHANNEL_ID,
        text:    `*Kudos this week (${kudos.length})*\n${lines}${extra}`,
      });
      console.log(`✅ Kudos digest posted: ${kudos.length} kudos`);
    } catch (err) {
      console.error("❌ Kudos digest error:", err);
    }
  });

  // 02:00 UTC daily — Streak reset sweep (consume freezes, reset stale streaks)
  cron.schedule("0 2 * * *", async () => {
    console.log("🔥 Running streak reset sweep...");
    try {
      const { dailyResetSweep } = await import("../services/streakService.js");
      const result = await dailyResetSweep();
      console.log(`✅ Streak sweep: scanned=${result.scanned} frozen=${result.frozen} reset=${result.reset}`);
    } catch (err) {
      console.error("❌ Streak sweep error:", err);
    }
  });

  console.log("  📅 Scheduled: Midnight UTC        — Shop rotation refresh");
  console.log("  📅 Scheduled: Friday 5PM          — Kudos weekly digest to club channel");
  console.log("  📅 Scheduled: 02:00 UTC daily     — Streak reset sweep");

  // ── Quest crons ───────────────────────────────────────────────

  // 00:00 UTC daily — assign new daily quests to every active member
  cron.schedule("0 0 * * *", async () => {
    console.log("🎯 Assigning daily quests...");
    try {
      const { assignDailyChallenges } = await import("../services/challengeService.js");
      const members = await prisma.member.findMany({ select: { id: true } });
      for (const m of members) {
        await assignDailyChallenges(m.id).catch(err =>
          console.error(`[challenge] daily assign ${m.id}:`, err));
      }
      console.log(`✅ Daily quest assignment complete (${members.length} members)`);
    } catch (err) {
      console.error("❌ Daily quest assignment error:", err);
    }
  }, { timezone: "Etc/UTC" });

  // Monday 00:00 UTC — assign new weekly quest
  cron.schedule("0 0 * * 1", async () => {
    console.log("🎯 Assigning weekly quests...");
    try {
      const { assignWeeklyChallenge } = await import("../services/challengeService.js");
      const members = await prisma.member.findMany({ select: { id: true } });
      for (const m of members) {
        await assignWeeklyChallenge(m.id).catch(err =>
          console.error(`[challenge] weekly assign ${m.id}:`, err));
      }
      console.log(`✅ Weekly quest assignment complete (${members.length} members)`);
    } catch (err) {
      console.error("❌ Weekly quest assignment error:", err);
    }
  }, { timezone: "Etc/UTC" });

  // 1st of month 00:00 UTC — assign monthly quest
  cron.schedule("0 0 1 * *", async () => {
    console.log("🎯 Assigning monthly quests...");
    try {
      const { assignMonthlyChallenge } = await import("../services/challengeService.js");
      const members = await prisma.member.findMany({ select: { id: true } });
      for (const m of members) {
        await assignMonthlyChallenge(m.id).catch(err =>
          console.error(`[challenge] monthly assign ${m.id}:`, err));
      }
      console.log(`✅ Monthly quest assignment complete (${members.length} members)`);
    } catch (err) {
      console.error("❌ Monthly quest assignment error:", err);
    }
  }, { timezone: "Etc/UTC" });

  // Sunday 23:55 UTC — end-of-week derived metric checks (Zero Gravity Backlog, Telemetry Report)
  cron.schedule("55 23 * * 0", async () => {
    console.log("🎯 Running weekly derived metric checks...");
    try {
      const { runWeeklyDerivedChecks } = await import("../services/challengeService.js");
      await runWeeklyDerivedChecks();
      console.log("✅ Weekly derived metric checks complete");
    } catch (err) {
      console.error("❌ Weekly derived checks error:", err);
    }
  }, { timezone: "Etc/UTC" });

  console.log("  📅 Scheduled: 00:00 UTC daily     — Daily quest assignment");
  console.log("  📅 Scheduled: Monday 00:00 UTC    — Weekly quest assignment");
  console.log("  📅 Scheduled: 1st of month UTC    — Monthly quest assignment");
  console.log("  📅 Scheduled: Sunday 23:55 UTC    — End-of-week derived metric checks");

  // ── Blog crons ──────────────────────────────────────────────────

  // Every 5 minutes — publish SCHEDULED blog posts whose scheduledAt has passed
  cron.schedule("*/5 * * * *", async () => {
    try {
      const { publishDueScheduledPosts } = await import("../services/blogService.js");
      const count = await publishDueScheduledPosts();
      if (count > 0) console.log(`📰 Auto-published ${count} scheduled blog post(s)`);
    } catch (err) {
      console.error("❌ Blog auto-publish error:", err);
    }
  });

  console.log("  📅 Scheduled: Every 5 minutes     — Auto-publish due scheduled blog posts");
}
