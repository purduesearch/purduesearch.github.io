// Grid of a member's earned badges. On your own profile each tile is clickable
// to set it as your active badge (the "rank_badge" slot on Member.equippedBadgeId),
// which drives the sidebar RankIcon. A "Rank default" tile unequips (cosmeticId null)
// so the icon reverts to following your current rank.

import { useState } from 'react';
import { post } from '../../api/clubPmClient';
import toast from 'react-hot-toast';
import { RANK_DEFAULT_SVG } from './RankIcon';

const RARITY_RING = {
  COMMON:   '#94a3b8',
  UNCOMMON: '#26d49a',
  RARE:     '#5ec1ff',
  MYTHIC:   '#9b6bff',
};

export default function BadgePicker({ badges = [], activeBadgeId = null, editable = false, rank = 'NESTLING', onChange }) {
  const [busyId, setBusyId] = useState(null);

  async function equip(cosmeticId) {
    if (!editable || busyId !== null) return;
    if (cosmeticId === activeBadgeId) return; // already active — no-op
    setBusyId(cosmeticId ?? '__default__');
    try {
      await post('/api/shop/equip', { slot: 'rank_badge', cosmeticId });
      // Refresh the sidebar member (carries equippedBadge for RankIcon).
      window.dispatchEvent(new CustomEvent('clubpm:member-updated'));
      onChange?.(cosmeticId);
      const name = cosmeticId ? (badges.find(b => b.id === cosmeticId)?.name ?? 'Badge') : null;
      toast.success(cosmeticId ? `${name} set as your active badge` : 'Reverted to rank badge', { className: 'pm-toast-celebrate' });
    } catch (err) {
      toast.error(err?.message ?? 'Failed to set badge');
    } finally {
      setBusyId(null);
    }
  }

  const rankUpper  = String(rank || 'NESTLING').toUpperCase();
  const defaultSvg = RANK_DEFAULT_SVG[rankUpper] ?? RANK_DEFAULT_SVG.NESTLING;

  return (
    <div className="cpm-badge-grid">
      {editable && (
        <button
          type="button"
          className={`cpm-badge-tile${activeBadgeId == null ? ' active' : ''}`}
          style={{ '--badge-ring': '#64748b' }}
          onClick={() => equip(null)}
          disabled={busyId !== null}
          title="Use your rank's default badge"
        >
          <img src={defaultSvg} alt="" className="cpm-badge-img" loading="lazy" />
          <span className="cpm-badge-name">Rank default</span>
          {activeBadgeId == null && (
            <span className="cpm-badge-active-dot"><i className="fas fa-check" aria-hidden="true" /></span>
          )}
        </button>
      )}

      {badges.map(b => {
        const ring     = RARITY_RING[String(b.rarity).toUpperCase()] ?? RARITY_RING.COMMON;
        const isActive = b.id === activeBadgeId;
        const Tag      = editable ? 'button' : 'div';
        return (
          <Tag
            key={b.id}
            {...(editable ? { type: 'button', disabled: busyId !== null, onClick: () => equip(b.id) } : {})}
            className={`cpm-badge-tile${isActive ? ' active' : ''}${editable ? '' : ' static'}`}
            style={{ '--badge-ring': ring }}
            title={editable ? (isActive ? `${b.name} (active)` : `Set ${b.name} as active`) : b.name}
          >
            {b.svgUrl
              ? <img src={b.svgUrl} alt={b.name} className="cpm-badge-img" loading="lazy" />
              : <i className={`${b.iconClass || 'fas fa-medal'} cpm-badge-fallback-icon`} aria-hidden="true" />}
            <span className="cpm-badge-name">{b.name}</span>
            {isActive && (
              <span className="cpm-badge-active-dot"><i className="fas fa-check" aria-hidden="true" /></span>
            )}
            {busyId === b.id && <span className="cpm-badge-spinner" aria-hidden="true" />}
          </Tag>
        );
      })}
    </div>
  );
}
