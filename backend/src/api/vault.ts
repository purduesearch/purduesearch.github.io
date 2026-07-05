// Constellation Vault — core API (items, versions, checkout, promote, history).
// Change requests live in changeRequests.ts (Phase 6); BOM/3D/AI packs extend
// this router further. NO gamification here — never import rewardService or
// challengeService, never grant XP from vault code.

import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { requireAuth, requireAdmin } from "./auth.js";
import { prisma } from "../db/prisma.js";
import { logAuditEvent, diffObjects } from "../services/activityService.js";
import { createNotification } from "../services/notificationCrud.js";
import { queueDm } from "../services/dmBatcher.js";
import {
  createDriveFolder,
  uploadStreamToDrive,
  getDriveFileStream,
  renameDriveFile,
  deleteDriveFile,
  getServiceAccountEmail,
} from "../services/driveService.js";
import {
  ensureVaultFolder,
  getVaultHealth,
  allocatePartNumber,
  sanitizeFileName,
  wouldCreateBomCycle,
  isAdminMember,
  signVaultPath,
  verifyVaultSignature,
  type VaultHealth,
} from "../services/vaultService.js";
import { askVault, findDuplicateCandidates } from "../services/vaultContextService.js";

export const vaultRouter = Router();

// Binary GETs (downloads, thumbnails) are reachable from <img>/<a href>
// elements that can't carry the Authorization Bearer header cross-origin
// users depend on, so they alternatively accept a short-lived HMAC-signed
// URL (minted by the authenticated /download-url endpoint below). Everything
// else requires normal auth.
const SIGNED_BINARY_PATH = /^\/vault\/versions\/[^/]+\/(download|thumbnail)$/;

vaultRouter.use((req: Request, res: Response, next) => {
  if (req.method === "GET" && SIGNED_BINARY_PATH.test(req.path)) {
    const { exp, sig } = req.query as { exp?: string; sig?: string };
    if (typeof exp === "string" && typeof sig === "string" && verifyVaultSignature(req.path, Number(exp), sig)) {
      next();
      return;
    }
  }
  requireAuth(req, res, next);
});

// ── Upload plumbing ──────────────────────────────────────────
// Vault files stream through a disk-backed temp dir (unlike blog.ts's
// in-memory image upload) since CAD files can be large; each handler unlinks
// its temp file in a `finally` block. A best-effort sweep on boot clears any
// orphans left behind by a crashed request.

const VAULT_TMP_DIR = "uploads/vault-tmp/";
fs.mkdirSync(VAULT_TMP_DIR, { recursive: true });

/**
 * Remove temp upload files older than 24h. Async so it never blocks the
 * event loop; runs once at boot (fire-and-forget) and daily via the cron in
 * slack/scheduler.ts — a long-lived process would otherwise accumulate
 * orphans from crashed requests forever.
 */
export async function sweepVaultTmpDir(): Promise<void> {
  const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;
  let entries: string[];
  try {
    entries = await fs.promises.readdir(VAULT_TMP_DIR);
  } catch (err) {
    console.error("[vault] tmp sweep readdir error:", err);
    return;
  }
  for (const entry of entries) {
    const entryPath = path.join(VAULT_TMP_DIR, entry);
    try {
      const stat = await fs.promises.stat(entryPath);
      if (stat.mtimeMs < cutoffMs) await fs.promises.unlink(entryPath);
    } catch (err) {
      console.error("[vault] tmp sweep unlink error:", err);
    }
  }
}
sweepVaultTmpDir().catch((err) => console.error("[vault] boot tmp sweep error:", err));

const itemUpload = multer({
  storage: multer.diskStorage({ destination: VAULT_TMP_DIR }),
  limits: { fileSize: (Number(process.env.VAULT_MAX_UPLOAD_MB) || 512) * 1024 * 1024 },
});

// 3D-preview thumbnails (Pack A) are small, client-rendered PNG snapshots —
// in-memory is fine, unlike the disk-backed CAD file uploads above.
const thumbnailUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === "image/png");
  },
});

function cleanupTempFile(filePath?: string): void {
  if (!filePath) return;
  fs.unlink(filePath, (err) => {
    if (err) console.error("[vault] temp file cleanup error:", err);
  });
}

const MEMBER_SUMMARY = { select: { id: true, displayName: true, avatarUrl: true } } as const;

