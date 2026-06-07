// "You unlocked X!" popup. Listens for `clubpm:cosmetic-unlocked` events
// dispatched by clubPmClient when any API response contains `unlockedCosmetic`.
//
// Event detail shape: { cosmeticId, name, rarity, svgUrl, slot, iconClass? }

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { post } from '../../api/clubPmClient';
import toast from 'react-hot-toast';

const RARITY_COLOR = {
  COMMON:   { border: 'rgba(180,190,210,0.45)', glow: 'rgba(180,190,210,0.10)', badge: '#94a3b8' },
  UNCOMMON: { border: 'rgba(38,212,154,0.50)',  glow: 'rgba(38,212,154,0.12)',  badge: '#aef0d3' },
  RARE:     { border: 'rgba(94,193,255,0.55)',  glow: 'rgba(94,193,255,0.14)',  badge: '#7dd3fc' },
  MYTHIC:   { border: 'rgba(155,107,255,0.65)', glow: 'rgba(155,107,255,0.18)', badge: '#c4b5fd' },
};

function UnlockModal({ cosmetic, onClose }) {
  const modalRef = useRef(null);
  const [equipping, setEquipping] = useState(false);
  const colors = RARITY_COLOR[cosmetic.rarity?.toUpperCase()] ?? RARITY_COLOR.COMMON;

  useEffect(() => {
    if (!modalRef.current || !window.anime) return;
    window.anime({
      targets: modalRef.current,
      scale:   [0.8, 1],
      opacity: [0, 1],
      duration: 400,
      easing: 'easeOutBack',
    });
  }, []);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleEquip = async () => {
    if (equipping || !cosmetic.slot) { onClose(); return; }
    setEquipping(true);
    try {
      await post('/api/shop/equip', { slot: cosmetic.slot, cosmeticId: cosmetic.cosmeticId });
      window.dispatchEvent(new CustomEvent('clubpm:reward-granted', {
        detail: { xpDelta: 0, doubloonsDelta: 0 },
      }));
      window.dispatchEvent(new CustomEvent('avatar-updated'));
      toast.success(`${cosmetic.name} equipped!`, { className: 'pm-toast-celebrate' });
    } catch (err) {
      toast.error(err.message ?? 'Equip failed');
    } finally {
      setEquipping(false);
      onClose();
    }
  };

  return createPortal(
    <div
      className="cosmetic-unlock-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1200,
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        ref={modalRef}
        className="cosmetic-unlock-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Cosmetic unlocked"
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 18, padding: '32px 36px',
          borderRadius: 22,
          background: 'linear-gradient(160deg, rgba(20,24,34,0.98), rgba(13,16,24,0.98))',
          border: `1.5px solid ${colors.border}`,
          boxShadow: `0 0 60px ${colors.glow}, 0 30px 80px rgba(0,0,0,0.5)`,
          maxWidth: 360, width: '90vw',
          textAlign: 'center',
        }}
      >
        {/* Badge label */}
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: 2,
          textTransform: 'uppercase', color: colors.badge,
        }}>
          {cosmetic.rarity ?? 'COMMON'} — {cosmetic.slot?.replace('_', ' ') ?? 'cosmetic'}
        </div>

        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--pm-text-primary, #f0f2f7)' }}>
          🎉 New unlock!
        </div>

        {/* SVG preview */}
        <div style={{
          width: 100, height: 100,
          borderRadius: 18,
          border: `2px solid ${colors.border}`,
          boxShadow: `0 0 24px ${colors.glow}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.04)',
          overflow: 'hidden',
        }}>
          {cosmetic.svgUrl ? (
            <img src={cosmetic.svgUrl} alt={cosmetic.name} width={80} height={80} />
          ) : cosmetic.iconClass ? (
            <i className={cosmetic.iconClass} style={{ fontSize: 40, color: colors.badge }} aria-hidden="true" />
          ) : (
            <i className="fas fa-star" style={{ fontSize: 40, color: colors.badge }} aria-hidden="true" />
          )}
        </div>

        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--pm-text-primary, #f0f2f7)' }}>
          {cosmetic.name}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, width: '100%', marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: 'var(--pm-text-secondary, #94a3b8)',
              cursor: 'pointer', fontWeight: 600, fontSize: 14,
            }}
          >
            Later
          </button>
          {cosmetic.slot && (
            <button
              onClick={handleEquip}
              disabled={equipping}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10,
                background: `linear-gradient(135deg, ${colors.border}, ${colors.glow})`,
                border: `1px solid ${colors.border}`,
                color: '#fff', cursor: equipping ? 'wait' : 'pointer',
                fontWeight: 700, fontSize: 14,
                opacity: equipping ? 0.7 : 1,
              }}
            >
              {equipping ? 'Equipping…' : 'Equip Now'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function CosmeticUnlockModal() {
  const [pending, setPending] = useState([]);

  useEffect(() => {
    const onUnlock = (e) => {
      const detail = e.detail;
      if (!detail?.name) return;
      setPending(prev => [...prev, { ...detail, _key: Date.now() + Math.random() }]);
    };
    window.addEventListener('clubpm:cosmetic-unlocked', onUnlock);
    return () => window.removeEventListener('clubpm:cosmetic-unlocked', onUnlock);
  }, []);

  if (!pending.length) return null;

  const current = pending[0];
  const dismiss = () => setPending(prev => prev.slice(1));

  return <UnlockModal cosmetic={current} onClose={dismiss} />;
}
