// Career admin API tests: in-process Express with an in-memory store and stub auth. No DB, no network.
// Run: cd backend && npx tsx src/api/careerAdmin.test.ts
import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { createCareerAdminRouter } from "./careerAdmin.js";
import { METRICS } from "../services/impactMetricCore.js";
import { OnetLinkError } from "../services/onetLinkService.js";
import { SEED_SIGNALS, type AdminAttestation, type CareerAdminStore, type DemandSignalRow } from "../services/careerAdminService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) { if (cond) passed++; else { failed++; console.error(`  FAIL ${name}`); } }

const src = readFileSync(fileURLToPath(new URL("./careerAdmin.ts", import.meta.url)), "utf8");
check("never reads req.session", !/req\.session/.test(src));
check("defaults to requireAuth + requireAdmin", /requireAuth, requireAdmin/.test(src));
check("no model imports", !/gemini|aiRouter/i.test(src));

const records = METRICS.find(m => m.proof === "RECORDS")!;
const confirmed = METRICS.find(m => m.proof === "CONFIRMED")!;
check("team_led is the only CONFIRMED metric", METRICS.filter(m => m.proof === "CONFIRMED").length === 1 && confirmed.id === "team_led");

const att = (d: Partial<AdminAttestation> & { id: string; memberId: string }): AdminAttestation => ({
  kind: "CLAIM", status: "PENDING", metricId: null, label: "Saved money", value: 5, unit: "USD",
  evidenceUrl: "https://example.com/e", note: null, reviewNote: null, createdAt: new Date(0), ...d,
});

function makeStore() {
  const atts: AdminAttestation[] = [
    att({ id: "a-pending", memberId: "m1" }),
    att({ id: "a-needs", memberId: "m1", status: "NEEDS_PROOF" }),
    att({ id: "a-verified", memberId: "m1", status: "VERIFIED" }),
    att({ id: "a-own", memberId: "admin" }),
    att({ id: "a-confirm", memberId: "m1", kind: "CONFIRM", status: "VERIFIED", metricId: confirmed.id }),
  ];
  let signals: DemandSignalRow[] = [];
  let disabled: string[] = [];
  const snaps: Record<string, number> = { [`m1:${confirmed.id}`]: 4, [`m2:${confirmed.id}`]: 0 };
  const calls = { seed: 0, setLink: [] as unknown[], removeLink: [] as unknown[], curated: 0 };
  let n = 0;
  const store: CareerAdminStore = {
    onetStatus: async () => ({ release: { version: "31.0" }, counts: { occupations: 1 }, danglingLinks: [{ id: "l1" }] }),
    unlinked: async () => [{ id: "s1", name: "CAD" }],
    setLink: async (actor, input) => { calls.setLink.push({ actor, input }); if (input.ref === "bad") throw new OnetLinkError("INVALID", "Reference does not exist for this link kind"); return { id: "l1", ...input }; },
    removeLink: async (actor, input) => { calls.removeLink.push({ actor, input }); return { count: 1 }; },
    applyCurated: async () => { calls.curated++; return { applied: 3, skipped: 1 }; },
    disabledMetrics: async () => disabled,
    setDisabledMetrics: async ids => { disabled = ids; },
    listAttestations: async status => atts.filter(a => !status || a.status === status),
    attestation: async id => atts.find(a => a.id === id) ?? null,
    reviewClaim: async (id, d) => {
      const a = atts.find(x => x.id === id);
      if (!a || a.kind !== "CLAIM" || !["PENDING", "NEEDS_PROOF"].includes(a.status)) return false;
      Object.assign(a, { status: d.status, reviewNote: d.reviewNote, reviewerId: d.reviewerId, reviewedAt: d.reviewedAt });
      return true;
    },
    member: async id => (id === "bot" ? { id, isBot: true } : id === "ghost" ? null : { id, isBot: false }),
    snapshotValue: async (m, k) => snaps[`${m}:${k}`] ?? null,
    confirmMetric: async d => { const a = att({ id: `c${++n}`, memberId: d.memberId, kind: "CONFIRM", metricId: d.metricId, label: null, unit: null, value: d.value, status: "VERIFIED", reviewerId: d.reviewerId }); atts.push(a); return a; },
    listSignals: async () => signals,
    countSignals: async () => signals.length,
    seedSignals: async rows => { calls.seed++; if (signals.length) return false; signals = rows.map((r, i) => ({ id: `sig${i}`, ...r })); return true; },
    createSignal: async data => { const r = { id: `sig-new${++n}`, ...data }; signals.push(r); return r; },
    updateSignal: async (id, data) => { const r = signals.find(s => s.id === id); if (!r) return null; Object.assign(r, data); return r; },
    deleteSignal: async id => { const i = signals.findIndex(s => s.id === id); if (i < 0) return false; signals.splice(i, 1); return true; },
  };
  return { store, atts, calls, disabledNow: () => disabled };
}

