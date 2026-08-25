import type { Request } from "express";
import { prisma } from "../db/prisma.js";
import { encryptSecret, decryptSecret } from "../utils/crypto.js";

// The Slack *user* OAuth token (user_scope: channels:read, groups:read,
// channels:write.invites, …) used by /api/slack/* to see the channels the
// signed-in person is in and to invite the bot on their behalf.
//
// It used to live only in `req.session.slackAccessToken`. That broke in two
// independent ways, both of which produced an empty channel picker with no
// error surfaced anywhere:
//
//   1. Bearer-authenticated clients (Brave/Safari, and anything that blocks the
//      SameSite=None cookie) have no session at all — `requireAuth` accepts the
//      Bearer token and sets req.memberId, but req.session is empty.
//   2. The session row/cookie expires after 7 days and is never refreshed
//      (resave:false, no rolling), while GET /auth/me re-issues the Bearer token
//      on every auth check. So nobody is ever bounced back through Slack OAuth,
//      and every session silently ages out permanently.
//
// So the token is persisted on the Member row, encrypted, and read via
// req.memberId — the same convention every other handler follows.

/**
 * Persist a member's Slack user token. Never throws: a missing or bad
 * INTEGRATION_TOKEN_KEY must not be able to break the Slack sign-in flow.
 */
export async function storeSlackUserToken(
  memberId: string,
  token: string | null | undefined
): Promise<void> {
  if (!token) return;
  try {
    const encrypted = encryptSecret(token);
    if (!encrypted) return;
    await prisma.member.update({
      where: { id: memberId },
      data: { slackUserToken: encrypted, slackUserTokenAt: new Date() },
    });
  } catch (err) {
    console.warn(
      "[slackUserToken] could not persist Slack user token (is INTEGRATION_TOKEN_KEY set?):",
      err instanceof Error ? err.message : err
    );
  }
}

/** Forget a token Slack has told us is no longer valid, so the UI prompts a re-auth. */
export async function clearSlackUserToken(memberId: string): Promise<void> {
  try {
    await prisma.member.update({
      where: { id: memberId },
      data: { slackUserToken: null, slackUserTokenAt: null },
    });
  } catch {
    // Best effort — a failed clear just means we retry the dead token once more.
  }
}

/**
 * Precedence rule, extracted so it can be tested without a database.
 *
 * The persisted copy wins; the session is only a migration path for members
 * still holding a live pre-fix session, and when it is used the value is
 * backfilled so that member never has to re-authenticate.
 *
 * The load-bearing property: a caller with NO session must still resolve a
 * token whenever one is stored. That is exactly what was broken.
 */
export function pickTokenSource(
  stored: string | null,
  fromSession: string | null | undefined
): { token: string | null; backfill: boolean } {
  if (stored) return { token: stored, backfill: false };
  if (fromSession) return { token: fromSession, backfill: true };
  return { token: null, backfill: false };
}

/**
 * Resolve the signed-in member's Slack user token.
 *
 * Returns null when there is no usable token — callers must degrade rather than
 * fail, since every member predating this change starts out with none.
 */
export async function getSlackUserToken(req: Request): Promise<string | null> {
  const memberId = req.memberId;

  let stored: string | null = null;
  if (memberId) {
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { slackUserToken: true },
    });
    stored = decryptSecret(member?.slackUserToken);
  }

  const { token, backfill } = pickTokenSource(stored, req.session?.slackAccessToken);
  if (backfill && memberId && token) await storeSlackUserToken(memberId, token);
  return token;
}

/** Slack error codes that mean "this token is dead, ask the user to sign in again". */
const DEAD_TOKEN_CODES = new Set([
  "invalid_auth",
  "token_revoked",
  "token_expired",
  "account_inactive",
  "not_authed",
]);

export function isDeadTokenError(code: string | undefined): boolean {
  return !!code && DEAD_TOKEN_CODES.has(code);
}

/** Pull Slack's real error code out of a WebClient rejection. */
export function slackErrorCode(err: unknown): string {
  const e = err as { data?: { error?: string }; message?: string };
  return e?.data?.error ?? e?.message ?? "unknown_error";
}
