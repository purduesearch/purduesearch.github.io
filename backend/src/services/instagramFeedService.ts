// Live Instagram feed cache for the public homepage.
// API: Instagram API with Instagram Login (graph.instagram.com), permission
// instagram_business_basic. A 60-day long-lived token is stored encrypted in the
// single InstagramFeedState row and refreshed here (allowed once it is >= 24h old).
// Every outbound dependency is injectable so the test suite stays offline.

import path from "node:path";
import { promises as fsp } from "node:fs";
import { fileURLToPath } from "node:url";
import { encryptSecret, decryptSecret } from "../utils/crypto.js";

const GRAPH = "https://graph.instagram.com";
const MEDIA_FIELDS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count";
export const FEED_SIZE = 6;
export const REFRESH_WITHIN_MS = 15 * 24 * 60 * 60 * 1000;
const FALLBACK_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;
const STATE_ID = "default";

export const INSTAGRAM_UPLOADS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), "..", "..", "uploads", "instagram",
);

export interface InstagramPost {
  id: string;
  caption: string;
  permalink: string;
  timestamp: string;
  likeCount: number | null;
  image: string;
}

export interface FeedStateRow {
  id: string;
  accessTokenEnc: string | null;
  tokenExpiresAt: Date | null;
  postsJson: string;
  fetchedAt: Date | null;
  lastError: string | null;
}

export interface FeedDb {
  get(): Promise<FeedStateRow | null>;
  save(patch: Partial<Omit<FeedStateRow, "id">>): Promise<void>;
}

export interface FeedFs {
  mkdir(dir: string): Promise<void>;
  exists(file: string): Promise<boolean>;
  write(file: string, data: Buffer): Promise<void>;
  list(dir: string): Promise<string[]>;
  remove(file: string): Promise<void>;
}

export interface FeedDeps {
  fetch: typeof fetch;
  db: FeedDb;
  fs: FeedFs;
  now: () => Date;
  env: Record<string, string | undefined>;
  dir: string;
}

export const defaultDb: FeedDb = {
  async get() {
    const { prisma } = await import("../db/prisma.js");
    return prisma.instagramFeedState.findUnique({ where: { id: STATE_ID } });
  },
  async save(patch) {
    const { prisma } = await import("../db/prisma.js");
    await prisma.instagramFeedState.upsert({
      where: { id: STATE_ID },
      create: { id: STATE_ID, ...patch },
      update: patch,
    });
  },
};

export const defaultFs: FeedFs = {
  async mkdir(dir) { await fsp.mkdir(dir, { recursive: true }); },
  async exists(file) { return fsp.access(file).then(() => true, () => false); },
  async write(file, data) { await fsp.writeFile(file, data); },
  async list(dir) { return fsp.readdir(dir).catch(() => []); },
  async remove(file) { await fsp.rm(file, { force: true }); },
};

function defaults(over: Partial<FeedDeps> = {}): FeedDeps {
  return {
    fetch: globalThis.fetch, db: defaultDb, fs: defaultFs,
    now: () => new Date(), env: process.env, dir: INSTAGRAM_UPLOADS_DIR, ...over,
  };
}

/**
 * Pure. One raw Graph media object → public post, or null when it cannot be shown.
 * VIDEO uses thumbnail_url. media_url is omitted by Meta for copyrighted media
 * (e.g. Reels audio), so such posts are dropped. like_count is omitted when the
 * owner hides likes, which becomes null. Ids are restricted to digits so they are
 * safe as file names.
 */
export function normalizeMedia(raw: unknown): InstagramPost | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : "";
  if (!/^\d+$/.test(id)) return null;
  const permalink = typeof r.permalink === "string" ? r.permalink : "";
  if (!permalink.startsWith("https://")) return null;
  const source = r.media_type === "VIDEO" ? r.thumbnail_url : r.media_url;
  if (typeof source !== "string" || !source.startsWith("https://")) return null;
  const timestamp = typeof r.timestamp === "string" ? r.timestamp : "";
  if (Number.isNaN(Date.parse(timestamp))) return null;
  const likes = typeof r.like_count === "number" && r.like_count >= 0 ? r.like_count : null;
  return {
    id,
    caption: typeof r.caption === "string" ? r.caption : "",
    permalink,
    timestamp,
    likeCount: likes,
    image: `/uploads/instagram/${id}.jpg`,
  };
}

/** Pure. Remote image URL for a raw media object (same rule as normalizeMedia). */
function sourceUrl(raw: any): string {
  return raw.media_type === "VIDEO" ? raw.thumbnail_url : raw.media_url;
}

/** Pure. Parse the stored list; anything malformed is an empty feed. */
export function parsePosts(json: string | null | undefined): InstagramPost[] {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? v.filter(p => p && typeof p.id === "string" && typeof p.image === "string") : [];
  } catch {
    return [];
  }
}

