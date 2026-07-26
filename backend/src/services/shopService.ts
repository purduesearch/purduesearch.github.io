// Daily-rotating cosmetic shop. Each member gets a per-day rotation of:
//   3 commons + 2 uncommons (always), plus 1 rare (rank-gated, 50% chance) and
//   1 mythic (rank-gated, 10% chance). Wishlists 2× weighted; cosmetics unseen
//   in the last 14 days 1.5× weighted. Idempotent per (memberId, day-UTC).

import { prisma } from "../db/prisma.js";
import type { Cosmetic, Rank, InventoryItemKey, EffectKey } from "@prisma/client";

export class ConsumableError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export const RARE_RANK_GATE:   Rank[] = ["SPECIALIST", "PIONEER", "COSMONAUT", "CELESTIAL"];
export const MYTHIC_RANK_GATE: Rank[] = ["COSMONAUT", "CELESTIAL"];

const MS_PER_DAY  = 86_400_000;
const SEEN_WINDOW = 14 * MS_PER_DAY;

function startOfUtcDay(date: Date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

type ShopSlots = {
  common:   string[];
  uncommon: string[];
  rare:     string | null;
  mythic:   string | null;
};

/** Weighted random sample without replacement. */
function weightedSample<T>(items: T[], weights: number[], n: number): T[] {
  const pool = items.map((item, i) => ({ item, weight: weights[i] ?? 1 }));
  const out: T[] = [];
  while (out.length < n && pool.length > 0) {
    const total = pool.reduce((s, p) => s + p.weight, 0);
    let r = Math.random() * total;
    let pickedIdx = -1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].weight;
      if (r <= 0) { pickedIdx = i; break; }
    }
    if (pickedIdx === -1) pickedIdx = pool.length - 1;
    out.push(pool[pickedIdx].item);
    pool.splice(pickedIdx, 1);
  }
  return out;
}

async function generateSlotsFor(memberId: string): Promise<ShopSlots> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { xp: true, rank: true },
  });
  if (!member) return { common: [], uncommon: [], rare: null, mythic: null };

  const [ownedRows, wishlistRows, recentRotations] = await Promise.all([
    prisma.memberCosmetic.findMany({ where: { memberId }, select: { cosmeticId: true } }),
    prisma.cosmeticWishlist.findMany({ where: { memberId }, select: { cosmeticId: true } }),
    prisma.shopRotation.findMany({
      where: { memberId, date: { gte: new Date(Date.now() - SEEN_WINDOW) } },
      select: { slots: true },
    }),
  ]);
  const ownedIds = new Set(ownedRows.map(r => r.cosmeticId));
  const wishIds  = new Set(wishlistRows.map(r => r.cosmeticId));

  const recentlyShown = new Set<string>();
  for (const r of recentRotations) {
    const s = r.slots as ShopSlots;
    for (const id of s.common ?? [])   recentlyShown.add(id);
    for (const id of s.uncommon ?? []) recentlyShown.add(id);
    if (s.rare)   recentlyShown.add(s.rare);
    if (s.mythic) recentlyShown.add(s.mythic);
  }

  const candidates = await prisma.cosmetic.findMany({
    where: {
      shopEligible: true,
      AND: [
        { id: { notIn: [...ownedIds] } },
        { OR: [{ xpGate: null }, { xpGate: { lte: member.xp } }] },
      ],
    },
  });

  const weightFor = (c: Cosmetic) =>
    (wishIds.has(c.id) ? 2 : 1) * (recentlyShown.has(c.id) ? 1 : 1.5);

  const byRarity = (rarity: Cosmetic["rarity"]) => candidates.filter(c => c.rarity === rarity);
  const pick = (rarity: Cosmetic["rarity"], n: number): string[] => {
    const pool = byRarity(rarity);
    return weightedSample(pool, pool.map(weightFor), Math.min(n, pool.length)).map(c => c.id);
  };

  const common   = pick("COMMON",   3);
  const uncommon = pick("UNCOMMON", 2);

  let rare: string | null = null;
  if (RARE_RANK_GATE.includes(member.rank) && Math.random() < 0.5) {
    const rares = pick("RARE", 1);
    rare = rares[0] ?? null;
  }
  let mythic: string | null = null;
  if (MYTHIC_RANK_GATE.includes(member.rank) && Math.random() < 0.1) {
    const ms = pick("MYTHIC", 1);
    mythic = ms[0] ?? null;
  }

  return { common, uncommon, rare, mythic };
}

