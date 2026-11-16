// Directory + intro service tests: in-memory store, injected clock/notify/mailer. No DB, no network, no email.
// Run: cd backend && npx tsx src/services/introService.test.ts
import { METRICS } from "./impactMetricCore.js";
import type { CardSource } from "./talentDirectoryCore.js";
import type { SponsorUserRow } from "./sponsorAuthService.js";
import { runSponsorMaintenance } from "./sponsorAuthService.js";
import {
  INTRO_LIMIT, INTRO_TTL_MS, IntroError, acceptEmailHtml, createIntroService, expireIntroRequests,
  type IntroRow, type IntroStore,
} from "./introService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) { if (cond) passed++; else { failed++; console.error(`  FAIL ${name}`); } }
async function code(p: Promise<unknown>): Promise<string> { try { await p; return "ok"; } catch (e) { return e instanceof IntroError ? e.code : `THREW ${(e as Error).message}`; } }

const records = METRICS.find(m => m.proof === "RECORDS")!;
const DAY = 24 * 60 * 60 * 1000;

interface FakeMember { id: string; displayName: string; email: string | null; isBot?: boolean; deactivated?: boolean; share?: boolean; gradTerm?: string; skills?: string[] }

function fakeIntroStore(members: FakeMember[], sponsors: SponsorUserRow[]) {
  const intros: IntroRow[] = [];
  let seq = 0;
  const shared = (m: FakeMember | undefined) => !!m && !m.isBot && !m.deactivated && !!m.share;
  const src = (m: FakeMember): CardSource => ({
    memberId: m.id, displayName: m.displayName,
    profile: { major: "ME", gradTerm: m.gradTerm ?? null, openTo: ["INTERNSHIP"], availableFrom: null, headline: null },
    targets: [{ code: "17-2141.00", title: "Mechanical Engineers" }],
    snapshots: [{ metricId: records.id, value: 7, detail: null }],
    attestations: [
      { id: `p-${m.id}`, kind: "CLAIM", status: "PENDING", label: "Pending secret claim", value: 3, unit: "USD" },
      { id: `v-${m.id}`, kind: "CLAIM", status: "VERIFIED", label: "Sponsorship raised", value: 500, unit: "USD" },
    ],
    // Member custom templates are unreviewed text: they must never reach a sponsor or the accept email.
    bulletRows: [
      { sourceKind: "METRIC", sourceId: records.id, included: true, position: 0, template: "Did {n} things as lead of a 30-person team" },
      { sourceKind: "ATTESTATION", sourceId: `v-${m.id}`, included: true, position: 0, template: "Raised $50,000 and led 40 engineers ({n} USD verified)" },
    ],
    certifications: [], badges: [], skillNames: m.skills ?? [],
  });
  const withSponsor = (r: IntroRow) => ({ ...r, sponsor: sponsors.find(s => s.id === r.sponsorUserId)! });
  const store: IntroStore = {
    sharedMemberIds: async () => members.filter(shared).map(m => m.id),
    sharedMember: async id => { const m = members.find(x => x.id === id); return shared(m) ? { id: m!.id, displayName: m!.displayName, email: m!.email } : null; },
    member: async id => { const m = members.find(x => x.id === id); return m ? { id: m.id, displayName: m.displayName, email: m.email } : null; },
    cardSource: async id => { const m = members.find(x => x.id === id); return m ? src(m) : null; },
    disabledMetrics: async () => [],
    createIntro: async (row, rule) => {
      if (intros.some(i => i.sponsorUserId === row.sponsorUserId && i.memberId === row.memberId && i.status === "PENDING" && i.expiresAt >= rule.now)) return "DUPLICATE";
      if (intros.filter(i => i.sponsorUserId === row.sponsorUserId && i.createdAt > rule.since).length >= rule.limit) return "RATE_LIMITED";
      const r: IntroRow = { ...row, id: `i${++seq}`, status: "PENDING", respondedAt: null };
      intros.push(r);
      return { ...r };
    },
    listForSponsor: async id => intros.filter(i => i.sponsorUserId === id).map(i => ({ ...i })),
    listForMember: async id => intros.filter(i => i.memberId === id).map(withSponsor),
    find: async id => { const r = intros.find(i => i.id === id); return r ? withSponsor(r) : null; },
    respond: async (id, memberId, status, now) => {
      const r = intros.find(i => i.id === id && i.memberId === memberId && i.status === "PENDING" && i.expiresAt >= now);
      if (!r) return false;
      r.status = status; r.respondedAt = now;
      return true;
    },
    expireDue: async (now, scope = {}) => {
      let n = 0;
      for (const i of intros) {
        if (i.status !== "PENDING" || i.expiresAt >= now) continue;
        if (scope.memberId && i.memberId !== scope.memberId) continue;
        if (scope.sponsorUserId && i.sponsorUserId !== scope.sponsorUserId) continue;
        i.status = "EXPIRED"; n++;
      }
      return n;
    },
  };
  return { store, intros };
}

