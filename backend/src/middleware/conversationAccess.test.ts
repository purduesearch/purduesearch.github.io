// Static guard, like appMountOrder.test.ts — importing the middleware would
// open a Prisma client. Run: cd backend && npx tsx src/middleware/conversationAccess.test.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => { if (c) passed++; else { failed++; console.error(`  ✗ ${n}`); } };

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "conversationAccess.ts"), "utf8");

// D2: no admin bypass, ever. The rule lives in the pure module, which has no
// admin input; this file must not reintroduce one by loading the flag.
check("never mentions isAdmin", !/isAdmin/.test(src));
check("delegates the read rule to the pure module", /canReadConversation\(/.test(src));
// Whether a particular DM exists is itself private: deny as 404, never 403.
check("denies with 404", /status\(404\)/.test(src));
check("never answers 403", !/status\(403\)/.test(src));

console.log(`conversationAccess: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
