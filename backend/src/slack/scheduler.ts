import cron from "node-cron";
import type { App } from "@slack/bolt";
import {
  sendAllWeeklyDigests,
  sendAllDueDateReminders,
  postAllProjectHealthSummaries,
  postAllWeekAheadSummaries,
} from "../services/notificationService.js";

// ── Scheduler ────────────────────────────────────────────────

export function startScheduler(app: App): void {
  // Monday 9:00 AM — Personal task digest DMs
  // Cron: minute hour day-of-month month day-of-week
  cron.schedule("0 9 * * 1", async () => {
    console.log("📬 Running Monday weekly digest...");
    try {
      await sendAllWeeklyDigests(app);
      console.log("✅ Weekly digests sent");
    } catch (error) {
      console.error("❌ Weekly digest error:", error);
    }
  });

  // Friday 4:00 PM — Project health summary to channels
  cron.schedule("0 16 * * 5", async () => {
    console.log("📊 Running Friday project health summary...");
    try {
      await postAllProjectHealthSummaries(app);
      console.log("✅ Project health summaries posted");
    } catch (error) {
      console.error("❌ Project health summary error:", error);
    }
  });

  // Daily 8:00 AM — Due today / overdue reminders
  cron.schedule("0 8 * * *", async () => {
    console.log("⏰ Running daily due date reminders...");
    try {
      await sendAllDueDateReminders(app);
      console.log("✅ Due date reminders sent");
    } catch (error) {
      console.error("❌ Due date reminder error:", error);
    }
  });

  // Sunday 6:00 PM — Week ahead summary to project channels
  cron.schedule("0 18 * * 0", async () => {
    console.log("📅 Running Sunday week-ahead summary...");
    try {
      await postAllWeekAheadSummaries(app);
      console.log("✅ Week-ahead summaries posted");
    } catch (error) {
      console.error("❌ Week-ahead summary error:", error);
    }
  });

  console.log("  📅 Scheduled: Monday 9AM — Weekly digest DMs");
  console.log("  📅 Scheduled: Friday 4PM — Project health summaries");
  console.log("  📅 Scheduled: Daily 8AM  — Due date reminders");
  console.log("  📅 Scheduled: Sunday 6PM — Week ahead summaries");
}