function healthErrorMessage(health: VaultHealth): string {
  switch (health.status) {
    case "no-link":
      return "This project has no linked Drive folder yet. Link one from the Files tab first.";
    case "not-folder":
      return "The linked Drive URL is not a folder link.";
    case "not-shared":
      return "The linked Drive folder is not shared with the service account.";
    default:
      return "Vault is not ready.";
  }
}

// ── GET /api/projects/:projectId/vault ────────────────────────
// Health (probe-only) + not-deleted items with latest version, checkout
// holder, part number and open CR count.

vaultRouter.get("/projects/:projectId/vault", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string;
    const health = await getVaultHealth(projectId);

    const items = await prisma.vaultItem.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      include: {
        versions: { orderBy: { versionNumber: "desc" }, take: 1 },
        checkedOutBy: MEMBER_SUMMARY,
        _count: { select: { crItems: { where: { changeRequest: { status: "OPEN" } } } } },
      },
    });

    res.json({
      health,
      items: items.map(({ versions, _count, ...item }) => ({
        ...item,
        latestVersion: versions[0] ?? null,
        openCrCount: _count.crItems,
      })),
    });
  } catch (error) {
    console.error("Get vault error:", error);
    res.status(500).json({ error: "Failed to load vault" });
  }
});

// ── POST /api/projects/:projectId/vault/items ─────────────────
// New item = new Drive subfolder + v1 check-in, in one go.

vaultRouter.post(
  "/projects/:projectId/vault/items",
  itemUpload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      if (!req.file) {
        res.status(400).json({ error: "file is required" });
        return;
      }

      const folder = await ensureVaultFolder(projectId);
      if ("error" in folder) {
        res.status(400).json({ error: healthErrorMessage(folder.error), health: folder.error });
        return;
      }

      const rawName = typeof req.body.name === "string" ? req.body.name.trim() : "";
      const originalBase = path.parse(req.file.originalname).name;
      const itemName = sanitizeFileName(rawName || originalBase) || "Untitled item";
      const sanitizedFile = sanitizeFileName(req.file.originalname) || "file";

      const itemFolder = await createDriveFolder(itemName, folder.folderId);
      if (!itemFolder) {
        res.status(400).json({
          error: "Could not create the item folder in Drive.",
          health: { status: "not-shared", serviceAccountEmail: getServiceAccountEmail() },
        });
        return;
      }

      const uploaded = await uploadStreamToDrive(
        fs.createReadStream(req.file.path),
        req.file.mimetype,
        `v1 — ${sanitizedFile}`,
        itemFolder.id
      );
      if (!uploaded) {
        res.status(502).json({ error: "Upload to Drive failed" });
        return;
      }

      const note = typeof req.body.note === "string" ? req.body.note.trim() || null : null;

      const { item, version } = await prisma.$transaction(async (tx) => {
        const item = await tx.vaultItem.create({
          data: {
            projectId,
            name: itemName,
            driveFolderId: itemFolder.id,
            createdById: req.memberId ?? null,
          },
        });
        const version = await tx.vaultVersion.create({
          data: {
            itemId: item.id,
            versionNumber: 1,
            driveFileId: uploaded.fileId,
            fileName: sanitizedFile,
            mimeType: req.file!.mimetype,
            sizeBytes: uploaded.size,
            checksumMd5: uploaded.md5,
            note,
            uploadedById: req.memberId ?? null,
          },
        });
        return { item, version };
      });

      logAuditEvent({
        projectId, memberId: req.memberId ?? null, source: "WEB",
        eventType: "VAULT_ITEM_CREATED",
        payload: { itemId: item.id, name: item.name },
      }).catch(console.error);
      logAuditEvent({
        projectId, memberId: req.memberId ?? null, source: "WEB",
        eventType: "VAULT_VERSION_CHECKED_IN",
        payload: { itemId: item.id, versionId: version.id, versionNumber: version.versionNumber, fileName: version.fileName },
      }).catch(console.error);

      res.status(201).json({ item, version });
    } catch (error) {
      console.error("Create vault item error:", error);
      res.status(500).json({ error: "Failed to create vault item" });
    } finally {
      cleanupTempFile(req.file?.path);
    }
  }
);

// ── GET /api/vault/items/:id ───────────────────────────────────

