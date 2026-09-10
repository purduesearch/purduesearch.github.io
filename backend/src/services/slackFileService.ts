import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { prisma } from "../db/prisma.js";
import {
  ensureClubPmRootFolder,
  createDriveFolder,
  uploadStreamToDrive,
  streamDriveFile,
} from "./driveService.js";

/**
 * Slack never announces expiry — on the free plan, history simply stops being
 * returned past ~90 days. So "about to expire" is age-based, and the 30-day
 * margin below is this design's entire tolerance for a cron outage, a Drive
 * quota error, or a revoked Drive credential. Copying early costs nothing:
 * they are the same bytes either way.
 */
export const MIRROR_CUTOFF_DAYS = 60;
export const MAX_MIRROR_ATTEMPTS = 3;

type Storage = "SLACK_ONLY" | "DRIVE" | "LOCAL" | "MIRROR_FAILED" | "UNAVAILABLE";
type MirrorOutcome = "drive" | "local" | "gone" | "error";

/** Pure: the storage state a mirror attempt lands in. */
export function nextStorageState(input: { outcome: MirrorOutcome; attempts: number }): Storage {
  switch (input.outcome) {
    case "drive": return "DRIVE";
    case "local": return "LOCAL";
    case "gone":  return "UNAVAILABLE";
    case "error": return input.attempts >= MAX_MIRROR_ATTEMPTS ? "MIRROR_FAILED" : "SLACK_ONLY";
  }
}

/**
 * Pure: where the proxy streams a file from.
 *
 * SlackFileStorage mixes locations with outcomes. MIRROR_FAILED maps to "slack"
 * because the mirror failing does not remove the file from Slack — it is still
 * servable until Slack expires it, at which point the proxy (or a later mirror
 * attempt) sees file_not_found and marks it UNAVAILABLE.
 */
export function streamSourceFor(storage: Storage): "slack" | "drive" | "disk" | "none" {
  if (storage === "DRIVE") return "drive";
  if (storage === "LOCAL") return "disk";
  if (storage === "UNAVAILABLE") return "none";
  return "slack"; // SLACK_ONLY and MIRROR_FAILED
}

const UPLOADS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "uploads");
const SLACK_UPLOADS = path.join(UPLOADS_DIR, "slack");

/**
 * Loaded lazily: importing bolt.ts constructs the Socket Mode app and registers
 * every Slack handler, which would drag the whole Slack graph into the pure
 * state-machine test and into projectChat.ts's import chain at boot.
 */
async function slackClient() {
  const { boltApp } = await import("../slack/bolt.js");
  return boltApp.client;
}

// ── Custom emoji cache ───────────────────────────────────────

let emojiCache: { map: Record<string, string>; at: number } | null = null;
const EMOJI_TTL_MS = 24 * 60 * 60_000;

export async function refreshCustomEmoji(): Promise<number> {
  try {
    const res = await (await slackClient()).emoji.list({});
    const map: Record<string, string> = {};
    for (const [name, url] of Object.entries(res.emoji ?? {})) {
      if (typeof url === "string" && url.startsWith("http")) map[name] = url;
    }
    emojiCache = { map, at: Date.now() };
    return Object.keys(map).length;
  } catch (err) {
    // missing_scope until the app is reinstalled with emoji:read. Custom emoji
    // then render as their :name: text, which is a degradation, not a failure.
    // Keep the last good map and restart the TTL, so a failing Slack call is
    // not retried on every chat read.
    console.warn("[slackFile] emoji.list failed:", (err as Error).message);
    emojiCache = { map: emojiCache?.map ?? {}, at: Date.now() };
    return 0;
  }
}

export async function getCustomEmoji(): Promise<Record<string, string>> {
  if (!emojiCache || Date.now() - emojiCache.at > EMOJI_TTL_MS) await refreshCustomEmoji();
  return emojiCache?.map ?? {};
}

// ── Slack fetch ──────────────────────────────────────────────

