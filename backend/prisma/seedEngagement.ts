// Seeds the engagement layer (RewardEventConfig defaults + starter Cosmetic catalogue).
// Idempotent: safe to re-run. Invoke standalone:
//   cd backend && npx tsx prisma/seedEngagement.ts

import {
  PrismaClient,
  RewardEventType,
  CosmeticCategory,
  CosmeticRarity,
  Rank,
} from "@prisma/client";

const prisma = new PrismaClient();

type EventDefault = {
  eventType: RewardEventType;
  autoApprove: boolean;
  xpAmount: number;
  doubloonAmount: number;
};

const EVENT_DEFAULTS: EventDefault[] = [
  { eventType: "TIME_LOG_HOUR",               autoApprove: true,  xpAmount: 20,  doubloonAmount: 5 },
  { eventType: "TASK_COMPLETE_ADMIN_CREATED", autoApprove: true,  xpAmount: 60,  doubloonAmount: 15 },
  { eventType: "TASK_COMPLETE_MEMBER_CREATED",autoApprove: false, xpAmount: 50,  doubloonAmount: 12 },
  { eventType: "MILESTONE_HIT",               autoApprove: true,  xpAmount: 200, doubloonAmount: 50 },
  { eventType: "KUDOS_RECEIVED",              autoApprove: true,  xpAmount: 15,  doubloonAmount: 30 },
  { eventType: "BLOG_POST_PUBLISHED",         autoApprove: true,  xpAmount: 100, doubloonAmount: 25 },
  { eventType: "EARLY_DELIVERY_BONUS",        autoApprove: true,  xpAmount: 0,   doubloonAmount: 0 },
];

type CosmeticSeed = {
  name: string;
  description?: string;
  category: CosmeticCategory;
  rarity: CosmeticRarity;
  cssSlug?: string;
  iconClass?: string;
  svgUrl?: string;
  registryKey?: string;
  themeTokens?: Record<string, string>;
  doubloonPrice: number;
  xpGate?: number;
  rankGate?: Rank;
  shopEligible: boolean;
  unlockCondition?: string;
};

