import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../db/prisma.js";

export const authRouter = Router();

// ── Types ────────────────────────────────────────────────────

interface AuthenticatedRequest extends Request {
  member?: {
    id: string;
    slackId: string;
    displayName: string;
  };
}

// ── Middleware: Require Auth ─────────────────────────────────

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.session.memberId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}

// Middleware: attach member to request
export async function attachMember(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  if (req.session.memberId) {
    const member = await prisma.member.findUnique({
      where: { id: req.session.memberId },
    });
    if (member) {
      req.member = {
        id: member.id,
        slackId: member.slackId,
        displayName: member.displayName,
      };
    }
  }
  next();
}

// ── GET /auth/slack — Redirect to Slack OAuth ────────────────

authRouter.get("/slack", (_req: Request, res: Response) => {
  const clientId = process.env.SLACK_CLIENT_ID;
  const redirectUri = `${process.env.FRONTEND_URL ? "" : "http://localhost:3000"}/auth/slack/callback`;

  const scopes = [
    "users:read",
    "users:read.email",
  ].join(",");

  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", clientId ?? "");
  url.searchParams.set("user_scope", scopes);
  url.searchParams.set("redirect_uri", redirectUri);

  res.redirect(url.toString());
});

// ── GET /auth/slack/callback — Handle OAuth callback ─────────

authRouter.get("/slack/callback", async (req: Request, res: Response) => {
  const { code } = req.query;

  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "Missing authorization code" });
    return;
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.SLACK_CLIENT_ID ?? "",
        client_secret: process.env.SLACK_CLIENT_SECRET ?? "",
        code,
        redirect_uri: `${process.env.FRONTEND_URL ? "" : "http://localhost:3000"}/auth/slack/callback`,
      }),
    });

    const tokenData = (await tokenResponse.json()) as {
      ok: boolean;
      authed_user?: {
        id: string;
        access_token: string;
      };
      error?: string;
    };

    if (!tokenData.ok || !tokenData.authed_user) {
      res.status(400).json({ error: tokenData.error ?? "OAuth failed" });
      return;
    }

    const { id: slackUserId, access_token: accessToken } = tokenData.authed_user;

    // Use the bot token to get user info
    const userInfoResponse = await fetch(
      `https://slack.com/api/users.info?user=${slackUserId}`,
      {
        headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
      }
    );

    const userInfo = (await userInfoResponse.json()) as {
      ok: boolean;
      user?: {
        name: string;
        profile: {
          display_name?: string;
          real_name?: string;
          image_72?: string;
        };
      };
    };

    const profile = userInfo.user?.profile;
    const displayName =
      profile?.display_name || profile?.real_name || slackUserId;
    const slackHandle = userInfo.user?.name ?? slackUserId;
    const avatarUrl = profile?.image_72;

    // Upsert member
    const member = await prisma.member.upsert({
      where: { slackId: slackUserId },
      update: {
        displayName,
        slackHandle,
        avatarUrl,
      },
      create: {
        slackId: slackUserId,
        slackHandle,
        displayName,
        avatarUrl,
      },
    });

    // Set session
    req.session.memberId = member.id;
    req.session.slackAccessToken = accessToken;

    // Redirect to frontend
    const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";
    res.redirect(frontendUrl);
  } catch (error) {
    console.error("OAuth callback error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
});

// ── GET /auth/logout ─────────────────────────────────────────

authRouter.get("/logout", (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
      res.status(500).json({ error: "Logout failed" });
      return;
    }
    res.json({ ok: true });
  });
});

// ── GET /auth/me — Check auth status ─────────────────────────

authRouter.get("/me", async (req: Request, res: Response) => {
  if (!req.session.memberId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const member = await prisma.member.findUnique({
    where: { id: req.session.memberId },
    include: {
      tasks: {
        include: { project: true },
        orderBy: { dueDate: "asc" },
      },
      projects: {
        include: { project: true },
      },
    },
  });

  if (!member) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Member not found" });
    return;
  }

  res.json(member);
});
