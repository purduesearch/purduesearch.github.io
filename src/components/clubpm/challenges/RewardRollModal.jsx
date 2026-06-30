import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const KIND_ICON = {
  BADGE:                 'fa-medal',
  ANIMATION:             'fa-wand-magic-sparkles',
  BORDER:                'fa-square-full',
  CONSUMABLE:            'fa-flask',
  DB_BONUS:              'fa-coins',
  DB_BONUS_DUPE_CONVERT: 'fa-coins',
  COSMETIC:              'fa-palette',
  DOUBLOONS:             'fa-coins',
  NOTHING:               'fa-ghost',
};

const KIND_LABEL = {
  BADGE:                 'Badge Unlocked',
  ANIMATION:             'Animation Unlocked',
  BORDER:                'Border Unlocked',
  CONSUMABLE:            'Consumable',
  DB_BONUS:              'Doubloons',
  DB_BONUS_DUPE_CONVERT: 'Doubloons (duplicate)',
  COSMETIC:              'Cosmetic Unlocked',
};

// Rank-badge artwork used as filler frames while the reel spins.
const FILLER = [
  '/clubpm/badges/rank/nestling.webp',
  '/clubpm/badges/rank/fledgling.webp',
  '/clubpm/badges/rank/cadet.webp',
  '/clubpm/badges/rank/specialist.webp',
  '/clubpm/badges/rank/pioneer.webp',
  '/clubpm/badges/rank/cosmonaut.webp',
  '/clubpm/badges/rank/celestial.webp',
];

function prettyItemKey(key) {
  if (!key) return 'Consumable';
  return String(key).toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function rollName(roll) {
  const p = roll.payload ?? {};
  if (p.name) return p.name;
  if (roll.outcomeKind === 'CONSUMABLE') {
    return `${prettyItemKey(p.itemKey)}${p.quantity ? ` ×${p.quantity}` : ''}`;
  }
  if (roll.outcomeKind === 'DB_BONUS' || roll.outcomeKind === 'DB_BONUS_DUPE_CONVERT') {
    return `+${p.amount ?? 0} Doubloons`;
  }
  return KIND_LABEL[roll.outcomeKind] ?? roll.outcomeKind;
}

// ── Slot-machine reel ──────────────────────────────────────────────
const TILE = 88;     // px per tile (image + padding)
const VISIBLE = 5;   // tiles across the viewport
const WIN_INDEX = 24;
const TOTAL = 30;

function BadgeReel({ badge, onDone }) {
  const trackRef = useRef(null);
  const [landed, setLanded] = useState(false);

  const items = useMemo(() => {
    const arr = [];
    for (let i = 0; i < TOTAL; i++) {
      if (i === WIN_INDEX) {
        arr.push({ src: badge.svgUrl, win: true });
      } else {
        arr.push({ src: FILLER[Math.floor(Math.random() * FILLER.length)], win: false });
      }
    }
    return arr;
  }, [badge]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const center = Math.floor(VISIBLE / 2) * TILE;
    const start  = center;                       // item 0 in the center slot
    const end    = center - WIN_INDEX * TILE;    // winning item in the center slot

    if (!window.anime) {
      track.style.transform = `translateX(${end}px)`;
      setLanded(true);
      onDone?.();
      return;
    }

    track.style.transform = `translateX(${start}px)`;
    const anim = window.anime({
      targets: track,
      translateX: [start, end],
      duration: 2800,
      easing: 'cubicBezier(0.10, 0.85, 0.18, 1)',
      complete: () => { setLanded(true); onDone?.(); },
    });
    return () => anim.pause();
  }, [items, onDone]);

  const rarity = String(badge.rarity ?? 'COMMON').toUpperCase();

  return (
    <div className={`badge-reel-viewport rarity-${rarity}${landed ? ' landed' : ''}`} style={{ width: VISIBLE * TILE }}>
      <div className="badge-reel-track" ref={trackRef}>
        {items.map((it, i) => (
          <div
            key={i}
            className={`badge-reel-tile${it.win && landed ? ' win' : ''}`}
            style={{ width: TILE }}
          >
            {it.src
              ? <img src={it.src} alt="" className="badge-reel-img" draggable={false} />
              : <i className="fas fa-medal" aria-hidden="true" />}
          </div>
        ))}
      </div>
      <div className="badge-reel-marker" aria-hidden="true" />
    </div>
  );
}

