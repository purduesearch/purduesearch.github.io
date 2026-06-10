import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useClubPmAuth } from '../../clubpm/ClubPmAuth';
import { getStreak } from '../../api/clubPmClient';
import { animate, spring, tweenNumber, prefersReducedMotion } from '../../clubpm/anim/motion';
import { burstAt, bigBurst } from './celebrate/confetti';

function formatRelative(date) {
  if (!date) return 'never';
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const day = 86_400_000;
  if (diffMs < day) return 'today';
  if (diffMs < 2 * day) return 'yesterday';
  return `${Math.floor(diffMs / day)} days ago`;
}

const SUB_MILESTONES = new Set([7, 14, 21]);

export default function StreakBadge() {
  const { member } = useClubPmAuth();
  const [streak, setStreak] = useState(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const flameRef = useRef(null);
  const countRef = useRef(null);
  const wrapRef  = useRef(null);
  const plusOneRef = useRef(null);
  const prevStreakRef = useRef(0);
  const extendedTodayRef = useRef(false);

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

  // Single re-fetch + animate-on-extend handler.
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
                'drop-shadow(0 0 22px var(--flame-glow))',
                'drop-shadow(0 0 0 var(--flame-glow))',
              ],
              duration: 600,
              ease: spring,
            });
          }
          if (wrapRef.current) {
            const firstOfDay = !extendedTodayRef.current;
            burstAt(wrapRef.current, {
              palette: 'streakExtend',
              intensity: firstOfDay ? 'normal' : 'small',
            });
            extendedTodayRef.current = true;
          }
          // Floating +1 above the badge.
          if (plusOneRef.current && !prefersReducedMotion()) {
            plusOneRef.current.textContent = '+1';
            animate(plusOneRef.current, {
              translateY: [-2, -22],
              opacity:    [0, 1, 1, 0],
              duration:   900,
              ease: 'easeOutQuad',
            });
          }
          // Sub-milestone burst at 7/14/21 between the big 10/20/30 modals.
          if (SUB_MILESTONES.has(next)) {
            bigBurst({ palette: 'streakExtend' });
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
    <Link
      ref={wrapRef}
      to="/clubpm/challenges"
      className={`pm-streak-badge ${count > 0 ? 'is-active' : ''}`}
      onMouseEnter={() => setTooltipOpen(true)}
      onMouseLeave={() => setTooltipOpen(false)}
      onFocus={() => setTooltipOpen(true)}
      onBlur={() => setTooltipOpen(false)}
      aria-label={`${count}-day streak. ${freezes} freezes available. Last active ${lastActive}. Open Challenges.`}
    >
      <img
        ref={flameRef}
        className="pm-streak-flame pm-streak-flame-img"
        src="/clubpm/badges/streak/flame.webp"
        width="22"
        height="22"
        alt=""
        aria-hidden="true"
      />
      <span ref={countRef} className="pm-streak-count">{count}</span>
      <span ref={plusOneRef} className="pm-streak-plus-one" aria-hidden="true" />
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
          <div className="pm-streak-tooltip-row pm-streak-tooltip-sub">
            Click to open Challenges
          </div>
        </div>
      ) : null}
    </Link>
  );
}
