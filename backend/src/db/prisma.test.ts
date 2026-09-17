// Regression guard: encrypted Member credentials must never ride along on a
// nested include.
//
// GET /api/projects returned `members: { include: { member: true } }` as-is, so
// every project member's AES-GCM ciphertext (Slack user token, GitHub tokens,
// private iCal feed URL) reached any signed-in member. The fix is a global
// `omit` on the Prisma client; this test keeps a new token-shaped Member column
// from being added without joining it. Run:
//   cd backend && npx tsx src/db/prisma.test.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MEMBER_SECRET_OMIT } from "./prisma.js";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; } else { failed++; console.error(`  ✗ ${n}`); }
};

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(here, "../../prisma/schema.prisma"), "utf8");
const memberBlock = schema.match(/^model Member \{([\s\S]*?)^\}/m)?.[1] ?? "";
check("found the Member model in schema.prisma", memberBlock.length > 0);

const omitted = new Set(Object.keys(MEMBER_SECRET_OMIT));

for (const field of ["slackUserToken", "githubAccessToken", "githubRefreshToken", "icsFeedUrl"]) {
  check(`${field} is globally omitted`, omitted.has(field));
  check(`${field} still exists on Member`, new RegExp(`^\\s*${field}\\s+String\\?`, "m").test(memberBlock));
}

// Any string column that looks like a credential must be omitted too.
const credentialShaped = [...memberBlock.matchAll(/^\s*(\w+)\s+String\??\s/gm)]
  .map(m => m[1])
  .filter(name => /(Token|Secret|FeedUrl)$/.test(name));
for (const name of credentialShaped) {
  check(`credential-shaped Member.${name} is in MEMBER_SECRET_OMIT`, omitted.has(name));
}

console.log(`prisma.test: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
