import sharp from "sharp";
import { uploadImageToDrive } from "./driveService.js";

export interface StoredImage {
  /** Proxied, publicly readable URL — /api/public/blog-image/:fileId on this backend. */
  url: string;
  width: number;
  height: number;
  driveFileId: string;
}

/**
 * Recompress an image to webp (max 1600px wide, animation preserved) and store
 * it on the bot's Drive. Shared by the blog upload route and the Google Photos
 * import so both produce identical image URLs. Returns null when Drive is
 * unavailable; throws when the bytes are not a decodable image.
 *
 * `origin` is the backend's public origin (`${req.protocol}://${req.get("host")}`).
 */
export async function storeBlogImage(input: Buffer, origin: string): Promise<StoredImage | null> {
  // `animated` decodes every frame (GIF/animated WebP) — sharp's default
  // reads only the first, which silently flattened uploaded GIFs.
  const { data, info } = await sharp(input, { animated: true })
    .rotate() // honor EXIF orientation before stripping metadata
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  const folderId =
    process.env.DRIVE_BLOG_IMAGES_FOLDER_ID ||
    process.env.DRIVE_AI_IMAGES_FOLDER_ID ||
    undefined;
  const filename = `blog-${Date.now()}.webp`;
  const uploaded = await uploadImageToDrive(data.toString("base64"), "image/webp", filename, folderId);
  if (!uploaded) return null;

  return {
    url: `${origin}/api/public/blog-image/${uploaded.fileId}`,
    width: info.width,
    // Animated output is a vertical strip of frames; pageHeight is one frame.
    height: info.pageHeight ?? info.height,
    driveFileId: uploaded.fileId,
  };
}
