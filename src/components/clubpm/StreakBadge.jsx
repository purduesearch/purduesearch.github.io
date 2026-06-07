import React, { useEffect, useRef, useState } from 'react';
import { useClubPmAuth } from '../../clubpm/ClubPmAuth';
import { getStreak } from '../../api/clubPmClient';
import { animate, spring, tweenNumber, prefersReducedMotion } from '../../clubpm/anim/motion';
import { burstAt } from './celebrate/confetti';

function formatRelative(date) {
  if (!date) return 'never';
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const day = 86_400_000;
  if (diffMs < day) return 'today';
  if (diffMs < 2 * day) return 'yesterday';
  return `${Math.floor(diffMs / day)} days ago`;
}

export default function StreakBadge() {
  const { member } = useClubPmAuth();
  const [streak, setStreak] = useState(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const flameRef = useRef(null);
  const countRef = useRef(null);
  const wrapRef  = useRef(null);
  const prevStreakRef = useRef(0);

  // Initial load
  useEffect(() => {
    if (!member?.id) return;
    let cancelled = false;
    getStreak(member.id).then((data) => {
      if (cancelled) return;
      setStreak(data);
      prevStreakRef.current = data?.currentStreak ?? 0;
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [member?.id]);

  // Single re-fetch + animate-on-extend handler, triggered by:
  //   - the global 'clubpm-streak-changed' event (fired by useStreakWatcher)
  //   - window focus / visibility change (backend is authoritative)
  //   - a 60-second slow poll while the tab is visible
  useEffect(() => {
    if (!member?.id) return;
    const refresh = async () => {
      try {
        const data = await getStreak(member.id, { force: true });
        const prev = prevStreakRef.current ?? 0;
        const next = data?.currentStreak ?? 0;

        if (next > prev) {
          tweenNumber(countRef.current, prev, next, { duration: 450 });
          if (flameRef.current && !prefersReducedMotion()) {
            animate(flameRef.current, {
              scale: [1, 1.4, 1],
              filter: [
                'drop-shadow(0 0 0 var(--flame-glow))',
                'drop-shadow(0 0 18px var(--flame-glow))',
                'drop-shadow(0 0 0 var(--flame-glow))',
              ],
              duration: 600,
              ease: spring,
            });
          }
          if (wrapRef.current) {
            burstAt(wrapRef.current, { palette: 'streakExtend', intensity: 'small' });
          }
        }
        prevStreakRef.current = next;
        setStreak(data);
      } catch {/* ignore */}
    };

    window.addEventListener('clubpm-streak-changed', refresh);
    window.addEventListener('focus', refresh);
    const onVis = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVis);

    const poll = setInterval(() => { if (!document.hidden) refresh(); }, 60_000);

    return () => {
      window.removeEventListener('clubpm-streak-changed', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(poll);
    };
  }, [member?.id]);

  // Idle breathing on the flame icon — paused when tab is hidden.
  useEffect(() => {
    if (!flameRef.current || prefersReducedMotion()) return;
    const a = animate(flameRef.current, {
      opacity: [0.85, 1, 0.85],
      scale:   [1, 1.06, 1],
      duration: 2200,
      ease: 'inOutSine',
      loop: true,
    });
    const onVis = () => {
      if (document.hidden) a.pause();
      else a.play();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      a.pause();
    };
  }, []);

  if (!member?.id) return null;

  const count = streak?.currentStreak ?? 0;
  const freezes = streak?.freezesAvailable ?? 0;
  const lastActive = formatRelative(streak?.lastActivityDate);

  return (
    <div
      ref={wrapRef}
      className={`pm-streak-badge ${count > 0 ? 'is-active' : ''}`}
      onMouseEnter={() => setTooltipOpen(true)}
      onMouseLeave={() => setTooltipOpen(false)}
      onFocus={() => setTooltipOpen(true)}
      onBlur={() => setTooltipOpen(false)}
      tabIndex={0}
      role="status"
      aria-label={`${count}-day streak. ${freezes} freezes available. Last active ${lastActive}.`}
    >
      <svg
        ref={flameRef}
        className="pm-streak-flame"
        width="18" height="18" viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          d="M12 2.5c0 4-3 5-3 8 0 1.5 1.2 2.4 2 2.4-.4-1.2.4-3 2-3.5 0 3 2 4 2 6.5a5 5 0 1 1-10 0c0-3.5 3-4 3-7.5 0-2.5-1-3.5-1-5 0 0 4-1 5 -1z"
          fill="currentColor"
        />
      </svg>
      <span ref={countRef} className="pm-streak-count">{count}</span>
      {tooltipOpen ? (
        <div className="pm-streak-tooltip" role="tooltip">
          <div className="pm-streak-tooltip-row">
            <strong>{count}-day streak</strong>
          </div>
          <div className="pm-streak-tooltip-row">
            {freezes} freeze{freezes === 1 ? '' : 's'} available
          </div>
          <div className="pm-streak-tooltip-row pm-streak-tooltip-sub">
            Last active {lastActive}
          </div>
        </div>
      ) : null}
    </div>
  );
}
