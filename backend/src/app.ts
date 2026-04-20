import "dotenv/config";
import express from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { boltApp, startBolt } from "./slack/bolt.js";
import { authRouter } from "./api/auth.js";
import { projectsRouter } from "./api/projects.js";
import { tasksRouter } from "./api/tasks.js";
import { membersRouter } from "./api/members.js";
import { startScheduler } from "./slack/scheduler.js";

// ── Express Setup ────────────────────────────────────────────

const app = express();
const PORT = parseInt(process.env.PORT ?? "3000", 10);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS — allow the Vite dev server
app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
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
      sameSite: process.env.NODE_ENV === "production" ? "lax" : "lax",
    },
  })
);

// ── API Routes ───────────────────────────────────────────────

app.use("/auth", authRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/members", membersRouter);

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
