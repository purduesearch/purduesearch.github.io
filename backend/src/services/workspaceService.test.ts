// Unit tests for workspaceService's pure helpers. No DB.
// Run: cd backend && npx tsx src/services/workspaceService.test.ts
import { trainingState, courseState, sanitizeWorkspaceInput, slugify } from "./workspaceService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

const now = new Date("2026-09-25T12:00:00Z");
const cert = (status: "PENDING" | "APPROVED" | "REJECTED", expiresOn: string | null) =>
  ({ status, expiresOn: expiresOn ? new Date(expiresOn) : null, createdAt: new Date("2026-01-01T00:00:00Z") });

console.log("requirement states");
{
  check("no certificate → missing", trainingState([], now) === "missing");
  check("approved, no expiry → ok", trainingState([cert("APPROVED", null)], now) === "ok");
  check("approved, expired → expired", trainingState([cert("APPROVED", "2026-01-01T00:00:00Z")], now) === "expired");
  check("pending → pending", trainingState([cert("PENDING", null)], now) === "pending");
  check("rejected only → missing", trainingState([cert("REJECTED", null)], now) === "missing");
  check("course not completed → missing", courseState(null) === "missing" && courseState(undefined) === "missing");
  check("course completed → ok", courseState(new Date()) === "ok");
}

console.log("sanitizeWorkspaceInput");
{
  const ok = (body: unknown, partial = false) => sanitizeWorkspaceInput(body, partial);
  check("create needs a name", !ok({}).ok);
  const named = ok({ name: "  Propulsion Lab  " });
  check("name trimmed", named.ok && named.value.name === "Propulsion Lab");
  check("bad colour", !ok({ name: "x", color: "red" }).ok);
  const colour = ok({ name: "x", color: "#00E5CC" });
  check("colour lower-cased", colour.ok && colour.value.color === "#00e5cc");
  check("capacity 0 rejected", !ok({ name: "x", capacity: 0 }).ok);
  const cap = ok({ name: "x", capacity: null });
  check("capacity null clears", cap.ok && cap.value.capacity === null);
  check("off-grid open time rejected", !ok({ name: "x", openStartMin: 45 }).ok);
  check("open after close rejected", !ok({ name: "x", openStartMin: 600, openEndMin: 540 }).ok);
  check("unknown timezone rejected", !ok({ name: "x", timezone: "Mars/Base" }).ok);
  const partial = ok({}, true);
  check("empty partial ok", partial.ok && Object.keys(partial.value).length === 0);
  const desc = ok({ description: "" }, true);
  check("empty description → null", desc.ok && desc.value.description === null);
  const term = ok({ defaultEndsOn: "2026-12-13" }, true);
  check("term end accepted", term.ok && term.value.defaultEndsOn === "2026-12-13");
  check("bad term end rejected", !ok({ defaultEndsOn: "12/13/2026" }, true).ok);
}

console.log("slugify");
{
  check("slug", slugify("Propulsion Lab (ARMS 1010)") === "propulsion-lab-arms-1010");
  check("empty falls back", slugify("!!!") === "space");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