vaultRouter.get("/vault/items/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const item = await prisma.vaultItem.findUnique({
      where: { id },
      include: {
        versions: { orderBy: { versionNumber: "desc" }, include: { uploadedBy: MEMBER_SUMMARY } },
        checkedOutBy: MEMBER_SUMMARY,
        createdBy: MEMBER_SUMMARY,
        childLinks: { include: { child: { select: { id: true, name: true, partNumber: true } } } },
        parentLinks: { include: { parent: { select: { id: true, name: true, partNumber: true } } } },
        crItems: { include: { changeRequest: { select: { id: true, number: true, title: true, status: true } } } },
      },
    });
    if (!item || item.deletedAt) {
      res.status(404).json({ error: "Vault item not found" });
      return;
    }
    res.json(item);
  } catch (error) {
    console.error("Get vault item error:", error);
    res.status(500).json({ error: "Failed to get vault item" });
  }
});

// ── PATCH /api/vault/items/:id ─────────────────────────────────
// Whitelist name/description only; revision/partNumber/checkout fields are
// never client-writable here (revision only changes inside approveCr's tx).

vaultRouter.patch("/vault/items/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.vaultItem.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      res.status(404).json({ error: "Vault item not found" });
      return;
    }

    const { name, description } = req.body as { name?: string; description?: string | null };
    const data: { name?: string; description?: string | null } = {};
    if (typeof name === "string") {
      const trimmed = sanitizeFileName(name.trim());
      if (!trimmed) {
        res.status(400).json({ error: "name cannot be empty" });
        return;
      }
      data.name = trimmed;
    }
    if (description !== undefined) data.description = description;
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    const updated = await prisma.vaultItem.update({ where: { id }, data });

    if (data.name && data.name !== existing.name) {
      renameDriveFile(existing.driveFolderId, data.name).catch((err) =>
        console.error("[vault] rename drive folder error:", err)
      );
    }

    const changes = diffObjects(existing as any, updated as any, ["name", "description"]);
    logAuditEvent({
      projectId: existing.projectId, memberId: req.memberId ?? null, source: "WEB",
      eventType: "VAULT_ITEM_UPDATED",
      payload: { itemId: id, changes },
    }).catch(console.error);

    res.json(updated);
  } catch (error) {
    console.error("Update vault item error:", error);
    res.status(500).json({ error: "Failed to update vault item" });
  }
});

// ── DELETE /api/vault/items/:id ────────────────────────────────
// Creator-or-admin only. Blocked by an open CR reference or a live
// where-used link (this item is a component of another item's BOM).

vaultRouter.delete("/vault/items/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const item = await prisma.vaultItem.findUnique({
      where: { id },
      include: {
        crItems: { include: { changeRequest: { select: { status: true } } } },
        parentLinks: true,
      },
    });
    if (!item || item.deletedAt) {
      res.status(404).json({ error: "Vault item not found" });
      return;
    }

    const isCreatorOrAdmin = item.createdById === req.memberId || (await isAdminMember(req.memberId!));
    if (!isCreatorOrAdmin) {
      res.status(403).json({ error: "Only the creator or an admin can delete this item" });
      return;
    }

    if (item.crItems.some((ci) => ci.changeRequest.status === "OPEN")) {
      res.status(409).json({ error: "This item is referenced by an open change request" });
      return;
    }
    if (item.parentLinks.length > 0) {
      res.status(409).json({ error: "This item is used as a component in another item's BOM" });
      return;
    }

    await prisma.vaultItem.update({ where: { id }, data: { deletedAt: new Date() } });

    logAuditEvent({
      projectId: item.projectId, memberId: req.memberId ?? null, source: "WEB",
      eventType: "VAULT_ITEM_DELETED",
      payload: { itemId: id, name: item.name },
    }).catch(console.error);

    res.json({ ok: true });
  } catch (error) {
    console.error("Delete vault item error:", error);
    res.status(500).json({ error: "Failed to delete vault item" });
  }
});

// ── POST /api/vault/items/:id/versions ─────────────────────────
// New check-in. Auto-releases the caller's own checkout; if someone else
// holds it, checks in anyway and warns + notifies the holder (advisory lock).

