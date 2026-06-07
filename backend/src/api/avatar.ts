// Avatar API — get/save config, extract features from an uploaded photo via
// Gemini, and accept a portrait PNG snapshot from the editor.

import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { requireAuth } from "./auth.js";
import {
  extractFeaturesFromImage,
  getAvatarConfig,
  saveAvatarConfig,
  saveAvatarPortrait,
} from "../services/avatarService.js";

export const avatarRouter = Router();
avatarRouter.use(requireAuth);

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_ROOT  = path.resolve(__dirname, "..", "..", "uploads");
const PORTRAITS_DIR = path.join(UPLOADS_ROOT, "portraits");

// In-memory upload (PNGs cap at ~2MB after toBlob; we write to disk in the
// handler so we can compute the filename from memberId + revision).
const portraitUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === "image/png");
  },
});

// ── GET /api/avatar/config ───────────────────────────────────

avatarRouter.get("/config", async (req: Request, res: Response) => {
  try {
    const cfg = await getAvatarConfig(req.memberId!);
    res.json(cfg);
  } catch (err: any) {
    console.error("Get avatar config error:", err);
    res.status(500).json({ error: err.message ?? "Failed to load avatar" });
  }
});

// ── PUT /api/avatar/config ───────────────────────────────────
// Body: { featureJson, equippedCosmetics }

avatarRouter.put("/config", async (req: Request, res: Response) => {
  try {
    const { featureJson, equippedCosmetics } = req.body as {
      featureJson: any;
      equippedCosmetics: any;
    };
    const cfg = await saveAvatarConfig(req.memberId!, featureJson, equippedCosmetics);
    res.json(cfg);
  } catch (err: any) {
    console.error("Save avatar config error:", err);
    res.status(500).json({ error: err.message ?? "Failed to save avatar" });
  }
});

// ── POST /api/avatar/portrait ────────────────────────────────
// Multipart upload with field name `portrait` (image/png). Writes the file
// to uploads/portraits/<memberId>-<rev>.png, updates AvatarConfig.portraitUrl,
// returns the URL. Old portrait for the same member is removed on overwrite
// to avoid disk growth.

avatarRouter.post(
  "/portrait",
  portraitUpload.single("portrait"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "portrait file (image/png) required" });
        return;
      }
      await fs.mkdir(PORTRAITS_DIR, { recursive: true });

      const memberId = req.memberId!;
      const rev      = Date.now();
      const filename = `${memberId}-${rev}.png`;
      const filepath = path.join(PORTRAITS_DIR, filename);
      await fs.writeFile(filepath, req.file.buffer);

      // Delete any older portraits for this member.
      try {
        const entries = await fs.readdir(PORTRAITS_DIR);
        await Promise.all(
          entries
            .filter((e) => e.startsWith(`${memberId}-`) && e !== filename)
            .map((e) => fs.unlink(path.join(PORTRAITS_DIR, e)).catch(() => {}))
        );
      } catch { /* directory missing on first run — already handled above */ }

      const url = `/uploads/portraits/${filename}`;
      const cfg = await saveAvatarPortrait(memberId, url);
      res.json({ url, updatedAt: cfg.updatedAt });
    } catch (err: any) {
      console.error("Save avatar portrait error:", err);
      res.status(500).json({ error: err.message ?? "Failed to save portrait" });
    }
  }
);

// ── POST /api/avatar/extract-features ────────────────────────
// Body: { imageBase64: string, mimeType?: "image/png"|"image/jpeg"|"image/webp" }

avatarRouter.post("/extract-features", async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType } = req.body as { imageBase64: string; mimeType?: string };
    if (!imageBase64) {
      res.status(400).json({ error: "imageBase64 required" });
      return;
    }
    // Strip "data:image/...;base64," prefix if present
    const stripped = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
    const allowed: Record<string, "image/png"|"image/jpeg"|"image/webp"> = {
      "image/png":  "image/png",
      "image/jpeg": "image/jpeg",
      "image/webp": "image/webp",
    };
    const mt = mimeType && allowed[mimeType] ? allowed[mimeType] : "image/jpeg";

    const features = await extractFeaturesFromImage(stripped, mt);
    if (!features) {
      res.status(502).json({ error: "Gemini extraction failed" });
      return;
    }
    res.json(features);
  } catch (err: any) {
    console.error("Extract avatar features error:", err);
    res.status(500).json({ error: err.message ?? "Extraction failed" });
  }
});
