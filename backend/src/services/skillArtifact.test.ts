// Artifact builders + GitHub collector (fake GithubSource). No DB, no network.
// Run: cd backend && npx tsx src/services/skillArtifact.test.ts

import {
  capText, crReviewArtifact, enforceCap, extOf, hashParts, isBotLogin, isTooThin, languagesFromFiles, manualArtifact, maxArtifactChars,
  pullAuthorArtifact, pullReviewArtifact, taskArtifacts, topFolders, vaultVersionArtifact,
  type PullInput, type TaskInput, type VaultVersionInput,
} from "./skillArtifactCore.js";
import { collectGithubFromRepos, type GithubSource, type PullListing, type RepoTarget } from "./skillCollectors/github.js";
import type { CollectWindow } from "./skillCollectors/types.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`, detail ?? ""); }
}

// ── helpers ──
check("capText short unchanged", capText("hello", 100) === "hello");
check("capText truncates with marker", capText("x".repeat(500), 100).length <= 100 && capText("x".repeat(500), 100).endsWith("[truncated]"));
check("capText collapses blank runs", capText("a\n\n\n\n\nb", 100) === "a\n\nb");
check("capText null safe", capText(null, 10) === "");
check("hash stable", hashParts(["a", 1]) === hashParts(["a", 1]) && hashParts(["a", 1]) !== hashParts(["a", 2]));
check("extOf", extOf("src/App.tsx") === "tsx" && extOf("Makefile") === "" && extOf("a/b/.gitignore") === "");
check("bots detected", isBotLogin("dependabot[bot]") && isBotLogin("github-actions[bot]") && isBotLogin(null) && !isBotLogin("alice"));
check("max chars env", maxArtifactChars({ SKILLS_MAX_ARTIFACT_CHARS: "9000" } as NodeJS.ProcessEnv) === 9000 && maxArtifactChars({ SKILLS_MAX_ARTIFACT_CHARS: "5" } as NodeJS.ProcessEnv) === 6000);

const files = [
  { filename: "src/ui/Panel.tsx", additions: 120, deletions: 10 },
  { filename: "src/ui/Panel.css", additions: 20, deletions: 0 },
  { filename: "firmware/main.cpp", additions: 5, deletions: 1 },
  { filename: "README.md", additions: 1, deletions: 0 },
];
check("languages weighted by change size", languagesFromFiles(files)[0] === "TypeScript");
check("languages limited", languagesFromFiles(files, 2).length === 2);
check("folders shape", topFolders(files).includes("src/ui") && topFolders(files).includes("(root)"));

// ── pull artifacts ──
const pull: PullInput = {
  repo: "club/app", number: 12, title: "Add telemetry panel", body: "Adds a panel.\n\n\n\nDetails.", url: "https://github.com/club/app/pull/12",
  merged: true, mergedAt: new Date("2026-09-01T12:00:00Z"), closedAt: new Date("2026-09-01T12:00:00Z"),
  additions: 146, deletions: 11, changedFiles: 4, commits: 7, files,
  reviews: [{ login: "bob", state: "CHANGES_REQUESTED" }, { login: "bob", state: "APPROVED" }], authorLogin: "alice",
};
const authorA = pullAuthorArtifact(pull, { memberId: "m-alice", projectId: "p1", projectName: "Ground Station" });
check("author artifact basics", authorA.source === "GITHUB" && authorA.sourceRef === "club/app#12" && authorA.memberId === "m-alice");
check("occurredAt is merge time", authorA.occurredAt.getTime() === pull.mergedAt!.getTime());
check("facts carry shape not diff", authorA.facts.languages !== undefined && authorA.facts.lines_added === 146 && authorA.facts.changes_requested === 1);
check("body lists files not code", authorA.body.includes("src/ui/Panel.tsx (+120/-10)"));
check("commit count is not surfaced as a headline fact", authorA.facts.commits === 7 && !("commit_count" in authorA.facts));
const reviewA = pullReviewArtifact(pull, { memberId: "m-bob", login: "bob", states: ["CHANGES_REQUESTED", "APPROVED"] }, { projectId: "p1", projectName: "Ground Station" });
check("review artifact is REVIEW source, separate ref", reviewA.source === "REVIEW" && reviewA.sourceRef === "club/app#12:review:bob" && reviewA.memberRole.includes("reviewed"));
check("author and reviewer hashes differ", authorA.contentHash !== reviewA.contentHash);
const edited = pullAuthorArtifact({ ...pull, title: "Add telemetry panel v2" }, { memberId: "m-alice" });
check("title change changes hash", edited.contentHash !== authorA.contentHash);
const unmerged = pullAuthorArtifact({ ...pull, merged: false, mergedAt: null }, { memberId: "m-alice" });
check("unmerged phrased as closed", unmerged.memberRole.includes("without merging") && unmerged.facts.result === "closed without merging");
const huge = pullAuthorArtifact({ ...pull, body: "y".repeat(50_000), files: Array.from({ length: 300 }, (_, i) => ({ filename: `f${i}.ts`, additions: 1, deletions: 1 })) }, { memberId: "m" }, 3000);
check("body capped", huge.body.length <= 3000, huge.body.length);
check("file list capped at 25", (huge.body.match(/\(\+1\/-1\)/g) ?? []).length === 25);
check("enforceCap shrinks oversized body", enforceCap({ ...authorA, body: "z".repeat(20_000) }, 2000).body.length < 2000);