vaultRouter.post(
  "/vault/items/:id/versions",
  itemUpload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!req.file) {
        res.status(400).json({ error: "file is required" });
        return;
      }

      const item = await prisma.vaultItem.findUnique({
        where: { id },
        include: { checkedOutBy: { select: { id: true, displayName: true, avatarUrl: true, slackId: true } } },
      });
      if (!item || item.deletedAt) {
        res.status(404).json({ error: "Vault item not found" });
        return;
      }

      const note = typeof req.body.note === "string" ? req.body.note.trim() || null : null;
      const sanitizedFile = sanitizeFileName(req.file.originalname) || "file";

      let version: Awaited<ReturnType<typeof prisma.vaultVersion.create>> | null = null;
      for (let attempt = 0; attempt < 2 && !version; attempt++) {
        const agg = await prisma.vaultVersion.aggregate({
          where: { itemId: id },
          _max: { versionNumber: true },
        });
        const versionNumber = (agg._max.versionNumber ?? 0) + 1;

        const uploaded = await uploadStreamToDrive(
          fs.createReadStream(req.file.path),
          req.file.mimetype,
          `v${versionNumber} — ${sanitizedFile}`,
          item.driveFolderId
        );
        if (!uploaded) {
          res.status(502).json({ error: "Upload to Drive failed" });
          return;
        }

        try {
          version = await prisma.vaultVersion.create({
            data: {
              itemId: id,
              versionNumber,
              driveFileId: uploaded.fileId,
              fileName: sanitizedFile,
              mimeType: req.file.mimetype,
              sizeBytes: uploaded.size,
              checksumMd5: uploaded.md5,
              note,
              uploadedById: req.memberId ?? null,
            },
          });
        } catch (err: any) {
          // The DB row failed, so this attempt's Drive upload is orphaned —
          // remove it (best-effort) before retrying or giving up.
          deleteDriveFile(uploaded.fileId).catch(console.error);
          if (err?.code === "P2002" && attempt === 0) continue; // versionNumber race — retry once
          if (err?.code === "P2002") {
            res.status(409).json({ error: "Could not allocate a version number — please retry" });
            return;
          }
          throw err;
        }
      }

      if (!version) {
        res.status(409).json({ error: "Could not allocate a version number — please retry" });
        return;
      }

      let warning: { checkedOutBy: { id: string; displayName: string; avatarUrl: string | null } } | null = null;

      if (item.checkedOutById === req.memberId && item.checkedOutById) {
        await prisma.vaultItem.update({
          where: { id },
          data: { checkedOutById: null, checkedOutAt: null, checkoutNote: null },
        });
        logAuditEvent({
          projectId: item.projectId, memberId: req.memberId ?? null, source: "WEB",
          eventType: "VAULT_CHECKOUT_RELEASED",
          payload: { itemId: id, reason: "auto-release on check-in" },
        }).catch(console.error);
      } else if (item.checkedOutById && item.checkedOutBy) {
        const holder = item.checkedOutBy;
        warning = { checkedOutBy: { id: holder.id, displayName: holder.displayName, avatarUrl: holder.avatarUrl } };
        const message = `A new version of "${item.name}" was checked in while you had it checked out.`;
        await createNotification({
          type: "VAULT_CHECKIN",
          recipientId: holder.id,
          actorId: req.memberId ?? undefined,
          projectId: item.projectId,
          message,
        });
        if (holder.slackId) queueDm(holder.slackId, message);
      }

      logAuditEvent({
        projectId: item.projectId, memberId: req.memberId ?? null, source: "WEB",
        eventType: "VAULT_VERSION_CHECKED_IN",
        payload: { itemId: id, versionId: version.id, versionNumber: version.versionNumber, fileName: version.fileName },
      }).catch(console.error);

      res.status(201).json(warning ? { version, warning } : { version });
    } catch (error) {
      console.error("Check in vault version error:", error);
      res.status(500).json({ error: "Failed to check in version" });
    } finally {
      cleanupTempFile(req.file?.path);
    }
  }
);

// ── GET /api/vault/versions/:id/download ───────────────────────
// Proxies the Drive file through the backend — vault files are never public.

vaultRouter.get("/vault/versions/:id/download", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const version = await prisma.vaultVersion.findUnique({ where: { id } });
    if (!version) {
      res.status(404).json({ error: "Version not found" });
      return;
    }

    const file = await getDriveFileStream(version.driveFileId);
    if (!file) {
      res.status(404).json({ error: "File not found in Drive" });
      return;
    }

    res.setHeader("Content-Disposition", `attachment; filename="${version.fileName.replace(/"/g, "")}"`);
    res.setHeader("Content-Type", file.mimeType);
    file.stream.on("error", (err) => {
      console.error("[vault] download stream error:", err);
      if (!res.headersSent) res.status(500).end();
    });
    file.stream.pipe(res);
  } catch (error) {
    console.error("Download vault version error:", error);
    res.status(500).json({ error: "Failed to download version" });
  }
});

