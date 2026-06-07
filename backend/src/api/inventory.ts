// Member inventory + consumable usage endpoints.

import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import {
  getInventoryForMember,
  useInventoryItem,
  ConsumableError,
} from "../services/shopService.js";

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth);

// GET /api/inventory
inventoryRouter.get("/", async (req: Request, res: Response) => {
  try {
    const data = await getInventoryForMember(req.memberId!);
    res.json(data);
  } catch (err) {
    console.error("[inventory] get error:", err);
    res.status(500).json({ error: "Failed to load inventory" });
  }
});

// POST /api/inventory/use   body { itemKey }
inventoryRouter.post("/use", async (req: Request, res: Response) => {
  const { itemKey } = req.body as { itemKey?: string };
  if (!itemKey) {
    res.status(400).json({ error: "itemKey required" });
    return;
  }
  try {
    const result = await useInventoryItem(req.memberId!, itemKey as any);
    res.json(result);
  } catch (err) {
    if (err instanceof ConsumableError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error("[inventory] use error:", err);
    res.status(500).json({ error: "Failed to use item" });
  }
});
