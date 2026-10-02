// Unit tests for photoAlbumCore. Pure — no network, no DB.
// Run: cd backend && npx tsx src/services/photoAlbumCore.test.ts
//
// The fixtures mirror the shape of a real shared-album page (checked against a
// live public album on 2026-10-02), trimmed to the fields the parser reads.

import {
  normalizeShareUrl, parseShareParams, isShareHost, isGoogleMediaUrl, sliceBalanced,
  extractInitData, parseAlbumData, parseSharePage, parseOgTitle, buildPageRequestBody,
  parseBatchExecute, photoDownloadUrl, photoThumbUrl, assetNameForPhoto, cleanPhotoIds,
  MAX_IMPORT_ITEMS,
} from "./photoAlbumCore.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

// ── Share links ──
const ok = (input: string) => { const r = normalizeShareUrl(input); return r.ok ? r.url : null; };
check("short link", ok("https://photos.app.goo.gl/oJEMCo5g5eUptS2fA") === "https://photos.app.goo.gl/oJEMCo5g5eUptS2fA");
check("short link without scheme", ok("photos.app.goo.gl/oJEMCo5g5eUptS2fA/") === "https://photos.app.goo.gl/oJEMCo5g5eUptS2fA");
check("short link drops query", ok("https://photos.app.goo.gl/abc123?utm=x") === "https://photos.app.goo.gl/abc123");
check("old goo.gl link", ok("https://goo.gl/photos/Xyz789") === "https://goo.gl/photos/Xyz789");
check("long share link", ok("https://photos.google.com/share/AF1QipAbc-_1?key=K3y_-") === "https://photos.google.com/share/AF1QipAbc-_1?key=K3y_-");
check("long share link with /u/0", ok("https://photos.google.com/u/0/share/AF1QipAbc?key=K") === "https://photos.google.com/share/AF1QipAbc?key=K");
check("share link without key rejected", ok("https://photos.google.com/share/AF1QipAbc") === null);
const priv = normalizeShareUrl("https://photos.google.com/u/1/album/AF1QipPrivate");
check("private album link explains Share → Create link", !priv.ok && /Create link/.test(priv.reason));
check("other host rejected", ok("https://evil.example/photos.app.goo.gl/abc") === null);
check("lookalike host rejected", ok("https://photos.app.goo.gl.evil.example/abc") === null);
check("file scheme rejected", ok("file:///etc/passwd") === null);
check("non-string rejected", !normalizeShareUrl(42).ok && !normalizeShareUrl("  ").ok);
check("share hosts", isShareHost("photos.google.com") && isShareHost("PHOTOS.APP.GOO.GL") && !isShareHost("accounts.google.com"));

const params = parseShareParams("https://photos.google.com/share/AF1QipAlbum?key=Key1");
check("share params", params?.albumId === "AF1QipAlbum" && params.key === "Key1");
check("share params reject other hosts", parseShareParams("https://accounts.google.com/share/A?key=B") === null);

check("media url ok", isGoogleMediaUrl("https://lh3.googleusercontent.com/pw/abc"));
check("media url rejects http", !isGoogleMediaUrl("http://lh3.googleusercontent.com/pw/abc"));
check("media url rejects lookalike", !isGoogleMediaUrl("https://googleusercontent.com.evil.example/x"));

// ── Balanced slicing ──
check("slice handles brackets in strings", sliceBalanced('x[1,"a]b\\"]",[2]]tail', 1) === '[1,"a]b\\"]",[2]]');
check("slice rejects unbalanced", sliceBalanced("[1,[2]", 0) === null);

// ── Album payload ──
const URL_A = "https://lh3.googleusercontent.com/pw/AP1GczA";
const URL_B = "https://lh3.googleusercontent.com/pw/AP1GczB";
const URL_V = "https://lh3.googleusercontent.com/pw/AP1GczV";
const COVER = "https://lh3.googleusercontent.com/pw/AP1GczCover";
const item = (id: string, url: string, w: number, h: number, extra: Record<string, unknown> = { "15": 15110 }) =>
  [id, [url, w, h, null, null, null, null, null, [null, null, 1]], 1317552314000, "hash", 0, 1564229558506, ["owner"], [[2]], 2, extra];