export async function getOrCreateTodayRotation(memberId: string) {
  const day = startOfUtcDay();
  const tomorrow = new Date(day.getTime() + MS_PER_DAY);

  const existing = await prisma.shopRotation.findUnique({
    where: { memberId_date: { memberId, date: day } },
  });
  if (existing) return existing;

  const slots = await generateSlotsFor(memberId);
  return prisma.shopRotation.create({
    data: { memberId, date: day, slots: slots as any, expiresAt: tomorrow },
  });
}

/** Cron entrypoint — refresh rotations for every non-bot member. */
export async function rotateAll(): Promise<void> {
  const members = await prisma.member.findMany({
    where: { isBot: false },
    select: { id: true },
  });
  for (const m of members) {
    try {
      await getOrCreateTodayRotation(m.id);
    } catch (err) {
      console.error(`[shop] rotateAll member=${m.id} failed:`, err);
    }
  }
}

/** Atomic purchase: re-reads balance and ownership inside a transaction. */
export async function purchase(memberId: string, cosmeticId: string): Promise<{
  newBalance: number;
  unlockedCosmetic: {
    id: string;
    name: string;
    rarity: string;
    category: string;
    svgUrl: string | null;
    iconClass: string | null;
  };
}> {
  return prisma.$transaction(async (tx) => {
    const [member, cosmetic, owned] = await Promise.all([
      tx.member.findUnique({ where: { id: memberId }, select: { doubloons: true, rank: true, xp: true } }),
      tx.cosmetic.findUnique({ where: { id: cosmeticId } }),
      tx.memberCosmetic.findUnique({ where: { memberId_cosmeticId: { memberId, cosmeticId } } }),
    ]);
    if (!member)   throw new Error("Member not found");
    if (!cosmetic) throw new Error("Cosmetic not found");
    if (owned)     throw new Error("You already own this");
    if (cosmetic.doubloonPrice <= 0) throw new Error("Not for sale");
    if (member.doubloons < cosmetic.doubloonPrice) throw new Error("Insufficient doubloons");
    if (cosmetic.xpGate !== null && member.xp < cosmetic.xpGate) throw new Error("XP gate not met");

    // Verify it's in today's rotation for this member (anti-cheat).
    const today = startOfUtcDay();
    const rotation = await tx.shopRotation.findUnique({
      where: { memberId_date: { memberId, date: today } },
    });
    if (!rotation) throw new Error("No active rotation");
    const slots = rotation.slots as ShopSlots;
    const inRotation = (slots.common ?? []).includes(cosmeticId)
                    || (slots.uncommon ?? []).includes(cosmeticId)
                    || slots.rare   === cosmeticId
                    || slots.mythic === cosmeticId;
    if (!inRotation) throw new Error("Not in today's rotation");

    const updated = await tx.member.update({
      where: { id: memberId },
      data:  { doubloons: { decrement: cosmetic.doubloonPrice } },
      select: { doubloons: true },
    });
    await tx.memberCosmetic.create({ data: { memberId, cosmeticId } });
    await tx.doubloonEvent.create({
      data: { memberId, amount: -cosmetic.doubloonPrice, source: "SHOP_PURCHASE", cosmeticId },
    });
    return {
      newBalance: updated.doubloons,
      unlockedCosmetic: {
        id: cosmetic.id,
        name: cosmetic.name,
        rarity: cosmetic.rarity,
        category: cosmetic.category,
        svgUrl: cosmetic.svgUrl,
        iconClass: cosmetic.iconClass,
      },
    };
  });
}

export async function toggleWishlist(memberId: string, cosmeticId: string): Promise<{ wishlisted: boolean }> {
  const existing = await prisma.cosmeticWishlist.findUnique({
    where: { memberId_cosmeticId: { memberId, cosmeticId } },
  });
  if (existing) {
    await prisma.cosmeticWishlist.delete({ where: { id: existing.id } });
    return { wishlisted: false };
  }
  await prisma.cosmeticWishlist.create({ data: { memberId, cosmeticId } });
  return { wishlisted: true };
}

/** Equip / unequip cosmetics by category slot. Used by the Profile cosmetic locker + Shop.
 *
 * The "rank_badge" slot is special: it's stored directly on Member.equippedBadgeId
 * (not via MemberCosmetic.equippedSlot) so the sidebar rank icon can render
 * without joining through MemberCosmetic on every request. */
