// Vault search (Phase 8): tokenization, permission-scoped SQL, filters,
// ranking, index documents, the search entry point and index rebuild.
// No DB, no network: the search and rebuild boundaries are injected.
// Run: cd backend && npx tsx src/services/vaultSearch.test.ts

import {
  buildSearchSql,
  buildTsQuery,
  commitDoc,
  commitItemIds,
  crDoc,
  itemDocs,
  makeSnippet,
  normalizeSearchParams,
  rankCandidates,
  savedViewQuery,
  tokenize,
  vaultLink,
  type Candidate,
} from "./vaultSearchCore.js";
import { rebuildVaultSearch, searchVault, SearchForbidden, type RebuildDeps, type SearchDeps } from "./vaultSearchService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

const ME = "m-me";
const params = (raw: Record<string, unknown> = {}) => normalizeSearchParams(raw, ME);

// ── Tokens and tsquery ────────────────────────────────────────
{
  const t = tokenize("PRT-0012 bracket_v2.STEP Träger");
  check("part number splits into its pieces", t.includes("prt") && t.includes("0012"));
  check("part number also indexed joined", t.includes("prt0012"));
  check("filename pieces indexed", t.includes("bracket") && t.includes("v2") && t.includes("step"));
  check("unicode letters survive", t.includes("träger"));
  check("empty text → no tokens", tokenize("").length === 0 && tokenize(null).length === 0);

  check("each query word becomes a prefix term", buildTsQuery("Brack v2") === "brack:* & v2:*");
  check("tsquery operators cannot be injected", buildTsQuery("a & !b | c:* <-> 'd'") === "a:* & b:* & c:* & d:*");
  check("punctuation-only query is not searchable", buildTsQuery("--- !!") === null);
  check("query terms are capped at 8", (buildTsQuery("a b c d e f g h i j") ?? "").split("&").length === 8);
  check("duplicate query terms collapse", buildTsQuery("bolt bolt BOLT") === "bolt:*");
}

// ── Parameters ────────────────────────────────────────────────
{
  const p = params({ q: "bolt", kinds: "item,version,bogus", authorId: "me", limit: "999", offset: "-3", fileExts: ".STEP,../x,sldprt", since: "not a date", released: "false", sort: "recent" });
  check("unknown kinds are dropped", p.kinds.join() === "ITEM,VERSION");
  check("authorId me resolves to the caller", p.authorId === ME);
  check("limit is clamped to 50", p.limit === 50);
  check("negative offset is clamped to 0", p.offset === 0);
  check("extensions are normalized and path-like values dropped", p.fileExts.join() === "step,sldprt");
  check("an invalid date is ignored", p.since === null);
  check("released=false is kept as a filter", p.released === false);
  check("sort=recent is honored", p.sort === "recent");
  check("an unknown CR status is dropped", params({ crStatus: "MERGED" }).crStatus === null);
  check("watching is off by default", params().watching === false);

  const stored = savedViewQuery({ q: "frame", authorId: "me", kinds: ["CR"], limit: 5, offset: 20 });
  check("saved views keep 'me' symbolic", stored.authorId === "me");
  check("saved views never store paging", !("limit" in stored) && !("offset" in stored));
  check("saved views keep filters", Array.isArray(stored.kinds) && (stored.kinds as string[])[0] === "CR");
}