// ── POST /api/vault/versions/:id/thumbnail ─────────────────────
// Client-rendered 3D-preview snapshot (Pack A). PNG only, 1MB cap; stored
// alongside the version's file in the item's Drive folder as thumb-v<n>.png.

vaultRouter.post(
  "/vault/versions/:id/thumbnail",
  // field name "file" matches clubPmClient's uploadVaultFile FormData key
  thumbnailUpload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "PNG thumbnail file is required" });
        return;
      }

      const id = req.params.id as string;
      const version = await prisma.vaultVersion.findUnique({
        where: { id },
        include: { item: { select: { driveFolderId: true, deletedAt: true } } },
      });
      if (!version || !version.item || version.item.deletedAt) {
        res.status(404).json({ error: "Version not found" });
        return;
      }

      const uploaded = await uploadStreamToDrive(
        Readable.from(req.file.buffer),
        "image/png",
        `thumb-v${version.versionNumber}.png`,
        version.item.driveFolderId
      );
      if (!uploaded) {
        res.status(502).json({ error: "Upload to Drive failed" });
        return;
      }

      const updated = await prisma.vaultVersion.update({
        where: { id },
        data: { thumbnailFileId: uploaded.fileId },
      });

      res.json(updated);
    } catch (error) {
      console.error("Upload vault thumbnail error:", error);
      res.status(500).json({ error: "Failed to upload thumbnail" });
    }
  }
);

// ── GET /api/vault/versions/:id/thumbnail ──────────────────────
// Proxies the thumbnail image through the backend (vault files are never
// public); private cache since access is auth-gated per request.

vaultRouter.get("/vault/versions/:id/thumbnail", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const version = await prisma.vaultVersion.findUnique({ where: { id } });
    if (!version || !version.thumbnailFileId) {
      res.status(404).json({ error: "No thumbnail for this version" });
      return;
    }

    const file = await getDriveFileStream(version.thumbnailFileId);
    if (!file) {
      res.status(404).json({ error: "Thumbnail not found in Drive" });
      return;
    }

    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("Content-Type", file.mimeType);
    file.stream.on("error", (err) => {
      console.error("[vault] thumbnail stream error:", err);
      if (!res.headersSent) res.status(500).end();
    });
    file.stream.pipe(res);
  } catch (error) {
    console.error("Get vault thumbnail error:", error);
    res.status(500).json({ error: "Failed to get thumbnail" });
  }
});

// ── GET /api/vault/versions/:id/download-url ───────────────────
// Mints a short-lived signed URL for the download/thumbnail proxies, so
// <a href>/<img> elements (which can't carry a Bearer header) still work for
// users whose cross-origin session cookie is blocked.

vaultRouter.get("/vault/versions/:id/download-url", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const version = await prisma.vaultVersion.findUnique({ where: { id }, select: { id: true } });
    if (!version) {
      res.status(404).json({ error: "Version not found" });
      return;
    }

    const downloadPath = `/vault/versions/${id}/download`;
    const { exp, sig } = signVaultPath(downloadPath);
    res.json({ url: `/api${downloadPath}?exp=${exp}&sig=${sig}`, expiresAt: exp });
  } catch (error) {
    console.error("Get vault download url error:", error);
    res.status(500).json({ error: "Failed to create download link" });
  }
});

// ── POST /api/vault/items/:id/checkout ─────────────────────────
// Advisory lock: free → take it; held by someone else → 409 unless
// { force: true }, which steals it and notifies + audits the previous holder.

