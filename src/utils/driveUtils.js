// Single source of truth for parsing, classifying, and rendering Google Drive
// URLs and items on the frontend. Mirrors the regex patterns from
// backend/src/services/driveService.ts so client and server agree on file IDs.

const URL_PATTERNS = [
  { re: /\/document\/d\/([a-zA-Z0-9_-]{25,})/,     kind: "doc" },
  { re: /\/spreadsheets\/d\/([a-zA-Z0-9_-]{25,})/, kind: "sheet" },
  { re: /\/presentation\/d\/([a-zA-Z0-9_-]{25,})/, kind: "slide" },
  { re: /\/folders\/([a-zA-Z0-9_-]{25,})/,         kind: "folder" },
  { re: /\/file\/d\/([a-zA-Z0-9_-]{25,})/,         kind: "file" },
  { re: /[?&]id=([a-zA-Z0-9_-]{25,})/,             kind: "file" },
];

const MIME_TO_KIND = {
  "application/vnd.google-apps.document":     "doc",
  "application/vnd.google-apps.spreadsheet":  "sheet",
  "application/vnd.google-apps.presentation": "slide",
  "application/vnd.google-apps.folder":       "folder",
  "application/pdf":                          "pdf",
};

const TYPE_META = {
  doc:     { icon: "fa-file-word",       color: "#4285F4", label: "Doc" },
  sheet:   { icon: "fa-file-excel",      color: "#0F9D58", label: "Sheet" },
  slide:   { icon: "fa-file-powerpoint", color: "#F4B400", label: "Slides" },
  pdf:     { icon: "fa-file-pdf",        color: "#EA4335", label: "PDF" },
  folder:  { icon: "fa-folder",          color: "#FFC107", label: "Folder" },
  image:   { icon: "fa-file-image",      color: "#9C27B0", label: "Image" },
  video:   { icon: "fa-file-video",      color: "#E91E63", label: "Video" },
  file:    { icon: "fa-file",            color: "#5F6368", label: "File" },
  unknown: { icon: "fa-link",            color: "#5F6368", label: "Link" },
};

export function parseDriveUrl(url) {
  if (!url || typeof url !== "string") return { kind: "unknown", id: null, raw: url };
  for (const { re, kind } of URL_PATTERNS) {
    const m = url.match(re);
    if (m) return { kind, id: m[1], raw: url };
  }
  return { kind: "unknown", id: null, raw: url };
}

export function mimeTypeToKind(mimeType) {
  if (!mimeType) return "file";
  if (MIME_TO_KIND[mimeType]) return MIME_TO_KIND[mimeType];
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  return "file";
}

export function getTypeMeta(kind) {
  return TYPE_META[kind] ?? TYPE_META.unknown;
}

// Build an iframe-embeddable URL for a parsed Drive item. Returns null when
// the kind has no preview surface (caller should fall back to a plain link).
export function getPreviewUrl({ kind, id }) {
  if (!id) return null;
  switch (kind) {
    case "doc":    return `https://docs.google.com/document/d/${id}/preview`;
    case "sheet":  return `https://docs.google.com/spreadsheets/d/${id}/preview`;
    case "slide":  return `https://docs.google.com/presentation/d/${id}/preview`;
    case "pdf":
    case "file":   return `https://drive.google.com/file/d/${id}/preview`;
    case "folder": return `https://drive.google.com/embeddedfolderview?id=${id}#list`;
    default:       return null;
  }
}

// Web-view URL for an item identified by id/kind (used when only the id is known
// — e.g. items returned from the folder listing without a webViewLink).
export function getWebViewUrl({ kind, id }) {
  if (!id) return null;
  switch (kind) {
    case "doc":    return `https://docs.google.com/document/d/${id}/edit`;
    case "sheet":  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
    case "slide":  return `https://docs.google.com/presentation/d/${id}/edit`;
    case "folder": return `https://drive.google.com/drive/folders/${id}`;
    case "pdf":
    case "file":
    default:       return `https://drive.google.com/file/d/${id}/view`;
  }
}

export function formatRelativeTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60)        return "just now";
  if (diff < 3600)      return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)     return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}