const data = [
  null,
  [
    item("AF1QipA", URL_A, 640, 480),
    item("AF1QipB", URL_B, 4000, 3000),
    item("AF1QipA", URL_A, 640, 480), // duplicate
    item("AF1QipV", URL_V, 1920, 1080, { "15": 1, "76647426": [[1]] }),
    ["AF1QipBad", ["https://evil.example/x", 1, 1]], // off-host
    ["AF1QipNoSize", [URL_A]],
    "junk",
  ],
  "NEXT_TOKEN",
  ["AF1QipAlbum", "Spring launch ", [1, 2], null, [COVER, 600, 315]],
];
const page = parseAlbumData(data);
check("parses photos, dropping duplicates and bad entries", page?.photos.length === 3);
check("photo fields", page?.photos[0]?.id === "AF1QipA" && page.photos[0].width === 640 && page.photos[0].takenAt === 1317552314000);
check("video detected", page?.photos[2]?.isVideo === true && page.photos[0]?.isVideo === false);
check("title trimmed", page?.title === "Spring launch");
check("cover", page?.coverUrl === COVER);
check("next page token", page?.nextPageToken === "NEXT_TOKEN");
check("empty token is null", parseAlbumData([null, [], ""])?.nextPageToken === null);
check("non-album data rejected", parseAlbumData({ a: 1 }) === null && parseAlbumData([null, "x"]) === null);

// ── Share page ──
const html = `<html><head><meta property="og:title" content="Rock &amp; Roll · Oct 2, 2011 – Jul 26, 2019 📸">
<script>AF_initDataCallback({key: 'ds:0', hash: '1', data:[null,[["not","photos"]]], sideChannel: {}});</script>
<script>AF_initDataCallback({key: 'ds:1', hash: '2', data:${JSON.stringify(data)}, sideChannel: {}});</script>
</head></html>`;
check("finds both init-data blocks", extractInitData(html).length === 2);
const fromPage = parseSharePage(html);
check("share page picks the album block", fromPage?.photos.length === 3 && fromPage.nextPageToken === "NEXT_TOKEN");
check("og title strips date suffix and decodes", parseOgTitle(html) === "Rock & Roll");
const untitled = html.replace('"Spring launch "', "null");
check("falls back to og:title", parseSharePage(untitled)?.title === "Rock & Roll");
check("page with no photos is null", parseSharePage("<html>nothing</html>") === null);

// ── Paging RPC ──
const body = new URLSearchParams(buildPageRequestBody("AF1QipAlbum", "TOKEN", "Key1"));
const freq = JSON.parse(body.get("f.req")!);
check("page request shape", freq[0][0][0] === "snAcKc" && JSON.parse(freq[0][0][1])[1] === "TOKEN" && JSON.parse(freq[0][0][1])[3] === "Key1");
const rpc = `)]}'\n\n[["wrb.fr","snAcKc",${JSON.stringify(JSON.stringify([null, [item("AF1QipC", URL_A, 10, 10)], ""]))},null,null,null,"generic"],["di",42]]`;
const nextPage = parseAlbumData(parseBatchExecute(rpc));
check("batchexecute payload parses", nextPage?.photos[0]?.id === "AF1QipC" && nextPage.nextPageToken === null);
check("batchexecute garbage is null", parseBatchExecute("<html>error</html>") === null);

// ── URLs + names ──
check("download url", photoDownloadUrl(URL_A) === `${URL_A}=w2048-h2048`);
check("thumb url", photoThumbUrl(URL_A) === `${URL_A}=w320-h320-c`);
check("existing size suffix replaced", photoThumbUrl(`${COVER}=w600-h315-p-k`, 400) === `${COVER}=w400-h400-c`);
check("asset name with date", assetNameForPhoto("Launch", Date.UTC(2026, 3, 12)) === "Launch · 2026-04-12");
check("asset name fallback", assetNameForPhoto("  ", null) === "Album photo");
check("photo ids cleaned + deduped", cleanPhotoIds(["a", "a", "b c", 1, "c"]).join() === "a,c");
check("photo ids capped", cleanPhotoIds(Array.from({ length: 50 }, (_, i) => `p${i}`)).length === MAX_IMPORT_ITEMS);

console.log(`photoAlbumCore: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
