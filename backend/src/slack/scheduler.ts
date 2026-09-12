import cron from "node-cron";
import type { App } from "@slack/bolt";
import { syncAdminStatus } from "../services/memberService.js";
import { prisma } from "../db/prisma.js";
import { createNotification } from "../services/notificationCrud.js";
import { sweepVaultTmpDir } from "../api/vault.js";
import { remindNonResponders } from "../api/meetingPolls.js";
import * as pollService from "../services/pollService.js";
import { EXCLUDE_TRAINING } from "../services/trainingSandboxService.js";

// ── Scheduler ────────────────────────────────────────────────
//
// No job here posts to Slack. Scheduled Slack DMs and channel posts (digests,
// standup prompts, reminders, escalations, AI reports, weekly summaries) were
// removed 2026-09-12; the bot now speaks in Slack only in direct response to
// someone using it there, plus the web-triggered DMs routed by
// createNotification. Do not add a scheduled Slack send back here.

export function startScheduler(app: App): void {

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

  // ── 03:40 daily — mirror Slack attachments before Slack expires them ──
  // Clear of the 03:00–03:30 cluster (vault temp sweep, notification cleanup,
  // auto-archive nudges).
  cron.schedule("40 3 * * *", async () => {
    try {
      const { sweepExpiringFiles, MIRROR_CUTOFF_DAYS } = await import("../services/slackFileService.js");
      const t = await sweepExpiringFiles();
      if (t.swept > 0) {
        console.log(
          `📦 [slackArchive] swept ${t.swept} file(s) older than ${MIRROR_CUTOFF_DAYS}d — ` +
          `${t.drive} to Drive, ${t.local} to disk, ${t.unavailable} already gone, ${t.failed} failed`
        );
      }
      if (t.local > 0) {
        console.warn("⚠️ [slackArchive] files fell back to local disk — is Google Drive connected?");
      }
      if (t.failed > 0) {
        console.error(
          `❌ [slackArchive] ${t.failed} file(s) failed to mirror — see SlackMessageFile.mirrorError; ` +
          "rows retry nightly until MIRROR_FAILED, then wait for an admin to hit Retry on the Admin page"
        );
      }
    } catch (err) {
      console.error("[slackArchive] mirror sweep failed:", err);
    }
  });

  // ── 03:50 daily — refresh the workspace custom-emoji cache ──
  cron.schedule("50 3 * * *", async () => {
    try {
      const { refreshCustomEmoji } = await import("../services/slackFileService.js");
      const n = await refreshCustomEmoji();
      console.log(`😀 [slackArchive] cached ${n} custom emoji`);
    } catch (err) {
      console.error("[slackArchive] emoji refresh failed:", err);
    }
  });

  // ── 03:55 daily — Slack portal: join new public channels, repair membership drift ──
  cron.schedule("55 3 * * *", async () => {
    try {
      const { joinAllPublicChannels, reconcileMemberships } = await import("../services/slackMembershipService.js");
      const j = await joinAllPublicChannels(app.client);
      const n = await reconcileMemberships();
      console.log(`👥 [slackPortal] joined ${j.joined}/${j.seen} public channels; reconciled ${n} member list(s)`);
    } catch (err) {
      console.error("[slackPortal] membership reconcile failed:", err);
    }
  });

  // ── Every 2 min — Slack portal: clear notifications members already read in Slack ──
  cron.schedule("*/2 * * * *", async () => {
    try {
      const { syncReadStateFromSlack } = await import("../services/slackReadSyncService.js");
      const r = await syncReadStateFromSlack();
      if (r.cleared > 0) console.log(`👁️ [slackPortal] read sync cleared ${r.cleared} notification(s) across ${r.checked} conversation(s)`);
    } catch (err) {
      console.error("[slackPortal] read sync failed:", err);
    }
  });

  // ── Daily 3:00 AM — Auto-archive nudges → creator in-app notification ────
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
        select: { id: true, title: true, projectId: true, createdById: true },
      });

      for (const task of tasks) {
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

      console.log(`✅ Auto-archive nudges sent for ${tasks.length} task(s)`);
    } catch (error) {
      console.error("❌ Auto-archive nudge error:", error);
    }
  });

  // ── Daily 8:45 AM — Milestone health refresh ─────────────────────
  // Recomputes the health status the dashboard reads. It no longer alerts anyone.
  cron.schedule("45 8 * * *", async () => {
    try {
      const { refreshAllMilestoneHealth } = await import("../services/milestoneService.js");
      const changed = await refreshAllMilestoneHealth();
      console.log(`✅ Milestone health: ${changed.length} status change(s)`);
    } catch (error) {
      console.error("❌ Milestone health error:", error);
    }
  });

  // The Member Spotlight auto-draft (Thursday 11:00 AM) was removed 2026-09-03.
  // It created an OutreachSubmission nobody had asked for, and its "fair
  // rotation" never rotated: it matched recent spotlights on authorId — the
  // admin who owned the draft, not the member being featured — while excluding
  // its own DRAFT rows, so the exclusion set was always empty and
  // `orderBy: createdAt asc` re-picked the same oldest member every week.
  // Spotlights are manual only now, via the Member Spotlight card in
  // Outreach Hub → Insights (POST /api/outreach/ai/spotlight).

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
        select: { id: true, authorId: true },
      });
      if (due.length === 0) return;

      await prisma.outreachSubmission.updateMany({
        where: { id: { in: due.map(s => s.id) } },
        data:  { status: "PUBLISHED" },
      });

      const { handleBlogPostPublished } = await import("../services/rewardService.js");
      for (const submission of due) {
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
        include: { templateSubmission: true },
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
            select: { id: true },
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
        }
      }
      console.log("✅ Event promo draft check complete");
    } catch (err) {
      console.error("❌ Event promo draft error:", err);
    }
  });

  console.log("  📅 Scheduled: Daily 8:15AM        — Training certificate expiry (in-app)");
  console.log("  📅 Scheduled: Daily 3AM           — Auto-archive nudges → creator (in-app)");
  console.log("  📅 Scheduled: Daily 8:45AM        — Milestone health refresh");
  console.log("  📅 Scheduled: Daily 3AM           — Notification cleanup (90 days)");
  console.log("  📅 Scheduled: Hourly              — Auto-publish APPROVED outreach submissions");
  console.log("  📅 Scheduled: Hourly :05          — Instantiate recurring template DRAFTs");
  console.log("  📅 Scheduled: Daily 8:10AM        — Auto-create EVENT_PROMO drafts (7/3/1 day lead)");

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
