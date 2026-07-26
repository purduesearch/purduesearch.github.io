// Re-seed the Cosmetic catalog after 20260605030000_vrm_overhaul.
//
// What this seeds:
//   - THEME/FRAME/ANIMATION cosmetics            — CSS-class driven
//   - Sample BADGE cosmetics                     — Font Awesome icons
//
// Run: npx tsx backend/prisma/seedVrmCosmetics.ts

import { PrismaClient, CosmeticCategory, CosmeticRarity } from "@prisma/client";

const prisma = new PrismaClient();

type SeedCosmetic = {
  name:           string;
  description?:   string;
  category:       CosmeticCategory;
  rarity:         CosmeticRarity;
  cssSlug?:       string;
  iconClass?:     string;
  svgUrl?:        string;
  registryKey?:   string;  // points at hairAssets/outfitAssets registry key
  doubloonPrice:  number;
  xpGate?:        number;
  shopEligible?:  boolean;
  unlockCondition?: string;
};

const COSMETICS: SeedCosmetic[] = [
  // ── Themes (CSS) ──
  { name: "Cosmic dusk",   category: "DASHBOARD_THEME", rarity: "UNCOMMON", cssSlug: "cosmic-dusk", doubloonPrice: 200 },
  { name: "Auroral",       category: "DASHBOARD_THEME", rarity: "RARE",     cssSlug: "auroral",     doubloonPrice: 450 },

  // ── Name frames (CSS) ──
  { name: "Brass plate",   category: "NAME_FRAME", rarity: "COMMON",   cssSlug: "brass",  doubloonPrice: 75 },
  { name: "Cadet ribbon",  category: "NAME_FRAME", rarity: "UNCOMMON", cssSlug: "cadet",  doubloonPrice: 175 },
  { name: "Comet trail",   category: "NAME_FRAME", rarity: "MYTHIC",   cssSlug: "comet",  doubloonPrice: 950, xpGate: 12000 },

  // ── Animations (CSS) ──
  { name: "Hover lift",    category: "ANIMATION", rarity: "COMMON",   cssSlug: "lift",     doubloonPrice: 100 },
  { name: "Pulse",         category: "ANIMATION", rarity: "UNCOMMON", cssSlug: "pulse",    doubloonPrice: 250 },

  // ── Badges (Font Awesome) ──
  { name: "First task",    category: "BADGE", rarity: "COMMON", iconClass: "fas fa-flag-checkered", doubloonPrice: 0 },
  { name: "Centurion",     category: "BADGE", rarity: "RARE",   iconClass: "fas fa-medal",          doubloonPrice: 0 },

  // ── Rank badges (SVG, auto-granted by recalculateRank when the rank is reached). ──
  // Names MUST be `"${RankDisplay} Badge"` — see RANK_DISPLAY in rewardService.ts.
  { name: "Nestling Badge",   category: "BADGE", rarity: "COMMON",   svgUrl: "/clubpm/badges/nestling.svg",   doubloonPrice: 0, shopEligible: false, unlockCondition: "Earned at Nestling rank" },
  { name: "Fledgling Badge",  category: "BADGE", rarity: "COMMON",   svgUrl: "/clubpm/badges/fledgling.svg",  doubloonPrice: 0, shopEligible: false, unlockCondition: "Earned at Fledgling rank" },
  { name: "Cadet Badge",      category: "BADGE", rarity: "UNCOMMON", svgUrl: "/clubpm/badges/cadet.svg",      doubloonPrice: 0, shopEligible: false, unlockCondition: "Earned at Cadet rank" },
  { name: "Specialist Badge", category: "BADGE", rarity: "UNCOMMON", svgUrl: "/clubpm/badges/specialist.svg", doubloonPrice: 0, shopEligible: false, unlockCondition: "Earned at Specialist rank" },
  { name: "Pioneer Badge",    category: "BADGE", rarity: "RARE",     svgUrl: "/clubpm/badges/pioneer.svg",    doubloonPrice: 0, shopEligible: false, unlockCondition: "Earned at Pioneer rank" },
  { name: "Cosmonaut Badge",  category: "BADGE", rarity: "RARE",     svgUrl: "/clubpm/badges/cosmonaut.svg",  doubloonPrice: 0, shopEligible: false, unlockCondition: "Earned at Cosmonaut rank" },
  { name: "Celestial Badge",  category: "BADGE", rarity: "MYTHIC",   svgUrl: "/clubpm/badges/celestial.svg",  doubloonPrice: 0, shopEligible: false, unlockCondition: "Earned at Celestial rank" },
];

async function main() {
  console.log(`Seeding ${COSMETICS.length} cosmetics…`);
  const created: { name: string; id: string; registryKey?: string | null; category: string }[] = [];
  for (const c of COSMETICS) {
    const row = await prisma.cosmetic.create({ data: c as any });
    created.push({ name: row.name, id: row.id, registryKey: row.registryKey, category: row.category });
  }
  console.log("Created:");
  for (const r of created) console.log(`  ${r.category.padEnd(16)} ${r.id}  ${r.name}${r.registryKey ? ` (registry: ${r.registryKey})` : ""}`);

  console.log("\nNext step:");
  console.log("  Update src/clubpm/avatar/vrm/hairAssets.js + outfitAssets.js with");
  console.log("  the cosmetic ids printed above + their VRM/GLB urls.");
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
