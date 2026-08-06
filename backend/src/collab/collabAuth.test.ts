// The readOnly decision is the security boundary for VIEW/COMMENT users, so it
// is tested as pure logic against the level. Run:
//   cd backend && npx tsx src/collab/collabAuth.test.ts
import { shouldBeReadOnly } from "./collabAuth.js";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; } else { failed++; console.error(`  ✗ ${n}`); }
};

check("VIEW is read-only",    shouldBeReadOnly("VIEW") === true);
check("COMMENT is read-only", shouldBeReadOnly("COMMENT") === true);
check("EDIT can write",       shouldBeReadOnly("EDIT") === false);
check("OWNER can write",      shouldBeReadOnly("OWNER") === false);

console.log(`\ncollabAuth: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