const COSMETICS: CosmeticSeed[] = [
  // ── Dashboard themes ──
  { name: "Emerald Theme",     category: "DASHBOARD_THEME", rarity: "COMMON",   cssSlug: "emerald",    doubloonPrice: 50,  shopEligible: true },
  { name: "Aurora Theme",      category: "DASHBOARD_THEME", rarity: "UNCOMMON", cssSlug: "aurora",     doubloonPrice: 120, shopEligible: true },
  { name: "Terracotta Theme",  category: "DASHBOARD_THEME", rarity: "RARE",     cssSlug: "terracotta", doubloonPrice: 300, shopEligible: true, rankGate: "SPECIALIST" },

  // ── Name frames ──
  { name: "Laurel Frame",      category: "NAME_FRAME", rarity: "COMMON",   cssSlug: "laurel",   doubloonPrice: 40,  shopEligible: true },
  { name: "Comet Frame",       category: "NAME_FRAME", rarity: "UNCOMMON", cssSlug: "comet",    doubloonPrice: 100, shopEligible: true },
  { name: "Stardust Frame",    category: "NAME_FRAME", rarity: "MYTHIC",   cssSlug: "stardust", doubloonPrice: 800, shopEligible: true, rankGate: "COSMONAUT" },

  // // ── Clothing (registryKey maps into clothingRegistry.js) ──
  // { name: "Flight Jacket",     category: "CLOTHING", rarity: "COMMON",   registryKey: "flight-jacket",   doubloonPrice: 60,  shopEligible: true },
  // { name: "Lab Coat",          category: "CLOTHING", rarity: "UNCOMMON", registryKey: "lab-coat",        doubloonPrice: 150, shopEligible: true },
  // { name: "Astronaut Suit",    category: "CLOTHING", rarity: "RARE",     registryKey: "astronaut-suit",  doubloonPrice: 400, shopEligible: true, rankGate: "PIONEER" },

  // // ── Avatar features (hair) ──
  // { name: "Buzz Cut",          category: "AVATAR_FEATURE", rarity: "COMMON",   registryKey: "buzz",        doubloonPrice: 30,  shopEligible: true },
  // { name: "Long Wavy",         category: "AVATAR_FEATURE", rarity: "UNCOMMON", registryKey: "long-wavy",   doubloonPrice: 80,  shopEligible: true },
  // { name: "Ponytail",          category: "AVATAR_FEATURE", rarity: "RARE",     registryKey: "ponytail",    doubloonPrice: 250, shopEligible: true, rankGate: "SPECIALIST" },

  // ── Badges (rank milestones — not shop-eligible, awarded by reaching rank) ──
  // svgUrl points at the rank artwork so equipping swaps the sidebar RankIcon.
  { name: "Nestling Badge",    category: "BADGE", rarity: "COMMON",   iconClass: "fas fa-egg",            svgUrl: "/clubpm/badges/rank/nestling.webp",   doubloonPrice: 0, shopEligible: false, unlockCondition: "Reach Nestling rank" },
  { name: "Fledgling Badge",   category: "BADGE", rarity: "COMMON",   iconClass: "fas fa-feather",        svgUrl: "/clubpm/badges/rank/fledgling.webp",  doubloonPrice: 0, shopEligible: false, unlockCondition: "Reach Fledgling rank" },
  { name: "Cadet Badge",       category: "BADGE", rarity: "UNCOMMON", iconClass: "fas fa-user-astronaut", svgUrl: "/clubpm/badges/rank/cadet.webp",      doubloonPrice: 0, shopEligible: false, unlockCondition: "Reach Cadet rank" },
  { name: "Specialist Badge",  category: "BADGE", rarity: "UNCOMMON", iconClass: "fas fa-medal",          svgUrl: "/clubpm/badges/rank/specialist.webp", doubloonPrice: 0, shopEligible: false, unlockCondition: "Reach Specialist rank" },
  { name: "Pioneer Badge",     category: "BADGE", rarity: "RARE",     iconClass: "fas fa-rocket",         svgUrl: "/clubpm/badges/rank/pioneer.webp",    doubloonPrice: 0, shopEligible: false, unlockCondition: "Reach Pioneer rank" },
  { name: "Cosmonaut Badge",   category: "BADGE", rarity: "RARE",     iconClass: "fas fa-satellite",      svgUrl: "/clubpm/badges/rank/cosmonaut.webp",  doubloonPrice: 0, shopEligible: false, unlockCondition: "Reach Cosmonaut rank" },
  { name: "Celestial Badge",   category: "BADGE", rarity: "MYTHIC",   iconClass: "fas fa-star",           svgUrl: "/clubpm/badges/rank/celestial.webp",  doubloonPrice: 0, shopEligible: false, unlockCondition: "Reach Celestial rank" },

  // ── Mythic badges
  { name: "John Peters",       category: "BADGE", rarity: "MYTHIC",   svgUrl: "/clubpm/badges/mythic/john_peters.webp", doubloonPrice: 500, shopEligible: true, unlockCondition: "Quest drop" },
  { name: "Ethereal Chair",       category: "BADGE", rarity: "MYTHIC",   svgUrl: "/clubpm/badges/mythic/ethereal_chair.webp", doubloonPrice: 500, shopEligible: true, unlockCondition: "Quest drop" },
  // ── Rare badges
  { name: "Gaming Chair",       category: "BADGE", rarity: "RARE",   svgUrl: "/clubpm/badges/rare/gaming_chair.webp", doubloonPrice: 400, shopEligible: true, unlockCondition: "Quest drop" },
  // ── Uncommon badges
  { name: "Folding Chair",       category: "BADGE", rarity: "UNCOMMON",   svgUrl: "/clubpm/badges/uncommon/folding_chair.webp", doubloonPrice: 200, shopEligible: true, unlockCondition: "Quest drop" },
  { name: "Smiling Thumbs Up",       category: "BADGE", rarity: "UNCOMMON",   svgUrl: "/clubpm/badges/uncommon/smiling_thumbsup.webp", doubloonPrice: 200, shopEligible: true, unlockCondition: "Quest drop" },
  // ── Common badges
  { name: "Seagull",       category: "BADGE", rarity: "COMMON",   svgUrl: "/clubpm/badges/common/seagull.webp", doubloonPrice: 100, shopEligible: true, unlockCondition: "Quest drop" },
  { name: "Wooden Chair",       category: "BADGE", rarity: "COMMON",   svgUrl: "/clubpm/badges/common/wooden_chair.webp", doubloonPrice: 100, shopEligible: true, unlockCondition: "Quest drop" },

  // ── Animations ──
  { name: "Pulse Animation",   category: "ANIMATION", rarity: "UNCOMMON", cssSlug: "pulse",   doubloonPrice: 90,  shopEligible: true },
  { name: "Sparkle Animation", category: "ANIMATION", rarity: "RARE",     cssSlug: "sparkle", doubloonPrice: 280, shopEligible: true, rankGate: "PIONEER" },

  // ── Additional Dashboard Themes (quest drops) ──
  {
    name: "Deep Space Theme",      category: "DASHBOARD_THEME", rarity: "COMMON",
    cssSlug: "deepspace",  shopEligible: false, doubloonPrice: 0,
    unlockCondition: "Quest drop",
    themeTokens: { accent: "#2bd9e3", accentSoft: "#d4f4f6", glow: "rgba(43,217,227,0.35)", bgOverlay: "transparent" },
  },
  {
    name: "Solar Theme",           category: "DASHBOARD_THEME", rarity: "COMMON",
    cssSlug: "solar",      shopEligible: false, doubloonPrice: 0,
    unlockCondition: "Quest drop",
    themeTokens: { accent: "#ff8c42", accentSoft: "#ffe1cf", glow: "rgba(255,140,66,0.35)", bgOverlay: "transparent" },
  },
  {
    name: "Nebula Theme",          category: "DASHBOARD_THEME", rarity: "UNCOMMON",
    cssSlug: "nebula",     shopEligible: false, doubloonPrice: 0,
    unlockCondition: "Quest drop",
    themeTokens: { accent: "#c155f5", accentSoft: "#efd9fb", glow: "rgba(193,85,245,0.35)", bgOverlay: "transparent" },
  },
  {
    name: "Coral Reef Theme",      category: "DASHBOARD_THEME", rarity: "UNCOMMON",
    cssSlug: "coral-reef", shopEligible: false, doubloonPrice: 0,
    unlockCondition: "Quest drop",
    themeTokens: { accent: "#ff5b76", accentSoft: "#fdd6db", glow: "rgba(255,91,118,0.35)", bgOverlay: "transparent" },
  },
  {
    name: "Supernova Theme",       category: "DASHBOARD_THEME", rarity: "RARE",
    cssSlug: "supernova",  shopEligible: false, doubloonPrice: 0,
    unlockCondition: "Quest drop",
    themeTokens: { accent: "#ffd54f", accentSoft: "#fff4cc", glow: "rgba(255,213,79,0.40)", bgOverlay: "rgba(255,213,79,0.04)" },
  },
  {
    name: "Quasar Theme",          category: "DASHBOARD_THEME", rarity: "RARE",
    cssSlug: "quasar",     shopEligible: false, doubloonPrice: 0,
    unlockCondition: "Quest drop",
    themeTokens: { accent: "#5b8def", accentSoft: "#d8e3fb", glow: "rgba(91,141,239,0.35)", bgOverlay: "rgba(91,141,239,0.03)" },
  },
  {
    name: "Event Horizon Theme",   category: "DASHBOARD_THEME", rarity: "MYTHIC",
    cssSlug: "event-horizon", shopEligible: false, doubloonPrice: 0,
    unlockCondition: "Quest drop",
    themeTokens: { accent: "#b388eb", accentSoft: "#ece0f7", glow: "rgba(179,136,235,0.45)", bgOverlay: "rgba(0,0,0,0.18)" },
  },
  {
    name: "Celestial Storm Theme", category: "DASHBOARD_THEME", rarity: "MYTHIC",
    cssSlug: "celestial-storm", shopEligible: false, doubloonPrice: 0,
    unlockCondition: "Quest drop",
    themeTokens: { accent: "#00e5cc", accentSoft: "#cef7f0", glow: "rgba(0,229,204,0.40)", bgOverlay: "rgba(0,229,204,0.03)" },
  },

  // ── Borders (quest drops) ──────────────────────────────────────
  {
    name: "Teal Thin Border",      category: "BORDER", rarity: "COMMON",
    cssSlug: "thin-teal",  shopEligible: false, doubloonPrice: 0,
    unlockCondition: "Quest drop",
    themeTokens: { accent: "#00e5cc", accentSoft: "#00b3a0", glow: "rgba(0,229,204,0.4)", bgOverlay: "transparent" },
  },
  {
    name: "Amber Thin Border",     category: "BORDER", rarity: "COMMON",
    cssSlug: "thin-amber", shopEligible: false, doubloonPrice: 0,
    unlockCondition: "Quest drop",
    themeTokens: { accent: "#f5a623", accentSoft: "#d18a0f", glow: "rgba(245,166,35,0.4)", bgOverlay: "transparent" },
  },
  {
    name: "Violet Glow Border",    category: "BORDER", rarity: "UNCOMMON",
    cssSlug: "glow-violet", shopEligible: false, doubloonPrice: 0,
    unlockCondition: "Quest drop",
    themeTokens: { accent: "#8b7cf8", accentSoft: "#5d4dcf", glow: "rgba(139,124,248,0.6)", bgOverlay: "transparent" },
  },
  {
    name: "Coral Ring Border",     category: "BORDER", rarity: "UNCOMMON",
    cssSlug: "ring-coral",  shopEligible: false, doubloonPrice: 0,
    unlockCondition: "Quest drop",
    themeTokens: { accent: "#ff6b6b", accentSoft: "#ff9a8b", glow: "rgba(255,107,107,0.4)", bgOverlay: "transparent" },
  },
  {
    name: "Laser Gradient Border", category: "BORDER", rarity: "RARE",
    cssSlug: "laser-gradient", shopEligible: false, doubloonPrice: 0,
    unlockCondition: "Quest drop",
    themeTokens: { accent: "#00e5cc", accentSoft: "#8b7cf8", glow: "rgba(139,124,248,0.5)", bgOverlay: "transparent" },
  },
  {
    name: "Aurora Pulse Border",   category: "BORDER", rarity: "RARE",
    cssSlug: "pulse-aurora",  shopEligible: false, doubloonPrice: 0,
    unlockCondition: "Quest drop",
    themeTokens: { accent: "#2bd9e3", accentSoft: "#8b7cf8", glow: "rgba(43,217,227,0.5)", bgOverlay: "transparent" },
  },
  {
    name: "Cosmic Shimmer Border", category: "BORDER", rarity: "MYTHIC",
    cssSlug: "cosmic-shimmer", shopEligible: false, doubloonPrice: 0,
    unlockCondition: "Quest drop",
    themeTokens: { accent: "#00e5cc", accentSoft: "#ff6b6b", glow: "rgba(0,229,204,0.6)", bgOverlay: "transparent" },
  },
  {
    name: "Eclipse Border",        category: "BORDER", rarity: "MYTHIC",
    cssSlug: "eclipse",        shopEligible: false, doubloonPrice: 0,
    unlockCondition: "Quest drop",
    themeTokens: { accent: "#8b7cf8", accentSoft: "#ffffff", glow: "rgba(139,124,248,0.7)", bgOverlay: "transparent" },
  },
];

