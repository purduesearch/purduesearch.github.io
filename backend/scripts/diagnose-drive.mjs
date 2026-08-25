// Read-only diagnostic for vault check-in failing with
//   POST /api/projects/:id/vault/items -> 400 "Could not create the item folder in Drive."
//
// Why this exists: every Drive failure mode collapses to `null` inside
// driveService.createDriveFolder (a bare catch that logs and returns null), and
// api/vault.ts turns that null into a hardcoded
//   { error: "Could not create the item folder in Drive.",
//     health: { status: "not-shared", ... } }
// So the client sees the same 400 whether the refresh token is dead, the bot was
// reconnected as a different Google account, the cached vaultFolderId points at a
// trashed folder, or Drive is out of storage. Worse, two upstream checks can't
// catch any of it:
//   - getVaultHealth() never calls Drive; it reports "ok" if a credential ROW exists.
//   - ensureVaultFolder() returns early with ZERO Drive calls when
//     Project.vaultFolderId is already set, so the very first Drive call of the
//     whole request is the one that fails.
//
// This walks each boundary in order and prints where it actually breaks. It never
// prints a token. Steps 1-6 are read-only; step 7 (opt-in) reproduces the exact
// failing call by creating and then deleting a scratch folder.
//
// Run from the backend dir so dotenv finds .env:
//   cd /opt/clubpm/backend && node scripts/diagnose-drive.mjs
//   cd /opt/clubpm/backend && DRIVE_WRITE_TEST=1 node scripts/diagnose-drive.mjs
import "dotenv/config";
import { google } from "googleapis";
import { prisma } from "../dist/db/prisma.js";
import { decryptSecret } from "../dist/utils/crypto.js";

// googleapis errors carry the useful part in different places depending on
// whether the failure was the token exchange or the API call itself.
function errInfo(e) {
  const status = e?.code ?? e?.status ?? e?.response?.status;
  const reason =
    e?.response?.data?.error?.errors?.[0]?.reason ??
    e?.response?.data?.error ??
    e?.errors?.[0]?.reason;
  const msg =
    e?.response?.data?.error?.message ??
    e?.response?.data?.error_description ??
    e?.message ??
    String(e);
  return `status=${status ?? "n/a"} reason=${
    typeof reason === "string" ? reason : JSON.stringify(reason) ?? "n/a"
  } msg=${msg}`;
}

const REQUIRED_SCOPE = "https://www.googleapis.com/auth/drive.file";

