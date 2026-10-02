// Unit tests for instagramFeedService. Offline: fetch, DB and filesystem are injected.
// Run: cd backend && npx tsx src/services/instagramFeedService.test.ts

process.env.INTEGRATION_TOKEN_KEY = "ab".repeat(32);

import {
  normalizeMedia, parsePosts, ensureToken, refreshFeed, getPublicFeed,
  REFRESH_WITHIN_MS, type FeedDb, type FeedFs, type FeedStateRow,
} from "./instagramFeedService.js";
import { encryptSecret, decryptSecret } from "../utils/crypto.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

const NOW = new Date("2026-10-02T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function media(id: string, over: Record<string, unknown> = {}) {
  return {
    id, caption: "hi", media_type: "IMAGE", media_url: `https://cdn.example/${id}.jpg`,
    permalink: `https://www.instagram.com/p/${id}/`, timestamp: "2026-09-30T10:00:00+0000",
    like_count: 7, ...over,
  };
}

const BLANK: FeedStateRow = { id: "default", accessTokenEnc: null, tokenExpiresAt: null, postsJson: "[]", fetchedAt: null, lastError: null };

function memDb(init?: Partial<FeedStateRow>) {
  let row: FeedStateRow | null = init ? { ...BLANK, ...init } : null;
  const db: FeedDb = {
    async get() { return row; },
    async save(patch) { row = { ...BLANK, ...row, ...patch }; },
  };
  return { db, row: () => row };
}

function memFs(files: string[] = []) {
  const set = new Set<string>(files);
  const base = (p: string) => p.split(/[\\/]/).pop()!;
  const fs: FeedFs = {
    async mkdir() {},
    async exists(f) { return set.has(base(f)); },
    async write(f) { set.add(base(f)); },
    async list() { return [...set]; },
    async remove(f) { set.delete(base(f)); },
  };
  return { fs, files: () => [...set].sort() };
}

function fakeFetch(handler: (url: string) => { status?: number; json?: unknown }) {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(url);
    const r = handler(url);
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300, status,
      json: async () => r.json,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    };
  }) as unknown as typeof fetch;
  return { f, calls };
}

const DIR = "/x/instagram";

console.log("normalizeMedia");
{
  const p = normalizeMedia(media("123"))!;
  check("image post maps", p.id === "123" && p.image === "/uploads/instagram/123.jpg" && p.likeCount === 7);
  check("exact key set", JSON.stringify(Object.keys(p).sort()) ===
    JSON.stringify(["caption", "id", "image", "likeCount", "permalink", "timestamp"]));
  check("hidden likes -> null", normalizeMedia(media("1", { like_count: undefined }))!.likeCount === null);
  check("missing caption -> empty string", normalizeMedia(media("1", { caption: undefined }))!.caption === "");
  check("video without thumbnail dropped", normalizeMedia(media("1", { media_type: "VIDEO" })) === null);
  check("video with thumbnail kept", normalizeMedia(media("1", { media_type: "VIDEO", thumbnail_url: "https://cdn.example/t.jpg" })) !== null);
  check("no media_url (copyright) dropped", normalizeMedia(media("1", { media_url: undefined })) === null);
  check("non-numeric id rejected (path safety)", normalizeMedia(media("../etc")) === null);
  check("http image rejected", normalizeMedia(media("1", { media_url: "http://cdn.example/a.jpg" })) === null);
  check("bad timestamp rejected", normalizeMedia(media("1", { timestamp: "nope" })) === null);
  check("null input", normalizeMedia(null) === null);
}

console.log("parsePosts");
{
  check("garbage -> []", parsePosts("{not json").length === 0);
  check("non-array -> []", parsePosts("{}").length === 0);
  check("empty/undefined -> []", parsePosts(undefined).length === 0 && parsePosts("").length === 0);
}

