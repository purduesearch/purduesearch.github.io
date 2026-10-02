import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import { normalizeShareUrl, photoThumbUrl, assetNameForPhoto, cleanPhotoIds } from "../services/photoAlbumCore.js";
import { PhotoAlbumError, loadAlbum, forgetAlbum, importAlbumPhotos } from "../services/photoAlbumService.js";

// Club-wide Google Photos albums, added by share link. Any member can add an
// album and pick from every album; only whoever added one (or an admin) can
// remove it. See services/photoAlbumService.ts for how albums are read.

export const photoAlbumsRouter = Router();
photoAlbumsRouter.use(requireAuth);

const ADDED_BY = { select: { id: true, displayName: true, avatarUrl: true } } as const;

function sendError(res: Response, err: unknown, label: string): void {
  if (err instanceof PhotoAlbumError) {
    const status = { INVALID_LINK: 400, NOT_PUBLIC: 422, NOT_FOUND: 404, UNREADABLE: 502, STORE_FAILED: 503 }[err.code];
    res.status(status).json({ error: err.message, code: err.code });
    return;
  }
  console.error(`[photo-albums] ${label}:`, err);
  res.status(500).json({ error: "Photo album request failed" });
}

// Cover thumbnail sized server-side, like photo thumbnails, so the browser never builds Google URLs.
function albumView<T extends { coverUrl: string | null }>(row: T) {
  return { ...row, coverThumbUrl: row.coverUrl ? photoThumbUrl(row.coverUrl, 400) : null };
}

async function isAdmin(memberId: string): Promise<boolean> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } });
  return Boolean(m?.isAdmin);
}

photoAlbumsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const [albums, admin] = await Promise.all([
      prisma.photoAlbum.findMany({ orderBy: { createdAt: "desc" }, include: { addedBy: ADDED_BY } }),
      isAdmin(req.memberId!),
    ]);
    res.json(albums.map((a) => ({ ...albumView(a), canRemove: admin || a.addedById === req.memberId })));
  } catch (err) {
    sendError(res, err, "list");
  }
});

// Reads the album before saving it, so a private or mistyped link fails here
// with a useful message instead of later in the picker.
photoAlbumsRouter.post("/", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { url?: unknown; title?: unknown };
  const link = normalizeShareUrl(body.url);
  if (!link.ok) {
    res.status(400).json({ error: link.reason, code: "INVALID_LINK" });
    return;
  }
  const customTitle = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  try {
    const album = await loadAlbum(link.url, { fresh: true });
    const existing = await prisma.photoAlbum.findUnique({
      where: { googleAlbumId: album.googleAlbumId },
      include: { addedBy: ADDED_BY },
    });
    if (existing) {
      res.json({ ...albumView(existing), canRemove: existing.addedById === req.memberId || await isAdmin(req.memberId!), alreadyAdded: true });
      return;
    }
    const created = await prisma.photoAlbum.create({
      data: {
        googleAlbumId: album.googleAlbumId,
        shareUrl: link.url,
        title: customTitle || album.title || "Untitled album",
        coverUrl: album.coverUrl,
        photoCount: album.photos.length,
        lastSyncedAt: new Date(),
        addedById: req.memberId!,
      },
      include: { addedBy: ADDED_BY },
    });
    res.status(201).json({ ...albumView(created), canRemove: true });
  } catch (err) {
    sendError(res, err, "add");
  }
});

photoAlbumsRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const album = await prisma.photoAlbum.findUnique({ where: { id: req.params.id as string } });
    if (!album) {
      res.status(404).json({ error: "Album not found" });
      return;
    }
    if (album.addedById !== req.memberId && !(await isAdmin(req.memberId!))) {
      res.status(403).json({ error: "Only whoever added this album, or an admin, can remove it" });
      return;
    }
    await prisma.photoAlbum.delete({ where: { id: album.id } });
    forgetAlbum(album.shareUrl);
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err, "remove");
  }
});

// ?refresh=1 skips the short server cache (the picker's Refresh button).
photoAlbumsRouter.get("/:id/photos", async (req: Request, res: Response) => {
  try {
    const row = await prisma.photoAlbum.findUnique({ where: { id: req.params.id as string } });
    if (!row) {
      res.status(404).json({ error: "Album not found" });
      return;
    }
    const album = await loadAlbum(row.shareUrl, { fresh: req.query.refresh === "1" });
    const updated = await prisma.photoAlbum.update({
      where: { id: row.id },
      data: { photoCount: album.photos.length, coverUrl: album.coverUrl ?? row.coverUrl, lastSyncedAt: new Date() },
    });
    res.json({
      album: albumView(updated),
      truncated: album.truncated,
      photos: album.photos.map((p) => ({
        id: p.id,
        thumbUrl: photoThumbUrl(p.baseUrl),
        width: p.width,
        height: p.height,
        takenAt: p.takenAt,
        isVideo: p.isVideo,
      })),
    });
  } catch (err) {
    sendError(res, err, "photos");
  }
});

// target "blog" → just the stored image URLs. target "asset" → also an
// OutreachAsset (kind IMAGE) per photo, so they show up in the Asset Library.
photoAlbumsRouter.post("/:id/import", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { photoIds?: unknown; target?: unknown; tags?: unknown };
  const photoIds = cleanPhotoIds(body.photoIds);
  if (photoIds.length === 0) {
    res.status(400).json({ error: "Choose at least one photo" });
    return;
  }
  const target = body.target === "asset" ? "asset" : "blog";
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((t): t is string => typeof t === "string" && t.trim() !== "").map((t) => t.trim().slice(0, 40)).slice(0, 10)
    : [];
  try {
    const row = await prisma.photoAlbum.findUnique({ where: { id: req.params.id as string } });
    if (!row) {
      res.status(404).json({ error: "Album not found" });
      return;
    }
    const origin = `${req.protocol}://${req.get("host")}`;
    const result = await importAlbumPhotos(row.shareUrl, photoIds, origin);
    const images = result.images.map(({ url, width, height, photoId }) => ({ url, width, height, photoId }));

    let assets: unknown[] | undefined;
    if (target === "asset") {
      assets = [];
      for (const im of result.images) {
        assets.push(await prisma.outreachAsset.create({
          data: {
            name: assetNameForPhoto(row.title, im.takenAt),
            kind: "IMAGE",
            url: im.url,
            driveFileId: im.driveFileId,
            tags: [...new Set(["photo-album", ...tags])],
            uploadedById: req.memberId!,
          },
          include: { uploadedBy: ADDED_BY },
        }));
      }
    }
    res.json({ images, assets, missing: result.missing, failed: result.failed });
  } catch (err) {
    sendError(res, err, "import");
  }
});
