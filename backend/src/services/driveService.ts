import { google } from "googleapis";
import { Readable } from "node:stream";
import { prisma } from "../db/prisma.js";
import { decryptSecret } from "../utils/crypto.js";

/**
 * Build a Drive client authenticated as the single OAuth "bot" account
 * (mirrors the per-member GitHub OAuth pattern). Both viewing and uploading
 * run as this account, so uploads are charged to a real, quota-bearing owner.
 * Returns null if no bot account has been connected yet (see googleAuth.ts),
 * so callers can degrade gracefully instead of throwing.
 */
async function getBotDrive() {
  const cred = await prisma.googleDriveCredential.findUnique({ where: { id: "singleton" } });
  const refreshToken = decryptSecret(cred?.refreshToken);
  if (!refreshToken) return null;
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: "v3", auth: oauth2 });
}

/**
 * Upload a base64-encoded image to Google Drive and make it publicly readable.
 * Returns the file ID and a direct-view URL, or null on error.
 */
export async function uploadImageToDrive(
  imageBase64: string,
  mimeType: string,
  filename: string,
  folderId?: string
): Promise<{ fileId: string; url: string } | null> {
  try {
    const drive = await getBotDrive();
    if (!drive) return null;

    const buffer   = Buffer.from(imageBase64, "base64");
    const readable = Readable.from(buffer);

    const meta: Record<string, unknown> = { name: filename };
    if (folderId) meta.parents = [folderId];

    const file = await drive.files.create({
      requestBody: meta,
      media:       { mimeType, body: readable },
      fields:      "id",
    });

    const fileId = file.data.id!;

    // Make the file publicly readable so it can be used as <img src>
    await drive.permissions.create({
      fileId,
      requestBody: { role: "reader", type: "anyone" },
    });

    const url = `https://drive.google.com/uc?export=view&id=${fileId}`;
    return { fileId, url };
  } catch (err) {
    console.error("[driveService] uploadImageToDrive error:", err);
    return null;
  }
}

/** Extract file ID from any Google Drive/Docs/Sheets/Slides URL. Returns null if not parseable. */
export function extractFileId(url: string): string | null {
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]{25,})/,
    /\/document\/d\/([a-zA-Z0-9_-]{25,})/,
    /\/spreadsheets\/d\/([a-zA-Z0-9_-]{25,})/,
    /\/presentation\/d\/([a-zA-Z0-9_-]{25,})/,
    /[?&]id=([a-zA-Z0-9_-]{25,})/,
    /\/folders\/([a-zA-Z0-9_-]{25,})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/** Export a Google Doc/Sheet/Slide/PDF as plain text. Returns text content or null on error. */
export async function fetchDriveFileAsText(fileId: string): Promise<{ text: string; name: string; mimeType: string } | null> {
  try {
    const drive = await getBotDrive();
    if (!drive) return null;

    const meta = await drive.files.get({ fileId, fields: "name,mimeType" });
    const mimeType = meta.data.mimeType ?? "";
    const name = meta.data.name ?? fileId;

    const EXPORT_MAP: Record<string, string> = {
      "application/vnd.google-apps.document":     "text/plain",
      "application/vnd.google-apps.spreadsheet":  "text/csv",
      "application/vnd.google-apps.presentation": "text/plain",
    };

    let text = "";

    if (EXPORT_MAP[mimeType]) {
      const res = await drive.files.export(
        { fileId, mimeType: EXPORT_MAP[mimeType] },
        { responseType: "text" }
      );
      text = res.data as string;
    } else if (mimeType === "application/pdf") {
      return { text: `__PDF__:${fileId}`, name, mimeType };
    } else {
      const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "text" });
      text = res.data as string;
    }

    return { text, name, mimeType };
  } catch (err) {
    console.error("[driveService] fetchDriveFileAsText error:", err);
    return null;
  }
}

export type DriveFolderFile = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  thumbnailLink?: string;
  iconLink?: string;
  modifiedTime?: string;
};

