import "dotenv/config";
import "./config/env.js"; // validate env vars at startup before binding
import { getSessionSecret } from "./config/env.js";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
import { redirectRouter } from "./api/redirect.js";
import { assetsRouter } from "./api/assets.js";
import { brandVoicesRouter } from "./api/brandVoices.js";
import { campaignsRouter } from "./api/campaigns.js";
import { contactsRouter } from "./api/contacts.js";
import { insightsRouter } from "./api/insights.js";
import { publicRouter } from "./api/public.js";
import { githubAuthRouter } from "./api/githubAuth.js";
import { githubRouter } from "./api/github.js";
import { githubWebhookRouter } from "./api/githubWebhook.js";
import { rewardsRouter } from "./api/rewards.js";
import { eventConfigRouter } from "./api/eventConfig.js";
import { leaderboardRouter } from "./api/leaderboard.js";
import { shopRouter } from "./api/shop.js";
import { avatarRouter } from "./api/avatar.js";
import { streakRouter } from "./api/streak.js";
import { inventoryRouter } from "./api/inventory.js";
import { challengesRouter } from "./api/challenges.js";
import { blockersRouter } from "./api/blockers.js";
import { vaultRouter } from "./api/vault.js";
import { changeRequestsRouter } from "./api/changeRequests.js";
import { blogRouter } from "./api/blog.js";
import { attachBlogCollab } from "./collab/blogCollab.js";

// ── Express Setup ────────────────────────────────────────────

const app = express();
const PORT = parseInt(process.env.PORT ?? "3000", 10);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// Trust the first proxy (Nginx) so req.secure reflects HTTPS correctly.
// Required for express-session to set Secure cookies behind a reverse proxy.
app.set("trust proxy", 1);

// GitHub webhook receiver — MUST come before express.json() so the raw body
// is available for X-Hub-Signature-256 verification.
app.use("/api/github/webhook", githubWebhookRouter);

// Body parsing (all other routes)
app.use(express.json({ limit: "15mb" }));
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
    secret: getSessionSecret(),
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
app.use("/auth/github", githubAuthRouter);
app.use("/api/github", githubRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/tags", tagsRouter);
app.use("/api/tasks", tasksRouter);
// Mounted before the bare "/api" routers below (blockersRouter, streakRouter):
// those attach requireAuth via router.use() with no path, which Express runs
// for every /api/* request that reaches them — mounting publicRouter first
// ensures unauthenticated /api/public/* requests are handled before that.
app.use("/api/public", publicRouter);
app.use("/api", blockersRouter);
app.use("/api", vaultRouter);
app.use("/api", changeRequestsRouter);
app.use("/api/members", membersRouter);
app.use("/api/activity", activityRouter);
app.use("/api/milestones", milestonesRouter);
app.use("/api/reporting", reportingRouter);
app.use("/api/slack", slackRouter);
// sseRouter MUST come before notificationsRouter: the SSE stream authenticates
// via a `?token=` query param for cookie-blocked EventSource clients, and
// notificationsRouter's pathless requireAuth would otherwise 401 that request
// (no cookie, no Authorization header) before it reached the /stream handler.
app.use("/api/notifications", sseRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/events", eventsRouter);
app.use("/api/outreach", outreachRouter);
app.use("/api/blog", blogRouter);
app.use("/api/outreach/assets", assetsRouter);
app.use("/api/outreach/brand-voices", brandVoicesRouter);
app.use("/api/outreach/campaigns", campaignsRouter);
app.use("/api/outreach/contacts", contactsRouter);
app.use("/api/outreach/insights", insightsRouter);
app.use("/api/rewards", rewardsRouter);
app.use("/api/event-config", eventConfigRouter);
app.use("/api/leaderboard", leaderboardRouter);
app.use("/api/shop", shopRouter);
app.use("/api/avatar", avatarRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/challenges", challengesRouter);
app.use("/api", streakRouter); // /api/members/:id/streak, /api/members/me/celebration, etc.
app.use("/r", redirectRouter);

// Static uploads (portraits, etc). Avatar portraits live under uploads/portraits
// and are referenced by their public URL from AvatarConfig.portraitUrl.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, "..", "uploads");
app.use("/uploads", express.static(UPLOADS_DIR, { fallthrough: true, maxAge: "1d" }));

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
    const server = app.listen(PORT, () => {
      console.log(`🚀 Express server running on http://localhost:${PORT}`);
      console.log(
        `🌐 Frontend expected at ${process.env.FRONTEND_URL ?? "http://localhost:5173"}`
      );
    });

    // Embedded blog collaboration WS server, riding the same HTTP server/port.
    attachBlogCollab(server);
    console.log("🤝 Blog collab (Hocuspocus) attached at /collab/blog");

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.error(
          `❌ Port ${PORT} is already in use. Kill the other process and retry:\n` +
          `   Windows:  netstat -ano | findstr :${PORT}  →  taskkill /PID <pid> /F\n` +
          `   macOS/Linux:  lsof -i :${PORT}  →  kill -9 <pid>`
        );
      } else {
        console.error("❌ Server error:", err);
      }
      process.exit(1);
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