async function main() {
  const h = makeStore();
  const notes: any[] = [];
  const app = express();
  app.use(express.json());
  app.use("/api/admin/career", createCareerAdminRouter({
    // Stub of [requireAuth, requireAdmin]: identity from a header, admin when the id starts with "admin".
    auth: [
      (req, res, next) => { const id = req.header("x-test-member"); if (!id) { res.status(401).json({ error: "Not authenticated" }); return; } req.memberId = id; next(); },
      (req, res, next) => { if (!req.memberId!.startsWith("admin")) { res.status(403).json({ error: "Forbidden" }); return; } next(); },
    ],
    store: h.store, notify: async n => { notes.push(n); return null; }, now: () => 1_000_000,
  }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/career`;
  const call = async (method: string, path: string, body?: unknown, member: string | null = "admin") => {
    const r = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(member ? { "x-test-member": member } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let json: any = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, json };
  };

  try {
    // auth
    for (const [m, p] of [["GET", "/onet/status"], ["GET", "/metrics"], ["GET", "/attestations"], ["GET", "/demand-signals"], ["POST", "/confirm"], ["POST", "/onet/apply-curated"]] as const) {
      check(`unauthenticated ${m} ${p} is 401`, (await call(m, p, m === "POST" ? {} : undefined, null)).status === 401);
      check(`non-admin ${m} ${p} is 403`, (await call(m, p, m === "POST" ? {} : undefined, "m1")).status === 403);
    }

    // onet
    let r = await call("GET", "/onet/status");
    check("onet status", r.status === 200 && r.json.release.version === "31.0" && r.json.danglingLinks.length === 1);
    r = await call("GET", "/onet/unlinked");
    check("onet unlinked", r.status === 200 && r.json.skills.length === 1);
    r = await call("POST", "/onet/apply-curated");
    check("apply curated delegates", r.status === 200 && r.json.applied === 3 && h.calls.curated === 1);
    r = await call("PUT", "/skills/s1/onet-links", { kind: "SOFTWARE", ref: "solidworks", relation: "BROADER" });
    check("put link passes admin actor from req.memberId", r.status === 200 && (h.calls.setLink[0] as any).actor.id === "admin" && (h.calls.setLink[0] as any).actor.isAdmin === true && (h.calls.setLink[0] as any).input.skillId === "s1");
    r = await call("PUT", "/skills/s1/onet-links", { kind: "NOPE", ref: "x" });
    check("bad link kind 400", r.status === 400);
    r = await call("PUT", "/skills/s1/onet-links", { kind: "ELEMENT", ref: "bad" });
    check("service OnetLinkError maps to 400", r.status === 400 && r.json.code === "INVALID");
    r = await call("DELETE", "/skills/s1/onet-links", { kind: "SOFTWARE", ref: "solidworks" });
    check("delete link", r.status === 200 && r.json.removed === 1);
    r = await call("DELETE", "/skills/s1/onet-links?kind=ELEMENT&ref=2.A.1.a");
    check("delete link via query", r.status === 200 && (h.calls.removeLink[1] as any).input.ref === "2.A.1.a");

    // metrics
    r = await call("GET", "/metrics");
    check("metrics list all with proof", r.status === 200 && r.json.metrics.length === METRICS.length && r.json.metrics.find((m: any) => m.id === confirmed.id).proof === "CONFIRMED");
    r = await call("PUT", "/metrics", { disabledMetrics: ["nope"] });
    check("unknown metric id rejected", r.status === 400 && h.disabledNow().length === 0);
    r = await call("PUT", "/metrics", { disabledMetrics: "x" });
    check("non-array rejected", r.status === 400);
    r = await call("PUT", "/metrics", { disabledMetrics: [records.id, records.id] });
    check("disabled deduped and flagged", r.status === 200 && h.disabledNow().length === 1 && r.json.metrics.find((m: any) => m.id === records.id).disabled === true);
    r = await call("PUT", "/metrics", []);
    check("bare array accepted and clears", r.status === 200 && h.disabledNow().length === 0);

    // attestations list
    r = await call("GET", "/attestations?status=PENDING");
    check("filter by status", r.status === 200 && r.json.attestations.every((a: any) => a.status === "PENDING") && r.json.attestations.length === 2);
    check("bad status filter 400", (await call("GET", "/attestations?status=WAT")).status === 400);

    // review
    r = await call("POST", "/attestations/a-pending/review", { status: "WAT" });
    check("review bad status 400", r.status === 400);
    r = await call("POST", "/attestations/a-pending/review", { status: "VERIFIED", note: "x".repeat(1001) });
    check("review note over 1000 rejected", r.status === 400 && notes.length === 0);
    r = await call("POST", "/attestations/a-pending/review", { status: "VERIFIED", note: "Looks good" });
    check("verify pending claim", r.status === 200 && r.json.attestation.status === "VERIFIED");
    const row = h.atts.find(a => a.id === "a-pending")!;
    check("reviewer recorded as req.memberId", row.reviewerId === "admin" && row.reviewedAt instanceof Date && row.reviewNote === "Looks good");
    check("owner notified once with the right type", notes.length === 1 && notes[0].recipientId === "m1" && notes[0].actorId === "admin" && notes[0].metadata.status === "VERIFIED" && typeof notes[0].slackText === "string");
    r = await call("POST", "/attestations/a-pending/review", { status: "DECLINED" });
    check("re-review of VERIFIED is 409", r.status === 409 && notes.length === 1);
    r = await call("POST", "/attestations/a-needs/review", { status: "DECLINED" });
    check("NEEDS_PROOF can be declined", r.status === 200 && r.json.attestation.status === "DECLINED" && notes.length === 2);
    r = await call("POST", "/attestations/a-verified/review", { status: "DECLINED" });
    check("already VERIFIED claim is 409", r.status === 409);
    r = await call("POST", "/attestations/a-own/review", { status: "VERIFIED" });
    check("own claim is 403", r.status === 403 && h.atts.find(a => a.id === "a-own")!.status === "PENDING");
    r = await call("POST", "/attestations/a-confirm/review", { status: "DECLINED" });
    check("CONFIRM rows are not reviewable", r.status === 409);
    r = await call("POST", "/attestations/missing/review", { status: "VERIFIED" });
    check("unknown attestation 404", r.status === 404);
    h.atts.push(att({ id: "a-np", memberId: "m2" }));
    r = await call("POST", "/attestations/a-np/review", { status: "NEEDS_PROOF", note: "Add a receipt" });
    check("needs-proof state", r.status === 200 && h.atts.find(a => a.id === "a-np")!.status === "NEEDS_PROOF" && notes.length === 3);
    r = await call("POST", "/attestations/a-np/review", { status: "VERIFIED" });
    check("NEEDS_PROOF can later be verified", r.status === 200 && notes.length === 4);

    // confirm
    r = await call("POST", "/confirm", { memberId: "m1", metricId: records.id });
    check("confirm rejects a RECORDS metric", r.status === 400);
    r = await call("POST", "/confirm", { memberId: "m1", metricId: "nope" });
    check("confirm rejects unknown metric", r.status === 400);
    r = await call("POST", "/confirm", { metricId: confirmed.id });
    check("confirm needs memberId", r.status === 400);
    r = await call("POST", "/confirm", { memberId: "m2", metricId: confirmed.id });
    check("zero snapshot is 409", r.status === 409);
    r = await call("POST", "/confirm", { memberId: "m3", metricId: confirmed.id });
    check("no snapshot is 409", r.status === 409);
    r = await call("POST", "/confirm", { memberId: "bot", metricId: confirmed.id });
    check("bot member 404", r.status === 404);
    r = await call("POST", "/confirm", { memberId: "ghost", metricId: confirmed.id });
    check("missing member 404", r.status === 404);
    r = await call("POST", "/confirm", { memberId: "admin", metricId: confirmed.id });
    check("admin confirming own metric is 403", r.status === 403);
    r = await call("POST", "/confirm", { memberId: "m1", metricId: confirmed.id });
    check("confirm creates VERIFIED CONFIRM at snapshot value", r.status === 201 && r.json.attestation.kind === "CONFIRM" && r.json.attestation.status === "VERIFIED" && r.json.attestation.value === 4 && r.json.attestation.reviewerId === "admin");

    // demand signals
    r = await call("GET", "/demand-signals");
    check("first GET seeds exactly three cited signals", r.status === 200 && r.json.signals.length === 3 && h.calls.seed === 1);
    check("seed matches the cited sources", r.json.signals.length === SEED_SIGNALS.length && r.json.signals.every((s: any) => s.sourceUrl.startsWith("https://")) &&
      ["NACE", "World Economic Forum", "LinkedIn"].every(n => r.json.signals.some((s: any) => s.sourceName.includes(n))));
    r = await call("GET", "/demand-signals");
    check("second GET does not seed again", r.json.signals.length === 3 && h.calls.seed === 1);
    const good = { title: "T", summary: "S", sourceName: "Src", sourceUrl: "https://example.com/x", publishedOn: "2026-04" };
    r = await call("POST", "/demand-signals", { ...good, sourceUrl: "http://example.com/x" });
    check("http URL rejected", r.status === 400);
    r = await call("POST", "/demand-signals", { ...good, sourceUrl: "javascript:alert(1)" });
    check("javascript URL rejected", r.status === 400);
    r = await call("POST", "/demand-signals", { ...good, sourceUrl: "https://user:pw@example.com/" });
    check("credentialed URL rejected", r.status === 400);
    r = await call("POST", "/demand-signals", { ...good, title: "x".repeat(161) });
    check("title cap enforced", r.status === 400);
    r = await call("POST", "/demand-signals", { ...good, publishedOn: "April 2026" });
    check("publishedOn format enforced", r.status === 400);
    r = await call("POST", "/demand-signals", { ...good, metricIds: ["nope"] });
    check("unknown metric id in signal rejected", r.status === 400);
    r = await call("POST", "/demand-signals", { ...good, metricIds: [records.id] });
    check("create signal", r.status === 201 && r.json.signal.active === true && r.json.signal.metricIds[0] === records.id);
    const id = r.json.signal.id;
    r = await call("PUT", `/demand-signals/${id}`, { sourceUrl: "http://x.com" });
    check("update validates https", r.status === 400);
    r = await call("PUT", `/demand-signals/${id}`, { active: false, title: "T2" });
    check("update signal", r.status === 200 && r.json.signal.active === false && r.json.signal.title === "T2");
    check("update unknown 404", (await call("PUT", "/demand-signals/none", { active: false })).status === 404);
    check("empty update 400", (await call("PUT", `/demand-signals/${id}`, {})).status === 400);
    check("delete signal", (await call("DELETE", `/demand-signals/${id}`)).status === 200);
    check("delete unknown 404", (await call("DELETE", `/demand-signals/${id}`)).status === 404);
  } finally {
    server.close();
  }
  console.log(`${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}
main().then(() => process.exit(process.exitCode ?? 0)).catch(e => { console.error(e); process.exit(1); });