/** List files in a Drive folder (non-recursive, first 50). */
export async function listDriveFolderFiles(folderId: string): Promise<DriveFolderFile[]> {
  try {
    const drive = await getBotDrive();
    if (!drive) return [];
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "files(id,name,mimeType,webViewLink,thumbnailLink,iconLink,modifiedTime)",
      orderBy: "folder,name",
      pageSize: 50,
    });
    return (res.data.files ?? []) as DriveFolderFile[];
  } catch (err) {
    console.error("[driveService] listDriveFolderFiles error:", err);
    return [];
  }
}

/** Get metadata for a single Drive file/folder (lightweight). */
export async function getDriveFileMeta(fileId: string): Promise<{ id: string; name: string; mimeType: string; webViewLink?: string } | null> {
  try {
    const drive = await getBotDrive();
    if (!drive) return null;
    const res = await drive.files.get({ fileId, fields: "id,name,mimeType,webViewLink" });
    return res.data as any;
  } catch (err) {
    console.error("[driveService] getDriveFileMeta error:", err);
    return null;
  }
}

/** Download a file from Drive and return it as base64. */
export async function fetchDriveFileAsBase64(fileId: string): Promise<{ base64: string; name: string } | null> {
  try {
    const drive = await getBotDrive();
    if (!drive) return null;
    const meta = await drive.files.get({ fileId, fields: "name" });
    const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
    const base64 = Buffer.from(res.data as ArrayBuffer).toString("base64");
    return { base64, name: meta.data.name ?? fileId };
  } catch (err) {
    console.error("[driveService] fetchDriveFileAsBase64 error:", err);
    return null;
  }
}

/** Create a Drive folder. With no parentId it is created in the bot's own root. */
export async function createDriveFolder(
  name: string,
  parentId?: string
): Promise<{ id: string; webViewLink?: string } | null> {
  try {
    const drive = await getBotDrive();
    if (!drive) return null;
    const requestBody: Record<string, unknown> = {
      name,
      mimeType: "application/vnd.google-apps.folder",
    };
    if (parentId) requestBody.parents = [parentId];
    const res = await drive.files.create({
      requestBody,
      fields: "id,webViewLink",
      supportsAllDrives: true,
    });
    return { id: res.data.id!, webViewLink: res.data.webViewLink ?? undefined };
  } catch (err) {
    console.error("[driveService] createDriveFolder error:", err);
    return null;
  }
}

/** Share a Drive file/folder with anyone who has the link (default: view-only). */
export async function makeDriveFilePublic(
  fileId: string,
  role: "reader" | "writer" = "reader"
): Promise<boolean> {
  try {
    const drive = await getBotDrive();
    if (!drive) return false;
    await drive.permissions.create({
      fileId,
      requestBody: { role, type: "anyone" },
      supportsAllDrives: true,
    });
    return true;
  } catch (err) {
    console.error("[driveService] makeDriveFilePublic error:", err);
    return false;
  }
}

/**
 * Find (or lazily create) the bot-owned root folder that holds one subfolder
 * per ClubPM project. Under the drive.file scope the bot only sees folders it
 * created itself, so looking it up by name is safe. Returns null if no bot
 * account is connected.
 */
export async function ensureClubPmRootFolder(): Promise<string | null> {
  try {
    const drive = await getBotDrive();
    if (!drive) return null;
    const existing = await drive.files.list({
      q: "name='ClubPM Projects' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false",
      fields: "files(id)",
      pageSize: 1,
    });
    const found = existing.data.files?.[0]?.id;
    if (found) return found;
    const created = await drive.files.create({
      requestBody: { name: "ClubPM Projects", mimeType: "application/vnd.google-apps.folder" },
      fields: "id",
    });
    return created.data.id ?? null;
  } catch (err) {
    console.error("[driveService] ensureClubPmRootFolder error:", err);
    return null;
  }
}

/**
 * Upload a readable stream to Drive as a new file. The file is left private
 * (no permissions.create) — vault files are never made public.
 */
