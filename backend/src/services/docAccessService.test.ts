// Table-driven tests for access combination. Pure logic, no database — the
// resolver's DB reads are a thin shell around combineAccess().
// Run: cd backend && npx tsx src/services/docAccessService.test.ts
import { combineAccess, atLeast, maxLevel } from "./docAccessService.js";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; } else { failed++; console.error(`  ✗ ${n}`); }
};

const none = { isAdmin: false, inherited: null, grant: null, club: null };

check("no sources at all -> null", combineAccess(none) === null);
check("admin always wins with OWNER",
  combineAccess({ ...none, isAdmin: true }) === "OWNER");
check("admin outranks a lower explicit grant",
  combineAccess({ ...none, isAdmin: true, grant: "VIEW" }) === "OWNER");
check("a lone grant is used as-is",
  combineAccess({ ...none, grant: "COMMENT" }) === "COMMENT");
check("club tier alone is used as-is",
  combineAccess({ ...none, club: "VIEW" }) === "VIEW");
check("grant beats a weaker club tier",
  combineAccess({ ...none, grant: "EDIT", club: "VIEW" }) === "EDIT");
check("club tier beats a weaker grant",
  combineAccess({ ...none, grant: "VIEW", club: "EDIT" }) === "EDIT");
check("inherited beats a weaker grant",
  combineAccess({ ...none, inherited: "OWNER", grant: "VIEW" }) === "OWNER");
check("inherited combines with club tier by max",
  combineAccess({ ...none, inherited: "EDIT", club: "COMMENT" }) === "EDIT");

check("atLeast: EDIT satisfies COMMENT", atLeast("EDIT", "COMMENT") === true);
check("atLeast: COMMENT does not satisfy EDIT", atLeast("COMMENT", "EDIT") === false);
check("atLeast: null satisfies nothing", atLeast(null, "VIEW") === false);
check("atLeast: exact match passes", atLeast("VIEW", "VIEW") === true);

check("maxLevel handles nulls on either side",
  maxLevel(null, "VIEW") === "VIEW" && maxLevel("VIEW", null) === "VIEW");
check("maxLevel of two nulls is null", maxLevel(null, null) === null);

console.log(`\ndocAccessService: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