vaultRouter.post("/vault/items/:id/checkout", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { note, force } = req.body as { note?: string; force?: boolean };

    const item = await prisma.vaultItem.findUnique({
      where: { id },
      include: { checkedOutBy: { select: { id: true, displayName: true, avatarUrl: true, slackId: true } } },
    });
    if (!item || item.deletedAt) {
      res.status(404).json({ error: "Vault item not found" });
      return;
    }

    const heldByOther = !!item.checkedOutById && item.checkedOutById !== req.memberId;
    if (heldByOther && !force) {
      res.status(409).json({ error: "Item is already checked out", holder: item.checkedOutBy });
      return;
    }

    const previousHolder = heldByOther ? item.checkedOutBy : null;

    const updated = await prisma.vaultItem.update({
      where: { id },
      data: {
        checkedOutById: req.memberId,
        checkedOutAt: new Date(),
        checkoutNote: typeof note === "string" ? note.trim() || null : null,
      },
      include: { checkedOutBy: MEMBER_SUMMARY },
    });

    if (previousHolder) {
      const message = `Your checkout of "${item.name}" was taken over by another member.`;
      await createNotification({
        type: "VAULT_CHECKIN",
        recipientId: previousHolder.id,
        actorId: req.memberId ?? undefined,
        projectId: item.projectId,
        message,
      });
      if (previousHolder.slackId) queueDm(previousHolder.slackId, message);
    }

    logAuditEvent({
      projectId: item.projectId, memberId: req.memberId ?? null, source: "WEB",
      eventType: "VAULT_ITEM_CHECKED_OUT",
      payload: { itemId: id, forced: !!previousHolder, previousHolderId: previousHolder?.id ?? null },
    }).catch(console.error);

    res.json(updated);
  } catch (error) {
    console.error("Checkout vault item error:", error);
    res.status(500).json({ error: "Failed to check out item" });
  }
});

// ── DELETE /api/vault/items/:id/checkout ───────────────────────
// Holder-or-admin only.

vaultRouter.delete("/vault/items/:id/checkout", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const item = await prisma.vaultItem.findUnique({ where: { id } });
    if (!item || item.deletedAt) {
      res.status(404).json({ error: "Vault item not found" });
      return;
    }
    if (!item.checkedOutById) {
      res.json(item);
      return;
    }

    const isHolderOrAdmin = item.checkedOutById === req.memberId || (await isAdminMember(req.memberId!));
    if (!isHolderOrAdmin) {
      res.status(403).json({ error: "Only the checkout holder or an admin can release this checkout" });
      return;
    }

    const previousHolderId = item.checkedOutById;
    const updated = await prisma.vaultItem.update({
      where: { id },
      data: { checkedOutById: null, checkedOutAt: null, checkoutNote: null },
    });

    logAuditEvent({
      projectId: item.projectId, memberId: req.memberId ?? null, source: "WEB",
      eventType: "VAULT_CHECKOUT_RELEASED",
      payload: { itemId: id, previousHolderId },
    }).catch(console.error);

    res.json(updated);
  } catch (error) {
    console.error("Release vault checkout error:", error);
    res.status(500).json({ error: "Failed to release checkout" });
  }
});

// ── POST /api/vault/items/:id/promote ──────────────────────────
// One-way: assigns the next part number for the project. 409 if already set.

vaultRouter.post("/vault/items/:id/promote", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const item = await prisma.vaultItem.findUnique({ where: { id } });
    if (!item || item.deletedAt) {
      res.status(404).json({ error: "Vault item not found" });
      return;
    }
    if (item.partNumber) {
      res.status(409).json({ error: "Item is already promoted to a part number" });
      return;
    }

    const partNumber = await allocatePartNumber(item.projectId);
    // Guarded write: only promote if still unpromoted, so a concurrent promote
    // can't be silently overwritten (last-write-wins would leave this caller's
    // response/audit reporting a part number that was never persisted).
    const { count } = await prisma.vaultItem.updateMany({
      where: { id, partNumber: null },
      data: { partNumber },
    });
    if (count === 0) {
      res.status(409).json({ error: "Item is already promoted to a part number" });
      return;
    }
    const updated = await prisma.vaultItem.findUnique({ where: { id } });

    logAuditEvent({
      projectId: item.projectId, memberId: req.memberId ?? null, source: "WEB",
      eventType: "VAULT_ITEM_PROMOTED",
      payload: { itemId: id, partNumber },
    }).catch(console.error);

    res.json(updated);
  } catch (error) {
    console.error("Promote vault item error:", error);
    res.status(500).json({ error: "Failed to promote item" });
  }
});

// ── PATCH /api/projects/:projectId/vault/settings ──────────────
// Admin-only. Changing the prefix never renumbers existing parts.

vaultRouter.patch(
  "/projects/:projectId/vault/settings",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const { partPrefix } = req.body as { partPrefix?: string };
      if (!partPrefix || !/^[A-Z0-9]{2,6}$/.test(partPrefix)) {
        res.status(400).json({ error: "partPrefix must be 2-6 uppercase letters/digits" });
        return;
      }

      const project = await prisma.project.update({
        where: { id: projectId },
        data: { vaultPartPrefix: partPrefix },
      });

      res.json({ vaultPartPrefix: project.vaultPartPrefix });
    } catch (error) {
      console.error("Update vault settings error:", error);
      res.status(500).json({ error: "Failed to update vault settings" });
    }
  }
);

