import React, { useRef, useEffect } from 'react';
import CosmeticChip from '../CosmeticChip';
import {
  animate,
  spring,
  springSnap,
  prefersReducedMotion,
  hasHoverCapability,
} from '../../../clubpm/anim/motion';
import { burstAt, rarityPalette } from '../celebrate/confetti';

function tiltOf(rect, e) {
  const x = (e.clientX - rect.left) / rect.width  - 0.5;
  const y = (e.clientY - rect.top)  / rect.height - 0.5;
  return { rx: -y * 8, ry: x * 8 };
}

export default function ShopCard({
  cosmetic,
  balance,
  owned,
  wishlisted,
  featured = false,
  onBuy,
  onWishlist,
  onPurchaseSuccess,
}) {
  const rootRef = useRef(null);

  // Mouse-move 3D tilt — disabled on touch and reduced-motion.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !hasHoverCapability() || prefersReducedMotion()) return;

    let pendingAnim = null;
    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      const { rx, ry } = tiltOf(rect, e);
      pendingAnim?.pause?.();
      pendingAnim = animate(el, {
        rotateX: rx,
        rotateY: ry,
        duration: 220,
        ease: springSnap,
      });
    };
    const onLeave = () => {
      pendingAnim?.pause?.();
      pendingAnim = animate(el, {
        rotateX: 0,
        rotateY: 0,
        translateY: 0,
        duration: 400,
        ease: spring,
      });
    };
    const onEnter = () => {
      animate(el, { translateY: -4, duration: 220, ease: spring });
    };

    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    el.addEventListener('mouseenter', onEnter);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
      el.removeEventListener('mouseenter', onEnter);
      pendingAnim?.pause?.();
    };
  }, []);

  if (!cosmetic) return null;
  const rarity = (cosmetic.rarity ?? 'COMMON').toLowerCase();
  const canAfford = balance >= cosmetic.doubloonPrice;
  const disabled  = owned || !canAfford;
  const buyLabel  = owned ? 'Owned' : !canAfford ? `Need ${cosmetic.doubloonPrice - balance}` : `Buy · ${cosmetic.doubloonPrice}`;

  const handleBuy = async () => {
    if (disabled) return;
    try {
      const result = await onBuy?.(cosmetic.id);
      if (result === false) return;
      if (rootRef.current && !prefersReducedMotion()) {
        animate(rootRef.current, {
          translateY: [0, -20, 0],
          rotateZ:    [0, -3, 3, 0],
          duration:   600,
          ease:     spring,
        });
      }
      burstAt(rootRef.current, { palette: rarityPalette(cosmetic.rarity) });
      onPurchaseSuccess?.(cosmetic);
    } catch {/* parent handles error */}
  };

  const handleHeart = (e) => {
    e.stopPropagation();
    const btn = e.currentTarget;
    if (!prefersReducedMotion()) {
      animate(btn, {
        scale: [1, 1.4, 0.9, 1.1, 1],
        duration: 500,
        ease: spring,
      });
    }
    onWishlist?.(cosmetic.id);
  };

  return (
    <div
      ref={rootRef}
      className={`pm-shop-card shop-card-${rarity}${featured ? ' is-featured' : ''}`}
      style={{ transformStyle: 'preserve-3d' }}
    >
      {featured && <div className="pm-shop-card-ribbon">Featured</div>}
      {owned && <div className="pm-shop-card-owned">Owned</div>}

      <div className="pm-shop-card-shimmer" aria-hidden="true" />

      <div className="pm-shop-card-body">
        <CosmeticChip cosmetic={cosmetic} />
        {cosmetic.description && (
          <div className="pm-shop-card-desc">{cosmetic.description}</div>
        )}
      </div>

      <div className="pm-shop-card-foot">
        <button
          type="button"
          className={`pm-shop-card-heart${wishlisted ? ' is-on' : ''}`}
          onClick={handleHeart}
          aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          title={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          <i className={wishlisted ? 'fas fa-heart' : 'far fa-heart'} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="pm-shop-card-buy"
          disabled={disabled}
          onClick={handleBuy}
        >
          {buyLabel}
        </button>
      </div>
    </div>
  );
}