export async function setEquipped(memberId: string, slot: string, cosmeticId: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (slot === "rank_badge") {
      // Ownership check — refuse to equip a badge the member doesn't own.
      if (cosmeticId) {
        const owned = await tx.memberCosmetic.findUnique({
          where: { memberId_cosmeticId: { memberId, cosmeticId } },
        });
        if (!owned) throw new Error("You don't own that badge");
      }
      await tx.member.update({
        where: { id: memberId },
        data:  { equippedBadgeId: cosmeticId },
      });
      return;
    }

    // Unequip anything currently in this slot
    await tx.memberCosmetic.updateMany({
      where: { memberId, equippedSlot: slot },
      data:  { equippedSlot: null },
    });
    if (cosmeticId) {
      await tx.memberCosmetic.update({
        where: { memberId_cosmeticId: { memberId, cosmeticId } },
        data:  { equippedSlot: slot },
      });
    }
  });
}

// ── Consumables ──────────────────────────────────────────────

export type ConsumableDef = {
  key: InventoryItemKey;
  name: string;
  shortDesc: string;
  longDesc: string;
  price: number; // doubloons
  icon: string;  // Font Awesome class
  rarity: "COMMON" | "UNCOMMON" | "RARE" | "MYTHIC";
};

/** Static consumables catalogue. Promote to a DB-backed config when admins need to tune prices. */
export const CONSUMABLES: ConsumableDef[] = [
  {
    key: "STREAK_FREEZE",
    name: "Streak Freeze",
    shortDesc: "Saves your streak if you miss a day.",
    longDesc: "Sits in your inventory. Auto-activates when you miss a day so your streak survives.",
    price: 50,
    icon: "fa-snowflake",
    rarity: "COMMON",
  },
  {
    key: "XP_BOOST_24H",
    name: "XP Boost (2× / 24h)",
    shortDesc: "Doubles XP for 24 hours.",
    longDesc: "Activates instantly. All XP grants for the next 24 hours are doubled.",
    price: 120,
    icon: "fa-bolt",
    rarity: "RARE",
  },
  {
    key: "KUDOS_REFILL",
    name: "Kudos Refill",
    shortDesc: "Adds +2 kudos sends this week.",
    longDesc: "Increases your weekly send cap by 2 (from 3 to 5) for the current ISO week.",
    price: 80,
    icon: "fa-heart",
    rarity: "UNCOMMON",
  },
  {
    key: "SHOP_REROLL",
    name: "Shop Re-roll",
    shortDesc: "Re-rolls today's shop rotation.",
    longDesc: "Wipes today's rotation and generates a fresh one. Use it when nothing in today's slots catches your eye.",
    price: 30,
    icon: "fa-dice",
    rarity: "COMMON",
  },
];

export function getConsumable(key: InventoryItemKey): ConsumableDef | undefined {
  return CONSUMABLES.find(c => c.key === key);
}

/** Atomic consumable purchase: deduct doubloons, increment inventory. */
export async function purchaseConsumable(memberId: string, itemKey: InventoryItemKey): Promise<{
  newBalance: number;
  inventory: { itemKey: InventoryItemKey; quantity: number }[];
}> {
  const def = getConsumable(itemKey);
  if (!def) throw new ConsumableError(400, "Unknown consumable");

  return prisma.$transaction(async (tx) => {
    const member = await tx.member.findUnique({ where: { id: memberId }, select: { doubloons: true } });
    if (!member) throw new ConsumableError(404, "Member not found");
    if (member.doubloons < def.price) throw new ConsumableError(400, "Insufficient doubloons");

    const updated = await tx.member.update({
      where: { id: memberId },
      data:  { doubloons: { decrement: def.price } },
      select: { doubloons: true },
    });

    await tx.memberInventory.upsert({
      where:  { memberId_itemKey: { memberId, itemKey } },
      create: { memberId, itemKey, quantity: 1 },
      update: { quantity: { increment: 1 } },
    });

    await tx.doubloonEvent.create({
      data: { memberId, amount: -def.price, source: "SHOP_PURCHASE" },
    });

    const inventory = await tx.memberInventory.findMany({
      where:  { memberId },
      select: { itemKey: true, quantity: true },
    });

    return { newBalance: updated.doubloons, inventory };
  });
}