/** Fresh url_private at use time — a stored URL may have rotated. */
async function slackFileUrl(slackFileId: string): Promise<{ url: string; mimeType: string } | "gone"> {
  try {
    const info = await (await slackClient()).files.info({ file: slackFileId });
    const f = info.file as { url_private?: string; mimetype?: string } | undefined;
    if (!f?.url_private) return "gone";
    return { url: f.url_private, mimeType: f.mimetype ?? "application/octet-stream" };
  } catch (err) {
    const code = (err as { data?: { error?: string } }).data?.error;
    if (code === "file_not_found" || code === "file_deleted") return "gone";
    throw err;
  }
}

/** url_private requires the bot token in a header — a browser can never do this. */
async function fetchSlackFile(url: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
  });
  if (!res.ok || !res.body) throw new Error(`Slack file fetch failed: ${res.status}`);
  return res;
}

function webBodyToNode(res: Response): Readable {
  return Readable.fromWeb(res.body as never);
}

// ── Proxy resolution ─────────────────────────────────────────

export type ResolvedFile =
  | { ok: true; stream: Readable; mimeType: string; fileName: string }
  | { ok: false; status: 404 | 410 | 502; detail: string };

export async function resolveFileStream(slackFileId: string): Promise<ResolvedFile> {
  const row = await prisma.slackMessageFile.findUnique({ where: { slackFileId } });
  if (!row) return { ok: false, status: 404, detail: "unknown file" };

  const source = streamSourceFor(row.storage as Storage);
  const mimeType = row.mimeType ?? "application/octet-stream";

  if (source === "none") {
    return { ok: false, status: 410, detail: "This file expired in Slack before it could be archived" };
  }

  if (source === "drive" && row.driveFileId) {
    const result = await streamDriveFile(row.driveFileId);
    if (!result.ok) return { ok: false, status: 502, detail: result.detail ?? result.reason };
    return { ok: true, stream: result.stream, mimeType: result.mimeType, fileName: row.name };
  }

  if (source === "disk" && row.localPath) {
    const abs = path.join(SLACK_UPLOADS, row.localPath);
    if (!fs.existsSync(abs)) return { ok: false, status: 410, detail: "mirrored copy is missing" };
    return { ok: true, stream: fs.createReadStream(abs), mimeType, fileName: row.name };
  }

  const url = await slackFileUrl(slackFileId);
  if (url === "gone") {
    await prisma.slackMessageFile.update({
      where: { slackFileId },
      data: { storage: "UNAVAILABLE" },
    });
    return { ok: false, status: 410, detail: "This file expired in Slack before it could be archived" };
  }
  const res = await fetchSlackFile(url.url);
  return { ok: true, stream: webBodyToNode(res), mimeType: url.mimeType, fileName: row.name };
}

// ── Mirroring ────────────────────────────────────────────────

/**
 * Per-channel folder directly under the ClubPM root, named for the channel.
 * Per-CHANNEL rather than per-project because a channel can belong to several
 * projects — a per-project layout would have to pick one arbitrarily.
 */
async function ensureChannelDriveFolder(slackChannelId: string): Promise<string | null> {
  const archive = await prisma.slackChannelArchive.findUnique({
    where: { slackChannelId },
    select: { driveFolderId: true, slackChannelName: true },
  });
  if (archive?.driveFolderId) return archive.driveFolderId;

  const root = await ensureClubPmRootFolder();
  if (!root) return null;

  const name = `Slack Archive — #${archive?.slackChannelName ?? slackChannelId}`;
  const created = await createDriveFolder(name, root);
  if (!created.ok) return null;

  await prisma.slackChannelArchive.update({
    where: { slackChannelId },
    data: { driveFolderId: created.value.id },
  });
  return created.value.id;
}

async function mirrorToDisk(slackChannelId: string, slackFileId: string, name: string, body: Response): Promise<string> {
  const dir = path.join(SLACK_UPLOADS, slackChannelId);
  fs.mkdirSync(dir, { recursive: true });
  const safe = `${slackFileId}-${name.replace(/[^\w.\-]/g, "_")}`;
  const abs = path.join(dir, safe);
  await pipeline(webBodyToNode(body), fs.createWriteStream(abs));
  return path.join(slackChannelId, safe);
}

