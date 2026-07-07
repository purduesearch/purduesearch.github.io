import { Router, type Request, type Response, type NextFunction } from "express";
import { google } from "googleapis";
import { requireAuth, requireAdmin } from "./auth.js";
import { prisma } from "../db/prisma.js";
import { encryptSecret } from "../utils/crypto.js";

export const googleAuthRouter = Router();

const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive", "openid", "email"];

// A full-page OAuth redirect can't send an Authorization header, and the
// cross-origin session cookie (SameSite=None) may be blocked by the browser.
// The frontend therefore passes the bearer token as ?token=…; promote it into
// the Authorization header so the standard requireAuth path can consume it.
function promoteQueryToken(req: Request, _res: Response, next: NextFunction): void {
  if (!req.headers.authorization && typeof req.query.token === "string") {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
}

function buildOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
}

// ── GET /auth/google — begin OAuth flow (admin-only: connects the shared bot) ─

googleAuthRouter.get(
  "/",
  promoteQueryToken,
  requireAuth,
  requireAdmin,
  (req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) {
      res.status(500).json({ error: "GOOGLE_OAUTH_CLIENT_ID not configured" });
      return;
    }

    // returnTo lets the SPA hop back to the page that triggered the connect.
    const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : "/clubpm";

    // Stash who initiated the flow in the session (server-side, not the URL).
    req.session.googleOauthMemberId = req.memberId!;
    req.session.googleOauthReturnTo = returnTo;

    const csrf = Math.random().toString(36).slice(2);
    req.session.googleOauthState = csrf;

    const oauth2 = buildOAuthClient();
    const url = oauth2.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: DRIVE_SCOPES,
      state: csrf,
    });

    req.session.save(err => {
      if (err) {
        console.error("[google-auth] session save error:", err);
        res.status(500).json({ error: "Failed to begin Google OAuth" });
        return;
      }
      res.redirect(url);
    });
  }
);

// ── GET /auth/google/callback ──────────────────────────────────

googleAuthRouter.get("/callback", async (req: Request, res: Response) => {
  const { code, state, error: googleError } = req.query;
  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";

  if (googleError) {
    console.warn("[google-auth] user denied:", googleError);
    res.redirect(`${frontendUrl}/clubpm?google=denied`);
    return;
  }

  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "Missing authorization code" });
    return;
  }

  // Verify CSRF + recover memberId from session
  const expectedState = req.session.googleOauthState;
  const memberId = req.session.googleOauthMemberId;
  const returnTo = req.session.googleOauthReturnTo ?? "/clubpm";
  if (!memberId || !expectedState || state !== expectedState) {
    res.status(400).json({ error: "Invalid OAuth state" });
    return;
  }

  try {
    const oauth2Client = buildOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    if (!tokens.refresh_token) {
      // Cleanup even on failure so a retry starts fresh.
      delete req.session.googleOauthState;
      delete req.session.googleOauthMemberId;
      delete req.session.googleOauthReturnTo;
      req.session.save(() => {
        const sep = returnTo.includes("?") ? "&" : "?";
        res.redirect(`${frontendUrl}${returnTo}${sep}google=norefresh`);
      });
      return;
    }

    const me = await google.oauth2({ version: "v2", auth: oauth2Client }).userinfo.get();
    const accountEmail = me.data.email;
    if (!accountEmail) {
      res.redirect(`${frontendUrl}/clubpm?google=user_failed`);
      return;
    }

    const encryptedRefreshToken = encryptSecret(tokens.refresh_token);
    if (!encryptedRefreshToken) {
      res.redirect(`${frontendUrl}/clubpm?google=token_failed`);
      return;
    }

    await prisma.googleDriveCredential.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        refreshToken: encryptedRefreshToken,
        accountEmail,
        scope: tokens.scope ?? DRIVE_SCOPES.join(" "),
        connectedById: memberId,
      },
      update: {
        refreshToken: encryptedRefreshToken,
        accountEmail,
        scope: tokens.scope ?? DRIVE_SCOPES.join(" "),
        connectedById: memberId,
      },
    });

    // Cleanup
    delete req.session.googleOauthState;
    delete req.session.googleOauthMemberId;
    delete req.session.googleOauthReturnTo;

    req.session.save(() => {
      const sep = returnTo.includes("?") ? "&" : "?";
      res.redirect(`${frontendUrl}${returnTo}${sep}google=connected`);
    });
  } catch (err) {
    console.error("[google-auth] callback error:", err);
    res.status(500).json({ error: "Google OAuth failed" });
  }
});

// ── DELETE /auth/google — disconnect (admin-only) ──────────────

googleAuthRouter.delete("/", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    await prisma.googleDriveCredential.deleteMany({ where: { id: "singleton" } });
    res.json({ ok: true });
  } catch (err) {
    console.error("[google-auth] disconnect error:", err);
    res.status(500).json({ error: "Failed to disconnect Google Drive" });
  }
});

// ── GET /auth/google/status — connection status ────────────────

googleAuthRouter.get("/status", requireAuth, async (_req: Request, res: Response) => {
  const cred = await prisma.googleDriveCredential.findUnique({ where: { id: "singleton" } });
  res.json({ connected: Boolean(cred), email: cred?.accountEmail ?? null });
});

// ── Session-data augmentation ───────────────────────────────────

declare module "express-session" {
  interface SessionData {
    googleOauthState?: string;
    googleOauthMemberId?: string;
    googleOauthReturnTo?: string;
  }
}
