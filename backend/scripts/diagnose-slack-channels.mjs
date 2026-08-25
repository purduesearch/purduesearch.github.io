// Read-only diagnostic for the "Linked Slack channel" picker being empty.
//
// Why this exists: GET /api/slack/channels reads the Slack *user* OAuth token
// from `req.session.slackAccessToken` — the one place in the API that depends on
// the express-session cookie instead of `req.memberId`. Every Bearer-token
// client (Brave/Safari, or anyone whose 7-day session row has expired while the
// Bearer token kept being re-issued) therefore gets a 401, which the frontend
// swallows with `.catch(() => {})` — an empty dropdown and no error anywhere.
//
// This script proves which layer is failing, without printing any token:
//   1. env + bot token sanity
//   2. session store: how many live sessions still carry a Slack user token
//   3. whether a stored user token still works and has the needed scopes
//   4. what each project currently has linked
//
// Run from the backend dir so dotenv finds .env:
//   cd /opt/clubpm/backend && node scripts/diagnose-slack-channels.mjs
import "dotenv/config";
import { WebClient } from "@slack/web-api";
import { prisma } from "../dist/db/prisma.js";

const errInfo = (e) => `${e?.data?.error ?? e?.message ?? e}`;

async function main() {
  console.log("\n=== Slack channel-picker diagnostic (read-only) ===");

  // ── 1. Environment ─────────────────────────────────────────
  console.log("\n[1] Environment");
  for (const k of [
    "SLACK_BOT_TOKEN",
    "SLACK_CLIENT_ID",
    "SLACK_CLIENT_SECRET",
    "SLACK_TEAM_ID",
    "FRONTEND_URL",
    "BACKEND_URL",
    "NODE_ENV",
  ]) {
    const v = process.env[k];
    const shown = k === "FRONTEND_URL" || k === "BACKEND_URL" || k === "NODE_ENV" || k === "SLACK_TEAM_ID";
    console.log(`  ${k.padEnd(22)} ${v ? (shown ? v : "SET") : "UNSET"}`);
  }

  // ── 2. Bot token ───────────────────────────────────────────
  console.log("\n[2] Bot token");
  let botUserId = null;
  if (!process.env.SLACK_BOT_TOKEN) {
    console.log("  !! SLACK_BOT_TOKEN unset — nothing else will work");
  } else {
    const bot = new WebClient(process.env.SLACK_BOT_TOKEN);
    try {
      const me = await bot.auth.test();
      botUserId = me.user_id ?? null;
      console.log(`  auth.test OK: bot=${me.user} (${me.user_id}) team=${me.team} (${me.team_id})`);
    } catch (e) {
      console.log(`  !! auth.test FAILED: ${errInfo(e)}`);
    }
    if (botUserId) {
      try {
        const r = await bot.users.conversations({
          user: botUserId,
          types: "public_channel,private_channel",
          exclude_archived: true,
          limit: 200,
        });
        console.log(`  bot is a member of ${(r.channels ?? []).length} channel(s) (first page)`);
      } catch (e) {
        console.log(`  !! bot users.conversations FAILED: ${errInfo(e)}`);
      }
    }
  }

  // ── 3. Session store ───────────────────────────────────────
  // This is the layer the picker actually depends on.
  console.log("\n[3] express-session store (connect-pg-simple table \"session\")");
  let sessions = [];
  try {
    sessions = await prisma.$queryRawUnsafe(`
      SELECT sid,
             expire,
             expire > NOW()                          AS live,
             (sess->>'memberId')                     AS member_id,
             (sess->>'slackAccessToken') IS NOT NULL AS has_slack_token
      FROM "session"
      ORDER BY expire DESC
    `);
  } catch (e) {
    console.log(`  !! could not read the session table: ${errInfo(e)}`);
  }

  const live = sessions.filter((s) => s.live);
  const liveWithMember = live.filter((s) => s.member_id);
  const liveWithToken = live.filter((s) => s.has_slack_token);
  console.log(`  total rows:                    ${sessions.length}`);
  console.log(`  live (not expired):            ${live.length}`);
  console.log(`  live AND logged in:            ${liveWithMember.length}`);
  console.log(`  live AND carry a Slack token:  ${liveWithToken.length}   <-- picker works only for these`);
  if (sessions.length) {
    console.log(`  newest expire: ${sessions[0].expire?.toISOString?.() ?? sessions[0].expire}`);
    console.log(`  oldest expire: ${sessions[sessions.length - 1].expire?.toISOString?.() ?? sessions[sessions.length - 1].expire}`);
  }

  const memberCount = await prisma.member.count();
  console.log(`  members in DB:                 ${memberCount}`);
  if (liveWithToken.length === 0) {
    console.log("  >> CONFIRMS the 401 path: no signed-in browser can produce a Slack user");
    console.log("     token, so GET /api/slack/channels returns 401 for everyone.");
  }

  // ── 4. Do stored user tokens still work / have the scopes? ──
  console.log("\n[4] Stored Slack user tokens (scope check)");
  if (liveWithToken.length === 0) {
    console.log("  (none to test — see [3])");
  } else {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT sid, sess->>'slackAccessToken' AS token, sess->>'memberId' AS member_id
      FROM "session"
      WHERE expire > NOW() AND sess->>'slackAccessToken' IS NOT NULL
      LIMIT 5
    `);
    for (const row of rows) {
      const label = `sid=${String(row.sid).slice(0, 8)}… member=${row.member_id ?? "?"}`;
      const uc = new WebClient(row.token);
      try {
        const me = await uc.auth.test();
        console.log(`  ${label}: auth.test OK as ${me.user} (${me.user_id})`);
      } catch (e) {
        console.log(`  ${label}: auth.test FAILED -> ${errInfo(e)}`);
        continue;
      }
      try {
        const r = await uc.users.conversations({
          types: "public_channel,private_channel",
          exclude_archived: true,
          limit: 200,
        });
        console.log(`  ${label}: users.conversations OK -> ${(r.channels ?? []).length} channel(s)`);
      } catch (e) {
        console.log(`  ${label}: users.conversations FAILED -> ${errInfo(e)}`);
        console.log("     (missing_scope here means the token predates channels:read/groups:read)");
      }
    }
  }

  // ── 5. What is linked today ────────────────────────────────
  console.log("\n[5] Projects and their linked channel");
  const projects = await prisma.project.findMany({
    select: { id: true, name: true, slackChannelId: true, slackChannelName: true },
    orderBy: { name: "asc" },
  });
  for (const p of projects) {
    console.log(
      `  • ${p.name.padEnd(28)} channelId=${p.slackChannelId ?? "null"}  name=${p.slackChannelName ?? "null"}`
    );
  }
  const linked = projects.filter((p) => p.slackChannelId).length;
  console.log(`  ${linked}/${projects.length} project(s) have a channel linked`);

  // ── 6. Recent 500s from the route (vs. silent 401s) ────────
  console.log("\n[6] Interpreting the result");
  console.log("  - If [3] shows 0 live sessions with a token: the route 401s and the");
  console.log("    dropdown is empty for everyone. Fix = persist the Slack user token");
  console.log("    per-member and read it via req.memberId (never req.session).");
  console.log("  - If [4] shows missing_scope: the granted user scopes are stale; users");
  console.log("    must re-run the OAuth flow to pick up channels:read/groups:read.");
  console.log("  - If both look healthy, grep the pm2 error log for");
  console.log("    \"List Slack channels error\" to see the real Slack API failure.");
}

main()
  .catch((e) => {
    console.error("diagnostic crashed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
    console.log("\n=== done ===");
  });