async function graphJson(d: FeedDeps, url: string): Promise<any> {
  const res = await d.fetch(url);
  if (!res.ok) {
    // Never echo the URL: it carries the access token.
    throw new Error(`Instagram API ${res.status}`);
  }
  return res.json();
}

/**
 * Seed the token from INSTAGRAM_ACCESS_TOKEN when the row has none, and refresh it
 * when fewer than 15 days remain. Returns the usable plaintext token, or null.
 * A failed refresh keeps the old token and records lastError.
 */
export async function ensureToken(over: Partial<FeedDeps> = {}): Promise<string | null> {
  const d = defaults(over);
  const row = await d.db.get();
  let token = decryptSecret(row?.accessTokenEnc);

  if (!token) {
    const seed = d.env.INSTAGRAM_ACCESS_TOKEN?.trim();
    if (!seed) return null;
    token = seed;
    // Expiry of the bootstrap token is unknown; assume it is fresh from the dashboard
    // (60 days) so the next cron run refreshes it once it is inside the window.
    await d.db.save({
      accessTokenEnc: encryptSecret(seed),
      tokenExpiresAt: new Date(d.now().getTime() + FALLBACK_TOKEN_TTL_MS),
    });
    return token;
  }

  const expiresAt = row?.tokenExpiresAt ?? null;
  const remaining = expiresAt ? expiresAt.getTime() - d.now().getTime() : 0;
  if (remaining >= REFRESH_WITHIN_MS) return token;

  // Inside the 15-day window the token is over 45 days old, so Meta's 24h minimum age is met.
  try {
    const url = `${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`;
    const body = await graphJson(d, url);
    if (typeof body?.access_token !== "string" || typeof body?.expires_in !== "number") {
      throw new Error("Instagram refresh: unexpected response");
    }
    await d.db.save({
      accessTokenEnc: encryptSecret(body.access_token),
      tokenExpiresAt: new Date(d.now().getTime() + body.expires_in * 1000),
      lastError: null,
    });
    return body.access_token;
  } catch (err) {
    await d.db.save({ lastError: `token refresh: ${errMessage(err)}` });
    // An expired token cannot fetch; a still-valid one can keep going.
    return remaining > 0 ? token : null;
  }
}

function errMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 500);
}

/**
 * Fetch the latest posts, mirror their images to uploads/instagram, store the list.
 * Never throws: on any failure the previous postsJson stays and lastError is set.
 */
export async function refreshFeed(over: Partial<FeedDeps> = {}): Promise<{ ok: boolean; count: number }> {
  const d = defaults(over);
  try {
    const token = await ensureToken(over);
    if (!token) {
      await d.db.save({ lastError: "no Instagram access token (set INSTAGRAM_ACCESS_TOKEN)" });
      return { ok: false, count: 0 };
    }
    const url = `${GRAPH}/me/media?fields=${MEDIA_FIELDS}&limit=${FEED_SIZE}&access_token=${encodeURIComponent(token)}`;
    const body = await graphJson(d, url);
    const rawList: any[] = Array.isArray(body?.data) ? body.data.slice(0, FEED_SIZE) : [];

    await d.fs.mkdir(d.dir);
    const posts: InstagramPost[] = [];
    for (const raw of rawList) {
      const post = normalizeMedia(raw);
      if (!post) continue;
      const file = path.join(d.dir, `${post.id}.jpg`);
      if (!(await d.fs.exists(file))) {
        const res = await d.fetch(sourceUrl(raw));
        if (!res.ok) throw new Error(`image download ${res.status}`);
        await d.fs.write(file, Buffer.from(await res.arrayBuffer()));
      }
      posts.push(post);
    }

    // Only replace the stored feed (and prune files) when we got something usable.
    if (posts.length === 0 && rawList.length > 0) throw new Error("no usable media in response");

    const keep = new Set(posts.map(p => `${p.id}.jpg`));
    for (const name of await d.fs.list(d.dir)) {
      if (name.endsWith(".jpg") && !keep.has(name)) await d.fs.remove(path.join(d.dir, name));
    }

    await d.db.save({ postsJson: JSON.stringify(posts), fetchedAt: d.now(), lastError: null });
    return { ok: true, count: posts.length };
  } catch (err) {
    try { await d.db.save({ lastError: errMessage(err) }); } catch { /* DB down: nothing more to do */ }
    console.error("[instagram] refreshFeed failed:", errMessage(err));
    return { ok: false, count: 0 };
  }
}

/** Public payload source. Empty list when nothing has been fetched yet. */
export async function getPublicFeed(over: Partial<FeedDeps> = {}): Promise<InstagramPost[]> {
  const d = defaults(over);
  const row = await d.db.get();
  return parsePosts(row?.postsJson);
}
