// Shared Google Photos albums — reads an album from its public share link and
// copies chosen photos into the blog image store. No Google credentials: the
// share link itself is the access grant, exactly as it is for a person who
// opens it in a browser. Pure parsing lives in photoAlbumCore.ts.
//
// Flow (browser side lives in src/components/clubpm/photoAlbums/):
//   1. a member pastes a share link → POST /api/photo-albums stores a PhotoAlbum row
//   2. GET /api/photo-albums/:id/photos → the album's photo list (thumbnails load
//      straight from googleusercontent.com in the browser)
//   3. POST /api/photo-albums/:id/import { photoIds } → the server looks each id
//      up in its own copy of the album (never a client-supplied URL), downloads
//      it, and stores it through storeBlogImage

import { storeBlogImage, type StoredImage } from "./blogImageStore.js";
import {
  MAX_ALBUM_PHOTOS, MAX_IMPORT_ITEMS, BATCH_EXECUTE_URL, PAGE_RPC_ID,
  isShareHost, isGoogleMediaUrl, parseShareParams, parseSharePage, parseAlbumData,
  parseBatchExecute, buildPageRequestBody, photoDownloadUrl,
  type AlbumPhoto,
} from "./photoAlbumCore.js";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_PAGE_BYTES = 15 * 1024 * 1024;
const MAX_DOWNLOAD_BYTES = 40 * 1024 * 1024;
const MAX_PAGES = 25;
const MAX_REDIRECTS = 5;
const CACHE_TTL_MS = 10 * 60_000;
const IMPORT_CONCURRENCY = 3;
const HEADERS = { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.8" };

export class PhotoAlbumError extends Error {
  constructor(public code: "INVALID_LINK" | "NOT_PUBLIC" | "NOT_FOUND" | "UNREADABLE" | "STORE_FAILED", message: string) {
    super(message);
  }
}

export interface AlbumSnapshot {
  /** Google's album id (AF1Qip…), from the resolved share URL. */
  googleAlbumId: string;
  title: string | null;
  coverUrl: string | null;
  photos: AlbumPhoto[];
  /** True when paging stopped early (cap reached or a page failed to load). */
  truncated: boolean;
}

async function readCapped(res: Response, limit: number): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > limit) throw new Error("response too large");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > limit) throw new Error("response too large");
  return buf;
}

