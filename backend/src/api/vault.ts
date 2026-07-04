// Constellation Vault — core API (items, versions, checkout, promote, history).
// Change requests live in changeRequests.ts (Phase 6); BOM/3D/AI packs extend
// this router further. NO gamification here — never import rewardService or
// challengeService, never grant XP from vault code.

import fs from "node:fs";
import path from "node:path";
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
  getServiceAccountEmail,
} from "../services/driveService.js";
import {
  ensureVaultFolder,
  getVaultHealth,
  allocatePartNumber,
  sanitizeFileName,
  type VaultHealth,
} from "../services/vaultService.js";

export const vaultRouter = Router();
vaultRouter.use(requireAuth);

// ── Upload plumbing ──────────────────────────────────────────
// Vault files stream through a disk-backed temp dir (unlike blog.ts's
// in-memory image upload) since CAD files can be large; each handler unlinks
// its temp file in a `finally` block. A best-effort sweep on boot clears any
// orphans left behind by a crashed request.

const VAULT_TMP_DIR = "uploads/vault-tmp/";
fs.mkdirSync(VAULT_TMP_DIR, { recursive: true });

function sweepVaultTmpDir(): void {
  const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;
  let entries: string[];
  try {
    entries = fs.readdirSync(VAULT_TMP_DIR);
  } catch (err) {
    console.error("[vault] tmp sweep readdir error:", err);
    return;
  }
  for (const entry of entries) {
    const entryPath = path.join(VAULT_TMP_DIR, entry);
    try {
      if (fs.statSync(entryPath).mtimeMs < cutoffMs) fs.unlinkSync(entryPath);
    } catch (err) {
      console.error("[vault] tmp sweep unlink error:", err);
    }
  }
}
sweepVaultTmpDir();

const itemUpload = multer({
  storage: multer.diskStorage({ destination: VAULT_TMP_DIR }),
  limits: { fileSize: (Number(process.env.VAULT_MAX_UPLOAD_MB) || 512) * 1024 * 1024 },
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

    const member = await prisma.member.findUnique({ where: { id: req.memberId! }, select: { isAdmin: true } });
    const isCreatorOrAdmin = !!member?.isAdmin || item.createdById === req.memberId;
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
          if (err?.code === "P2002" && attempt === 0) continue; // versionNumber race — retry once
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

    const member = await prisma.member.findUnique({ where: { id: req.memberId! }, select: { isAdmin: true } });
    const isHolderOrAdmin = item.checkedOutById === req.memberId || !!member?.isAdmin;
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
    const updated = await prisma.vaultItem.update({ where: { id }, data: { partNumber } });

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
      where: { payload: { path: ["itemId"], equals: id } },
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
