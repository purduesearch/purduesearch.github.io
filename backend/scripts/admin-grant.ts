// Quick admin helper: grant doubloons, XP, or a badge to a member.
// Usage:
//   npx tsx scripts/admin-grant.ts list                        — list all members
//   npx tsx scripts/admin-grant.ts doubloons <memberId> <amt>  — grant doubloons
//   npx tsx scripts/admin-grant.ts xp <memberId> <amt>         — grant XP
//   npx tsx scripts/admin-grant.ts badge <memberId> <cosmeticId> — grant a badge cosmetic
//   npx tsx scripts/admin-grant.ts badges                      — list all badge cosmetics
//   npx tsx scripts/admin-grant.ts cosmetics                   — list all cosmetics

import { prisma } from "../src/db/prisma.js";

const [,, cmd, arg1, arg2] = process.argv;

async function main() {
  switch (cmd) {
    case "list": {
      const members = await prisma.member.findMany({
        where: { isBot: false },
        select: { id: true, displayName: true, doubloons: true, xp: true, rank: true },
        orderBy: { displayName: "asc" },
      });
      console.table(members);
      break;
    }
    case "doubloons": {
      if (!arg1 || !arg2) { console.error("Usage: doubloons <memberId> <amount>"); break; }
      const updated = await prisma.member.update({
        where: { id: arg1 },
        data: { doubloons: { increment: parseInt(arg2) } },
        select: { displayName: true, doubloons: true },
      });
      await prisma.doubloonEvent.create({
        data: { memberId: arg1, amount: parseInt(arg2), source: "TASK_COMPLETE" },
      });
      console.log(`✅ Granted ${arg2} doubloons to ${updated.displayName}. New balance: ${updated.doubloons}`);
      break;
    }
    case "xp": {
      if (!arg1 || !arg2) { console.error("Usage: xp <memberId> <amount>"); break; }
      const updated = await prisma.member.update({
        where: { id: arg1 },
        data: { xp: { increment: parseInt(arg2) } },
        select: { displayName: true, xp: true },
      });
      await prisma.xpEvent.create({
        data: { memberId: arg1, amount: parseInt(arg2), source: "TASK_COMPLETE" },
      });
      console.log(`✅ Granted ${arg2} XP to ${updated.displayName}. New XP: ${updated.xp}`);
      break;
    }
    case "badge": {
      if (!arg1 || !arg2) { console.error("Usage: badge <memberId> <cosmeticId>"); break; }
      await prisma.memberCosmetic.upsert({
        where: { memberId_cosmeticId: { memberId: arg1, cosmeticId: arg2 } },
        update: {},
        create: { memberId: arg1, cosmeticId: arg2 },
      });
      const cosmetic = await prisma.cosmetic.findUnique({ where: { id: arg2 }, select: { name: true } });
      const member = await prisma.member.findUnique({ where: { id: arg1 }, select: { displayName: true } });
      console.log(`✅ Granted badge "${cosmetic?.name}" to ${member?.displayName}`);
      break;
    }
    case "badges": {
      const badges = await prisma.cosmetic.findMany({
        where: { category: "BADGE" },
        select: { id: true, name: true, rarity: true, svgUrl: true },
        orderBy: { name: "asc" },
      });
      console.table(badges);
      break;
    }
    case "cosmetics": {
      const all = await prisma.cosmetic.findMany({
        select: { id: true, name: true, category: true, rarity: true },
        orderBy: [{ category: "asc" }, { name: "asc" }],
      });
      console.table(all);
      break;
    }
    default:
      console.log(`Admin Grant Tool
  list                          — list all members (with ID, doubloons, XP, rank)
  doubloons <memberId> <amt>    — grant doubloons
  xp <memberId> <amt>           — grant XP (will also recalculate rank)
  badge <memberId> <cosmeticId> — grant a badge cosmetic to a member
  badges                        — list all badge cosmetics
  cosmetics                     — list all cosmetics`);
  }
}

main().catch(console.error).finally(() => process.exit(0));