/** Follows the short link by hand so every hop stays on a Google Photos host. */
async function fetchSharePage(shareUrl: string): Promise<{ html: string; finalUrl: string }> {
  let url = shareUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetch(url, { redirect: "manual", headers: HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (err) {
      console.warn("[photo-albums] fetch failed:", (err as Error).message);
      throw new PhotoAlbumError("UNREADABLE", "Could not reach Google Photos. Try again in a minute.");
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      const next = location ? new URL(location, url) : null;
      if (!next || next.protocol !== "https:") throw new PhotoAlbumError("UNREADABLE", "Google Photos sent an unexpected redirect.");
      if (!isShareHost(next.hostname)) {
        // A sign-in redirect means link sharing is off or the album is private.
        throw new PhotoAlbumError("NOT_PUBLIC", "This album is not shared by link. In Google Photos, open the album's Share options and turn on link sharing.");
      }
      url = next.toString();
      continue;
    }
    if (res.status === 404) throw new PhotoAlbumError("NOT_FOUND", "Google Photos says this album link does not exist (it may have been unshared).");
    if (!res.ok) throw new PhotoAlbumError("UNREADABLE", `Google Photos answered ${res.status}. Try again in a minute.`);
    try {
      return { html: (await readCapped(res, MAX_PAGE_BYTES)).toString("utf8"), finalUrl: url };
    } catch {
      throw new PhotoAlbumError("UNREADABLE", "Could not read this album page.");
    }
  }
  throw new PhotoAlbumError("UNREADABLE", "Google Photos redirected too many times.");
}

/** Next page via the share page's own RPC; null on any failure (caller marks the album truncated). */
async function fetchNextPage(albumId: string, key: string, pageToken: string) {
  try {
    const res = await fetch(`${BATCH_EXECUTE_URL}?rpcids=${PAGE_RPC_ID}`, {
      method: "POST",
      headers: { ...HEADERS, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: buildPageRequestBody(albumId, pageToken, key),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return parseAlbumData(parseBatchExecute((await readCapped(res, MAX_PAGE_BYTES)).toString("utf8")));
  } catch (err) {
    console.warn("[photo-albums] page fetch failed:", (err as Error).message);
    return null;
  }
}

async function readAlbum(shareUrl: string): Promise<AlbumSnapshot> {
  const { html, finalUrl } = await fetchSharePage(shareUrl);
  const params = parseShareParams(finalUrl);
  const first = parseSharePage(html);
  if (!params || !first) {
    throw new PhotoAlbumError("UNREADABLE", "Could not find any photos in this album. It may be empty, or Google changed the page format.");
  }

  const photos = [...first.photos];
  const seen = new Set(photos.map((p) => p.id));
  let token = first.nextPageToken;
  let truncated = false;
  for (let page = 0; token && page < MAX_PAGES; page++) {
    if (photos.length >= MAX_ALBUM_PHOTOS) { truncated = true; break; }
    const next = await fetchNextPage(params.albumId, params.key, token);
    if (!next) { truncated = true; break; }
    for (const p of next.photos) {
      if (!seen.has(p.id)) { seen.add(p.id); photos.push(p); }
    }
    token = next.nextPageToken;
  }
  if (token && !truncated) truncated = true;

  return {
    googleAlbumId: params.albumId,
    title: first.title,
    coverUrl: first.coverUrl ?? photos[0]?.baseUrl ?? null,
    photos: photos.slice(0, MAX_ALBUM_PHOTOS),
    truncated,
  };
}

// Photo grids and imports both read the album; a short cache keeps one browse
// + import from fetching it twice.
const cache = new Map<string, { at: number; snapshot: AlbumSnapshot }>();

export async function loadAlbum(shareUrl: string, { fresh = false } = {}): Promise<AlbumSnapshot> {
  const hit = cache.get(shareUrl);
  if (!fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.snapshot;
  const snapshot = await readAlbum(shareUrl);
  cache.set(shareUrl, { at: Date.now(), snapshot });
  if (cache.size > 100) cache.delete(cache.keys().next().value!);
  return snapshot;
}

export function forgetAlbum(shareUrl: string): void {
  cache.delete(shareUrl);
}

async function downloadPhoto(photo: AlbumPhoto): Promise<Buffer> {
  // Re-checked here: the id lookup already guarantees this came from Google's
  // own payload, but nothing should ever fetch off-host.
  if (!isGoogleMediaUrl(photo.baseUrl)) throw new Error("unexpected photo host");
  const res = await fetch(photoDownloadUrl(photo.baseUrl), { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`download ${res.status}`);
  return readCapped(res, MAX_DOWNLOAD_BYTES);
}

export interface ImportedPhoto extends StoredImage {
  photoId: string;
  takenAt: number | null;
}

export interface ImportResult {
  images: ImportedPhoto[];
  /** Requested ids no longer in the album. */
  missing: number;
  /** Photos that failed to download or store. */
  failed: number;
}

/** Copies the chosen photos (by id, in request order) into the blog image store. */
export async function importAlbumPhotos(shareUrl: string, photoIds: string[], origin: string): Promise<ImportResult> {
  let album = await loadAlbum(shareUrl);
  let byId = new Map(album.photos.map((p) => [p.id, p]));
  // A cached copy may predate photos added since; reload once before giving up on any.
  if (photoIds.some((id) => !byId.has(id))) {
    album = await loadAlbum(shareUrl, { fresh: true });
    byId = new Map(album.photos.map((p) => [p.id, p]));
  }
  const wanted = photoIds.slice(0, MAX_IMPORT_ITEMS);
  const photos = wanted.map((id) => byId.get(id)).filter((p): p is AlbumPhoto => Boolean(p));
  const missing = wanted.length - photos.length;

  const results: (ImportedPhoto | null)[] = new Array(photos.length).fill(null);
  let next = 0;
  let storeDown = false;
  const worker = async () => {
    while (next < photos.length && !storeDown) {
      const i = next++;
      const photo = photos[i]!;
      try {
        const stored = await storeBlogImage(await downloadPhoto(photo), origin);
        if (!stored) { storeDown = true; return; }
        results[i] = { ...stored, photoId: photo.id, takenAt: photo.takenAt };
      } catch (err) {
        console.warn(`[photo-albums] import of ${photo.id} failed:`, (err as Error).message);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(IMPORT_CONCURRENCY, photos.length) }, worker));

  const images = results.filter((r): r is ImportedPhoto => r !== null);
  if (storeDown && images.length === 0) {
    throw new PhotoAlbumError("STORE_FAILED", "Image storage is unavailable (is the Drive bot account connected?)");
  }
  return { images, missing, failed: photos.length - images.length };
}