// ── tasks ──
const task: TaskInput = {
  id: "t1", title: "Design bracket for antenna mount", description: "Needs to survive vibration test.", tags: ["cad", "mechanical"],
  priority: "HIGH", milestoneTitle: "CDR", projectName: "Rover", projectId: "p2", completedAt: new Date("2026-09-10T00:00:00Z"),
  estimatedHours: 6, storyPoints: 3, subtaskTotal: 0, subtaskDone: 0, assigneeCount: 2, loggedMinutes: { a: 180, b: 30 },
  createdById: "lead", assigneeIds: ["a", "b"],
};
const ta = taskArtifacts(task);
check("one artifact per assignee", ta.length === 2 && ta[0].memberId === "a" && ta[1].memberId === "b");
check("per-member logged hours", ta[0].facts.hours_logged_by_this_person === 3 && ta[1].facts.hours_logged_by_this_person === 0.5);
check("multi-assignee phrased as shared", ta[0].memberRole.includes("several assignees"));
check("same task, different members, different hashes", ta[0].contentHash !== ta[1].contentHash);
check("creator gets no artifact without subtasks", !ta.some((x) => x.memberId === "lead"));
const withSubs = taskArtifacts({ ...task, assigneeIds: ["a"], assigneeCount: 1, subtaskTotal: 3, subtaskDone: 3 });
check("creator who split work gets a distinct artifact", withSubs.length === 2 && withSubs[1].memberId === "lead" && withSubs[1].sourceRef === "t1:created");
check("thin tasks skipped", isTooThin({ title: "fix", description: null, tags: [] }) && taskArtifacts({ ...task, title: "fix", description: null, tags: [] }).length === 0);
check("short title with description kept", !isTooThin({ title: "fix", description: "Repaired the intermittent solder joint on the radio board", tags: [] }));

// ── vault ──
const ver: VaultVersionInput = {
  versionId: "v1", itemId: "i1", itemName: "Antenna Bracket", partNumber: "ROV-0042", itemDescription: "6061 bracket", fileName: "bracket.SLDPRT",
  sizeBytes: 2_048_000, versionNumber: 3, versionCount: 3, revision: "B", released: true, note: "Added fillets after FEA", uploadedAt: new Date("2026-09-12T00:00:00Z"),
  uploadedById: "a", projectId: "p2", projectName: "Rover", parentNames: ["Mast Assembly"], childNames: [], crTitles: ["CR-4 Stiffen bracket"],
};
const cad = vaultVersionArtifact(ver);
check("cad artifact", cad.source === "CAD" && cad.sourceRef === "v1" && cad.facts.file_kind === "SolidWorks part" && cad.memberRole.includes("version 3"));
check("cad facts include BOM + CR context", String(cad.facts.used_in_assemblies).includes("Mast") && String(cad.facts.change_requests).includes("CR-4"));
check("first version phrased as creation", vaultVersionArtifact({ ...ver, versionNumber: 1 }).memberRole.includes("created"));
check("no bytes in body", !cad.body.includes("2048000") && cad.body.includes("Added fillets"));
const cr = crReviewArtifact({ crId: "c1", number: 4, title: "Stiffen bracket", description: "Thicker wall", status: "APPROVED", decidedAt: new Date("2026-09-13T00:00:00Z"), reviewNote: "Checked FEA margin", itemNames: ["Antenna Bracket"], projectId: "p2", projectName: "Rover" }, "rev", "reviewer");
check("CR review artifact", cr.source === "REVIEW" && cr.sourceRef === "cr:c1:reviewer" && cr.memberRole.includes("approved"));

// ── manual ──
const man = manualArtifact({ id: "x1", memberId: "m", title: "Mentored 3 new members on soldering", description: "Ran two sessions.", occurredAt: new Date("2026-09-01"), enteredByOther: false });
check("manual is flagged self-described", man.source === "MANUAL" && man.memberRole.includes("themselves"));
check("manual entered by lead is distinguishable", manualArtifact({ id: "x1", memberId: "m", title: "t", description: "d", occurredAt: new Date(), enteredByOther: true }).memberRole.includes("team lead"));