// ── SQL: permission clause and filters ────────────────────────
{
  const allowed = ["p1", "p2"];
  const plain = buildSearchSql(params({ q: "bracket" }), allowed, null);
  check("permission clause is always first", plain.text.includes(`WHERE d."projectId" = ANY($1::text[])`));
  check("permission list is bound from the caller, not the request", JSON.stringify(plain.values[0]) === JSON.stringify(allowed));
  check("text query uses the GIN-indexed vector", plain.text.includes(`d."searchVector" @@ query`));

  const scoped = buildSearchSql(params({ q: "x", projectId: "p9" }), allowed, null);
  check("a requested project narrows but never replaces the permission clause", scoped.text.includes(`d."projectId" = ANY($1::text[])`) && scoped.values.includes("p9"));

  const hostile = buildSearchSql(params({ q: "'; DROP TABLE \"VaultSearchDoc\"; --", authorId: "x' OR '1'='1" }), allowed, null);
  check("request strings never reach the SQL text", !hostile.text.includes("DROP") && !hostile.text.includes("OR '1'"));

  const all = buildSearchSql(params({ kinds: "CR", released: "true", checkedOut: "true", crStatus: "open", fileExts: "step", authorId: "m2", since: "2026-01-01", until: "2026-02-01" }), allowed, ["i1"]);
  for (const clause of [`d."kind" = ANY(`, `d."released" = $`, `d."checkedOut" = $`, `d."crStatus" = $`, `d."fileExt" = ANY(`, `d."authorId" = $`, `d."itemId" = ANY(`, `d."occurredAt" >= $`, `d."occurredAt" <= $`]) {
    check(`filter clause present: ${clause}`, all.text.includes(clause));
  }
  check("CR status is upper-cased", all.values.includes("OPEN"));
  check("no text query → newest first, no tsquery", !all.text.includes("to_tsquery") && all.text.includes(`ORDER BY d."occurredAt" DESC`));
  check("recent sort fetches one extra row for hasMore", buildSearchSql(params({ sort: "recent", limit: "10", offset: "20" }), allowed, null).values.at(-1) === 31);
}

// ── Ranking ───────────────────────────────────────────────────
{
  const now = new Date("2026-09-26T00:00:00Z");
  const base = (over: Partial<Candidate>): Candidate => ({
    id: "x", projectId: "p1", kind: "ITEM", itemId: "i", versionId: null, crId: null, commitSha: null,
    title: "", body: "", partNumber: null, fileName: null, fileExt: null, authorId: null, authorName: null,
    released: false, checkedOut: false, crStatus: null, url: null, occurredAt: now, rank: 0, ...over,
  });
  const exactPart = base({ id: "exact", partNumber: "PRT-0012", title: "Mount", rank: 0.05 });
  const wordy = base({ id: "wordy", title: "prt 0012 notes everywhere", rank: 0.4, kind: "COMMIT" });
  const ranked = rankCandidates([wordy, exactPart], params({ q: "prt-0012" }), now);
  check("an exact part number outranks a higher text score", ranked[0].id === "exact");

  const item = base({ id: "item", kind: "ITEM", rank: 0.2 });
  const version = base({ id: "version", kind: "VERSION", rank: 0.2 });
  check("an item outranks its version at equal relevance", rankCandidates([version, item], params({ q: "bracket" }), now)[0].id === "item");

  const old = base({ id: "old", rank: 0.2, occurredAt: new Date("2025-01-01") });
  const fresh = base({ id: "fresh", rank: 0.2 });
  check("recency breaks a tie", rankCandidates([old, fresh], params({ q: "bracket" }), now)[0].id === "fresh");

  const commit = base({ id: "commit", kind: "COMMIT", commitSha: "abcdef1234567", rank: 0 });
  const other = base({ id: "other", kind: "ITEM", rank: 0.3 });
  check("a commit SHA prefix of 7+ characters ranks the commit first", rankCandidates([other, commit], params({ q: "abcdef1" }), now)[0].id === "commit");

  const byDate = rankCandidates([old, fresh, exactPart], params({ q: "prt-0012", sort: "recent" }), now);
  check("sort=recent ignores relevance", byDate[byDate.length - 1].id === "old" && byDate[0].id !== "old");

  check("snippet centers on the first match", makeSnippet(`${"lorem ".repeat(60)}gusset plate ${"ipsum ".repeat(40)}`, "gusset").includes("gusset"));
}