// ── GET /api/vault/items/:id/history ───────────────────────────
// Same shape as GET /api/tasks/:id/history (getTaskAuditLog), scoped by
// payload.itemId instead of a taskId column.

vaultRouter.get("/vault/items/:id/history", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const logs = await prisma.activityLog.findMany({
      where: { vaultItemId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { member: MEMBER_SUMMARY },
    });

    res.json(
      logs.map((log) => ({
        id: log.id,
        actor: log.member,
        action: log.eventType.toLowerCase().replace(/_/g, " "),
        at: log.createdAt,
        metadata: log.payload,
      }))
    );
  } catch (error) {
    console.error("Get vault item history error:", error);
    res.status(500).json({ error: "Failed to get item history" });
  }
});

// ── POST /api/vault/items/:id/bom ──────────────────────────────
// Link a child item into this item's bill of materials (Pack C). Same
// project, no self-links, no cycles (walks the child's descendants).

vaultRouter.post("/vault/items/:id/bom", async (req: Request, res: Response) => {
  try {
    const parentId = req.params.id as string;
    const { childItemId, quantity, note } = req.body as {
      childItemId?: string;
      quantity?: number;
      note?: string;
    };

    if (!childItemId) {
      res.status(400).json({ error: "childItemId is required" });
      return;
    }
    if (childItemId === parentId) {
      res.status(400).json({ error: "An item can't be a component of itself" });
      return;
    }
    const qty = quantity === undefined ? 1 : Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      res.status(400).json({ error: "quantity must be a positive integer" });
      return;
    }

    const [parent, child] = await Promise.all([
      prisma.vaultItem.findUnique({ where: { id: parentId } }),
      prisma.vaultItem.findUnique({ where: { id: childItemId } }),
    ]);
    if (!parent || parent.deletedAt) {
      res.status(404).json({ error: "Vault item not found" });
      return;
    }
    if (!child || child.deletedAt || child.projectId !== parent.projectId) {
      res.status(400).json({ error: "childItemId must reference a live item in the same project" });
      return;
    }

    if (await wouldCreateBomCycle(parentId, childItemId)) {
      res.status(409).json({ error: "Linking this item would create a cycle in the BOM" });
      return;
    }

    // Create-only: a stale client re-adding an existing child must NOT
    // silently overwrite its quantity — quantity updates go through the
    // explicit PATCH route below.
    let edge;
    try {
      edge = await prisma.vaultBomEdge.create({
        data: {
          parentId,
          childId: childItemId,
          quantity: qty,
          note: typeof note === "string" ? note.trim() || null : null,
        },
        include: { child: { select: { id: true, name: true, partNumber: true, currentRevision: true } } },
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        res.status(409).json({ error: "That item is already in this BOM" });
        return;
      }
      throw err;
    }

    logAuditEvent({
      projectId: parent.projectId, memberId: req.memberId ?? null, source: "WEB",
      eventType: "VAULT_BOM_LINK_ADDED",
      payload: { itemId: parentId, childItemId, childName: child.name, quantity: qty },
    }).catch(console.error);

    res.status(201).json(edge);
  } catch (error) {
    console.error("Add BOM link error:", error);
    res.status(500).json({ error: "Failed to add BOM link" });
  }
});

// ── PATCH /api/vault/items/:id/bom/:childItemId ────────────────
// Explicit quantity/note update for an existing BOM edge (the qty stepper).
// Audited as VAULT_BOM_LINK_UPDATED so overwrites are distinguishable from
// fresh links in the history.

