// One-shot: refund every hair (AVATAR_FEATURE) and outfit (CLOTHING) purchase
// before those categories are dropped from the schema. Run ONCE, before the
// migration. Safe to re-run only if the migration has not yet been applied —
// it is not idempotent, so check the log output before repeating.

import { PrismaClient } from "@prisma/client";
import { grantDoubloons } from "../src/services/rewardService.js";

const prisma = new PrismaClient();

async function main() {
  const owned = await prisma.memberCosmetic.findMany({
    where: { cosmetic: { category: { in: ["AVATAR_FEATURE", "CLOTHING"] } } },
    include: { cosmetic: { select: { name: true, doubloonPrice: true } } },
  });

  console.log(`Found ${owned.length} VRM cosmetic ownership rows.`);

  for (const mc of owned) {
    const price = mc.cosmetic.doubloonPrice ?? 0;
    if (price <= 0) {
      console.log(`  skip (free): ${mc.cosmetic.name} → member ${mc.memberId}`);
      continue;
    }
    await grantDoubloons(mc.memberId, price, "ADMIN_ADJUSTMENT", { cosmeticId: mc.cosmeticId });
    console.log(`  refunded ${price} → member ${mc.memberId} for ${mc.cosmetic.name} (3D avatar removed)`);
  }

  console.log("Refunds complete.");
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
