// Full quest refresh for a single member — wipes the current-period quests
// (daily/weekly/monthly) and immediately re-assigns fresh ones.
// For local testing only.
//
//   cd backend
//   npm run quests:refresh -- henry@example.com
//   npm run quests:refresh -- <memberId>

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Period helpers (mirrors challengeService.ts)
function dayStartUTC(d = new Date()) {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}
function weekStartUTC(d = new Date()) {
  const out = dayStartUTC(d);
  const day = out.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day; // ISO week: Mon start
  out.setUTCDate(out.getUTCDate() + diff);
  return out;
}
function monthStartUTC(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error(
      "Usage:\n" +
      "  npm run quests:refresh -- <email | memberId>\n" +
      "  npx tsx prisma/refreshQuests.ts henry@example.com"
    );
    process.exit(1);
  }

  // ── 1. Resolve member ─────────────────────────────────────────
  const member = await prisma.member.findFirst({
    where: { OR: [{ id: arg }, { email: arg }] },
    select: { id: true, displayName: true, email: true },
  });

  if (!member) {
    console.error(`\nNo member found for "${arg}"`);
    const sample = await prisma.member.findMany({
      take: 8, select: { id: true, displayName: true, email: true },
    });
    if (sample.length) {
      console.log("\nAvailable members:");
      sample.forEach(m => console.log(`  ${m.email ?? m.id}  (${m.displayName})`));
    }
    process.exit(1);
  }

  console.log(`\nRefreshing quests for ${member.displayName} (${member.email ?? member.id})\n`);

  const now = new Date();
  const todayStart   = dayStartUTC(now);
  const thisWeekStart  = weekStartUTC(now);
  const thisMonthStart = monthStartUTC(now);

  // ── 2. Check catalog is seeded ────────────────────────────────
  const catalogCount = await prisma.challenge.count({ where: { active: true } });
  if (catalogCount === 0) {
    console.error("No active challenges in the catalog. Run: npm run seed:challenges");
    process.exit(1);
  }

  // ── 3. Delete current-period rows (all, including claimed) ────
  // Must delete by matching periodStart so the assign-guard sees 0 existing rows.
  const [delDaily, delWeekly, delMonthly] = await Promise.all([
    prisma.memberChallenge.deleteMany({
      where: { memberId: member.id, challenge: { type: "DAILY"   }, periodStart: todayStart },
    }),
    prisma.memberChallenge.deleteMany({
      where: { memberId: member.id, challenge: { type: "WEEKLY"  }, periodStart: thisWeekStart },
    }),
    prisma.memberChallenge.deleteMany({
      where: { memberId: member.id, challenge: { type: "MONTHLY" }, periodStart: thisMonthStart },
    }),
  ]);

  console.log(`  Deleted: ${delDaily.count} daily  |  ${delWeekly.count} weekly  |  ${delMonthly.count} monthly`);

  // ── 4. Re-assign via the real cron service ───────────────────
  const svc = await import("../src/services/challengeService.js");
  await svc.assignDailyChallenges(member.id);
  await svc.assignWeeklyChallenge(member.id);
  await svc.assignMonthlyChallenge(member.id);

  // ── 5. Print results ─────────────────────────────────────────
  const assigned = await prisma.memberChallenge.findMany({
    where: {
      memberId: member.id,
      periodStart: { gte: thisMonthStart },
    },
    include: {
      challenge: { select: { type: true, name: true, target: true, metricKey: true } },
    },
    orderBy: [{ challenge: { type: "asc" } }, { periodStart: "asc" }],
  });

  if (assigned.length === 0) {
    console.log("\n  ⚠  No quests assigned — the challenge pool may be exhausted by the");
    console.log("     recent-history exclusion. Run once more or wipe history with:\n");
    console.log("     prisma studio → MemberChallenge → delete rows for this member\n");
    process.exit(0);
  }

  const byType: Record<string, typeof assigned> = {};
  for (const r of assigned) {
    (byType[r.challenge.type] ??= []).push(r);
  }

  console.log("\n  Assigned:");
  for (const [type, list] of Object.entries(byType)) {
    console.log(`    ${type}`);
    for (const r of list) {
      const status = r.claimedAt ? "claimed" : r.completedAt ? "COMPLETE (unclaimed)" : `${r.progress}/${r.challenge.target}`;
      console.log(`      • ${r.challenge.name}  [${r.challenge.metricKey}]  — ${status}`);
    }
  }

  console.log("\n  Done. Reload /api/challenges/active in the app to see the new quests.\n");
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