vaultRouter.patch("/vault/items/:id/bom/:childItemId", async (req: Request, res: Response) => {
  try {
    const parentId = req.params.id as string;
    const childItemId = req.params.childItemId as string;
    const { quantity, note } = req.body as { quantity?: number; note?: string | null };

    const parent = await prisma.vaultItem.findUnique({ where: { id: parentId } });
    if (!parent || parent.deletedAt) {
      res.status(404).json({ error: "Vault item not found" });
      return;
    }

    const data: { quantity?: number; note?: string | null } = {};
    if (quantity !== undefined) {
      const qty = Number(quantity);
      if (!Number.isInteger(qty) || qty < 1) {
        res.status(400).json({ error: "quantity must be a positive integer" });
        return;
      }
      data.quantity = qty;
    }
    if (note !== undefined) data.note = typeof note === "string" ? note.trim() || null : null;
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    let edge;
    try {
      edge = await prisma.vaultBomEdge.update({
        where: { parentId_childId: { parentId, childId: childItemId } },
        data,
        include: { child: { select: { id: true, name: true, partNumber: true, currentRevision: true } } },
      });
    } catch (err: any) {
      if (err?.code === "P2025") {
        res.status(404).json({ error: "BOM link not found" });
        return;
      }
      throw err;
    }

    logAuditEvent({
      projectId: parent.projectId, memberId: req.memberId ?? null, source: "WEB",
      eventType: "VAULT_BOM_LINK_UPDATED",
      payload: { itemId: parentId, childItemId, ...data },
    }).catch(console.error);

    res.json(edge);
  } catch (error) {
    console.error("Update BOM link error:", error);
    res.status(500).json({ error: "Failed to update BOM link" });
  }
});

// ── DELETE /api/vault/items/:id/bom/:childItemId ───────────────

vaultRouter.delete("/vault/items/:id/bom/:childItemId", async (req: Request, res: Response) => {
  try {
    const parentId = req.params.id as string;
    const childItemId = req.params.childItemId as string;

    const parent = await prisma.vaultItem.findUnique({ where: { id: parentId } });
    if (!parent || parent.deletedAt) {
      res.status(404).json({ error: "Vault item not found" });
      return;
    }

    try {
      await prisma.vaultBomEdge.delete({
        where: { parentId_childId: { parentId, childId: childItemId } },
      });
    } catch (err: any) {
      if (err?.code === "P2025") {
        res.status(404).json({ error: "BOM link not found" });
        return;
      }
      throw err;
    }

    logAuditEvent({
      projectId: parent.projectId, memberId: req.memberId ?? null, source: "WEB",
      eventType: "VAULT_BOM_LINK_REMOVED",
      payload: { itemId: parentId, childItemId },
    }).catch(console.error);

    res.json({ ok: true });
  } catch (error) {
    console.error("Remove BOM link error:", error);
    res.status(500).json({ error: "Failed to remove BOM link" });
  }
});

// ── GET /api/vault/items/:id/where-used ────────────────────────
// Parents (assemblies) that use this item as a component, with quantity.

vaultRouter.get("/vault/items/:id/where-used", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const item = await prisma.vaultItem.findUnique({ where: { id } });
    if (!item || item.deletedAt) {
      res.status(404).json({ error: "Vault item not found" });
      return;
    }

    const edges = await prisma.vaultBomEdge.findMany({
      where: { childId: id },
      include: { parent: { select: { id: true, name: true, partNumber: true, currentRevision: true, deletedAt: true } } },
    });

    res.json(
      edges
        .filter((e) => !e.parent.deletedAt)
        .map((e) => ({
          id: e.parent.id,
          name: e.parent.name,
          partNumber: e.parent.partNumber,
          currentRevision: e.parent.currentRevision,
          quantity: e.quantity,
          note: e.note,
        }))
    );
  } catch (error) {
    console.error("Get where-used error:", error);
    res.status(500).json({ error: "Failed to get where-used" });
  }
});

// ── POST /api/projects/:projectId/vault/ask ────────────────────
// AI copilot Q&A over the project's vault snapshot (Pack B).

vaultRouter.post("/projects/:projectId/vault/ask", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string;
    const { question } = req.body as { question?: string };
    if (!question || !question.trim()) {
      res.status(400).json({ error: "question is required" });
      return;
    }

    const answer = await askVault(projectId, question.trim());
    if (answer === null) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    res.json({ answer });
  } catch (error) {
    console.error("Vault ask error:", error);
    res.status(500).json({ error: "Failed to answer question" });
  }
});

// ── POST /api/projects/:projectId/vault/check-duplicates ───────
// Heuristic filename-token overlap + semantic metadata pass. Always a soft
// warning — never a claim about geometry.

vaultRouter.post("/projects/:projectId/vault/check-duplicates", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string;
    const { fileName, name } = req.body as { fileName?: string; name?: string };
    if (!fileName || !fileName.trim()) {
      res.status(400).json({ error: "fileName is required" });
      return;
    }

    const candidates = await findDuplicateCandidates(projectId, fileName.trim(), name ?? null);
    res.json({ candidates });
  } catch (error) {
    console.error("Vault check-duplicates error:", error);
    res.status(500).json({ error: "Failed to check for duplicates" });
  }
});