async function main() {
  console.log("\n=== Drive bot / vault check-in diagnostic ===");

  // ── 1. Environment ─────────────────────────────────────────
  console.log("\n[1] Environment");
  for (const k of [
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "GOOGLE_OAUTH_REDIRECT_URI",
    "INTEGRATION_TOKEN_KEY",
    "NODE_ENV",
  ]) {
    const v = process.env[k];
    const plain = k === "GOOGLE_OAUTH_REDIRECT_URI" || k === "NODE_ENV";
    console.log(`  ${k.padEnd(28)} ${v ? (plain ? v : "SET") : "UNSET"}`);
  }
  if (process.env.INTEGRATION_TOKEN_KEY && process.env.INTEGRATION_TOKEN_KEY.length !== 64) {
    console.log("  !! INTEGRATION_TOKEN_KEY is not 64 hex chars — decryptSecret will throw");
  }

  // ── 2. Stored bot credential ───────────────────────────────
  console.log("\n[2] GoogleDriveCredential row");
  const cred = await prisma.googleDriveCredential.findUnique({ where: { id: "singleton" } });
  if (!cred) {
    console.log("  !! NO ROW — no Drive bot account connected.");
    console.log("     Every vault check-in will 400. Fix: an admin visits /auth/google.");
    return;
  }
  console.log(`  accountEmail:  ${cred.accountEmail}`);
  console.log(`  connectedAt:   ${cred.connectedAt?.toISOString?.() ?? cred.connectedAt}`);
  console.log(`  updatedAt:     ${cred.updatedAt?.toISOString?.() ?? cred.updatedAt}`);
  console.log(`  scope:         ${cred.scope}`);
  if (!cred.scope?.includes(REQUIRED_SCOPE)) {
    console.log(`  !! granted scope does NOT include ${REQUIRED_SCOPE} — writes cannot work`);
  }
  const ageDays = (Date.now() - new Date(cred.updatedAt).getTime()) / 86400000;
  console.log(`  token age:     ${ageDays.toFixed(1)} days`);
  if (ageDays > 7) {
    console.log("     NOTE: if the OAuth consent screen is in \"Testing\" publishing status,");
    console.log("     Google expires refresh tokens after 7 days. Check step [4].");
  }

  // ── 3. Decryption (INTEGRATION_TOKEN_KEY intact?) ──────────
  console.log("\n[3] Refresh-token decryption");
  let refreshToken = null;
  try {
    refreshToken = decryptSecret(cred.refreshToken);
  } catch (e) {
    console.log(`  !! decryptSecret THREW: ${e?.message ?? e}`);
  }
  if (!refreshToken) {
    console.log("  !! decrypt returned null — INTEGRATION_TOKEN_KEY was rotated since the");
    console.log("     token was stored. getBotDrive() returns null, so EVERY Drive call fails.");
    console.log("     Fix: restore the old key, or reconnect at /auth/google.");
    return;
  }
  console.log(`  OK — decrypted (${refreshToken.length} chars, not printed)`);

  // ── 4. Token exchange — does Google still accept the refresh token? ──
  console.log("\n[4] Refresh -> access token exchange");
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  try {
    const { token } = await oauth2.getAccessToken();
    console.log(`  OK — Google issued an access token (${token ? "present" : "EMPTY"})`);
  } catch (e) {
    console.log(`  !! FAILED: ${errInfo(e)}`);
    console.log("     invalid_grant here = the refresh token is revoked or expired (7-day");
    console.log("     expiry applies while the OAuth app is in \"Testing\" publishing status),");
    console.log("     or the OAuth client id/secret was rotated.");
    console.log("     Fix: an admin reconnects at /auth/google (and set the consent screen");
    console.log("     to \"In production\" so tokens stop expiring).");
    return;
  }

  const drive = google.drive({ version: "v3", auth: oauth2 });

  // ── 5. Which account is this, and does it have room? ───────
  console.log("\n[5] Account identity + storage");
  try {
    const about = await drive.about.get({ fields: "user(emailAddress,displayName),storageQuota" });
    const user = about.data.user;
    const q = about.data.storageQuota ?? {};
    console.log(`  live account:  ${user?.emailAddress} (${user?.displayName})`);
    if (user?.emailAddress && user.emailAddress !== cred.accountEmail) {
      console.log(`  !! MISMATCH vs stored accountEmail (${cred.accountEmail})`);
    }
    const used = Number(q.usage ?? 0);
    const limit = q.limit != null ? Number(q.limit) : null;
    console.log(
      `  storage:       ${(used / 1e9).toFixed(2)} GB used` +
        (limit ? ` of ${(limit / 1e9).toFixed(2)} GB (${((used / limit) * 100).toFixed(1)}%)` : " (unlimited)")
    );
    if (limit && used >= limit) {
      console.log("  !! QUOTA FULL — files.create returns storageQuotaExceeded (403).");
    }
  } catch (e) {
    console.log(`  !! about.get FAILED: ${errInfo(e)}`);
  }

  // ── 6. Is each project's cached vaultFolderId still reachable? ──
  // This is the failure ensureVaultFolder cannot catch: it trusts the cached id
  // without a Drive call, so a folder that is trashed — or that belongs to a
  // DIFFERENT Google account than the one now connected (drive.file grants are
  // per app+user and do NOT transfer on reconnect) — surfaces only here.
  console.log("\n[6] Per-project vault folder reachability");
  const projects = await prisma.project.findMany({
    select: { id: true, name: true, vaultFolderId: true, driveLink: true },
    orderBy: { name: "asc" },
  });
  for (const p of projects) {
    const label = `  • ${(p.name ?? p.id).slice(0, 30).padEnd(30)}`;
    if (!p.vaultFolderId) {
      console.log(`${label} vaultFolderId=null (will be provisioned on first check-in)`);
      continue;
    }
    try {
      const meta = await drive.files.get({
        fileId: p.vaultFolderId,
        fields: "id,name,mimeType,trashed,ownedByMe,capabilities(canAddChildren)",
        supportsAllDrives: true,
      });
      const d = meta.data;
      const bad =
        d.trashed || d.capabilities?.canAddChildren === false
          ? "  <-- CANNOT ADD CHILDREN"
          : "";
      console.log(
        `${label} OK name="${d.name}" trashed=${d.trashed} ownedByMe=${d.ownedByMe} canAddChildren=${d.capabilities?.canAddChildren}${bad}`
      );
    } catch (e) {
      console.log(`${label} !! files.get FAILED: ${errInfo(e)}`);
      console.log("       404 here = this folder is invisible to the CURRENTLY connected");
      console.log("       account. Under drive.file the bot only sees what IT created, so a");
      console.log("       reconnect using a different Google account orphans the cached id.");
      console.log(`       Fix: clear it -> UPDATE "Project" SET "vaultFolderId"=NULL WHERE id='${p.id}';`);
    }
  }

  // ── 7. Reproduce the exact failing call (opt-in; creates then deletes) ──
  console.log("\n[7] Write test (createDriveFolder, the call that 400s)");
  if (process.env.DRIVE_WRITE_TEST !== "1") {
    console.log("  skipped — re-run with DRIVE_WRITE_TEST=1 to actually attempt a folder create");
  } else {
    const target = projects.find((p) => p.vaultFolderId);
    if (!target) {
      console.log("  no project has a vaultFolderId yet — nothing to test against");
    } else {
      console.log(`  target: ${target.name} (parent ${target.vaultFolderId})`);
      let createdId = null;
      try {
        const res = await drive.files.create({
          requestBody: {
            name: `__diagnostic ${new Date().toISOString()}`,
            mimeType: "application/vnd.google-apps.folder",
            parents: [target.vaultFolderId],
          },
          fields: "id",
          supportsAllDrives: true,
        });
        createdId = res.data.id ?? null;
        console.log(`  OK — folder created (${createdId}). Drive writes work.`);
        console.log("  >> If check-in still 400s, the failure is NOT in createDriveFolder;");
        console.log("     grep the pm2 error log for [driveService] uploadStreamToDrive error.");
      } catch (e) {
        console.log(`  !! REPRODUCED the failure: ${errInfo(e)}`);
        console.log("     This is the real error the 400 was hiding.");
      }
      if (createdId) {
        try {
          await drive.files.delete({ fileId: createdId, supportsAllDrives: true });
          console.log("  cleanup: scratch folder deleted");
        } catch (e) {
          console.log(`  cleanup FAILED (delete it by hand): ${errInfo(e)}`);
        }
      }
    }
  }

  console.log("\n[8] Reading this output");
  console.log("  [2] no row / [3] null      -> bot not connected or key rotated");
  console.log("  [4] invalid_grant          -> refresh token dead; reconnect /auth/google");
  console.log("  [5] account mismatch       -> reconnected as a different Google account");
  console.log("  [5] quota full             -> 403 storageQuotaExceeded on upload");
  console.log("  [6] 404 on a vaultFolderId -> stale cached id; NULL it and re-check-in");
  console.log("  [7] reproduces the error   -> that message is the true root cause");
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
