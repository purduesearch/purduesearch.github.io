// ClubPM Shop — Daily Deal + Consumables + Rotation grid + Inventory.
//
// Layout:
//   1. Balance / streak header (animated counters)
//   2. Featured Daily Deal (highest-rarity slot, hero card)
//   3. Consumables row (Streak Freeze, XP Boost, Kudos Refill, Re-roll)
//   4. Today's Rotation grid
//   5. Inventory panel (collapsed by default)

import { useCallback, useEffect, useState, useRef } from "react";
import toast from "react-hot-toast";
import {
  get,
  post,
  getConsumables,
  purchaseConsumable as apiPurchaseConsumable,
  getInventory,
  useInventoryItem as activateInventoryItem,
} from "../../api/clubPmClient";
import ShopCard from "../../components/clubpm/shop/ShopCard";
import ConsumableCard from "../../components/clubpm/shop/ConsumableCard";
import InventoryPanel from "../../components/clubpm/shop/InventoryPanel";
import { tweenNumber, revealStagger } from "../../clubpm/anim/motion";

const RARE_RANK_GATE   = ["SPECIALIST", "PIONEER", "COSMONAUT", "CELESTIAL"];
const MYTHIC_RANK_GATE = ["COSMONAUT", "CELESTIAL"];

function formatCountdown(msRemaining) {
  if (msRemaining <= 0) return "Refreshing…";
  const totalSec = Math.floor(msRemaining / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `Refreshes in ${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

// Pick the highest-rarity slot to feature as the Daily Deal hero.
function pickFeatured(slots, rank) {
  if (slots.mythic && MYTHIC_RANK_GATE.includes(rank)) return slots.mythic;
  if (slots.rare   && RARE_RANK_GATE.includes(rank))   return slots.rare;
  if (slots.uncommon?.length) return slots.uncommon[0];
  if (slots.common?.length)   return slots.common[0];
  return null;
}

export default function Shop() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [consumables, setConsumables] = useState([]);
  const [inv, setInv] = useState({ inventory: [], effects: [], weeklyBonusSends: 0 });
  const tickRef = useRef(null);
  const balanceRef = useRef(null);
  const prevBalance = useRef(0);
  const gridRef = useRef(null);
  const consumablesRowRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [today, cataloguePayload, inventoryPayload] = await Promise.all([
        get("/api/shop/today"),
        getConsumables(),
        getInventory(),
      ]);
      setData(today);
      setConsumables(cataloguePayload?.consumables ?? []);
      setInv(inventoryPayload ?? { inventory: [], effects: [], weeklyBonusSends: 0 });
    } catch (err) {
      toast.error(err.message ?? "Failed to load shop");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tickRef.current);
  }, []);

  useEffect(() => {
    if (!data?.expiresAt) return;
    const remaining = new Date(data.expiresAt).getTime() - now;
    if (remaining <= 0) load();
  }, [now, data?.expiresAt, load]);

  // Animate balance whenever it changes (initial load or after purchase).
  useEffect(() => {
    if (!balanceRef.current || data?.balance == null) return;
    const next = Number(data.balance) || 0;
    tweenNumber(balanceRef.current, prevBalance.current, next, { duration: 800 });
    prevBalance.current = next;
  }, [data?.balance]);

  // Stagger mount-in of the rotation grid.
  useEffect(() => {
    if (!gridRef.current) return;
    const cards = gridRef.current.querySelectorAll('.pm-shop-card');
    revealStagger(cards, { delay: 50, fromY: 14 });
  }, [data?.expiresAt]);

  useEffect(() => {
    if (!consumablesRowRef.current) return;
    const cards = consumablesRowRef.current.querySelectorAll('.pm-consumable-card');
    revealStagger(cards, { delay: 60, fromY: 10 });
  }, [consumables.length]);

  const handleBuy = async (cosmeticId) => {
    try {
      const result = await post("/api/shop/purchase", { cosmeticId });
      toast.success(`Purchased! ${result.newBalance} doubloons left.`, { className: 'pm-toast-celebrate' });
      setData(d => d ? { ...d, balance: result.newBalance, ownedIds: [...d.ownedIds, cosmeticId] } : d);
      return result;
    } catch (err) {
      toast.error(err.message ?? "Purchase failed");
      return false;
    }
  };

  const handleWishlist = async (cosmeticId) => {
    try {
      const result = await post(`/api/shop/wishlist/${cosmeticId}`, {});
      setData(d => d ? { ...d, wishlistIds: result.wishlisted
        ? [...d.wishlistIds, cosmeticId]
        : d.wishlistIds.filter(id => id !== cosmeticId)
      } : d);
    } catch (err) {
      toast.error(err.message ?? "Failed to update wishlist");
    }
  };

  const handleConsumableBuy = async (itemKey) => {
    try {
      const result = await apiPurchaseConsumable(itemKey);
      setData(d => d ? { ...d, balance: result.newBalance } : d);
      // Refresh inventory immediately.
      const next = await getInventory();
      setInv(next);

      // If they bought a non-passive item, auto-use it.
      if (itemKey !== 'STREAK_FREEZE') {
        try {
          const usage = await activateInventoryItem(itemKey);
          toast.success(usage.message ?? 'Used!', { className: 'pm-toast-celebrate' });
          const refreshed = await getInventory();
          setInv(refreshed);
          if (itemKey === 'SHOP_REROLL') {
            // Re-roll wiped today's rotation — refetch.
            const today = await get('/api/shop/today');
            setData(today);
          }
        } catch (useErr) {
          toast(useErr.message ?? 'Bought, but use failed', { className: 'pm-toast-celebrate' });
        }
      } else {
        toast.success('Streak Freeze added to your inventory.', { className: 'pm-toast-celebrate' });
      }
      return result;
    } catch (err) {
      toast.error(err.message ?? 'Purchase failed');
      return false;
    }
  };

  if (loading || !data) {
    return <div style={{ padding: 24 }}>Loading shop…</div>;
  }

  const ownedSet = new Set(data.ownedIds);
  const wishSet  = new Set(data.wishlistIds);
  const msLeft   = new Date(data.expiresAt).getTime() - now;

  const featured = pickFeatured(data.slots, data.rank);
  const featuredId = featured?.id;

  const showRare   = data.slots.rare   && RARE_RANK_GATE.includes(data.rank);
  const showMythic = data.slots.mythic && MYTHIC_RANK_GATE.includes(data.rank);

  // Build the rotation list, skipping the featured item (it gets its own hero).
  const rotation = [
    ...(data.slots.common  ?? []),
    ...(data.slots.uncommon ?? []),
    ...(showRare   ? [data.slots.rare]   : []),
    ...(showMythic ? [data.slots.mythic] : []),
  ].filter(c => c && c.id !== featuredId);

  const activeBoost = inv.effects?.find(e => e.effectKey === 'XP_BOOST_24H');

  return (
    <div className="pm-shop">
      {/* Header */}
      <div className="pm-shop-header">
        <h2 className="pm-shop-title">
          <i className="fas fa-store" aria-hidden="true" /> Shop
        </h2>
        <div className="pm-shop-header-meta">
          {/* Countdown first so the digit-width changes don't shove the
              balance pill around as time ticks down. */}
          <span className="pm-shop-countdown">{formatCountdown(msLeft)}</span>
          <span className="pm-shop-balance">
            <i className="fas fa-coins" aria-hidden="true" />
            <span ref={balanceRef} className="pm-shop-balance-num">{data.balance}</span>
          </span>
        </div>
      </div>

      {/* Featured Daily Deal */}
      {featured ? (
        <div className="pm-shop-featured">
          <ShopCard
            cosmetic={featured}
            balance={data.balance}
            owned={ownedSet.has(featured.id)}
            wishlisted={wishSet.has(featured.id)}
            featured
            onBuy={handleBuy}
            onWishlist={handleWishlist}
          />
        </div>
      ) : null}

      {/* Consumables */}
      <section className="pm-shop-section">
        <h3 className="pm-shop-section-title">Consumables</h3>
        <div className="pm-consumables-row" ref={consumablesRowRef}>
          {consumables.map((item) => (
            <ConsumableCard
              key={item.key}
              item={item}
              balance={data.balance}
              activeEffect={item.key === 'XP_BOOST_24H' ? activeBoost : null}
              onBuy={handleConsumableBuy}
            />
          ))}
        </div>
      </section>

      {/* Today's Rotation */}
      <section className="pm-shop-section">
        <h3 className="pm-shop-section-title">Today's rotation</h3>
        <div className="pm-shop-grid" ref={gridRef}>
          {rotation.map((c) => (
            <ShopCard
              key={c.id}
              cosmetic={c}
              balance={data.balance}
              owned={ownedSet.has(c.id)}
              wishlisted={wishSet.has(c.id)}
              onBuy={handleBuy}
              onWishlist={handleWishlist}
            />
          ))}
          {rotation.length === 0 && (
            <div className="pm-shop-empty">Nothing else in rotation today.</div>
          )}
        </div>
      </section>

      {/* Inventory */}
      <InventoryPanel inventory={inv.inventory} effects={inv.effects} />
    </div>
  );
}
