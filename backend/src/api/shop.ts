// Shop endpoints — today's rotation, purchase, wishlist toggle.

import { Router, type Request, type Response } from "express";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "./auth.js";
import {
  getOrCreateTodayRotation,
  purchase,
  toggleWishlist,
  setEquipped,
  CONSUMABLES,
  purchaseConsumable,
  ConsumableError,
} from "../services/shopService.js";

export const shopRouter = Router();
shopRouter.use(requireAuth);

// ── GET /api/shop/today ──────────────────────────────────────
// Returns today's rotation hydrated with full Cosmetic rows, the member's
// balance, ownership set, and wishlist set.

shopRouter.get("/today", async (req: Request, res: Response) => {
  try {
    const memberId = req.memberId!;
    const rotation = await getOrCreateTodayRotation(memberId);
    const slots = rotation.slots as {
      common: string[]; uncommon: string[];
      rare: string | null; mythic: string | null;
    };

    const allIds = [
      ...(slots.common ?? []),
      ...(slots.uncommon ?? []),
      slots.rare, slots.mythic,
    ].filter((id): id is string => !!id);

    const [cosmetics, member, owned, wishlists] = await Promise.all([
      prisma.cosmetic.findMany({ where: { id: { in: allIds } } }),
      prisma.member.findUnique({ where: { id: memberId }, select: { doubloons: true, rank: true, xp: true } }),
      prisma.memberCosmetic.findMany({ where: { memberId }, select: { cosmeticId: true } }),
      prisma.cosmeticWishlist.findMany({ where: { memberId }, select: { cosmeticId: true } }),
    ]);

    const byId = new Map(cosmetics.map(c => [c.id, c]));
    const hydrate = (id: string | null | undefined) => (id ? byId.get(id) ?? null : null);

    res.json({
      slots: {
        common:   (slots.common ?? []).map(hydrate).filter(Boolean),
        uncommon: (slots.uncommon ?? []).map(hydrate).filter(Boolean),
        rare:     hydrate(slots.rare),
        mythic:   hydrate(slots.mythic),
      },
      expiresAt: rotation.expiresAt,
      balance:   member?.doubloons ?? 0,
      rank:      member?.rank,
      xp:        member?.xp ?? 0,
      ownedIds:    owned.map(o => o.cosmeticId),
      wishlistIds: wishlists.map(w => w.cosmeticId),
    });
  } catch (err: any) {
    console.error("Shop /today error:", err);
    res.status(500).json({ error: err.message ?? "Failed to load shop" });
  }
});

// ── POST /api/shop/purchase ──────────────────────────────────

shopRouter.post("/purchase", async (req: Request, res: Response) => {
  try {
    const { cosmeticId } = req.body as { cosmeticId: string };
    if (!cosmeticId) {
      res.status(400).json({ error: "cosmeticId required" });
      return;
    }
    const result = await purchase(req.memberId!, cosmeticId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? "Purchase failed" });
  }
});

// ── POST /api/shop/wishlist/:cosmeticId ──────────────────────

shopRouter.post("/wishlist/:cosmeticId", async (req: Request, res: Response) => {
  try {
    const result = await toggleWishlist(req.memberId!, req.params.cosmeticId as string);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? "Failed to toggle wishlist" });
  }
});

// ── POST /api/shop/equip ─────────────────────────────────────
// Body: { slot: "outfit" | "hair" | "theme" | "frame" | "animation",
//         cosmeticId: string | null }   (null = unequip)

shopRouter.post("/equip", async (req: Request, res: Response) => {
  try {
    const { slot, cosmeticId } = req.body as { slot: string; cosmeticId: string | null };
    if (!slot) {
      res.status(400).json({ error: "slot required" });
      return;
    }
    await setEquipped(req.memberId!, slot, cosmeticId ?? null);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? "Failed to equip" });
  }
});

// ── GET /api/shop/consumables ────────────────────────────────

shopRouter.get("/consumables", async (_req: Request, res: Response) => {
  res.json({ consumables: CONSUMABLES });
});

// ── POST /api/shop/purchase-consumable ───────────────────────

shopRouter.post("/purchase-consumable", async (req: Request, res: Response) => {
  const { itemKey } = req.body as { itemKey?: string };
  if (!itemKey) {
    res.status(400).json({ error: "itemKey required" });
    return;
  }
  try {
    const result = await purchaseConsumable(req.memberId!, itemKey as any);
    res.json(result);
  } catch (err) {
    if (err instanceof ConsumableError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error("[shop] purchase-consumable error:", err);
    res.status(500).json({ error: "Purchase failed" });
  }
});
