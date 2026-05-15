import { google } from "googleapis";

function getDriveAuth() {
  const keyJson = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!, "base64").toString("utf8");
  const key = JSON.parse(keyJson);
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
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

/** List files in a Drive folder (non-recursive, first 50). */
export async function listDriveFolderFiles(folderId: string): Promise<Array<{ id: string; name: string; mimeType: string }>> {
  try {
    const auth = getDriveAuth();
    const drive = google.drive({ version: "v3", auth });
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "files(id,name,mimeType)",
      pageSize: 50,
    });
    return (res.data.files ?? []) as Array<{ id: string; name: string; mimeType: string }>;
  } catch (err) {
    console.error("[driveService] listDriveFolderFiles error:", err);
    return [];
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
