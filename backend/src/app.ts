import "dotenv/config";
import express from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { boltApp, startBolt } from "./slack/bolt.js";
import { syncAdminStatus } from "./services/memberService.js";
import { authRouter } from "./api/auth.js";
import { projectsRouter, tagsRouter } from "./api/projects.js";
import { tasksRouter } from "./api/tasks.js";
import { membersRouter } from "./api/members.js";
import { activityRouter } from "./api/activity.js";
import { milestonesRouter } from "./api/milestones.js";
import { reportingRouter } from "./api/reporting.js";
import { slackRouter } from "./api/slack.js";
import { startScheduler } from "./slack/scheduler.js";
import { notificationsRouter } from "./api/notifications.js";
import { sseRouter } from "./api/sse.js";
import { initDmBatcher } from "./services/dmBatcher.js";
import { eventsRouter } from "./api/events.js";
import { outreachRouter } from "./api/outreach.js";

// ── Express Setup ────────────────────────────────────────────

const app = express();
const PORT = parseInt(process.env.PORT ?? "3000", 10);

// Trust the first proxy (Nginx) so req.secure reflects HTTPS correctly.
// Required for express-session to set Secure cookies behind a reverse proxy.
app.set("trust proxy", 1);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
    credentials: true,
  })
);

// Session (backed by PostgreSQL)
const PgSession = connectPgSimple(session);
app.use(
  session({
    store: new PgSession({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET ?? "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
      // "none" required for cross-origin fetch with credentials (GitHub Pages → Oracle)
      // "lax" is fine for same-origin local dev
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  })
);

// ── API Routes ───────────────────────────────────────────────

app.use("/auth", authRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/tags", tagsRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/members", membersRouter);
app.use("/api/activity", activityRouter);
app.use("/api/milestones", milestonesRouter);
app.use("/api/reporting", reportingRouter);
app.use("/api/slack", slackRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/notifications", sseRouter);
app.use("/api/events", eventsRouter);
app.use("/api/outreach", outreachRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Start ────────────────────────────────────────────────────

async function start(): Promise<void> {
  try {
    // Start Slack Bolt app (Socket Mode)
    await startBolt();
    console.log("⚡ Slack Bolt app started (Socket Mode)");

    // Initialize DM batcher (must come before scheduler)
    initDmBatcher(boltApp);

    // Sync admin status from leadership channel on boot
    if (process.env.LEADERSHIP_CHANNEL_ID) {
      syncAdminStatus(boltApp)
        .then(() => console.log("🔑 Admin status synced from leadership channel"))
        .catch(err => console.error("⚠️  Admin sync failed (check groups:read scope):", err?.data?.error ?? err));
    } else {
      console.warn("⚠️  LEADERSHIP_CHANNEL_ID not set — nobody will have admin rights");
    }

    // Start cron scheduler
    startScheduler(boltApp);
    console.log("⏰ Cron scheduler started");

    // Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 Express server running on http://localhost:${PORT}`);
      console.log(
        `🌐 Frontend expected at ${process.env.FRONTEND_URL ?? "http://localhost:5173"}`
      );
    });
  } catch (error) {
    console.error("❌ Failed to start application:", error);
    process.exit(1);
  }
}

start();

// Augment express-session types for our session data
declare module "express-session" {
  interface SessionData {
    memberId: string;
    slackAccessToken: string;
  }
}

export { app };
