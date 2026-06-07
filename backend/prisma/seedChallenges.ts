// Seeds the challenge catalog (quests + achievements) and roll tables.
// Idempotent: uses upsert on unique key. Safe to re-run.
//   cd backend && npx tsx prisma/seedChallenges.ts

import {
  PrismaClient,
  ChallengeType,
  ChallengeCategory,
  ChallengeMetric,
  CosmeticRarity,
} from "@prisma/client";

const prisma = new PrismaClient();

type ChallengeSeed = {
  key: string;
  type: ChallengeType;
  category: ChallengeCategory;
  tier?: CosmeticRarity;
  name: string;
  description: string;
  metricKey: ChallengeMetric;
  target: number;
  xpReward: number;
  doubloonReward: number;
  rollTableKey?: string;
  iconClass?: string;
};

const CHALLENGES: ChallengeSeed[] = [
  // ── DAILY ──────────────────────────────────────────────────────
  {
    key: "daily_first_contact",
    type: "DAILY", category: "KANBAN",
    name: "First Contact", description: "Complete 1 task today.",
    metricKey: "TASK_COMPLETED", target: 1,
    xpReward: 30, doubloonReward: 15, rollTableKey: "DAILY_DROP",
    iconClass: "fas fa-rocket",
  },
  {
    key: "daily_three_body_problem",
    type: "DAILY", category: "KANBAN",
    name: "Three-Body Problem", description: "Complete 3 tasks in a single day.",
    metricKey: "TASK_COMPLETED", target: 3,
    xpReward: 60, doubloonReward: 30, rollTableKey: "DAILY_DROP",
    iconClass: "fas fa-meteor",
  },
  {
    key: "daily_mission_briefing",
    type: "DAILY", category: "KANBAN",
    name: "Mission Briefing", description: "Create 2 new tasks with a title, description, and due date.",
    metricKey: "TASK_CREATED_WITH_DETAILS", target: 2,
    xpReward: 40, doubloonReward: 20, rollTableKey: "DAILY_DROP",
    iconClass: "fas fa-satellite-dish",
  },
  {
    key: "daily_priority_clearance",
    type: "DAILY", category: "KANBAN",
    name: "Priority Clearance", description: "Move 1 task from Backlog to In Progress.",
    metricKey: "TASK_MOVED_BACKLOG_TO_INPROGRESS", target: 1,
    xpReward: 20, doubloonReward: 10, rollTableKey: "DAILY_DROP",
    iconClass: "fas fa-arrow-right",
  },
  {
    key: "daily_tag_and_deploy",
    type: "DAILY", category: "KANBAN",
    name: "Tag & Deploy", description: "Add a label or tag to 3 tasks.",
    metricKey: "TASK_LABELED", target: 3,
    xpReward: 25, doubloonReward: 12, rollTableKey: "DAILY_DROP",
    iconClass: "fas fa-tags",
  },
  {
    key: "daily_rendezvous_assignment",
    type: "DAILY", category: "KANBAN",
    name: "Rendezvous Assignment", description: "Assign a task to a teammate.",
    metricKey: "TASK_ASSIGNED_TO_TEAMMATE", target: 1,
    xpReward: 30, doubloonReward: 15, rollTableKey: "DAILY_DROP",
    iconClass: "fas fa-user-plus",
  },
  {
    key: "daily_open_comms",
    type: "DAILY", category: "COMMENTS",
    name: "Open Comms", description: "Write a comment on any task (10+ words).",
    metricKey: "COMMENT_LONG", target: 1,
    xpReward: 25, doubloonReward: 12, rollTableKey: "DAILY_DROP",
    iconClass: "fas fa-comments",
  },
  {
    key: "daily_signal_boost",
    type: "DAILY", category: "COMMENTS",
    name: "Signal Boost", description: "React to a teammate's comment with an emoji.",
    metricKey: "COMMENT_REACTION", target: 1,
    xpReward: 15, doubloonReward: 8, rollTableKey: "DAILY_DROP",
    iconClass: "fas fa-thumbs-up",
  },
  {
    key: "daily_status_ping",
    type: "DAILY", category: "COMMENTS",
    name: "Status Ping", description: "Post a status update comment on 2 different tasks.",
    metricKey: "STATUS_COMMENT", target: 2,
    xpReward: 35, doubloonReward: 18, rollTableKey: "DAILY_DROP",
    iconClass: "fas fa-broadcast-tower",
  },
  {
    key: "daily_clock_in",
    type: "DAILY", category: "TIME",
    name: "Clock In", description: "Log any time entry on a task today.",
    metricKey: "TIME_LOG_ENTRY", target: 1,
    xpReward: 20, doubloonReward: 10, rollTableKey: "DAILY_DROP",
    iconClass: "fas fa-clock",
  },
  {
    key: "daily_deep_focus",
    type: "DAILY", category: "TIME",
    name: "Deep Focus", description: "Log at least 2 hours of tracked time across all tasks.",
    metricKey: "TIME_LOG_HOURS", target: 120,
    xpReward: 50, doubloonReward: 25, rollTableKey: "DAILY_DROP",
    iconClass: "fas fa-hourglass-half",
  },
  {
    key: "daily_multi_orbit",
    type: "DAILY", category: "TIME",
    name: "Multi-Orbit", description: "Track time on 3 different tasks in one day.",
    metricKey: "TIME_LOG_UNIQUE_TASKS", target: 3,
    xpReward: 40, doubloonReward: 20, rollTableKey: "DAILY_DROP",
    iconClass: "fas fa-satellite",
  },
  {
    key: "daily_data_uplink",
    type: "DAILY", category: "FILES",
    name: "Data Uplink", description: "Attach a file or Drive link to any task.",
    metricKey: "FILE_ATTACHED", target: 1,
    xpReward: 30, doubloonReward: 15, rollTableKey: "DAILY_DROP",
    iconClass: "fas fa-paperclip",
  },
  {
    key: "daily_evidence_bay",
    type: "DAILY", category: "FILES",
    name: "Evidence Bay", description: "Attach files or links to 2 different tasks today.",
    metricKey: "FILE_ATTACHED", target: 2,
    xpReward: 45, doubloonReward: 22, rollTableKey: "DAILY_DROP",
    iconClass: "fas fa-folder-open",
  },
  {
    key: "daily_crew_manifest",
    type: "DAILY", category: "PROFILE",
    name: "Crew Manifest", description: "Update something on your member profile (bio, role, or avatar).",
    metricKey: "PROFILE_UPDATED", target: 1,
    xpReward: 20, doubloonReward: 10, rollTableKey: "DAILY_DROP",
    iconClass: "fas fa-id-badge",
  },

  // ── WEEKLY ─────────────────────────────────────────────────────
  {
    key: "weekly_week_in_the_field",
    type: "WEEKLY", category: "KANBAN",
    name: "Week in the Field", description: "Complete at least 1 task every weekday for 5 consecutive days.",
    metricKey: "DAILY_ACTIVE", target: 5,
    xpReward: 150, doubloonReward: 80, rollTableKey: "WEEKLY_BADGE",
    iconClass: "fas fa-calendar-check",
  },
  {
    key: "weekly_squadron_output",
    type: "WEEKLY", category: "KANBAN",
    name: "Squadron Output", description: "Complete 10 tasks in a single week.",
    metricKey: "TASK_COMPLETED", target: 10,
    xpReward: 180, doubloonReward: 100, rollTableKey: "WEEKLY_BADGE",
    iconClass: "fas fa-rocket",
  },
  {
    key: "weekly_mission_architect",
    type: "WEEKLY", category: "KANBAN",
    name: "Mission Architect", description: "Create 8 new tasks with full details (title, description, due date, assignee).",
    metricKey: "TASK_CREATED_WITH_DETAILS", target: 8,
    xpReward: 120, doubloonReward: 70, rollTableKey: "WEEKLY_BADGE",
    iconClass: "fas fa-drafting-compass",
  },
  {
    key: "weekly_zero_gravity_backlog",
    type: "WEEKLY", category: "KANBAN",
    name: "Zero Gravity Backlog", description: "End the week with no overdue tasks.",
    metricKey: "TASKS_NO_OVERDUE", target: 1,
    xpReward: 160, doubloonReward: 90, rollTableKey: "WEEKLY_BADGE",
    iconClass: "fas fa-check-circle",
  },
  {
    key: "weekly_orbital_sweep",
    type: "WEEKLY", category: "KANBAN",
    name: "Orbital Sweep", description: "Move at least 5 tasks from In Progress to Done.",
    metricKey: "TASK_MOVED_INPROGRESS_TO_DONE", target: 5,
    xpReward: 130, doubloonReward: 75, rollTableKey: "WEEKLY_BADGE",
    iconClass: "fas fa-meteor",
  },
  {
    key: "weekly_flight_hours",
    type: "WEEKLY", category: "TIME",
    name: "Flight Hours", description: "Log at least 8 hours of tracked time across the week.",
    metricKey: "TIME_LOG_HOURS", target: 480,
    xpReward: 150, doubloonReward: 85, rollTableKey: "WEEKLY_BADGE",
    iconClass: "fas fa-clock",
  },
  {
    key: "weekly_time_on_target",
    type: "WEEKLY", category: "TIME",
    name: "Time on Target", description: "Track time on at least 5 unique tasks this week.",
    metricKey: "TIME_LOG_UNIQUE_TASKS", target: 5,
    xpReward: 110, doubloonReward: 60, rollTableKey: "WEEKLY_BADGE",
    iconClass: "fas fa-satellite-dish",
  },
  {
    key: "weekly_telemetry_report",
    type: "WEEKLY", category: "TIME",
    name: "Telemetry Report", description: "Log time every single weekday for 5 days straight.",
    metricKey: "TIME_LOG_WEEKDAY", target: 5,
    xpReward: 170, doubloonReward: 95, rollTableKey: "WEEKLY_BADGE",
    iconClass: "fas fa-chart-line",
  },
  {
    key: "weekly_crew_debrief",
    type: "WEEKLY", category: "COMMENTS",
    name: "Crew Debrief", description: "Write comments on 5 different tasks this week.",
    metricKey: "COMMENT_WRITTEN", target: 5,
    xpReward: 120, doubloonReward: 65, rollTableKey: "WEEKLY_BADGE",
    iconClass: "fas fa-comments",
  },
  {
    key: "weekly_reaction_chain",
    type: "WEEKLY", category: "COLLABORATION",
    name: "Reaction Chain", description: "React to comments from 3 different teammates this week.",
    metricKey: "COMMENT_REACTION", target: 3,
    xpReward: 90, doubloonReward: 50, rollTableKey: "WEEKLY_BADGE",
    iconClass: "fas fa-link",
  },
  {
    key: "weekly_all_hands_on_deck",
    type: "WEEKLY", category: "COLLABORATION",
    name: "All Hands on Deck", description: "Assign tasks to at least 3 different teammates.",
    metricKey: "UNIQUE_ASSIGNEES", target: 3,
    xpReward: 120, doubloonReward: 70, rollTableKey: "WEEKLY_BADGE",
    iconClass: "fas fa-users",
  },
  {
    key: "weekly_transmission_sent",
    type: "WEEKLY", category: "CONTENT",
    name: "Transmission Sent", description: "Publish or draft 1 blog post this week.",
    metricKey: "BLOG_DRAFTED", target: 1,
    xpReward: 140, doubloonReward: 80, rollTableKey: "WEEKLY_BADGE",
    iconClass: "fas fa-globe",
  },
  {
    key: "weekly_first_contact_protocol",
    type: "WEEKLY", category: "CONTENT",
    name: "First Contact Protocol", description: "Draft 1 outreach proposal this week.",
    metricKey: "OUTREACH_DRAFTED", target: 1,
    xpReward: 160, doubloonReward: 90, rollTableKey: "WEEKLY_BADGE",
    iconClass: "fas fa-bullhorn",
  },
  {
    key: "weekly_document_bay",
    type: "WEEKLY", category: "FILES",
    name: "Document Bay", description: "Attach files or links to 5 different tasks this week.",
    metricKey: "FILE_ATTACHED", target: 5,
    xpReward: 100, doubloonReward: 60, rollTableKey: "WEEKLY_BADGE",
    iconClass: "fas fa-folder",
  },

  // ── MONTHLY ────────────────────────────────────────────────────
  {
    key: "monthly_launch_window",
    type: "MONTHLY", category: "KANBAN",
    name: "Launch Window", description: "Complete at least 30 tasks over the month.",
    metricKey: "TASK_COMPLETED", target: 30,
    xpReward: 600, doubloonReward: 350, rollTableKey: "MONTHLY_HIGH_RARITY",
    iconClass: "fas fa-rocket",
  },
  {
    key: "monthly_unbroken_orbit",
    type: "MONTHLY", category: "KANBAN",
    name: "Unbroken Orbit", description: "Maintain a daily activity streak for 20+ days this month.",
    metricKey: "DAILY_ACTIVE", target: 20,
    xpReward: 700, doubloonReward: 400, rollTableKey: "MONTHLY_HIGH_RARITY",
    iconClass: "fas fa-satellite",
  },
  {
    key: "monthly_zero_overdue",
    type: "MONTHLY", category: "KANBAN",
    name: "Zero Overdue", description: "End every week of the month with 0 overdue tasks.",
    metricKey: "TASKS_NO_OVERDUE", target: 4,
    xpReward: 800, doubloonReward: 500, rollTableKey: "MONTHLY_HIGH_RARITY",
    iconClass: "fas fa-check-double",
  },
  {
    key: "monthly_fifty_hours_logged",
    type: "MONTHLY", category: "TIME",
    name: "50 Hours Logged", description: "Track 50+ total hours of work time this month.",
    metricKey: "TIME_LOG_HOURS", target: 3000,
    xpReward: 750, doubloonReward: 450, rollTableKey: "MONTHLY_HIGH_RARITY",
    iconClass: "fas fa-hourglass-end",
  },
  {
    key: "monthly_broadcast_spectrum",
    type: "MONTHLY", category: "CONTENT",
    name: "Broadcast Spectrum", description: "Publish 3 blog posts this month.",
    metricKey: "BLOG_PUBLISHED", target: 3,
    xpReward: 650, doubloonReward: 380, rollTableKey: "MONTHLY_HIGH_RARITY",
    iconClass: "fas fa-globe",
  },
  {
    key: "monthly_diplomatic_corps",
    type: "MONTHLY", category: "CONTENT",
    name: "Diplomatic Corps", description: "Submit 3 completed outreach proposals this month.",
    metricKey: "OUTREACH_SUBMITTED", target: 3,
    xpReward: 700, doubloonReward: 420, rollTableKey: "MONTHLY_HIGH_RARITY",
    iconClass: "fas fa-handshake",
  },
  {
    key: "monthly_deep_space_archive",
    type: "MONTHLY", category: "FILES",
    name: "Deep Space Archive", description: "Attach files or Drive links to 20+ tasks this month.",
    metricKey: "FILE_ATTACHED", target: 20,
    xpReward: 500, doubloonReward: 300, rollTableKey: "MONTHLY_HIGH_RARITY",
    iconClass: "fas fa-archive",
  },
  {
    key: "monthly_command_structure",
    type: "MONTHLY", category: "LEADERSHIP",
    name: "Command Structure", description: "Assign tasks to 5+ different teammates over the month.",
    metricKey: "UNIQUE_ASSIGNEES", target: 5,
    xpReward: 600, doubloonReward: 350, rollTableKey: "MONTHLY_HIGH_RARITY",
    iconClass: "fas fa-sitemap",
  },
  {
    key: "monthly_crew_cohesion",
    type: "MONTHLY", category: "LEADERSHIP",
    name: "Crew Cohesion", description: "Comment on tasks from at least 4 different teammates this month.",
    metricKey: "UNIQUE_COMMENTERS_TARGETED", target: 4,
    xpReward: 480, doubloonReward: 280, rollTableKey: "MONTHLY_HIGH_RARITY",
    iconClass: "fas fa-users",
  },
  {
    key: "monthly_full_mission_profile",
    type: "MONTHLY", category: "KANBAN",
    name: "Full Mission Profile", description: "Complete a task in every Kanban column at least twice this month.",
    metricKey: "KANBAN_COLUMN_COMPLETION", target: 1,
    xpReward: 680, doubloonReward: 400, rollTableKey: "MONTHLY_HIGH_RARITY",
    iconClass: "fas fa-th",
  },
  {
    key: "monthly_mission_commander",
    type: "MONTHLY", category: "ELITE",
    name: "Mission Commander", description: "Complete all active monthly challenges in the same month.",
    metricKey: "ALL_MONTHLY_COMPLETE", target: 1,
    xpReward: 1200, doubloonReward: 800, rollTableKey: "GUARANTEED_MYTHIC",
    iconClass: "fas fa-star",
  },

  // ── ACHIEVEMENTS — Common ────────────────────────────────────────
  {
    key: "ach_liftoff",
    type: "ACHIEVEMENT", category: "KANBAN", tier: "COMMON",
    name: "Liftoff", description: "Complete your very first task.",
    metricKey: "TASK_COMPLETED", target: 1,
    xpReward: 100, doubloonReward: 50,
    iconClass: "fas fa-rocket",
  },
  {
    key: "ach_mission_log",
    type: "ACHIEVEMENT", category: "COMMENTS", tier: "COMMON",
    name: "Mission Log", description: "Write your first comment on a task.",
    metricKey: "COMMENT_WRITTEN", target: 1,
    xpReward: 60, doubloonReward: 30,
    iconClass: "fas fa-comment",
  },
  {
    key: "ach_timekeeping",
    type: "ACHIEVEMENT", category: "TIME", tier: "COMMON",
    name: "Timekeeping", description: "Log your first time entry on a task.",
    metricKey: "TIME_LOG_ENTRY", target: 1,
    xpReward: 60, doubloonReward: 30,
    iconClass: "fas fa-clock",
  },
  {
    key: "ach_file_transfer",
    type: "ACHIEVEMENT", category: "FILES", tier: "COMMON",
    name: "File Transfer", description: "Attach your first file or Drive link to a task.",
    metricKey: "FILE_ATTACHED", target: 1,
    xpReward: 60, doubloonReward: 30,
    iconClass: "fas fa-paperclip",
  },
  {
    key: "ach_transmission",
    type: "ACHIEVEMENT", category: "CONTENT", tier: "COMMON",
    name: "Transmission", description: "Publish your first blog post.",
    metricKey: "BLOG_PUBLISHED", target: 1,
    xpReward: 150, doubloonReward: 80,
    iconClass: "fas fa-globe",
  },
  {
    key: "ach_id_confirmed",
    type: "ACHIEVEMENT", category: "PROFILE", tier: "COMMON",
    name: "ID Confirmed", description: "Complete your member profile (bio, role, or avatar).",
    metricKey: "PROFILE_UPDATED", target: 1,
    xpReward: 80, doubloonReward: 40,
    iconClass: "fas fa-id-badge",
  },

  // ── ACHIEVEMENTS — Uncommon ─────────────────────────────────────
  {
    key: "ach_missions_25",
    type: "ACHIEVEMENT", category: "KANBAN", tier: "UNCOMMON",
    name: "25 Missions Complete", description: "Complete a total of 25 tasks.",
    metricKey: "TASK_COMPLETED", target: 25,
    xpReward: 250, doubloonReward: 150,
    iconClass: "fas fa-medal",
  },
  {
    key: "ach_streak_7",
    type: "ACHIEVEMENT", category: "KANBAN", tier: "UNCOMMON",
    name: "7-Day Streak", description: "Maintain an activity streak for 7 consecutive days.",
    // Uses DAILY_ACTIVE; service checks actual Streak.currentStreak at eval time
    metricKey: "DAILY_ACTIVE", target: 7,
    xpReward: 200, doubloonReward: 120,
    iconClass: "fas fa-fire",
  },
  {
    key: "ach_ten_hours",
    type: "ACHIEVEMENT", category: "TIME", tier: "UNCOMMON",
    name: "10 Hours Logged", description: "Accumulate 10 total hours of tracked time.",
    metricKey: "TIME_LOG_HOURS", target: 600,
    xpReward: 180, doubloonReward: 100,
    iconClass: "fas fa-hourglass-half",
  },
  {
    key: "ach_vocal_crew",
    type: "ACHIEVEMENT", category: "COMMENTS", tier: "UNCOMMON",
    name: "Vocal Crew", description: "Write 25 total comments across all tasks.",
    metricKey: "COMMENT_WRITTEN", target: 25,
    xpReward: 175, doubloonReward: 100,
    iconClass: "fas fa-comments",
  },
  {
    key: "ach_intel_package",
    type: "ACHIEVEMENT", category: "FILES", tier: "UNCOMMON",
    name: "Intel Package", description: "Attach files or links to 15 different tasks total.",
    metricKey: "FILE_ATTACHED", target: 15,
    xpReward: 190, doubloonReward: 110,
    iconClass: "fas fa-folder-open",
  },
  {
    key: "ach_outreach_pioneer",
    type: "ACHIEVEMENT", category: "CONTENT", tier: "UNCOMMON",
    name: "Outreach Pioneer", description: "Submit your first outreach proposal.",
    metricKey: "OUTREACH_SUBMITTED", target: 1,
    xpReward: 220, doubloonReward: 130,
    iconClass: "fas fa-bullhorn",
  },

  // ── ACHIEVEMENTS — Rare ─────────────────────────────────────────
  {
    key: "ach_missions_100",
    type: "ACHIEVEMENT", category: "KANBAN", tier: "RARE",
    name: "100 Missions", description: "Complete a total of 100 tasks.",
    metricKey: "TASK_COMPLETED", target: 100,
    xpReward: 800, doubloonReward: 500,
    iconClass: "fas fa-trophy",
  },
  {
    key: "ach_orbit_30",
    type: "ACHIEVEMENT", category: "KANBAN", tier: "RARE",
    name: "30-Day Orbit", description: "Maintain a 30-day activity streak.",
    // Service checks actual Streak.currentStreak >= 30
    metricKey: "DAILY_ACTIVE", target: 30,
    xpReward: 1000, doubloonReward: 600,
    iconClass: "fas fa-satellite",
  },
  {
    key: "ach_hours_100",
    type: "ACHIEVEMENT", category: "TIME", tier: "RARE",
    name: "100 Hours", description: "Accumulate 100 total tracked hours.",
    metricKey: "TIME_LOG_HOURS", target: 6000,
    xpReward: 900, doubloonReward: 550,
    iconClass: "fas fa-hourglass-end",
  },
  {
    key: "ach_blog_10",
    type: "ACHIEVEMENT", category: "CONTENT", tier: "RARE",
    name: "10 Blog Posts", description: "Publish a total of 10 blog posts.",
    metricKey: "BLOG_PUBLISHED", target: 10,
    xpReward: 750, doubloonReward: 450,
    iconClass: "fas fa-pen",
  },
  {
    key: "ach_outreach_10",
    type: "ACHIEVEMENT", category: "CONTENT", tier: "RARE",
    name: "10 Outreach Proposals", description: "Submit 10 total outreach proposals.",
    metricKey: "OUTREACH_SUBMITTED", target: 10,
    xpReward: 800, doubloonReward: 500,
    iconClass: "fas fa-handshake",
  },
  {
    key: "ach_all_rounder",
    type: "ACHIEVEMENT", category: "ELITE", tier: "RARE",
    name: "All-Rounder", description: "Use every ClubPM feature at least once: tasks, time tracking, files, blog, comments, outreach, profile.",
    // Service checks if 6 specific starter achievements are unlocked
    metricKey: "TASK_COMPLETED", target: 999,
    xpReward: 700, doubloonReward: 400,
    iconClass: "fas fa-star",
  },

  // ── ACHIEVEMENTS — Mythic ────────────────────────────────────────
  {
    key: "ach_missions_500",
    type: "ACHIEVEMENT", category: "KANBAN", tier: "MYTHIC",
    name: "500 Missions", description: "Complete a cumulative total of 500 tasks.",
    metricKey: "TASK_COMPLETED", target: 500,
    xpReward: 3000, doubloonReward: 2000,
    iconClass: "fas fa-crown",
  },
  {
    key: "ach_streak_100",
    type: "ACHIEVEMENT", category: "KANBAN", tier: "MYTHIC",
    name: "100-Day Unbroken", description: "Maintain a 100-consecutive-day activity streak.",
    // Service checks actual Streak.currentStreak >= 100
    metricKey: "DAILY_ACTIVE", target: 100,
    xpReward: 4000, doubloonReward: 2500,
    iconClass: "fas fa-fire-alt",
  },
  {
    key: "ach_hours_1000",
    type: "ACHIEVEMENT", category: "TIME", tier: "MYTHIC",
    name: "1000 Hours", description: "Accumulate 1,000 total tracked hours.",
    metricKey: "TIME_LOG_HOURS", target: 60000,
    xpReward: 3500, doubloonReward: 2200,
    iconClass: "fas fa-infinity",
  },
  {
    key: "ach_semester_commander",
    type: "ACHIEVEMENT", category: "ELITE", tier: "MYTHIC",
    name: "Semester Commander", description: "Complete all monthly challenges for an entire semester (4 consecutive months).",
    metricKey: "ALL_MONTHLY_COMPLETE", target: 4,
    xpReward: 5000, doubloonReward: 3000,
    iconClass: "fas fa-medal",
  },
  {
    key: "ach_search_legend",
    type: "ACHIEVEMENT", category: "ELITE", tier: "MYTHIC",
    name: "SEARCH Legend", description: "Earn every Rare-tier achievement.",
    metricKey: "RANK_RARE_ACHIEVEMENTS_ALL", target: 1,
    xpReward: 8000, doubloonReward: 5000,
    iconClass: "fas fa-star",
  },
];

async function main(): Promise<void> {
  console.log("🎯 Seeding challenge catalog...");

  let upserted = 0;
  for (const c of CHALLENGES) {
    await prisma.challenge.upsert({
      where: { key: c.key },
      update: {
        name: c.name,
        description: c.description,
        xpReward: c.xpReward,
        doubloonReward: c.doubloonReward,
        target: c.target,
        rollTableKey: c.rollTableKey,
        iconClass: c.iconClass,
        active: true,
      },
      create: c,
    });
    upserted++;
  }

  const daily   = CHALLENGES.filter(c => c.type === "DAILY").length;
  const weekly  = CHALLENGES.filter(c => c.type === "WEEKLY").length;
  const monthly = CHALLENGES.filter(c => c.type === "MONTHLY").length;
  const ach     = CHALLENGES.filter(c => c.type === "ACHIEVEMENT").length;

  console.log(`  ✅ Challenges: ${upserted} total (${daily} daily, ${weekly} weekly, ${monthly} monthly, ${ach} achievements)`);
  console.log("🎯 Challenge seed complete.");
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
