// RNG drop system for quest completions.
// ROLL_TABLES are evaluated independently per row (not a single pick) so multiple
// outcomes can land in one roll — matching the spec's "+chance" wording.

import { prisma } from "../db/prisma.js";
import { CosmeticRarity, InventoryItemKey } from "@prisma/client";
import { grantDoubloons } from "./rewardService.js";

type OutcomeKind = "BADGE" | "ANIMATION" | "BORDER" | "CONSUMABLE" | "DB_BONUS";

type RollRow = {
  outcomeKind: OutcomeKind;
  payload: {
    rarity?: CosmeticRarity;
    itemKey?: InventoryItemKey;
    quantity?: number;
    amount?: number;
  };
  probability: number;
};

export type RollResult = RollRow & { hit: true };

const ROLL_TABLES: Record<string, RollRow[]> = {
  DAILY_DROP: [
    { outcomeKind: "CONSUMABLE", payload: { itemKey: "STREAK_FREEZE", quantity: 1 }, probability: 0.08 },
    { outcomeKind: "CONSUMABLE", payload: { itemKey: "XP_BOOST_24H",  quantity: 1 }, probability: 0.05 },
    { outcomeKind: "CONSUMABLE", payload: { itemKey: "KUDOS_REFILL",  quantity: 1 }, probability: 0.06 },
  ],

  WEEKLY_BADGE: [
    { outcomeKind: "BADGE",      payload: { rarity: "COMMON" },                      probability: 0.55 },
    { outcomeKind: "BADGE",      payload: { rarity: "UNCOMMON" },                    probability: 0.35 },
    { outcomeKind: "CONSUMABLE", payload: { itemKey: "STREAK_FREEZE", quantity: 2 }, probability: 0.12 },
    { outcomeKind: "CONSUMABLE", payload: { itemKey: "XP_BOOST_24H",  quantity: 1 }, probability: 0.08 },
    { outcomeKind: "ANIMATION",  payload: { rarity: "COMMON" },                      probability: 0.18 },
    { outcomeKind: "ANIMATION",  payload: { rarity: "UNCOMMON" },                    probability: 0.09 },
    { outcomeKind: "BORDER",     payload: { rarity: "COMMON" },                      probability: 0.15 },
    { outcomeKind: "BORDER",     payload: { rarity: "UNCOMMON" },                    probability: 0.07 },
    { outcomeKind: "CONSUMABLE", payload: { itemKey: "KUDOS_REFILL",  quantity: 3 }, probability: 0.10 },
  ],

  MONTHLY_HIGH_RARITY: [
    { outcomeKind: "BADGE",      payload: { rarity: "RARE" },                        probability: 0.60 },
    { outcomeKind: "BADGE",      payload: { rarity: "MYTHIC" },                      probability: 0.15 },
    { outcomeKind: "CONSUMABLE", payload: { itemKey: "STREAK_FREEZE", quantity: 7 }, probability: 0.20 },
    { outcomeKind: "CONSUMABLE", payload: { itemKey: "XP_BOOST_24H",  quantity: 1 }, probability: 0.10 },
    { outcomeKind: "ANIMATION",  payload: { rarity: "RARE" },                        probability: 0.25 },
    { outcomeKind: "ANIMATION",  payload: { rarity: "MYTHIC" },                      probability: 0.08 },
    { outcomeKind: "BORDER",     payload: { rarity: "RARE" },                        probability: 0.20 },
    { outcomeKind: "BORDER",     payload: { rarity: "MYTHIC" },                      probability: 0.05 },
    { outcomeKind: "CONSUMABLE", payload: { itemKey: "KUDOS_REFILL",  quantity: 10 },probability: 0.15 },
    { outcomeKind: "DB_BONUS",   payload: { amount: 500 },                           probability: 0.10 },
  ],

  GUARANTEED_MYTHIC: [
    { outcomeKind: "BADGE", payload: { rarity: "MYTHIC" }, probability: 1.0 },
  ],
};

export function rollTable(tableKey: string): RollResult[] {
  const table = ROLL_TABLES[tableKey];
  if (!table) return [];
  return table
    .filter(row => Math.random() < row.probability)
    .map(row => ({ ...row, hit: true as const }));
}

export async function applyRollResults(
  memberId: string,
  sourceType: string,
  sourceId: string,
  tableKey: string,
  results: RollResult[]
): Promise<void> {
  const rolled: any[] = [];

  for (const result of results) {
    const { outcomeKind, payload } = result;

    if (outcomeKind === "DB_BONUS" && payload.amount) {
      await grantDoubloons(memberId, payload.amount, "ADMIN_ADJUSTMENT");
      rolled.push({ kind: "DB_BONUS", amount: payload.amount });
      continue;
    }

    if (outcomeKind === "CONSUMABLE" && payload.itemKey && payload.quantity) {
      await prisma.memberInventory.upsert({
        where:  { memberId_itemKey: { memberId, itemKey: payload.itemKey } },
        update: { quantity: { increment: payload.quantity } },
        create: { memberId, itemKey: payload.itemKey, quantity: payload.quantity },
      });
      rolled.push({ kind: "CONSUMABLE", itemKey: payload.itemKey, quantity: payload.quantity });
      continue;
    }

    if ((outcomeKind === "BADGE" || outcomeKind === "ANIMATION" || outcomeKind === "BORDER") && payload.rarity) {
      const category = outcomeKind === "BADGE" ? "BADGE"
        : outcomeKind === "ANIMATION" ? "ANIMATION"
        : "BORDER";

      const owned = await prisma.memberCosmetic.findMany({
        where: { memberId },
        select: { cosmeticId: true },
      });
      const ownedIds = owned.map(o => o.cosmeticId);

      const candidate = await prisma.cosmetic.findFirst({
        where: {
          category,
          rarity: payload.rarity,
          id: { notIn: ownedIds },
        },
        orderBy: { createdAt: "asc" },
      });

      if (candidate) {
        await prisma.memberCosmetic.create({
          data: { memberId, cosmeticId: candidate.id },
        });
        rolled.push({ kind: outcomeKind, cosmeticId: candidate.id, rarity: payload.rarity, name: candidate.name });
      } else {
        // All cosmetics of this type owned — convert to DB bonus
        const bonus = payload.rarity === "MYTHIC" ? 200
          : payload.rarity === "RARE" ? 100
          : payload.rarity === "UNCOMMON" ? 50 : 25;
        await grantDoubloons(memberId, bonus, "ADMIN_ADJUSTMENT");
        rolled.push({ kind: "DB_BONUS_DUPE_CONVERT", amount: bonus, rarity: payload.rarity });
      }
    }
  }

  await prisma.rewardRoll.create({
    data: { memberId, sourceType, sourceId, tableKey, rolled },
  });
}