export async function uploadStreamToDrive(
  stream: NodeJS.ReadableStream,
  mimeType: string,
  filename: string,
  folderId: string
): Promise<{ fileId: string; size: number | null; md5: string | null; webViewLink?: string } | null> {
  try {
    const drive = await getBotDrive();
    if (!drive) return null;
    const res = await drive.files.create({
      requestBody: { name: filename, parents: [folderId] },
      media: { mimeType, body: stream },
      fields: "id,size,md5Checksum,webViewLink",
      supportsAllDrives: true,
    });
    return {
      fileId: res.data.id!,
      size: res.data.size != null ? Number(res.data.size) : null,
      md5: res.data.md5Checksum ?? null,
      webViewLink: res.data.webViewLink ?? undefined,
    };
  } catch (err) {
    console.error("[driveService] uploadStreamToDrive error:", err);
    return null;
  }
}

/** Stream a Drive file's contents back out (used to proxy vault downloads through the backend). */
export async function getDriveFileStream(
  fileId: string
): Promise<{ stream: NodeJS.ReadableStream; name: string; mimeType: string; size?: number } | null> {
  try {
    const drive = await getBotDrive();
    if (!drive) return null;
    const meta = await drive.files.get({
      fileId,
      fields: "name,mimeType,size",
      supportsAllDrives: true,
    });
    const res = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "stream" }
    );
    return {
      stream: res.data as unknown as NodeJS.ReadableStream,
      name: meta.data.name ?? fileId,
      mimeType: meta.data.mimeType ?? "application/octet-stream",
      size: meta.data.size != null ? Number(meta.data.size) : undefined,
    };
  } catch (err) {
    console.error("[driveService] getDriveFileStream error:", err);
    return null;
  }
}

/** Delete a Drive file (cleanup for orphaned uploads after a failed check-in). */
export async function deleteDriveFile(fileId: string): Promise<boolean> {
  try {
    const drive = await getBotDrive();
    if (!drive) return false;
    await drive.files.delete({ fileId, supportsAllDrives: true });
    return true;
  } catch (err) {
    console.error("[driveService] deleteDriveFile error:", err);
    return false;
  }
}

export type DriveStreamResult =
  | { ok: true; stream: Readable; mimeType: string }
  // "not-connected": no bot credential, or its refresh token won't decrypt
  //   (INTEGRATION_TOKEN_KEY changed) — nothing on Drive is reachable.
  // "unauthorized": the credential exists but Google rejected it (revoked or
  //   expired refresh token, or the OAuth client id/secret was rotated).
  // "not-found": Drive itself says this one file is gone.
  // "drive-error": anything else (Drive 5xx, network, a DB read that failed).
  | { ok: false; reason: "not-connected" | "unauthorized" | "not-found" | "drive-error"; detail?: string };

/**
 * Stream a Drive file's raw bytes (for the public image proxy).
 *
 * The reason is reported rather than collapsed into a bare null: a broken bot
 * credential takes out *every* blog image at once, and when that is served as
 * a plain 404 it is indistinguishable from a deleted file — which is exactly
 * what made a site-wide cover/carousel image outage hard to place.
 */
// Never throws: the caller is an Express 4 async route handler, where a
// rejected promise hangs the request instead of returning an error.
export async function streamDriveFile(fileId: string): Promise<DriveStreamResult> {
  try {
    const drive = await getBotDrive();
    if (!drive) {
      const cred = await prisma.googleDriveCredential.findUnique({ where: { id: "singleton" } });
      const detail = !cred
        ? "no Google Drive bot account is connected (visit /auth/google to connect one)"
        : "the stored refresh token could not be decrypted — check INTEGRATION_TOKEN_KEY";
      console.error("[driveService] streamDriveFile: Drive unavailable —", detail);
      return { ok: false, reason: "not-connected", detail };
    }
    const meta = await drive.files.get({ fileId, fields: "mimeType" });
    const resp = await drive.files.get({ fileId, alt: "media" }, { responseType: "stream" });
    return {
      ok: true,
      stream: resp.data as unknown as Readable,
      mimeType: meta.data.mimeType ?? "application/octet-stream",
    };
  } catch (err) {
    const status = (err as { code?: number; status?: number })?.code
      ?? (err as { response?: { status?: number } })?.response?.status;
    console.error(`[driveService] streamDriveFile(${fileId}) failed (status ${status ?? "n/a"}):`, err);
    if (status === 404) return { ok: false, reason: "not-found" };
    if (status === 401 || status === 403) {
      return {
        ok: false,
        reason: "unauthorized",
        detail: `Google rejected the bot credential (status ${status}) — reconnect Drive at /auth/google`,
      };
    }
    return { ok: false, reason: "drive-error", detail: `status ${status ?? "n/a"}` };
  }
}