export default function RewardRollModal({ rolls = [], xpDelta = 0, doubloonsDelta = 0, onClose, title = 'Challenge Complete!', subtitle }) {
  const modalRef = useRef(null);

  const grantedRolls = rolls.filter(r => r.granted && r.outcomeKind !== 'NOTHING');
  const badgeWin = grantedRolls.find(r => r.outcomeKind === 'BADGE' && r.payload?.svgUrl);
  const [phase, setPhase] = useState(badgeWin ? 'spinning' : 'done');

  useEffect(() => {
    if (!modalRef.current || !window.anime) return;
    window.anime({
      targets: modalRef.current,
      scale:   [0.85, 1],
      opacity: [0, 1],
      duration: 350,
      easing: 'easeOutBack',
    });
  }, []);

  // Close on Escape — only once the reel (if any) has settled.
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && phase === 'done') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, phase]);

  const hasRewards = xpDelta > 0 || doubloonsDelta > 0 || grantedRolls.length > 0;
  const spinning = phase === 'spinning';
  const badgeRarity = String(badgeWin?.payload?.rarity ?? 'MYTHIC').toUpperCase();

  return createPortal(
    <div className="reward-roll-backdrop" onClick={spinning ? undefined : onClose}>
      <div
        ref={modalRef}
        className="reward-roll-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Challenge reward"
      >
        <div className="reward-roll-title">
          <i className="fas fa-gift" aria-hidden="true" style={{ color: 'var(--pm-accent-teal)', marginRight: 8 }} />
          {spinning ? 'Rolling for a badge…' : title}
        </div>
        {subtitle && !spinning && (
          <div className="reward-roll-subtitle" style={{ color: 'var(--pm-text-secondary)', fontSize: 13, marginBottom: 12 }}>
            {subtitle}
          </div>
        )}

        {/* Slot-machine reel — only while a badge is being revealed */}
        {badgeWin && (
          <div className="badge-reel-wrap">
            <BadgeReel badge={badgeWin.payload} onDone={() => setPhase('done')} />
            {!spinning && (
              <div className={`badge-reel-result rarity-${badgeRarity}`}>
                <span className="badge-reel-result-rarity">{badgeRarity}</span>
                <span className="badge-reel-result-name">{badgeWin.payload.name}</span>
              </div>
            )}
          </div>
        )}

        {!spinning && (
          <>
            <div className="reward-roll-items">
              {xpDelta > 0 && (
                <div className="reward-roll-item">
                  <div className="reward-roll-item-icon" style={{ background: 'rgba(255,214,0,0.12)', color: '#ffd600' }}>
                    <i className="fas fa-star" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="reward-roll-item-name">+{xpDelta} XP</div>
                    <div className="reward-roll-item-kind">Experience Points</div>
                  </div>
                </div>
              )}
              {doubloonsDelta > 0 && (
                <div className="reward-roll-item">
                  <div className="reward-roll-item-icon" style={{ background: 'rgba(0,229,195,0.12)', color: 'var(--pm-accent-teal)' }}>
                    <i className="fas fa-coins" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="reward-roll-item-name">+{doubloonsDelta} Doubloons</div>
                    <div className="reward-roll-item-kind">Currency</div>
                  </div>
                </div>
              )}
              {grantedRolls.map((roll, i) => (
                <div key={i} className="reward-roll-item">
                  <div className={`reward-roll-item-icon rarity-${String(roll.payload?.rarity ?? 'COMMON').toUpperCase()}`}>
                    {roll.payload?.svgUrl
                      ? <img src={roll.payload.svgUrl} alt="" width={22} height={22} />
                      : <i className={`fas ${KIND_ICON[roll.outcomeKind] ?? 'fa-star'}`} aria-hidden="true" />}
                  </div>
                  <div>
                    <div className="reward-roll-item-name">{rollName(roll)}</div>
                    <div className="reward-roll-item-kind">{KIND_LABEL[roll.outcomeKind] ?? 'Reward'}</div>
                  </div>
                </div>
              ))}
              {!hasRewards && (
                <div style={{ color: 'var(--pm-text-muted)', fontSize: '0.85rem', padding: '8px 0' }}>
                  No bonus drops this time. Keep it up!
                </div>
              )}
            </div>

            <button className="reward-roll-close-btn" onClick={onClose}>
              Nice!
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