/** Use one item from the member's inventory. Item-specific logic. */
export async function useInventoryItem(memberId: string, itemKey: InventoryItemKey): Promise<{
  ok: true;
  message: string;
  inventory: { itemKey: InventoryItemKey; quantity: number }[];
  effect?: { effectKey: EffectKey; expiresAt: Date };
  weeklyBonusSends?: number;
}> {
  const inv = await prisma.memberInventory.findUnique({
    where: { memberId_itemKey: { memberId, itemKey } },
  });
  if (!inv || inv.quantity <= 0) {
    throw new ConsumableError(400, "You don't have any of those");
  }

  switch (itemKey) {
    case "STREAK_FREEZE": {
      // Passive — cannot be manually used.
      throw new ConsumableError(400, "Streak Freezes auto-activate when you miss a day. Just hold on to it.");
    }
    case "XP_BOOST_24H": {
      const existing = await prisma.activeEffect.findUnique({
        where: { memberId_effectKey: { memberId, effectKey: "XP_BOOST_24H" } },
      });
      if (existing && existing.expiresAt.getTime() > Date.now()) {
        throw new ConsumableError(409, "An XP Boost is already active");
      }
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const effect = await prisma.activeEffect.upsert({
        where:  { memberId_effectKey: { memberId, effectKey: "XP_BOOST_24H" } },
        create: { memberId, effectKey: "XP_BOOST_24H", multiplier: 2, expiresAt },
        update: { multiplier: 2, expiresAt },
      });
      await prisma.memberInventory.update({
        where: { id: inv.id },
        data:  { quantity: { decrement: 1 } },
      });
      const inventory = await prisma.memberInventory.findMany({
        where:  { memberId },
        select: { itemKey: true, quantity: true },
      });
      return {
        ok: true,
        message: "XP Boost activated. 2× XP for the next 24 hours.",
        inventory,
        effect: { effectKey: effect.effectKey, expiresAt: effect.expiresAt },
      };
    }
    case "KUDOS_REFILL": {
      const weekStart = startOfIsoWeek();
      const member = await prisma.member.findUnique({
        where: { id: memberId },
        select: { weeklyBonusSends: true, weeklyBonusSendsWeek: true },
      });
      let bonus = (member?.weeklyBonusSends ?? 0);
      if (!member?.weeklyBonusSendsWeek || member.weeklyBonusSendsWeek.getTime() !== weekStart.getTime()) {
        bonus = 0; // stale week — reset before applying
      }
      bonus += 2;
      await prisma.member.update({
        where: { id: memberId },
        data:  { weeklyBonusSends: bonus, weeklyBonusSendsWeek: weekStart },
      });
      await prisma.memberInventory.update({
        where: { id: inv.id },
        data:  { quantity: { decrement: 1 } },
      });
      const inventory = await prisma.memberInventory.findMany({
        where:  { memberId },
        select: { itemKey: true, quantity: true },
      });
      return {
        ok: true,
        message: `+2 kudos sends this week. You can now send ${3 + bonus} kudos before Monday.`,
        inventory,
        weeklyBonusSends: bonus,
      };
    }
    case "SHOP_REROLL": {
      await regenerateForMember(memberId);
      await prisma.memberInventory.update({
        where: { id: inv.id },
        data:  { quantity: { decrement: 1 } },
      });
      const inventory = await prisma.memberInventory.findMany({
        where:  { memberId },
        select: { itemKey: true, quantity: true },
      });
      return {
        ok: true,
        message: "Shop re-rolled. Fresh items in your rotation.",
        inventory,
      };
    }
    default:
      throw new ConsumableError(400, "Unknown consumable");
  }
}

/** Wipe today's rotation row for a member and regenerate from scratch. */
export async function regenerateForMember(memberId: string) {
  const day = startOfUtcDay();
  const tomorrow = new Date(day.getTime() + MS_PER_DAY);
  const slots = await generateSlotsFor(memberId);
  return prisma.shopRotation.upsert({
    where:  { memberId_date: { memberId, date: day } },
    create: { memberId, date: day, slots: slots as any, expiresAt: tomorrow },
    update: { slots: slots as any, expiresAt: tomorrow },
  });
}

/** Read-side: inventory + active effects + weekly kudos bonus for a member. */
export async function getInventoryForMember(memberId: string) {
  const [inventory, effects, member] = await Promise.all([
    prisma.memberInventory.findMany({
      where:  { memberId },
      orderBy: { itemKey: "asc" },
      select: { itemKey: true, quantity: true, acquiredAt: true, updatedAt: true },
    }),
    prisma.activeEffect.findMany({
      where: { memberId, expiresAt: { gt: new Date() } },
      select: { effectKey: true, multiplier: true, expiresAt: true },
    }),
    prisma.member.findUnique({
      where: { id: memberId },
      select: { weeklyBonusSends: true, weeklyBonusSendsWeek: true },
    }),
  ]);

  // Zero out stale weeklyBonusSends if the recorded week is older than the current.
  const currentWeek = startOfIsoWeek();
  const bonusValid =
    member?.weeklyBonusSendsWeek && member.weeklyBonusSendsWeek.getTime() === currentWeek.getTime();
  const weeklyBonusSends = bonusValid ? (member?.weeklyBonusSends ?? 0) : 0;

  return { inventory, effects, weeklyBonusSends };
}

function startOfIsoWeek(now: Date = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay();
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d;
}
