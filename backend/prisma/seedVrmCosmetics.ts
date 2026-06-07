// Re-seed the Cosmetic catalog after 20260605030000_vrm_overhaul.
//
// What this seeds:
//   - HAIR cosmetics (category=AVATAR_FEATURE)   — VRM mesh attachments
//   - OUTFIT cosmetics (category=CLOTHING)       — VRM body-mesh swaps
//   - THEME/FRAME/ANIMATION cosmetics            — CSS-class driven
//   - Sample BADGE cosmetics                     — Font Awesome icons
//
// The hair/outfit entries' cosmeticIds are surfaced to the frontend via the
// registries in src/clubpm/avatar/vrm/{hairAssets,outfitAssets}.js. After
// running this seed, copy the printed JSON snippets into those files so the
// editor can load the VRM/GLB files for each entry.
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
  // ── Hair (VRM attachments) ──
  { name: "Buzz cut",      description: "Crisp and sharp.",          category: "AVATAR_FEATURE", rarity: "COMMON",   registryKey: "buzz",       doubloonPrice: 50 },
  { name: "Long wavy",     description: "Flowing waves.",            category: "AVATAR_FEATURE", rarity: "UNCOMMON", registryKey: "long-wavy",  doubloonPrice: 120 },
  { name: "Ponytail",      description: "Tidy and travel-ready.",    category: "AVATAR_FEATURE", rarity: "UNCOMMON", registryKey: "ponytail",   doubloonPrice: 120 },
  { name: "Cosmic mohawk", description: "Standout volume.",          category: "AVATAR_FEATURE", rarity: "RARE",     registryKey: "mohawk",     doubloonPrice: 350, xpGate: 3500 },

  // ── Outfits (VRM body-mesh swaps) ──
  { name: "Flight jacket", description: "Leather + dark slacks.",    category: "CLOTHING", rarity: "COMMON",   registryKey: "flight-jacket", doubloonPrice: 80  },
  { name: "Lab coat",      description: "Classic white coat.",       category: "CLOTHING", rarity: "COMMON",   registryKey: "lab-coat",      doubloonPrice: 80  },
  { name: "Astronaut suit",description: "Helmet sold separately.",   category: "CLOTHING", rarity: "RARE",     registryKey: "astronaut-suit",doubloonPrice: 400, xpGate: 5000 },
  { name: "Field overalls",description: "Outreach uniform.",         category: "CLOTHING", rarity: "UNCOMMON", registryKey: "overalls",      doubloonPrice: 150 },
  { name: "Press tee",     description: "Club merch.",               category: "CLOTHING", rarity: "COMMON",   registryKey: "press-tee",     doubloonPrice: 60  },
  { name: "Gala blazer",   description: "Dressed up.",               category: "CLOTHING", rarity: "MYTHIC",   registryKey: "gala-blazer",   doubloonPrice: 900, xpGate: 12000 },

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
