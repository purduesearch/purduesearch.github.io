// Pure helpers for shared Google Photos album links (photoAlbumService.ts).
//
// Google's Photos APIs need an OAuth app verification the club cannot get, so
// members instead paste an album's public share link (Share → Create link).
// Anyone holding that link can view the album without signing in, and so can
// the server: it reads the photo list out of the share page's embedded data and
// downloads photos from googleusercontent.com with no credentials.
//
// The share page format is undocumented. Every parser here fails soft — it
// returns null or an empty list, never throws — and the service turns that
// into "could not read this album".

/** Hard ceiling on one import, so a single request stays well under proxy timeouts. */
export const MAX_IMPORT_ITEMS = 30;

/** Stop paging an album past this many photos. */
export const MAX_ALBUM_PHOTOS = 2000;

/** Longest edge requested from Google. blogImageStore downsizes to 1600 anyway. */
const DOWNLOAD_EDGE = 2048;
const THUMB_EDGE = 320;

/** Hosts a share link may start on or redirect through. */
const SHARE_HOSTS = new Set(["photos.app.goo.gl", "goo.gl", "photos.google.com"]);

/** Pagination RPC used by the share page itself. */
export const PAGE_RPC_ID = "snAcKc";
export const BATCH_EXECUTE_URL = "https://photos.google.com/_/PhotosUi/data/batchexecute";

// ── Share links ───────────────────────────────────────────────

export type ShareLinkResult = { ok: true; url: string } | { ok: false; reason: string };

const NOT_A_SHARE_LINK =
  "Paste a Google Photos shared album link, like https://photos.app.goo.gl/…";
const PRIVATE_ALBUM_LINK =
  "That is a private album link. In Google Photos, open the album, click Share → Create link, and paste that link instead.";

/**
 * Accepts the short link Google hands out (photos.app.goo.gl/…, or the older
 * goo.gl/photos/…) and the long photos.google.com/share/…?key=… form, and
 * returns it in one canonical spelling. Anything else is rejected, which also
 * keeps the server from fetching arbitrary URLs.
 */
export function normalizeShareUrl(input: unknown): ShareLinkResult {
  if (typeof input !== "string" || !input.trim()) return { ok: false, reason: NOT_A_SHARE_LINK };
  let raw = input.trim();
  if (!/^[a-z]+:\/\//i.test(raw)) raw = `https://${raw}`;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: NOT_A_SHARE_LINK };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, reason: NOT_A_SHARE_LINK };
  const host = u.hostname.toLowerCase();

  if (host === "photos.app.goo.gl") {
    const m = /^\/([A-Za-z0-9]+)\/?$/.exec(u.pathname);
    return m ? { ok: true, url: `https://photos.app.goo.gl/${m[1]}` } : { ok: false, reason: NOT_A_SHARE_LINK };
  }
  if (host === "goo.gl") {
    const m = /^\/photos\/([A-Za-z0-9]+)\/?$/.exec(u.pathname);
    return m ? { ok: true, url: `https://goo.gl/photos/${m[1]}` } : { ok: false, reason: NOT_A_SHARE_LINK };
  }
  if (host === "photos.google.com") {
    const share = /^(?:\/u\/\d+)?\/share\/([\w-]+)\/?$/.exec(u.pathname);
    const key = u.searchParams.get("key");
    if (share && key && /^[\w-]+$/.test(key)) {
      return { ok: true, url: `https://photos.google.com/share/${share[1]}?key=${key}` };
    }
    if (/^(?:\/u\/\d+)?\/(album|photo|share)\//.test(u.pathname)) return { ok: false, reason: PRIVATE_ALBUM_LINK };
  }
  return { ok: false, reason: NOT_A_SHARE_LINK };
}

export function isShareHost(hostname: string): boolean {
  return SHARE_HOSTS.has(hostname.toLowerCase());
}

/** The album id + key from a resolved photos.google.com/share/… URL. */
export function parseShareParams(url: string): { albumId: string; key: string } | null {
  try {
    const u = new URL(url);
    if (u.hostname !== "photos.google.com") return null;
    const m = /^(?:\/u\/\d+)?\/share\/([\w-]+)\/?$/.exec(u.pathname);
    const key = u.searchParams.get("key");
    return m && key ? { albumId: m[1]!, key } : null;
  } catch {
    return null;
  }
}

export function isGoogleMediaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "googleusercontent.com" || u.hostname.endsWith(".googleusercontent.com"));
  } catch {
    return false;
  }
}

