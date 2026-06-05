import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import {
  saveMemberGithubAuth,
  clearMemberGithubAuth,
  octokitForMember,
} from "../services/githubService.js";
import { prisma } from "../db/prisma.js";

export const githubAuthRouter = Router();

// ── GET /auth/github — begin OAuth flow ──────────────────────
// Stores the caller's memberId in the OAuth `state` parameter (HMAC-signed via
// session) so the callback can attribute the resulting token to them.

githubAuthRouter.get("/", requireAuth, (req: Request, res: Response) => {
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  if (!clientId) {
    res.status(500).json({ error: "GITHUB_APP_CLIENT_ID not configured" });
    return;
  }
  const redirectUri = `${process.env.BACKEND_URL ?? "http://localhost:3001"}/auth/github/callback`;

  // returnTo lets the SPA hop back to the page that triggered the connect.
  const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : "/clubpm";

  // Stash who initiated the flow in the session (server-side, not the URL).
  req.session.githubOauthMemberId = req.memberId!;
  req.session.githubOauthReturnTo = returnTo;

  // GitHub Apps with "Request user authorization (OAuth) during installation"
  // use the same /login/oauth/authorize endpoint as classic OAuth apps.
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "read:user user:email repo read:org");
  // state is bound to the session cookie; we still pass a token for CSRF.
  const csrf = Math.random().toString(36).slice(2);
  req.session.githubOauthState = csrf;
  url.searchParams.set("state", csrf);

  req.session.save(err => {
    if (err) {
      console.error("[github-auth] session save error:", err);
      res.status(500).json({ error: "Failed to begin GitHub OAuth" });
      return;
    }
    res.redirect(url.toString());
  });
});

// ── GET /auth/github/callback ─────────────────────────────────

githubAuthRouter.get("/callback", async (req: Request, res: Response) => {
  const { code, state, error: ghError } = req.query;
  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";

  if (ghError) {
    console.warn("[github-auth] user denied:", ghError);
    res.redirect(`${frontendUrl}/clubpm?github=denied`);
    return;
  }

  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "Missing authorization code" });
    return;
  }

  // Verify CSRF + recover memberId from session
  const expectedState = req.session.githubOauthState;
  const memberId = req.session.githubOauthMemberId;
  const returnTo = req.session.githubOauthReturnTo ?? "/clubpm";
  if (!memberId || !expectedState || state !== expectedState) {
    res.status(400).json({ error: "Invalid OAuth state" });
    return;
  }

  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: process.env.GITHUB_APP_CLIENT_ID,
        client_secret: process.env.GITHUB_APP_CLIENT_SECRET,
        code,
        redirect_uri: `${process.env.BACKEND_URL ?? "http://localhost:3001"}/auth/github/callback`,
      }),
    });
    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!tokenData.access_token) {
      console.error("[github-auth] token exchange failed:", tokenData);
      res.redirect(`${frontendUrl}/clubpm?github=token_failed`);
      return;
    }

    // Fetch user profile to capture login
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `token ${tokenData.access_token}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (!userRes.ok) {
      res.redirect(`${frontendUrl}/clubpm?github=user_failed`);
      return;
    }
    const user = (await userRes.json()) as { login: string };

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    await saveMemberGithubAuth(memberId, {
      login: user.login,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? null,
      expiresAt,
    });

    // Cleanup
    delete req.session.githubOauthState;
    delete req.session.githubOauthMemberId;
    delete req.session.githubOauthReturnTo;

    req.session.save(() => {
      const sep = returnTo.includes("?") ? "&" : "?";
      res.redirect(`${frontendUrl}${returnTo}${sep}github=connected`);
    });
  } catch (err) {
    console.error("[github-auth] callback error:", err);
    res.status(500).json({ error: "GitHub OAuth failed" });
  }
});

// ── DELETE /auth/github — disconnect ─────────────────────────

githubAuthRouter.delete("/", requireAuth, async (req: Request, res: Response) => {
  try {
    await clearMemberGithubAuth(req.memberId!);
    res.json({ ok: true });
  } catch (err) {
    console.error("[github-auth] disconnect error:", err);
    res.status(500).json({ error: "Failed to disconnect GitHub" });
  }
});

// ── GET /auth/github/me — connection status ──────────────────

githubAuthRouter.get("/me", requireAuth, async (req: Request, res: Response) => {
  const member = await prisma.member.findUnique({
    where: { id: req.memberId! },
    select: { githubLogin: true, githubTokenExpiresAt: true },
  });
  const connected = Boolean(member?.githubLogin);
  let healthy = connected;
  if (connected) {
    // Cheap probe — if the token is dead, mark unhealthy so the UI prompts re-auth.
    const o = await octokitForMember(req.memberId!);
    if (!o) {
      healthy = false;
    } else {
      try {
        await o.users.getAuthenticated();
      } catch {
        healthy = false;
      }
    }
  }
  res.json({
    connected,
    healthy,
    login: member?.githubLogin ?? null,
    expiresAt: member?.githubTokenExpiresAt ?? null,
  });
});

// ── Session-data augmentation ────────────────────────────────

declare module "express-session" {
  interface SessionData {
    githubOauthState?: string;
    githubOauthMemberId?: string;
    githubOauthReturnTo?: string;
  }
}
