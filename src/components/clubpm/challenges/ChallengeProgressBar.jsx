import { useEffect, useRef } from 'react';

export default function ChallengeProgressBar({ value, target, animate: doAnimate = true }) {
  const fillRef = useRef(null);
  const pct = Math.min(100, Math.round((value / Math.max(target, 1)) * 100));

  useEffect(() => {
    if (!fillRef.current) return;
    const el = fillRef.current;
    el.style.width = `${pct}%`;

    if (doAnimate && typeof window !== 'undefined' && window.anime) {
      window.anime({
        targets: el,
        width: [`0%`, `${pct}%`],
        duration: 600,
        easing: 'spring(1, 80, 12, 0)',
      });
      if (pct >= 100) {
        window.anime({
          targets: el,
          boxShadow: '0 0 16px var(--pm-accent-teal)',
          duration: 400,
          easing: 'easeOutQuad',
        });
      }
    }
  }, [pct, doAnimate]);

  return (
    <div style={{ marginTop: 8 }}>
      <div className="quest-progress-track">
        <div
          ref={fillRef}
          className="quest-progress-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: '0.7rem', color: 'var(--pm-text-muted)' }}>
        <span>{value} / {target}</span>
        <span>{pct}%</span>
      </div>
    </div>
  );
}