async function main(): Promise<void> {
  console.log("🌱 Seeding engagement layer...");

  for (const cfg of EVENT_DEFAULTS) {
    await prisma.rewardEventConfig.upsert({
      where:  { eventType: cfg.eventType },
      update: {}, // don't clobber admin-edited values on re-seed
      create: cfg,
    });
  }
  console.log(`  ✅ RewardEventConfig: ${EVENT_DEFAULTS.length} rows ensured`);

  let backfilled = 0;
  for (const c of COSMETICS) {
    const existing = await prisma.cosmetic.findFirst({ where: { name: c.name } });
    if (existing) {
      // Backfill svgUrl on rows seeded before badges had artwork, without
      // clobbering any other admin-edited fields.
      if (c.svgUrl && existing.svgUrl !== c.svgUrl) {
        await prisma.cosmetic.update({ where: { id: existing.id }, data: { svgUrl: c.svgUrl } });
        backfilled++;
      }
      continue;
    }
    await prisma.cosmetic.create({ data: c });
  }
  const total = await prisma.cosmetic.count();
  console.log(`  ✅ Cosmetic catalogue: ${total} rows total (${COSMETICS.length} seed entries, ${backfilled} svgUrl backfilled)`);

  console.log("🌱 Engagement seed complete.");
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
