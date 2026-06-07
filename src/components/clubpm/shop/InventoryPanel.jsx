import React, { useState } from 'react';

const ITEM_META = {
  STREAK_FREEZE: { name: 'Streak Freeze',  icon: 'fa-snowflake', tone: '#5ec1ff' },
  XP_BOOST_24H:  { name: 'XP Boost',       icon: 'fa-bolt',      tone: '#ffd96b' },
  KUDOS_REFILL:  { name: 'Kudos Refill',   icon: 'fa-heart',     tone: '#ff7a8f' },
  SHOP_REROLL:   { name: 'Shop Re-roll',   icon: 'fa-dice',      tone: '#9b6bff' },
};

function timeLeft(expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m left`;
}

export default function InventoryPanel({ inventory = [], effects = [] }) {
  const [open, setOpen] = useState(false);
  const owned = inventory.filter(i => i.quantity > 0);
  if (owned.length === 0 && effects.length === 0) return null;

  return (
    <div className="pm-inventory-panel">
      <button
        type="button"
        className="pm-inventory-toggle"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <i className={`fas fa-chevron-${open ? 'down' : 'right'}`} aria-hidden="true" /> Your inventory ({owned.length})
      </button>
      {open ? (
        <div className="pm-inventory-body">
          {owned.length > 0 && (
            <div className="pm-inventory-grid">
              {owned.map(item => {
                const meta = ITEM_META[item.itemKey] ?? { name: item.itemKey, icon: 'fa-cube', tone: '#aaa' };
                return (
                  <div key={item.itemKey} className="pm-inventory-row">
                    <i className={`fas ${meta.icon}`} style={{ color: meta.tone }} aria-hidden="true" />
                    <span className="pm-inventory-name">{meta.name}</span>
                    <span className="pm-inventory-qty">×{item.quantity}</span>
                  </div>
                );
              })}
            </div>
          )}
          {effects.length > 0 && (
            <div className="pm-inventory-effects">
              <div className="pm-inventory-section-label">Active effects</div>
              {effects.map(eff => (
                <div key={eff.effectKey} className="pm-inventory-row pm-inventory-effect">
                  <i className="fas fa-bolt" aria-hidden="true" />
                  <span className="pm-inventory-name">{eff.effectKey.replace(/_/g, ' ')}</span>
                  <span className="pm-inventory-qty">{timeLeft(eff.expiresAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