console.log("ensureToken");
{
  const none = memDb();
  check("no row, no env -> null", (await ensureToken({ db: none.db, env: {}, now: () => NOW })) === null);

  const seeded = memDb();
  const t = await ensureToken({ db: seeded.db, env: { INSTAGRAM_ACCESS_TOKEN: "seed" }, now: () => NOW });
  check("seeds from env", t === "seed");
  check("seed stored encrypted", seeded.row()!.accessTokenEnc !== "seed" && decryptSecret(seeded.row()!.accessTokenEnc) === "seed");
  check("seed expiry ~60d", seeded.row()!.tokenExpiresAt!.getTime() === NOW.getTime() + 60 * DAY);

  const fresh = memDb({ accessTokenEnc: encryptSecret("tok"), tokenExpiresAt: new Date(NOW.getTime() + 30 * DAY) });
  const ff = fakeFetch(() => ({ json: {} }));
  check("fresh token returned", (await ensureToken({ db: fresh.db, fetch: ff.f, env: {}, now: () => NOW })) === "tok");
  check("no refresh call when >15d left", ff.calls.length === 0);

  const old = memDb({ accessTokenEnc: encryptSecret("old"), tokenExpiresAt: new Date(NOW.getTime() + 10 * DAY) });
  const rf = fakeFetch(() => ({ json: { access_token: "new", token_type: "bearer", expires_in: 5184000 } }));
  check("refreshes inside window", (await ensureToken({ db: old.db, fetch: rf.f, env: {}, now: () => NOW })) === "new");
  check("refresh URL", rf.calls[0].startsWith("https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token="));
  check("refreshed token stored", decryptSecret(old.row()!.accessTokenEnc) === "new");
  check("expiry from expires_in", old.row()!.tokenExpiresAt!.getTime() === NOW.getTime() + 5184000 * 1000);

  const bad = memDb({ accessTokenEnc: encryptSecret("old"), tokenExpiresAt: new Date(NOW.getTime() + 10 * DAY) });
  const bf = fakeFetch(() => ({ status: 400, json: {} }));
  check("failed refresh keeps still-valid token", (await ensureToken({ db: bad.db, fetch: bf.f, env: {}, now: () => NOW })) === "old");
  check("failed refresh records lastError", /token refresh/.test(bad.row()!.lastError ?? ""));
  check("lastError has no token", !(bad.row()!.lastError ?? "").includes("old"));

  const dead = memDb({ accessTokenEnc: encryptSecret("dead"), tokenExpiresAt: new Date(NOW.getTime() - DAY) });
  check("failed refresh of expired token -> null", (await ensureToken({ db: dead.db, fetch: bf.f, env: {}, now: () => NOW })) === null);
  check("REFRESH_WITHIN_MS is 15 days", REFRESH_WITHIN_MS === 15 * DAY);
}

console.log("refreshFeed");
{
  const state = memDb({ accessTokenEnc: encryptSecret("tok"), tokenExpiresAt: new Date(NOW.getTime() + 40 * DAY) });
  const disk = memFs(["999.jpg", "readme.txt"]);
  const net = fakeFetch(url => {
    if (url.includes("/me/media")) {
      return { json: { data: [
        media("111"),
        media("222", { media_type: "VIDEO", thumbnail_url: "https://cdn.example/thumb222.jpg", media_url: "https://cdn.example/v.mp4" }),
        media("333", { media_url: undefined }),
      ] } };
    }
    return {};
  });
  const base = { db: state.db, fs: disk.fs, fetch: net.f, env: {}, now: () => NOW, dir: DIR };
  const r = await refreshFeed(base);
  check("ok with 2 usable posts", r.ok && r.count === 2);
  check("media URL asks for 6 posts with fields", /limit=6/.test(net.calls[0]) && /fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count/.test(net.calls[0]));
  check("video downloads thumbnail", net.calls.includes("https://cdn.example/thumb222.jpg") && !net.calls.includes("https://cdn.example/v.mp4"));
  check("images written, stale .jpg pruned, other files kept", JSON.stringify(disk.files()) === JSON.stringify(["111.jpg", "222.jpg", "readme.txt"]));
  const stored = parsePosts(state.row()!.postsJson);
  check("stored list", stored.length === 2 && stored[0].id === "111");
  check("fetchedAt set, lastError cleared", state.row()!.fetchedAt!.getTime() === NOW.getTime() && state.row()!.lastError === null);
  check("getPublicFeed returns stored", (await getPublicFeed({ db: state.db })).length === 2);

  const before = net.calls.length;
  await refreshFeed(base);
  check("existing images not re-downloaded", net.calls.slice(before).filter(u => u.includes("cdn.example")).length === 0);

  const failNet = fakeFetch(() => ({ status: 500, json: {} }));
  const r2 = await refreshFeed({ ...base, fetch: failNet.f });
  check("API failure returns ok:false, no throw", !r2.ok);
  check("previous posts kept on failure", parsePosts(state.row()!.postsJson).length === 2);
  check("lastError written, token not leaked", /Instagram API 500/.test(state.row()!.lastError ?? "") && !(state.row()!.lastError ?? "").includes("tok"));

  const state3 = memDb({ accessTokenEnc: encryptSecret("tok"), tokenExpiresAt: new Date(NOW.getTime() + 40 * DAY), postsJson: JSON.stringify(stored) });
  const disk3 = memFs(["111.jpg", "222.jpg"]);
  const imgFail = fakeFetch(url => url.includes("/me/media") ? { json: { data: [media("444")] } } : { status: 403 });
  const r3 = await refreshFeed({ ...base, db: state3.db, fs: disk3.fs, fetch: imgFail.f });
  check("image failure -> ok:false", !r3.ok);
  check("image failure keeps old list and files", parsePosts(state3.row()!.postsJson).length === 2 && disk3.files().length === 2);

  const noTok = memDb();
  const r4 = await refreshFeed({ ...base, db: noTok.db });
  check("no token -> ok:false with lastError", !r4.ok && /INSTAGRAM_ACCESS_TOKEN/.test(noTok.row()!.lastError ?? ""));

  const brokenDb: FeedDb = { async get() { throw new Error("db down"); }, async save() { throw new Error("db down"); } };
  const r5 = await refreshFeed({ ...base, db: brokenDb });
  check("DB failure never throws", !r5.ok);
}

console.log("getPublicFeed");
{
  check("no row -> []", (await getPublicFeed({ db: memDb().db })).length === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