const sponsor = (id: string, email: string, over: Partial<SponsorUserRow> = {}): SponsorUserRow => ({
  id, email, name: "Sam Sponsor", tokenVersion: 0, disabledAt: null, org: { id: "o1", name: "Acme Rockets", active: true, accessUntil: null }, ...over,
});

async function main() {
  let clock = 1_800_000_000_000;
  const members: FakeMember[] = [
    { id: "m-zed", displayName: "Zed Young", email: "zed@purdue.test", share: true, gradTerm: "2027-05", skills: ["SolidWorks"] },
    { id: "m-ada", displayName: "Ada Lovelace", email: "ada@purdue.test", share: true, gradTerm: "2029-05" },
    { id: "m-bea", displayName: "bea Cole", email: "bea@purdue.test", share: true, gradTerm: "2028-05" },
    { id: "m-private", displayName: "Pat Private", email: "pat@purdue.test", share: false },
    { id: "m-bot", displayName: "Constellation Bot", email: null, share: true, isBot: true },
    { id: "m-gone", displayName: "Gone Member", email: "gone@purdue.test", share: true, deactivated: true },
    { id: "m-quit", displayName: "Quinn\r\nBcc: evil@x.test Quitter", email: "quinn@purdue.test", share: true },
  ];
  for (let i = 0; i < 25; i++) members.push({ id: `m-x${String(i).padStart(2, "0")}`, displayName: `Xavier ${i}`, email: `x${i}@purdue.test`, share: true });
  const sponsors = [sponsor("s1", "sam@acme.test"), sponsor("s2", "kim@other.test", { name: null }), sponsor("s3", "off@gone.test", { disabledAt: new Date(0) }),
    sponsor("s4", "mal@evil.test", { name: "<!channel> <https://evil.test|click>", org: { id: "o4", name: "Evil & Co", active: true, accessUntil: null } })];
  const h = fakeIntroStore(members, sponsors);
  const notes: { recipientId: string; message: string; slackText: string; metadata: Record<string, unknown> }[] = [];
  const mails: { to: string; subject: string; html: string }[] = [];
  let mailFails = false;
  const svc = createIntroService({
    store: h.store, now: () => clock, frontendUrl: () => "https://front.test/",
    notify: async n => { notes.push(n); },
    mailer: async m => { if (mailFails) throw new Error("smtp down"); mails.push(m); },
  });

  // Directory
  let dir = await svc.directory({});
  const ids = dir.members.map(m => m.memberId);
  check("non-shared member invisible in directory", !ids.includes("m-private"));
  check("bot invisible", !ids.includes("m-bot"));
  check("deactivated invisible", !ids.includes("m-gone"));
  check("alphabetical by card name", JSON.stringify(ids.slice(0, 2)) === JSON.stringify(["m-ada", "m-bea"]) && ids[ids.length - 1] === "m-zed");
  check("cards carry short names only", dir.members.every(m => !m.name.includes("Lovelace")) && dir.members[0].name === "Ada L.");
  check("pending claim never in a directory card", !JSON.stringify(dir).includes("Pending secret claim"));
  check("no email in directory", !JSON.stringify(dir).includes("@purdue.test"));
  dir = await svc.directory({ sort: "gradTerm" });
  check("gradTerm sort", JSON.stringify(dir.members.slice(0, 3).map(m => m.memberId)) === JSON.stringify(["m-zed", "m-bea", "m-ada"]));
  dir = await svc.directory({ tool: "solidworks" });
  check("tool filter narrows via skill names, names not exposed", dir.members.length === 1 && dir.members[0].memberId === "m-zed" && !JSON.stringify(dir).includes("SolidWorks"));
  dir = await svc.directory({ gradTerm: "2028" });
  check("gradTerm year filter", dir.members.length === 1 && dir.members[0].memberId === "m-bea");
  check("bad filter 400", (await code(svc.directory({ openTo: "GIG" }))) === "INVALID");

  // Intro create
  const s1 = sponsors[0];
  const msg = { message: "We'd love to talk about our summer internship.", opportunityId: "opp-1" };
  check("non-shared member 404 on intro", (await code(svc.requestIntro(s1, { memberId: "m-private", ...msg }))) === "NOT_FOUND");
  check("unknown member 404", (await code(svc.requestIntro(s1, { memberId: "nope", ...msg }))) === "NOT_FOUND");
  check("bot 404", (await code(svc.requestIntro(s1, { memberId: "m-bot", ...msg }))) === "NOT_FOUND");
  check("deactivated 404", (await code(svc.requestIntro(s1, { memberId: "m-gone", ...msg }))) === "NOT_FOUND");
  check("empty message 400", (await code(svc.requestIntro(s1, { memberId: "m-ada", message: "   " }))) === "INVALID");
  check("long message 400", (await code(svc.requestIntro(s1, { memberId: "m-ada", message: "x".repeat(1001) }))) === "INVALID");
  check("long opportunityId 400", (await code(svc.requestIntro(s1, { memberId: "m-ada", message: "hi", opportunityId: "o".repeat(65) }))) === "INVALID");
  check("nothing stored or notified on failures", h.intros.length === 0 && notes.length === 0);

  const created = await svc.requestIntro(s1, { memberId: "m-ada", ...msg });
  check("created pending, expires in 21 days", created.intro.status === "PENDING" && (created.intro.expiresAt as Date).getTime() === clock + INTRO_TTL_MS);
  check("create response has no member email", !JSON.stringify(created).includes("ada@purdue.test"));
  check("notification sent once", notes.length === 1 && notes[0].recipientId === "m-ada");
  check("notification deep link from FRONTEND_URL", notes[0].slackText.includes("https://front.test/clubpm/profile?tab=skills&view=career") && notes[0].metadata.link === "https://front.test/clubpm/profile?tab=skills&view=career");
  check("notification names org + sponsor, no sponsor email", notes[0].message.includes("Acme Rockets") && notes[0].message.includes("Sam Sponsor")
    && !JSON.stringify(notes[0]).includes("sam@acme.test"));
  check("second pending for same pair 409", (await code(svc.requestIntro(s1, { memberId: "m-ada", ...msg }))) === "CONFLICT" && notes.length === 1);

  // Email absent before accept
  let sl = await svc.sponsorIntros("s1");
  check("sponsor list: member email absent before accept", sl.intros.length === 1 && !("memberEmail" in sl.intros[0]) && !JSON.stringify(sl).includes("ada@purdue.test"));
  check("sponsor list: short member name", sl.intros[0].member.name === "Ada L.");
  let inbox = await svc.memberIntros("m-ada");
  check("member inbox: sponsor email absent before accept", inbox.intros.length === 1 && !JSON.stringify(inbox).includes("sam@acme.test")
    && inbox.intros[0].sponsor.org === "Acme Rockets" && inbox.intros[0].sponsor.name === "Sam Sponsor" && inbox.intros[0].message === msg.message);
  check("other member's inbox empty", (await svc.memberIntros("m-bea")).intros.length === 0);
  check("other sponsor's list empty", (await svc.sponsorIntros("s2")).intros.length === 0);

  // Respond
  const id = created.intro.id;
  check("respond needs boolean", (await code(svc.respond("m-ada", id, { accept: "yes" }))) === "INVALID");
  check("not own request 404", (await code(svc.respond("m-bea", id, { accept: true }))) === "NOT_FOUND");
  check("unknown request 404", (await code(svc.respond("m-ada", "nope", { accept: true }))) === "NOT_FOUND");
  const acc = await svc.respond("m-ada", id, { accept: true });
  check("accept ok + emailed", acc.status === "ACCEPTED" && acc.emailed === true);
  check("accept emails sponsor with member email + shareable bullets only", mails.length === 1 && mails[0].to === "sam@acme.test"
    && mails[0].html.includes("ada@purdue.test") && mails[0].html.includes("7") && !mails[0].html.includes("Pending secret claim"));
  check("accept email uses canonical wording, never the member's custom template", mails.length === 1
    && mails[0].html.includes("Sponsorship raised: 500 USD") && !mails[0].html.includes("30-person") && !mails[0].html.includes("50,000")
    && !mails[0].html.includes("40 engineers"));
  check("second response 409", (await code(svc.respond("m-ada", id, { accept: false }))) === "CONFLICT");
  sl = await svc.sponsorIntros("s1");
  check("member email present after accept", sl.intros[0].status === "ACCEPTED" && (sl.intros[0] as { memberEmail?: string }).memberEmail === "ada@purdue.test");
  inbox = await svc.memberIntros("m-ada");
  check("sponsor email present to member after accept", inbox.intros[0].sponsor.email === "sam@acme.test");

  // Decline: no email, never reveals
  const c2 = await svc.requestIntro(s1, { memberId: "m-bea", message: "hello" });
  const dec = await svc.respond("m-bea", c2.intro.id, { accept: false });
  check("decline ok, no email", dec.status === "DECLINED" && dec.emailed === false && mails.length === 1);
  sl = await svc.sponsorIntros("s1");
  check("declined has no member email", !JSON.stringify(sl).includes("bea@purdue.test"));
  check("accept after decline 409", (await code(svc.respond("m-bea", c2.intro.id, { accept: true }))) === "CONFLICT");
  check("after decline, a new request may be sent", (await code(svc.requestIntro(s1, { memberId: "m-bea", message: "again" }))) === "ok");

  // Mail failure does not undo accept
  mailFails = true;
  const c3 = await svc.requestIntro(s1, { memberId: "m-zed", message: "hi" });
  const r3 = await svc.respond("m-zed", c3.intro.id, { accept: true });
  check("mail failure: accept stands", r3.status === "ACCEPTED" && r3.emailed === false && h.intros.find(i => i.id === c3.intro.id)!.status === "ACCEPTED");
  mailFails = false;

  // Disabled sponsor: decline allowed, accept refused
  const s3 = sponsors[2];
  const c4 = await svc.requestIntro(s3, { memberId: "m-x00", message: "hi" });
  check("accept for an ineligible sponsor 409", (await code(svc.respond("m-x00", c4.intro.id, { accept: true }))) === "CONFLICT" && h.intros.find(i => i.id === c4.intro.id)!.status === "PENDING");

  // Sponsor-supplied names are escaped in the Slack text; the link stays the only Slack link.
  const quitMember = members.find(x => x.id === "m-quit")!;
  const before4 = notes.length;
  const c5 = await svc.requestIntro(sponsors[3], { memberId: "m-quit", message: "<script>alert(1)</script> & more" });
  const slack = notes[before4].slackText;
  check("slack text escapes sponsor name/org", !slack.includes("<!channel>") && !slack.includes("<https://evil.test") && slack.includes("&lt;!channel&gt;") && slack.includes("Evil &amp; Co")
    && (slack.match(/</g) ?? []).length === 1);
  check("notification never carries the sponsor message body", !JSON.stringify(notes[before4]).includes("alert(1)"));
  check("member inbox gets message as data", (await svc.memberIntros("m-quit")).intros[0].message === "<script>alert(1)</script> & more");

  // Member turns sharing off after the request: sponsor sees nothing about them; accept refused, decline allowed.
  quitMember.share = false;
  let l4 = await svc.sponsorIntros("s4");
  check("unshared member redacted in sponsor list", l4.intros.length === 1 && l4.intros[0].member.id === null && l4.intros[0].member.sharing === false
    && !JSON.stringify(l4).includes("Quinn") && !JSON.stringify(l4).includes("m-quit") && !JSON.stringify(l4).includes("quinn@purdue.test"));
  check("unshared member: accept 409, nothing mailed", (await code(svc.respond("m-quit", c5.intro.id, { accept: true }))) === "CONFLICT"
    && h.intros.find(i => i.id === c5.intro.id)!.status === "PENDING" && mails.every(m => m.to !== "mal@evil.test"));
  check("unshared member: new intro 404", (await code(svc.requestIntro(sponsors[1], { memberId: "m-quit", message: "hi" }))) === "NOT_FOUND");
  check("unshared member hidden from directory", !(await svc.directory({})).members.some(x => x.memberId === "m-quit"));
  check("unshared member: decline still allowed", (await svc.respond("m-quit", c5.intro.id, { accept: false })).status === "DECLINED");
  // Sharing back on: a fresh request can be accepted; the subject line carries no header injection.
  quitMember.share = true;
  const c6 = await svc.requestIntro(sponsors[3], { memberId: "m-quit", message: "again" });
  const acc6 = await svc.respond("m-quit", c6.intro.id, { accept: true });
  const mail6 = mails[mails.length - 1];
  check("accept after re-sharing mails sponsor", acc6.emailed && mail6.to === "mal@evil.test");
  check("subject has no CR/LF", !/[\r\n]/.test(mail6.subject));
  { const html = acceptEmailHtml({ id: "x", displayName: "<b>Eve</b>", email: "e\"><script>@x.test" }, ["<img src=x onerror=1>"], "<opp>");
    check("accept email html-escapes name, email, bullets, opportunity", !/<b>|<script>|<img|<opp>/.test(html) && html.includes("&lt;b&gt;Eve") && html.includes("&lt;img")); }
  l4 = await svc.sponsorIntros("s4");
  check("accepted row shows email again once shared", l4.intros.some(i => (i as { memberEmail?: string }).memberEmail === "quinn@purdue.test"));
  quitMember.share = false;
  l4 = await svc.sponsorIntros("s4");
  check("accepted row redacted after sharing turned off", !JSON.stringify(l4).includes("quinn@purdue.test") && l4.intros.every(i => i.member.id === null));

  // Rate limit: 20 per sponsor user per 7 days (s1 has 4 so far)
  const before = h.intros.filter(i => i.sponsorUserId === "s1").length;
  let okCount = 0;
  for (let i = 0; okCount + before < INTRO_LIMIT; i++) {
    if ((await code(svc.requestIntro(s1, { memberId: `m-x${String(i).padStart(2, "0")}`, message: "hi" }))) === "ok") okCount++;
  }
  check("20 within window", h.intros.filter(i => i.sponsorUserId === "s1").length === 20);
  check("21st is 429", (await code(svc.requestIntro(s1, { memberId: "m-x24", message: "hi" }))) === "RATE_LIMITED");
  check("other sponsor unaffected", (await code(svc.requestIntro(sponsors[1], { memberId: "m-x24", message: "hi" }))) === "ok");
  const notifiedAfter = notes.length;
  clock += 7 * DAY + 1;
  check("window slides after 7 days", (await code(svc.requestIntro(s1, { memberId: "m-x24", message: "hi" }))) === "ok" && notes.length === notifiedAfter + 1);

  // Expiry: lazy on read
  const kimId = h.intros.find(i => i.sponsorUserId === "s2")!.id;
  clock += 21 * DAY;
  const raw = h.intros.find(i => i.id === kimId)!;
  check("still PENDING in storage before a read", raw.status === "PENDING");
  const k = await svc.sponsorIntros("s2");
  check("lazy expiry on sponsor read", k.intros[0].status === "EXPIRED" && raw.status === "EXPIRED");
  check("expired cannot be accepted (409)", (await code(svc.respond("m-x24", kimId, { accept: true }))) === "CONFLICT");
  const pendingAda = h.intros.filter(i => i.status === "PENDING" && i.memberId === "m-x01");
  check("member read expires their rows", pendingAda.length > 0 && (await svc.memberIntros("m-x01")).intros.every(i => i.status !== "PENDING"));
  check("expired pair no longer blocks a new request", (await code(svc.requestIntro(sponsors[1], { memberId: "m-x24", message: "again" }))) === "ok");

  // Maintenance sweep
  const stillPending = h.intros.filter(i => i.status === "PENDING" && i.expiresAt.getTime() < clock + 30 * DAY).length;
  const swept = await expireIntroRequests(new Date(clock + 30 * DAY), h.store);
  check("maintenance marks overdue pending EXPIRED", swept === stillPending && swept > 0 && h.intros.every(i => i.status !== "PENDING"));
  check("maintenance never throws", (await expireIntroRequests(new Date(), { ...h.store, expireDue: async () => { throw new Error("db"); } })) === 0);
  const m = await runSponsorMaintenance(new Date(clock), {
    tokens: { deleteStaleTokens: async () => 2 } as never,
    intros: { ...h.store, expireDue: async () => 5 },
  });
  check("runSponsorMaintenance reports both counts", m.tokensDeleted === 2 && m.introsExpired === 5);
  const m2 = await runSponsorMaintenance(new Date(clock), {
    tokens: { deleteStaleTokens: async () => { throw new Error("x"); } } as never,
    intros: { ...h.store, expireDue: async () => { throw new Error("y"); } },
  });
  check("runSponsorMaintenance never throws", m2.tokensDeleted === 0 && m2.introsExpired === 0);

  check("notifications are CAREER_INTRO_REQUEST via default notify", /CAREER_INTRO_REQUEST/.test((await import("node:fs")).readFileSync(new URL("./introService.ts", import.meta.url), "utf8")));
  check("no queueDm or model calls in service", !/queueDm|gemini|aiRouter/i.test((await import("node:fs")).readFileSync(new URL("./introService.ts", import.meta.url), "utf8")));

  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