/** Copy one file out of Slack. Idempotent: an already-mirrored row is a no-op. */
export async function mirrorFile(slackFileId: string): Promise<Storage> {
  const row = await prisma.slackMessageFile.findUnique({
    where: { slackFileId },
    include: { message: { select: { slackChannelId: true } } },
  });
  if (!row) return "UNAVAILABLE";
  if (row.storage === "DRIVE" || row.storage === "LOCAL" || row.storage === "UNAVAILABLE") {
    return row.storage as Storage;
  }

  const attempts = row.mirrorAttempts + 1;
  const channelId = row.message.slackChannelId;

  try {
    const url = await slackFileUrl(slackFileId);
    if (url === "gone") {
      const storage = nextStorageState({ outcome: "gone", attempts });
      await prisma.slackMessageFile.update({
        where: { slackFileId },
        data: { storage, mirrorAttempts: attempts, mirrorError: "file_not_found in Slack" },
      });
      return storage;
    }

    const folderId = await ensureChannelDriveFolder(channelId);

    if (folderId) {
      const res = await fetchSlackFile(url.url);
      const uploaded = await uploadStreamToDrive(webBodyToNode(res), url.mimeType, row.name, folderId);
      if (uploaded) {
        await prisma.slackMessageFile.update({
          where: { slackFileId },
          data: {
            storage: nextStorageState({ outcome: "drive", attempts }),
            driveFileId: uploaded.fileId,
            mirroredAt: new Date(),
            mirrorAttempts: attempts,
            mirrorError: null,
          },
        });
        return "DRIVE";
      }
    }

    // Drive unavailable (no credential, or the upload returned null). Falling
    // back to disk matters: every driveService call returns null on error rather
    // than throwing, so without this the sweep would no-op SILENTLY and files
    // would die at day 90 with nothing in the logs saying why.
    const res = await fetchSlackFile(url.url);
    const localPath = await mirrorToDisk(channelId, slackFileId, row.name, res);
    await prisma.slackMessageFile.update({
      where: { slackFileId },
      data: {
        storage: nextStorageState({ outcome: "local", attempts }),
        localPath,
        mirroredAt: new Date(),
        mirrorAttempts: attempts,
        mirrorError: folderId ? "Drive upload returned null" : "no Drive account connected",
      },
    });
    return "LOCAL";
  } catch (err) {
    const storage = nextStorageState({ outcome: "error", attempts });
    await prisma.slackMessageFile.update({
      where: { slackFileId },
      data: { storage, mirrorAttempts: attempts, mirrorError: (err as Error).message.slice(0, 500) },
    });
    return storage;
  }
}

export async function sweepExpiringFiles(
  cutoffDays = MIRROR_CUTOFF_DAYS,
  batchSize = 200
): Promise<{ swept: number; drive: number; local: number; failed: number; unavailable: number }> {
  const cutoff = new Date(Date.now() - cutoffDays * 86_400_000);
  const due = await prisma.slackMessageFile.findMany({
    where: { storage: "SLACK_ONLY", postedAt: { lt: cutoff } },
    orderBy: { postedAt: "asc" },
    take: batchSize,
    select: { slackFileId: true },
  });

  const tally = { swept: 0, drive: 0, local: 0, failed: 0, unavailable: 0 };
  for (const f of due) {
    const result = await mirrorFile(f.slackFileId);
    tally.swept++;
    if (result === "DRIVE") tally.drive++;
    else if (result === "LOCAL") tally.local++;
    else if (result === "UNAVAILABLE") tally.unavailable++;
    else tally.failed++;
  }
  return tally;
}

export async function getStorageHealth(): Promise<{ counts: Record<string, number>; driveConnected: boolean }> {
  const grouped = await prisma.slackMessageFile.groupBy({ by: ["storage"], _count: { _all: true } });
  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.storage] = g._count._all;
  const cred = await prisma.googleDriveCredential.findUnique({ where: { id: "singleton" } });
  return { counts, driveConnected: !!cred };
}
