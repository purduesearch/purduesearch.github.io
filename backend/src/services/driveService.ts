import { google } from "googleapis";
import { Readable } from "node:stream";

function getDriveAuth() {
  const keyJson = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!, "base64").toString("utf8");
  const key = JSON.parse(keyJson);
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
}

function getDriveWriteAuth() {
  const keyJson = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!, "base64").toString("utf8");
  const key = JSON.parse(keyJson);
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });
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
    const auth  = getDriveWriteAuth();
    const drive = google.drive({ version: "v3", auth });

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
    const auth = getDriveAuth();
    const drive = google.drive({ version: "v3", auth });

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
    const auth = getDriveAuth();
    const drive = google.drive({ version: "v3", auth });
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
    const auth = getDriveAuth();
    const drive = google.drive({ version: "v3", auth });
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
    const auth = getDriveAuth();
    const drive = google.drive({ version: "v3", auth });
    const meta = await drive.files.get({ fileId, fields: "name" });
    const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
    const base64 = Buffer.from(res.data as ArrayBuffer).toString("base64");
    return { base64, name: meta.data.name ?? fileId };
  } catch (err) {
    console.error("[driveService] fetchDriveFileAsBase64 error:", err);
    return null;
  }
}

/** Create a subfolder in Drive under the given parent folder. */
export async function createDriveFolder(
  name: string,
  parentId: string
): Promise<{ id: string; webViewLink?: string } | null> {
  try {
    const auth = getDriveWriteAuth();
    const drive = google.drive({ version: "v3", auth });
    const res = await drive.files.create({
      requestBody: {
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      },
      fields: "id,webViewLink",
      supportsAllDrives: true,
    });
    return { id: res.data.id!, webViewLink: res.data.webViewLink ?? undefined };
  } catch (err) {
    console.error("[driveService] createDriveFolder error:", err);
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
    const auth = getDriveWriteAuth();
    const drive = google.drive({ version: "v3", auth });
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
    const auth = getDriveWriteAuth();
    const drive = google.drive({ version: "v3", auth });
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

/** Rename a Drive file (used when a vault item is renamed). */
export async function renameDriveFile(fileId: string, newName: string): Promise<boolean> {
  try {
    const auth = getDriveWriteAuth();
    const drive = google.drive({ version: "v3", auth });
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

/** Decode the service account's email from GOOGLE_SERVICE_ACCOUNT_KEY, for "share with this address" UI. */
export function getServiceAccountEmail(): string | null {
  try {
    const keyJson = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!, "base64").toString("utf8");
    const key = JSON.parse(keyJson);
    return key.client_email ?? null;
  } catch (err) {
    console.error("[driveService] getServiceAccountEmail error:", err);
    return null;
  }
}