// ── Share page parsing ────────────────────────────────────────

/**
 * Returns the JSON text of the bracketed value starting at `start` (which must
 * point at `[` or `{`), honoring strings and escapes, or null if unbalanced.
 */
export function sliceBalanced(text: string, start: number): string | null {
  const open = text[start];
  if (open !== "[" && open !== "{") return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Every `data:` array passed to AF_initDataCallback(...) on the page, parsed. */
export function extractInitData(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /AF_initDataCallback\(\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const dataAt = html.indexOf("data:", m.index);
    if (dataAt < 0) break;
    const arrayAt = html.indexOf("[", dataAt);
    // The data key must belong to this callback, not a later one.
    const nextCallback = html.indexOf("AF_initDataCallback(", m.index + 1);
    if (arrayAt < 0 || (nextCallback >= 0 && arrayAt > nextCallback)) continue;
    const json = sliceBalanced(html, arrayAt);
    if (!json) continue;
    try {
      out.push(JSON.parse(json));
    } catch {
      /* not plain JSON — skip */
    }
  }
  return out;
}

export interface AlbumPhoto {
  /** Google's media key (AF1Qip…). Stable within the album; the import looks photos up by it. */
  id: string;
  /** Unsized googleusercontent URL; append =w…-h… to fetch a size. */
  baseUrl: string;
  width: number;
  height: number;
  /** Capture time, epoch ms, when Google provides one. */
  takenAt: number | null;
  /** Videos only offer a still frame here. */
  isVideo: boolean;
}

export interface AlbumPage {
  title: string | null;
  coverUrl: string | null;
  photos: AlbumPhoto[];
  nextPageToken: string | null;
}

// Video items carry an extra metadata entry under this key in their trailing object.
const VIDEO_META_KEY = "76647426";

function looksLikeVideo(item: unknown[]): boolean {
  return item.some((part) => part !== null && typeof part === "object" && !Array.isArray(part) && VIDEO_META_KEY in part);
}

/** One media entry: ["AF1Qip…", [url, width, height, …], takenAtMs, …]. */
function toAlbumPhoto(raw: unknown): AlbumPhoto | null {
  if (!Array.isArray(raw) || typeof raw[0] !== "string" || !raw[0]) return null;
  const detail = raw[1];
  if (!Array.isArray(detail)) return null;
  const [url, width, height] = detail as unknown[];
  if (typeof url !== "string" || !isGoogleMediaUrl(url)) return null;
  if (typeof width !== "number" || typeof height !== "number") return null;
  return {
    id: raw[0],
    baseUrl: url,
    width,
    height,
    takenAt: typeof raw[2] === "number" ? raw[2] : null,
    isVideo: looksLikeVideo(raw),
  };
}

/**
 * The album payload shape, shared by the page's embedded data and the paging
 * RPC: [_, mediaItems[], nextPageToken, albumMeta[], …] where albumMeta is
 * [albumId, title, _, _, [coverUrl, …], …]. Returns null when it doesn't fit.
 */
export function parseAlbumData(data: unknown): AlbumPage | null {
  if (!Array.isArray(data) || !Array.isArray(data[1])) return null;
  const photos: AlbumPhoto[] = [];
  const seen = new Set<string>();
  for (const raw of data[1] as unknown[]) {
    const photo = toAlbumPhoto(raw);
    if (photo && !seen.has(photo.id)) {
      seen.add(photo.id);
      photos.push(photo);
    }
  }
  const meta = Array.isArray(data[3]) ? (data[3] as unknown[]) : [];
  const title = typeof meta[1] === "string" && meta[1].trim() ? meta[1].trim() : null;
  const coverRaw = Array.isArray(meta[4]) ? (meta[4] as unknown[])[0] : null;
  const coverUrl = typeof coverRaw === "string" && isGoogleMediaUrl(coverRaw) ? coverRaw : null;
  const nextPageToken = typeof data[2] === "string" && data[2] ? data[2] : null;
  return { title, coverUrl, photos, nextPageToken };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'" };

/** og:title fallback, minus the " · Oct 2, 2011 – Jul 26, 2019 📸" suffix Google appends. */
export function parseOgTitle(html: string): string | null {
  const m = /<meta property="og:title" content="([^"]*)"/.exec(html);
  if (!m) return null;
  const decoded = m[1]!.replace(/&(amp|lt|gt|quot|#39|#x27);/g, (_, e: string) => ENTITIES[e] ?? "");
  const title = decoded.split(" · ")[0]!.trim();
  return title || null;
}

/** The first page of an album from its share page HTML: the init-data block with the most photos. */
export function parseSharePage(html: string): AlbumPage | null {
  let best: AlbumPage | null = null;
  for (const data of extractInitData(html)) {
    const page = parseAlbumData(data);
    if (page && page.photos.length > 0 && (!best || page.photos.length > best.photos.length)) best = page;
  }
  if (!best) return null;
  return { ...best, title: best.title ?? parseOgTitle(html) };
}

// ── Paging RPC ────────────────────────────────────────────────

/** Form body for the share page's own "next page" call. */
export function buildPageRequestBody(albumId: string, pageToken: string, key: string): string {
  const inner = JSON.stringify([albumId, pageToken, null, key]);
  return new URLSearchParams({ "f.req": JSON.stringify([[[PAGE_RPC_ID, inner, null, "generic"]]]) }).toString();
}

/**
 * batchexecute answers `)]}'` then JSON like [["wrb.fr", rpcId, "<payload json>", …], …].
 * Returns the parsed payload for `rpcId`, or null.
 */
export function parseBatchExecute(text: string, rpcId = PAGE_RPC_ID): unknown {
  const start = text.indexOf("[[");
  if (start < 0) return null;
  const json = sliceBalanced(text, start);
  if (!json) return null;
  try {
    const envelope = JSON.parse(json) as unknown[];
    for (const entry of envelope) {
      if (Array.isArray(entry) && entry[0] === "wrb.fr" && entry[1] === rpcId && typeof entry[2] === "string") {
        return JSON.parse(entry[2]);
      }
    }
  } catch {
    /* fall through */
  }
  return null;
}

// ── URLs + names ──────────────────────────────────────────────

// Google's media ids never contain "=", so anything after one is a size suffix
// (e.g. "=w600-h315-p-k" on a cover) that must go before appending ours.
const stripSize = (url: string) => url.replace(/=[^/=]*$/, "");

/** Full-size download URL for an album photo. */
export function photoDownloadUrl(baseUrl: string, edge = DOWNLOAD_EDGE): string {
  return `${stripSize(baseUrl)}=w${edge}-h${edge}`;
}

/** Square-cropped grid thumbnail, loaded by the browser straight from Google. */
export function photoThumbUrl(baseUrl: string, edge = THUMB_EDGE): string {
  return `${stripSize(baseUrl)}=w${edge}-h${edge}-c`;
}

/** Asset Library name: "Spring launch · 2026-04-12", or just the album title. */
export function assetNameForPhoto(albumTitle: string, takenAt: number | null): string {
  const base = albumTitle.trim() || "Album photo";
  const date = takenAt ? new Date(takenAt).toISOString().slice(0, 10) : null;
  return (date ? `${base} · ${date}` : base).slice(0, 120);
}

/** Request body photoIds → unique, bounded string ids. */
export function cleanPhotoIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const ids = input.filter((v): v is string => typeof v === "string" && /^[\w-]{1,200}$/.test(v));
  return [...new Set(ids)].slice(0, MAX_IMPORT_ITEMS);
}