// ── Index documents ───────────────────────────────────────────
{
  const t0 = new Date("2026-09-01"), t1 = new Date("2026-09-10");
  const docs = itemDocs({
    id: "i1", projectId: "p1", name: "Motor mount", description: "Carries the NEMA 17", partNumber: "PRT-0007",
    currentRevision: "B", checkedOutById: "m2", checkoutNote: null, createdBy: { id: "m1", displayName: "Ada" },
    createdAt: t0, updatedAt: t1,
    versions: [
      { id: "v1", versionNumber: 1, fileName: "mount.step", note: "first cut", revision: "A", releasedAt: t0, commitSha: null, uploadedBy: { id: "m1", displayName: "Ada" }, createdAt: t0 },
      { id: "v2", versionNumber: 2, fileName: "mount_v2.step", note: "thicker wall", revision: null, releasedAt: null, commitSha: "0123456789abcdef0123456789abcdef01234567", uploadedBy: { id: "m2", displayName: "Bo" }, createdAt: t1 },
    ],
  });
  const item = docs.find((d) => d.kind === "ITEM")!;
  const v2 = docs.find((d) => d.id === "VERSION:v2")!;
  check("one item doc plus one per version", docs.length === 3);
  check("item doc carries the latest file and note", item.fileName === "mount_v2.step" && item.body.includes("thicker wall"));
  check("item doc is released when it has a revision", item.released === true && item.checkedOut === true);
  check("item doc indexes its description", item.weightB.includes("nema"));
  check("version doc indexes its commit SHA", v2.weightA.includes("0123456789abcdef"));
  check("an unreleased version is not released", v2.released === false && v2.authorId === "m2");
  check("version doc keeps the file extension", v2.fileExt === "step");

  const cr = crDoc({
    id: "c1", projectId: "p1", number: 12, title: "Stiffen mount", description: "Cracked in test", status: "OPEN",
    releaseNotes: null, reviewNote: null, author: { id: "m1", displayName: "Ada" }, createdAt: t0, updatedAt: t1,
    items: [{ note: "rib added", targetRevision: "C", item: { id: "i1", name: "Motor mount", partNumber: "PRT-0007" }, version: { fileName: "mount_v2.step" } }],
  });
  check("CR doc is findable by its number", cr.weightA.includes("cr12") && cr.title.startsWith("CR-12"));
  check("CR doc indexes covered part numbers", cr.weightA.includes("prt0007"));
  check("CR doc carries its status", cr.crStatus === "OPEN" && cr.released === false);

  const commit = commitDoc("p1", "org/vault", { sha: "feedface", message: "Tighten tolerance\n\nlonger body [vault-job:job-1]", authorName: "Bo", at: t1, paths: ["vault/items/i1/source/mount.step", "vault/items/i1/metadata.json"] });
  check("commit doc drops the job tag", !commit.body.includes("vault-job"));
  check("commit doc title is the first line", commit.title === "Tighten tolerance");
  check("commit doc links the single touched item", commit.itemId === "i1");
  check("commit doc links to GitHub", commit.url === "https://github.com/org/vault/commit/feedface");
  check("commit item ids come from vault paths only", commitItemIds(["README.md", "vault/items/a/x", "vault/items/b/y", "vault/items/a/z"]).join() === "a,b");
}

// ── Deep links ────────────────────────────────────────────────
{
  const link = vaultLink({ projectId: "p1", itemId: "i1", versionId: "v2" });
  check("links open Files → Vault on the exact version", link === "/clubpm/projects/p1?tab=files&sub=vault&vaultItem=i1&vaultVersion=v2");
  check("CR links carry the CR id", vaultLink({ projectId: "p1", crId: "c1" }).endsWith("vaultCr=c1"));
}

