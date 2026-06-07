import React, { useRef } from 'react';
import { animate, spring, prefersReducedMotion } from '../../../clubpm/anim/motion';
import { burstAt } from '../celebrate/confetti';

export default function ConsumableCard({ item, balance, activeEffect, onBuy }) {
  const rootRef = useRef(null);
  const canAfford = balance >= item.price;
  const isXpBoost = item.key === 'XP_BOOST_24H';
  const boostActive = isXpBoost && activeEffect?.effectKey === 'XP_BOOST_24H'
    && new Date(activeEffect.expiresAt).getTime() > Date.now();

  const handleBuy = async () => {
    if (!canAfford) return;
    try {
      const result = await onBuy?.(item.key);
      if (result === false) return;
      if (rootRef.current && !prefersReducedMotion()) {
        animate(rootRef.current, {
          translateY: [0, -10, 0],
          duration: 380,
          ease: spring,
        });
      }
      burstAt(rootRef.current, { palette: 'consumable', intensity: 'small' });
    } catch {/* parent handles error */}
  };

  return (
    <div ref={rootRef} className={`pm-consumable-card pm-rarity-${item.rarity?.toLowerCase() ?? 'common'}`}>
      <div className="pm-consumable-icon">
        <i className={`fas ${item.icon}`} aria-hidden="true" />
      </div>
      <div className="pm-consumable-name">{item.name}</div>
      <div className="pm-consumable-desc">{item.shortDesc}</div>
      {boostActive ? (
        <div className="pm-consumable-active">
          Active until {new Date(activeEffect.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </div>
      ) : null}
      <button
        type="button"
        className="pm-consumable-buy"
        disabled={!canAfford || boostActive}
        onClick={handleBuy}
      >
        {boostActive ? 'Active' : !canAfford ? `Need ${item.price - balance}` : `Buy · ${item.price}`}
      </button>
    </div>
  );
}
