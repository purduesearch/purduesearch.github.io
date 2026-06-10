import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const KIND_ICON = {
  COSMETIC:    'fa-palette',
  CONSUMABLE:  'fa-flask',
  DOUBLOONS:   'fa-coins',
  NOTHING:     'fa-ghost',
};

export default function RewardRollModal({ rolls = [], xpDelta = 0, doubloonsDelta = 0, onClose, title = 'Challenge Complete!', subtitle }) {
  const modalRef = useRef(null);

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

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const grantedRolls = rolls.filter(r => r.granted && r.outcomeKind !== 'NOTHING');
  const hasRewards = xpDelta > 0 || doubloonsDelta > 0 || grantedRolls.length > 0;

  return createPortal(
    <div className="reward-roll-backdrop" onClick={onClose}>
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
          {title}
        </div>
        {subtitle && (
          <div className="reward-roll-subtitle" style={{ color: 'var(--pm-text-secondary)', fontSize: 13, marginBottom: 12 }}>
            {subtitle}
          </div>
        )}

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
              <div className={`reward-roll-item-icon rarity-${roll.payload?.rarity ?? 'COMMON'}`}>
                <i className={`fas ${KIND_ICON[roll.outcomeKind] ?? 'fa-star'}`} aria-hidden="true" />
              </div>
              <div>
                <div className="reward-roll-item-name">
                  {roll.payload?.name ?? roll.outcomeKind}
                </div>
                <div className="reward-roll-item-kind">
                  {roll.outcomeKind === 'DOUBLOONS'
                    ? `${roll.payload?.doubloonAmount ?? 0} Doubloons`
                    : roll.outcomeKind === 'COSMETIC' ? 'Cosmetic Unlocked'
                    : 'Consumable'}
                </div>
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
      </div>
    </div>,
    document.body
  );
}
