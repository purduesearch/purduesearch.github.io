// Guard the personal feed's privacy boundary without a database or credentials.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./activity.ts", import.meta.url), "utf8");
const start = source.indexOf('activityRouter.get("/dashboard"');
const end = source.indexOf('activityRouter.get("/",', start);
const feed = source.slice(start, end);

assert.ok(source.indexOf("activityRouter.use(requireAuth)") < start, "feed requires authentication");
assert.match(feed, /members:\s*\{\s*some:\s*\{\s*memberId:\s*req\.memberId!/, "membership uses authenticated identity");
assert.match(feed, /\.\.\.EXCLUDE_TRAINING/, "private training projects never enter the dashboard");
assert.doesNotMatch(feed, /req\.(query|body|session)/, "caller cannot override feed identity or scope");
assert.match(feed, /prisma\.activityLog\.findMany/, "feed includes all audit event categories");
assert.match(feed, /createdAt:\s*"desc"/, "latest activity comes first");
assert.match(feed, /take:\s*15/, "feed is bounded");
assert.match(feed, /displayName:\s*true,\s*avatarUrl:\s*true/, "author projection excludes private member fields");
console.log("Dashboard activity privacy checks passed");
