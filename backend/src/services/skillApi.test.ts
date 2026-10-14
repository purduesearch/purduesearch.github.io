// Skills API guards: auth wiring, mount order, no identity from the client, ranking
// stability. Source scans (importing the routers would pull in auth and the DB).
// Run: cd backend && npx tsx src/services/skillApi.test.ts

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rankPeople } from "./skillAdminService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`, detail ?? ""); }
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const member = read("api/skills.ts");
const admin = read("api/skillsAdmin.ts");
const app = read("app.ts");

// ── auth wiring ──
check("member router requires auth for every route", /skillsRouter\.use\(requireAuth\)/.test(member));
check("admin router requires auth AND admin for every route", /skillsAdminRouter\.use\(requireAuth, requireAdmin\)/.test(admin));
check("public portfolio route has no auth middleware", !/publicPortfolioRouter\.(get|use)\([^)]*requireAuth/.test(member));
check("every public portfolio response is 404 when not enabled", /getPublicPortfolio/.test(member) && /status\(404\)/.test(member));
check("public portfolio is marked noindex and short-cached", /X-Robots-Tag", "noindex"/.test(member) && /max-age=300/.test(member));

// ── identity comes from the session, never the request ──
check("member routes read req.memberId, never req.session", !/req\.session/.test(member) && !/req\.session/.test(admin));
check("member routes never take memberId from the body for self actions", !/memberId:\s*req\.body/.test(member) && !/addManualEvidence\(req\.body/.test(member));
check("self actions always pass req.memberId as the subject", /addManualEvidence\(req\.memberId!, req\.memberId!/.test(member) && /createDispute\(req\.memberId!/.test(member) && /setSelfClaim\(req\.memberId!/.test(member));
check("admin-entered evidence records the admin separately from the subject", /addManualEvidence\(String\(req\.params\.memberId\), req\.memberId!/.test(admin));
check("peer endorsements record the endorser from the session", /endorsePeer\(req\.memberId!/.test(member));

// ── mount order ──
const at = (needle: string) => app.indexOf(needle);
check("skills routers are mounted", at('app.use("/api/skills"') > 0 && at('app.use("/api/admin/skills"') > 0 && at('app.use("/api/public/portfolio"') > 0);
check("portfolio mounts before the general public router", at('app.use("/api/public/portfolio"') < at('app.use("/api/public", publicRouter)'));
check("skills routers mount above the first bare /api router", at('app.use("/api/skills"') < at('app.use("/api", blockersRouter)'));
check("cron stays opt-in", /SKILLS_ENABLED !== "1"/.test(read("slack/scheduler.ts")));

// ── the key never reaches a client ──
for (const f of ["api/skills.ts", "services/skillMemberService.ts", "services/skillViewCore.ts", "services/skillPrompts.ts"]) {
  check(`${f} never touches the Gemini key`, !/GEMINI_API_KEY/.test(read(f)));
}
check("admin route never reads the key itself", !/GEMINI_API_KEY/.test(admin));
const lane = read("services/ai/skillsGemini.ts");
check("config exposes only whether the key is set", /keySet: !!env\.GEMINI_API_KEY/.test(lane) && !/interface SkillsLlmConfig \{[^}]*apiKey/.test(lane));
check("status panel reports configured as a boolean only", /geminiConfigured: llm\.problems\.length === 0/.test(read("services/skillAdminService.ts")) && !/process.env.GEMINI_API_KEY/.test(read("services/skillAdminService.ts")));

// ── no overall score / leaderboard ──
const adminSvc = read("services/skillAdminService.ts");
check("admin search has no overall score field", !/overallScore|totalScore|rankScore/.test(adminSvc + admin));
check("advisory text is attached to admin results", /ADVISORY/.test(adminSvc));

// ── ranking is stable and level-first ──
const mk = (name: string, bestLevel: number, bestBand: "LOW" | "MEDIUM" | "HIGH", lastDemonstrated = 0) => ({ name, bestLevel, bestBand, lastDemonstrated });
const ranked = rankPeople([mk("Zed", 3, "HIGH"), mk("Amy", 4, "LOW"), mk("Bob", 4, "HIGH"), mk("Cat", 4, "HIGH", 5), mk("Dan", 3, "HIGH")]);
check("level, then confidence, then recency, then name", ranked.map((r) => r.name).join() === "Cat,Bob,Amy,Dan,Zed", ranked.map((r) => r.name).join());
check("rankPeople does not mutate its input", (() => { const a = [mk("B", 1, "LOW"), mk("A", 2, "LOW")]; rankPeople(a); return a[0].name === "B"; })());

console.log(`skillApi: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