// ── searchVault: permission boundary through injected deps ────
async function searchTests() {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const rows = (n: number): Candidate[] => Array.from({ length: n }, (_, i) => ({
    id: `ITEM:i${i}`, projectId: "p1", kind: "ITEM", itemId: `i${i}`, versionId: null, crId: null, commitSha: null,
    title: `Item ${i}`, body: "", partNumber: null, fileName: null, fileExt: null, authorId: null, authorName: null,
    released: false, checkedOut: false, crStatus: null, url: null, occurredAt: new Date(2026, 0, n - i), rank: "0.1" as any,
  }));
  const deps = (allowed: string[], watched: string[] = [], n = 3): SearchDeps => ({
    accessibleProjectIds: async () => allowed,
    watchedItemIds: async () => watched,
    query: async (text, values) => { queries.push({ text, values }); return rows(n); },
  });

  let forbidden = false;
  try { await searchVault(ME, { q: "x", projectId: "secret" }, deps(["p1"])); } catch (e) { forbidden = e instanceof SearchForbidden; }
  check("searching a project you cannot open is forbidden", forbidden);
  check("a forbidden search never queries", queries.length === 0);

  const none = await searchVault(ME, { q: "x" }, deps([]));
  check("a member with no projects gets nothing and no query runs", none.results.length === 0 && queries.length === 0);

  const unwatched = await searchVault(ME, { q: "x", watching: "true" }, deps(["p1"], []));
  check("watching with no watched items short-circuits", unwatched.results.length === 0 && queries.length === 0);

  const page = await searchVault(ME, { q: "item", limit: "2" }, deps(["p1", "p2"], [], 3));
  check("the query is scoped to the caller's projects", JSON.stringify(queries[0].values[0]) === JSON.stringify(["p1", "p2"]));
  check("results are paged and report more", page.results.length === 2 && page.hasMore === true);
  check("results carry an app deep link", page.results[0].link.startsWith("/clubpm/projects/p1?tab=files&sub=vault&vaultItem="));
  check("the internal rank is not exposed", typeof (page.results[0] as any).rank === "undefined");
}

// ── Rebuild ───────────────────────────────────────────────────
async function rebuildTests() {
  type Doc = { projectId: string; kind: string; indexedAt: number };
  function world(opts: { githubFails?: boolean } = {}) {
    let clock = 100;
    const index = new Map<string, Doc>([
      ["ITEM:gone", { projectId: "p1", kind: "ITEM", indexedAt: 1 }],
      ["COMMIT:p1:old", { projectId: "p1", kind: "COMMIT", indexedAt: 1 }],
      ["ITEM:other-project", { projectId: "p2", kind: "ITEM", indexedAt: 1 }],
    ]);
    const log: string[] = [];
    const deps: RebuildDeps = {
      now: () => new Date(clock),
      listItemIds: async () => ["a", "b"],
      listCrIds: async () => ["c"],
      reindexItem: async (id) => { clock++; log.push(`item:${id}`); index.set(`ITEM:${id}`, { projectId: "p1", kind: "ITEM", indexedAt: clock }); },
      reindexCr: async (id) => { clock++; log.push(`cr:${id}`); index.set(`CR:${id}`, { projectId: "p1", kind: "CR", indexedAt: clock }); },
      syncCommits: async () => {
        if (opts.githubFails) throw new Error("GITHUB_502");
        clock++; log.push("commits"); index.set("COMMIT:p1:new", { projectId: "p1", kind: "COMMIT", indexedAt: clock }); return 1;
      },
      deleteStale: async (projectId, before, keepCommits) => {
        log.push("deleteStale");
        for (const [id, d] of index) if (d.projectId === projectId && d.indexedAt < before.getTime() && !(keepCommits && d.kind === "COMMIT")) index.delete(id);
      },
    };
    return { index, log, deps };
  }

  const ok = world();
  const result = await rebuildVaultSearch("p1", {}, ok.deps);
  check("rebuild reindexes every item and CR", result.items === 2 && result.changeRequests === 1 && result.commits === 1);
  check("stale docs are removed only after every upsert", ok.log.at(-1) === "deleteStale");
  check("a doc for a vanished item is removed", !ok.index.has("ITEM:gone"));
  check("a stale commit is removed when GitHub synced", !ok.index.has("COMMIT:p1:old") && ok.index.has("COMMIT:p1:new"));
  check("rebuild never touches another project", ok.index.has("ITEM:other-project"));

  const down = world({ githubFails: true });
  const downResult = await rebuildVaultSearch("p1", {}, down.deps);
  check("a GitHub outage is reported, not thrown", downResult.githubError === "GITHUB_502");
  check("a GitHub outage keeps the existing commit docs", down.index.has("COMMIT:p1:old"));
  check("a GitHub outage still rebuilds items", down.index.has("ITEM:a") && !down.index.has("ITEM:gone"));

  const offline = world();
  await rebuildVaultSearch("p1", { github: false }, offline.deps);
  check("--no-github skips the sync and keeps commits", !offline.log.includes("commits") && offline.index.has("COMMIT:p1:old"));
}

await searchTests();
await rebuildTests();

console.log(`vaultSearch: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
