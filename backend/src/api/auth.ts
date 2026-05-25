import { Router, type Request, type Response, type NextFunction } from "express";
import { createHmac } from "crypto";
import { prisma } from "../db/prisma.js";

export const authRouter = Router();

// Expose memberId on every request (set by requireAuth, works for both session and Bearer token).
declare module "express-serve-static-core" {
  interface Request {
    memberId?: string;
  }
}

// ── Token helpers (HMAC-signed, 7-day TTL) ───────────────────
// Used when cross-origin cookies are blocked (e.g. Brave Shields).
// Frontend stores token in localStorage and sends it as Authorization: Bearer.

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function tokenSecret(): string {
  return process.env.SESSION_SECRET ?? "dev-secret-change-me";
}

export function signToken(memberId: string): string {
  const expires = Date.now() + TOKEN_TTL_MS;
  const payload = Buffer.from(`${memberId}|${expires}`).toString("base64url");
  const sig = createHmac("sha256", tokenSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function verifyToken(token: string): string | null {
  try {
    const dotIdx = token.indexOf(".");
    if (dotIdx === -1) return null;
    const payload = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);
    const expectedSig = createHmac("sha256", tokenSecret()).update(payload).digest("hex");
    // Constant-time comparison
    if (sig.length !== expectedSig.length) return null;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
    if (diff !== 0) return null;
    const decoded = Buffer.from(payload, "base64url").toString();
    const pipeIdx = decoded.lastIndexOf("|");
    if (pipeIdx === -1) return null;
    const memberId = decoded.slice(0, pipeIdx);
    const expires = parseInt(decoded.slice(pipeIdx + 1));
    if (isNaN(expires) || Date.now() > expires) return null;
    return memberId;
  } catch {
    return null;
  }
}

// ── Middleware: Require Auth ─────────────────────────────────

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Bearer token first — works even when Brave blocks SameSite=None cross-origin cookies.
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const memberId = verifyToken(authHeader.slice(7));
    if (memberId) {
      req.memberId = memberId;
      console.log(`[auth] source=bearer path=${req.path}`);
      return next();
    }
  }
  // Fall back to session cookie.
  if (!req.session.memberId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  req.memberId = req.session.memberId;
  console.log(`[auth] source=cookie path=${req.path}`);
  next();
}

// ── GET /auth/slack — Redirect to Slack OAuth ────────────────

authRouter.get("/slack", (_req: Request, res: Response) => {
  const clientId = process.env.SLACK_CLIENT_ID;
  const redirectUri = `${process.env.BACKEND_URL ?? "http://localhost:3001"}/auth/slack/callback`;

  const scopes = [
    "users:read",
    "users:read.email",
    // Needed for the project channel picker (users.conversations + conversations.invite)
    "channels:read",
    "groups:read",
    "mpim:read",
    "channels:write.invites",
    "groups:write.invites",
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
        redirect_uri: `${process.env.BACKEND_URL ?? "http://localhost:3001"}/auth/slack/callback`,
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

    // Set session and wait for it to be written to the store before redirecting.
    // Without save(), the redirect can race ahead of the async PostgreSQL write.
    req.session.memberId = member.id;
    req.session.slackAccessToken = accessToken;

    const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
    // Sign a Bearer token to include in the redirect fragment so cross-origin clients
    // (e.g. Brave with Shields blocking SameSite=None cookies) can authenticate via header.
    const loginToken = signToken(member.id);
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        res.status(500).json({ error: "Authentication failed" });
        return;
      }
      res.redirect(`${frontendUrl}/clubpm?lt=${encodeURIComponent(loginToken)}`);
    });
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

authRouter.get("/me", requireAuth, async (req: Request, res: Response) => {
  const member = await prisma.member.findUnique({
    where: { id: req.memberId! },
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
