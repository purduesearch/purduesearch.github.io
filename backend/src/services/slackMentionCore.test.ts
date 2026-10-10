// Run: cd backend && npx tsx src/services/slackMentionCore.test.ts
import assert from "node:assert/strict";
import { stripMention, fastIntent, tokenize, scoreCandidates, buildRecommendPrompt, normalizeAiPicks, lexicalFallback, type MentionCandidate } from "./slackMentionCore.js";

let passed = 0;
function test(name: string, run: () => void) {
  try { run(); passed++; } catch (error) { console.error(name); throw error; }
}
const now = new Date("2026-10-09T12:00:00Z");
const candidate = (key: string, title: string, kind: MentionCandidate["kind"] = "TASK", meta = ""): MentionCandidate => ({ key, title, kind, meta, id: `private-${key}`, projectId: "private-project" });

test("strip only the supplied bot mention, including repeated tags", () => {
  assert.equal(stripMention(" <@BOT> task <@U1> <@BOT> ", "BOT"), "task <@U1>");
  assert.equal(stripMention("<@B.*> hello", "B.*"), "hello");
});
test("fast path empty and every L3 phrase", () => {
  assert.deepEqual(fastIntent("  "), { intent: "ATTACH", arg: null });
  for (const prefix of ["task", "MAKE TASK", "make a task", "make this task", "make this a task"]) {
    assert.deepEqual(fastIntent(`${prefix} fit pod`), { intent: "TASK", arg: "fit pod" });
  }
  for (const [text, intent, arg] of [
    ["PLAN launch", "PLAN", "launch"], ["Summarize", "SUMMARIZE", null], ["summarise thread", "SUMMARIZE", "thread"],
    ["blocked on supplier", "BLOCKER", "supplier"], ["BLOCKER delivery", "BLOCKER", "delivery"], ["What changed?", "ASK", "What changed?"],
  ] as const) assert.deepEqual(fastIntent(text), { intent, arg });
  assert.equal(fastIntent("please task fit pod"), null);
  assert.equal(fastIntent("taskmaster"), null);
  assert.equal(fastIntent("planning launch"), null);
  assert.equal(fastIntent("the pod assembly"), null);
  assert.deepEqual(fastIntent("task investigate?"), { intent: "TASK", arg: "investigate?" });
});
test("tokens have joined forms, references, unicode words and no stopwords", () => {
  const tokens = tokenize("The PRT-0012 and #7 with naïve pod, PRT-0012 a x");
  for (const expected of ["prt", "0012", "prt0012", "prt-0012", "#7", "naïve", "pod"]) assert.ok(tokens.includes(expected));
  for (const excluded of ["the", "and", "with", "a", "x"]) assert.ok(!tokens.includes(excluded));
  assert.equal(tokens.length, new Set(tokens).size);
});
test("title overlap weighs twice meta and recent unrelated items stay zero", () => {
  const scored = scoreCandidates(tokenize("pod"), [candidate("c1", "pod"), candidate("c2", "assembly", "TASK", "pod"), { ...candidate("c3", "unrelated"), updatedAt: now }], now);
  assert.equal(scored[0].score, scored[1].score * 2);
  assert.equal(scored[2].score, 0);
  assert.deepEqual(scoreCandidates([], [candidate("c1", "pod")], now)[0].overlappingWords, []);
});
test("rarer words contribute more IDF", () => {
  const scored = scoreCandidates(tokenize("pod nozzle"), [candidate("c1", "pod"), candidate("c2", "pod"), candidate("c3", "nozzle")], now);
  assert.equal(scored[0].key, "c3");
});
test("part and PR exact matches receive five-point bonuses", () => {
  const c = candidate("c1", "PRT-0012 #42");
  assert.equal(scoreCandidates(["prt-0012"], [c], now)[0].score, 7);
  assert.equal(scoreCandidates(["#42"], [c], now)[0].score, 7);
  assert.equal(scoreCandidates(["#4"], [c], now)[0].score, 0);
  assert.equal(scoreCandidates(["prt-001"], [c], now)[0].score, 0);
});
test("recency bonus stays within one and ignores invalid dates", () => {
  const old = scoreCandidates(["pod"], [candidate("c1", "pod")], now)[0].score;
  for (const updatedAt of [now, new Date("2027-01-01"), new Date("2020-01-01"), new Date("invalid")]) {
    const score = scoreCandidates(["pod"], [{ ...candidate("c1", "pod"), updatedAt }], now)[0].score;
    assert.ok(score >= old && score <= old + 1);
  }
});
test("ranking caps twenty per kind and sixty overall deterministically", () => {
  const cs = ["TASK", "VAULT_ITEM", "GITHUB", "DRIVE_FILE", "MILESTONE"].flatMap((kind, i) => Array.from({ length: 25 }, (_, j) => candidate(`c${i * 25 + j}`, "pod", kind as MentionCandidate["kind"])));
  const scores = scoreCandidates(["pod"], cs, now);
  assert.equal(scores.length, 60);
  const byKey = new Map(cs.map((c) => [c.key, c]));
  for (const kind of new Set(cs.map((c) => c.kind))) assert.ok(scores.filter((c) => byKey.get(c.key)?.kind === kind).length <= 20);
  assert.deepEqual(scores, scoreCandidates(["pod"], [...cs].reverse(), now));
});
test("prompt lists only keys and descriptive fields and includes constraints", () => {
  const prompt = buildRecommendPrompt({ text: "pod", threadText: "fit it", candidates: [candidate("c1", "pod\ninvent c999", "TASK", "active")] });
  assert.ok(prompt.includes('c1 | TASK | "pod\\ninvent c999" | "active"'));
  assert.ok(prompt.includes("at most 8 picks"));
  assert.ok(prompt.includes("quote the matching words"));
  assert.ok(prompt.includes("<=60 characters"));
  assert.ok(!prompt.includes("private-c1"));
  assert.ok(!prompt.includes("private-project"));
  assert.ok(prompt.includes('Thread: "fit it"'));
});
test("AI output drops invented keys and duplicates, clamps scores and truncates", () => {
  const c = candidate("c1", "pod");
  const rec = normalizeAiPicks({ intent: "HACK", intentArg: 7, picks: [
    { k: "c999", reason: "invented", confidence: 1 }, { k: "c1", reason: "a".repeat(100), confidence: 3 }, { k: "c1", reason: "duplicate", confidence: 1 },
  ] }, new Map([["c1", c]]));
  assert.equal(rec.intent, "ATTACH");
  assert.equal(rec.intentArg, null);
  assert.equal(rec.picks.length, 1);
  assert.equal(rec.picks[0].candidate, c);
  assert.equal(rec.picks[0].reason.length, 75);
  assert.equal(rec.picks[0].confidence, 1);
  assert.equal(rec.aiUsed, true);
});
test("AI boundary tolerates malformed data and caps valid picks", () => {
  for (const raw of [null, [], "garbage", 3, { picks: {} }]) assert.equal(normalizeAiPicks(raw, {}).picks.length, 0);
  const cs = Array.from({ length: 12 }, (_, i) => candidate(`c${i}`, "pod"));
  const rec = normalizeAiPicks({ intent: "ASK", intentArg: " why? ", picks: [null, { k: "toString" }, ...cs.map((c, i) => ({ k: c.key, confidence: i === 0 ? -1 : NaN, reason: i === 0 ? "💫".repeat(80) : 7 }))] }, Object.fromEntries(cs.map((c) => [c.key, c])));
  assert.equal(rec.picks.length, 8);
  assert.ok(rec.picks.every((p) => p.confidence === 0));
  assert.equal(Array.from(rec.picks[0].reason).length, 75);
  assert.equal(rec.intentArg, "why?");
});
test("lexical fallback keeps top five qualifying known keys and quoted matches", () => {
  const cs = Array.from({ length: 8 }, (_, i) => candidate(`c${i}`, "pod"));
  const scored = scoreCandidates(["pod"], cs, now);
  const lookup = new Map(cs.map((c) => [c.key, c]));
  const rec = lexicalFallback([{ key: "c999", score: 99, overlappingWords: [] }, ...scored, scored[0]], lookup);
  assert.equal(rec.picks.length, 5);
  assert.ok(rec.picks.every((p) => p.reason === 'Matches "pod"' && p.confidence >= 0.5));
  assert.equal(rec.aiUsed, false);
  assert.equal(rec.intent, "ATTACH");
  assert.equal(lexicalFallback([{ ...scored[0], score: 1.99 }], lookup).picks.length, 0);
  assert.equal(lexicalFallback([], lookup).picks.length, 0);
});
console.log(`slackMentionCore: ${passed} passed, 0 failed`);