/** Rename a Drive file (used when a vault item is renamed). */
export async function renameDriveFile(fileId: string, newName: string): Promise<boolean> {
  try {
    const drive = await getBotDrive();
    if (!drive) return false;
    await drive.files.update({
      fileId,
      requestBody: { name: newName },
      supportsAllDrives: true,
    });
    return true;
  } catch (err) {
    console.error("[driveService] renameDriveFile error:", err);
    return false;
  }
}

/** The connected Drive bot account's email, for "share with this address" UI. */
export async function getBotAccountEmail(): Promise<string | null> {
  const cred = await prisma.googleDriveCredential.findUnique({ where: { id: "singleton" } });
  return cred?.accountEmail ?? null;
}

const PDF_MIME = "application/pdf";
const GOOGLE_SLIDES_MIME = "application/vnd.google-apps.presentation";

/**
 * Upload a .pptx and let Drive convert it to a Google Slides file, then export
 * that as PDF. Both halves are legal under `drive.file` because the app created
 * the file it is reading.
 *
 * Returns the PDF stream plus the temporary Drive file id — the caller MUST
 * delete it (see deleteDriveFile) or every import leaks a converted copy.
 */
export async function convertUploadToPdf(
  stream: NodeJS.ReadableStream,
  mimeType: string,
  filename: string,
  folderId: string
): Promise<{ stream: NodeJS.ReadableStream; tempFileId: string } | null> {
  // Tracked out here so the catch can clean up: once we return null the caller
  // has no id to delete, and a conversion that dies at the export step would
  // otherwise strand its Google Slides copy in Drive forever.
  let tempFileId: string | null = null;
  try {
    const drive = await getBotDrive();
    if (!drive) return null;
    const created = await drive.files.create({
      requestBody: { name: filename, parents: [folderId], mimeType: GOOGLE_SLIDES_MIME },
      media: { mimeType, body: stream },
      fields: "id",
      supportsAllDrives: true,
    });
    tempFileId = created.data.id ?? null;
    if (!tempFileId) return null;
    const exported = await drive.files.export(
      { fileId: tempFileId, mimeType: PDF_MIME },
      { responseType: "stream" }
    );
    return { stream: exported.data as unknown as NodeJS.ReadableStream, tempFileId };
  } catch (err) {
    console.error("[driveService] convertUploadToPdf error:", err);
    if (tempFileId) void deleteDriveFile(tempFileId);
    return null;
  }
}

/**
 * Export an existing Drive file (a Google Slides deck the bot account can see)
 * as PDF. Distinguishes not-found from forbidden so the caller can tell the
 * author to share the deck with the bot account rather than showing a bare 403.
 */
export async function exportDriveFileAsPdf(
  fileId: string
): Promise<{ stream: NodeJS.ReadableStream } | { error: "NOT_FOUND" | "FORBIDDEN" | "UNAVAILABLE" }> {
  const drive = await getBotDrive();
  if (!drive) return { error: "UNAVAILABLE" };
  try {
    const exported = await drive.files.export(
      { fileId, mimeType: PDF_MIME },
      { responseType: "stream" }
    );
    return { stream: exported.data as unknown as NodeJS.ReadableStream };
  } catch (err) {
    const status = (err as { code?: number; status?: number }).code
      ?? (err as { status?: number }).status;
    if (status === 404) return { error: "NOT_FOUND" };
    if (status === 403) return { error: "FORBIDDEN" };
    console.error("[driveService] exportDriveFileAsPdf error:", err);
    return { error: "UNAVAILABLE" };
  }
}

/**
 * Whether the stored credential was granted drive.readonly. Read from the
 * persisted `scope` string, because a token issued before the scope was added
 * keeps working for everything else — only the link import must be disabled.
 */
export function hasDriveReadonlyScope(scope: string | null | undefined): boolean {
  return (scope ?? "").includes("https://www.googleapis.com/auth/drive.readonly");
}