// ── GitHub collector with a fake source ──
const repos: RepoTarget[] = [{ projectRepoId: "r1", slug: "club/app", projectId: "p1", projectName: "Ground Station" }, { projectRepoId: "r2", slug: "club/app", projectId: "p9", projectName: "Dup" }];
const logins = new Map([["alice", "m-alice"], ["bob", "m-bob"]]);
const win: CollectWindow = { since: new Date("2026-08-25T00:00:00Z"), until: new Date("2026-09-08T00:00:00Z"), maxArtifacts: 50, maxChars: 6000 };
const listing = (over: Partial<PullListing> & { number: number }): PullListing => ({
  title: `PR ${over.number}`, body: "body", url: `u${over.number}`, authorLogin: "alice", merged: true, mergedAt: new Date("2026-09-01T00:00:00Z"), closedAt: new Date("2026-09-01T00:00:00Z"), draft: false, ...over,
});
function fakeSource(pulls: PullListing[], reviews: Record<number, { login: string; state: string }[]> = {}, opts: { truncated?: boolean; failOn?: number } = {}): GithubSource & { listCalls: number } {
  const s = {
    listCalls: 0,
    async listClosedPulls() { s.listCalls++; return { pulls, truncated: !!opts.truncated }; },
    async getPullStats(_r: unknown, n: number) { if (n === opts.failOn) throw new Error("boom"); return { additions: 100, deletions: 5, changedFiles: 4, commits: 3 }; },
    async getPullFiles() { return files; },
    async getPullReviews(_r: unknown, n: number) { return reviews[n] ?? []; },
  };
  return s;
}
{
  const src = fakeSource(
    [listing({ number: 1 }), listing({ number: 2, authorLogin: "dependabot[bot]" }), listing({ number: 3, draft: true }), listing({ number: 4, authorLogin: "stranger" })],
    { 1: [{ login: "bob", state: "APPROVED" }, { login: "alice", state: "COMMENTED" }, { login: "ghost", state: "APPROVED" }, { login: "copilot[bot]", state: "COMMENTED" }] },
  );
  const r = await collectGithubFromRepos(repos, logins, async () => src, win);
  const mine = r.artifacts.map((a) => `${a.memberId}:${a.source}`).sort();
  check("author + reviewer artifacts, nothing else", JSON.stringify(mine) === JSON.stringify(["m-alice:GITHUB", "m-bob:REVIEW"]), mine);
  check("bots and drafts skipped", !r.artifacts.some((a) => a.sourceRef.includes("#2") || a.sourceRef.includes("#3")));
  check("self-review not counted", !r.artifacts.some((a) => a.memberId === "m-alice" && a.source === "REVIEW"));
  check("unmapped logins counted once each (stranger, ghost)", r.unmapped === 2, r.unmapped);
  check("repo linked to two projects read once", src.listCalls === 1);
  check("first project wins attribution", r.artifacts.every((a) => a.projectId === "p1"));
  check("not truncated", !r.truncated && r.resumeFrom === null && r.errors.length === 0);
}
{
  const r = await collectGithubFromRepos(repos, logins, async () => fakeSource([listing({ number: 1 })]), { ...win, memberIds: ["m-bob"] });
  check("member filter applied", r.artifacts.length === 0);
}
{
  const r = await collectGithubFromRepos(repos, logins, async () => fakeSource([listing({ number: 1 }), listing({ number: 2, mergedAt: new Date("2026-09-02T00:00:00Z") })], {}, { failOn: 1 }), win);
  check("one failing PR is recorded, others still collected", r.errors.length === 1 && r.errors[0].includes("#1") && r.artifacts.length === 1);
}
{
  const r = await collectGithubFromRepos(repos, logins, async () => null, win);
  check("repo without access recorded, not thrown", r.errors.length === 1 && r.artifacts.length === 0);
}
{
  const r = await collectGithubFromRepos(repos, logins, async () => fakeSource([listing({ number: 1 }), listing({ number: 2, mergedAt: new Date("2026-09-03T00:00:00Z") })], {}, { truncated: true }), win);
  check("truncation reports a resume point at newest kept", r.truncated && r.resumeFrom?.toISOString() === "2026-09-03T00:00:00.000Z", r.resumeFrom);
}
{
  const r = await collectGithubFromRepos(repos, logins, async () => fakeSource([listing({ number: 1 }), listing({ number: 2, mergedAt: new Date("2026-09-03T00:00:00Z") })]), { ...win, maxArtifacts: 1 });
  check("maxArtifacts caps and flags truncation", r.artifacts.length === 1 && r.truncated);
}
{
  const unmergedSmall = listing({ number: 5, merged: false, mergedAt: null });
  const small: GithubSource = { ...fakeSource([unmergedSmall]), async getPullStats() { return { additions: 2, deletions: 1, changedFiles: 1, commits: 1 }; } };
  const r = await collectGithubFromRepos(repos, logins, async () => small, win);
  check("tiny unreviewed closed PR is noise, skipped", r.artifacts.length === 0);
  const reviewed = fakeSource([unmergedSmall], { 5: [{ login: "bob", state: "COMMENTED" }] });
  const r2 = await collectGithubFromRepos(repos, logins, async () => reviewed, win);
  check("closed PR with review activity kept", r2.artifacts.some((a) => a.source === "GITHUB" && a.memberRole.includes("without merging")));
}

console.log(`skillArtifact: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
