// Regression guard for the dead live-notification stream in Brave/Safari.
//
// EventSource and <img> cannot send an Authorization header, so sseRouter and
// projectChatRouter accept a signed `?token=` query param instead. Any router
// mounted AHEAD of them whose pathless `router.use(requireAuth)` covers their
// path 401s that request (no cookie, no header) before it ever arrives. The
// bare `app.use("/api", …)` routers are the widest such trap: blockersRouter's
// requireAuth runs for EVERY /api/* request that reaches it. sseRouter used to
// sit below them, so `/api/notifications/stream?token=…` returned 401 while the
// same token in a header returned 200 — no live notifications, no live chat.
//
// Static scan, like slackUserTokenService.test.ts: importing app.ts would boot
// Prisma, Slack, and the HTTP server. Run:
//   cd backend && npx tsx src/appMountOrder.test.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; } else { failed++; console.error(`  ✗ ${n}`); }
};

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "app.ts"), "utf8");
const mounts = [...src.matchAll(/^app\.use\(\s*"([^"]+)"\s*,\s*(\w+)/gm)].map((m) => ({
  path: m[1],
  router: m[2],
}));
const indexOf = (router: string) => mounts.findIndex((m) => m.router === router);

check("found the app.use mounts", mounts.length > 20);

// Routers whose routes authenticate via a `?token=` query param.
const QUERY_TOKEN_ROUTERS = ["sseRouter", "projectChatRouter"];

// Routers that attach a pathless requireAuth, keyed to a mount path that
// shadows a query-token router. Bare "/api" mounts are checked generically.
const SHADOWS: Record<string, string> = {
  sseRouter: "notificationsRouter",
  projectChatRouter: "projectsRouter",
};

const bareApi = mounts
  .map((m, i) => ({ ...m, i }))
  .filter((m) => m.path === "/api");
check("found the bare /api mounts", bareApi.length > 0);

for (const router of QUERY_TOKEN_ROUTERS) {
  const at = indexOf(router);
  check(`${router} is mounted`, at !== -1);
  for (const bare of bareApi) {
    check(`${router} is mounted above app.use("/api", ${bare.router})`, at < bare.i);
  }
  const shadow = SHADOWS[router];
  check(`${router} is mounted above ${shadow}`, at < indexOf(shadow));
}

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
