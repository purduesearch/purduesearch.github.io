// Full-screen takeover when the member crosses a streak multiple of 10. The
// member's own VRM character is shown front and centre, jumps/spins, and the
// big number reveals with confetti. Same-day only — the celebration endpoint
// consumes itself on first read so this never re-fires same day.

import React, { useEffect, useRef, useState } from 'react';
import { get } from '../../../api/clubPmClient';
import { useClubPmAuth } from '../../../clubpm/ClubPmAuth';
import AvatarModel from '../avatar/AvatarModel';
import { animate, spring, springBouncy, prefersReducedMotion } from '../../../clubpm/anim/motion';
import { bigBurst } from './confetti';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#@$%&!?*';

function scrambleInto(el, finalText, durationMs = 800) {
  if (!el) return;
  if (prefersReducedMotion()) { el.textContent = finalText; return; }
  const target = finalText.toUpperCase();
  const frames = Math.max(8, Math.round(durationMs / 50));
  let frame = 0;
  el.textContent = target.replace(/./g, () => CHARS[Math.floor(Math.random() * CHARS.length)]);
  const tick = () => {
    frame += 1;
    const progress = Math.min(1, frame / frames);
    const settled = Math.floor(progress * target.length);
    let out = '';
    for (let i = 0; i < target.length; i++) {
      if (i < settled || target[i] === ' ') out += target[i];
      else out += CHARS[Math.floor(Math.random() * CHARS.length)];
    }
    el.textContent = out;
    if (frame < frames) requestAnimationFrame(tick);
    else el.textContent = target;
  };
  requestAnimationFrame(tick);
}

export default function StreakMilestoneModal({ milestone, onDismiss, freezeAwarded, longestStreak }) {
  const { member } = useClubPmAuth();
  const [avatarConfig, setAvatarConfig] = useState(null);
  const backdropRef = useRef(null);
  const cardRef = useRef(null);
  const numberRef = useRef(null);
  const subRef = useRef(null);
  const subtitleRef = useRef(null);
  const continueRef = useRef(null);
  const rewardRef = useRef(null);
  const [celebrationActive, setCelebrationActive] = useState(false);

  useEffect(() => {
    if (!member?.id) return;
    get('/api/avatar/config').then(setAvatarConfig).catch(() => setAvatarConfig(null));
  }, [member?.id]);

  // Choreograph the modal entrance + character celebration.
  useEffect(() => {
    if (!milestone) return;

    // Refresh the sidebar member info — a Streak Freeze may have just been
    // awarded server-side at multiples of 30. Also lets any XP/DB display
    // pulse alongside the celebration.
    window.dispatchEvent(new CustomEvent("clubpm:member-updated"));

    if (!prefersReducedMotion()) {
      animate(backdropRef.current, { opacity: [0, 1], duration: 250 });
      animate(cardRef.current, {
        scale: [0.6, 1.04, 1],
        opacity: [0, 1],
        duration: 600,
        ease: springBouncy,
      });
    }

    // Kick off character celebration shortly after card lands.
    const t1 = setTimeout(() => setCelebrationActive(true), 200);

    // Big number reveal with spring overshoot.
    const t2 = setTimeout(() => {
      if (numberRef.current && !prefersReducedMotion()) {
        animate(numberRef.current, {
          translateY: [60, -8, 0],
          opacity: [0, 1, 1],
          duration: 700,
          ease: springBouncy,
        });
      }
    }, 400);

    // Subtitle scramble.
    const t3 = setTimeout(() => scrambleInto(subRef.current, 'DAY STREAK!', 700), 600);

    // First confetti cannon.
    const t4 = setTimeout(() => bigBurst({ palette: 'milestone' }), 800);

    // Subtitle row fade-in.
    const t5 = setTimeout(() => {
      if (subtitleRef.current && !prefersReducedMotion()) {
        animate(subtitleRef.current, {
          opacity: [0, 1],
          translateY: [10, 0],
          duration: 400,
        });
      } else if (subtitleRef.current) {
        subtitleRef.current.style.opacity = 1;
      }
    }, 1600);

    // Reward callout slide-in.
    const t6 = setTimeout(() => {
      if (rewardRef.current && !prefersReducedMotion()) {
        animate(rewardRef.current, {
          opacity: [0, 1],
          translateY: [30, 0],
          scale: [0.9, 1.04, 1],
          duration: 600,
          ease: springBouncy,
        });
      } else if (rewardRef.current) {
        rewardRef.current.style.opacity = 1;
      }
    }, 1800);

    // Continue button spring in.
    const t7 = setTimeout(() => {
      if (continueRef.current && !prefersReducedMotion()) {
        animate(continueRef.current, {
          scale: [0.5, 1.08, 1],
          opacity: [0, 1],
          duration: 500,
          ease: spring,
        });
      } else if (continueRef.current) {
        continueRef.current.style.opacity = 1;
      }
    }, 2000);

    // Escape key dismisses.
    const onKey = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);

    return () => {
      [t1, t2, t3, t4, t5, t6, t7].forEach(clearTimeout);
      window.removeEventListener('keydown', onKey);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestone]);

  const handleClose = () => {
    if (!prefersReducedMotion()) {
      bigBurst({ palette: 'milestone' });
      animate(cardRef.current, { scale: [1, 0.9], opacity: [1, 0], duration: 280, ease: spring });
      animate(backdropRef.current, { opacity: [1, 0], duration: 280 });
    }
    setTimeout(() => onDismiss?.(), prefersReducedMotion() ? 0 : 280);
  };

  if (!milestone) return null;

  return (
    <div
      ref={backdropRef}
      className="pm-celebrate-backdrop pm-streak-milestone"
      style={{ opacity: prefersReducedMotion() ? 1 : 0 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="streak-milestone-title"
      onClick={(e) => { e.stopPropagation(); /* backdrop click does NOT dismiss */ }}
    >
      <div
        ref={cardRef}
        className="pm-streak-milestone-card"
        style={{ opacity: prefersReducedMotion() ? 1 : 0 }}
      >
        <div className="pm-streak-avatar-wrap">
          {avatarConfig ? (
            <AvatarModel
              featureJson={avatarConfig.featureJson}
              equippedCosmetics={avatarConfig.equippedCosmetics}
              size={420}
              interactive={false}
              celebrationType={celebrationActive ? 'streak-milestone' : null}
            />
          ) : (
            <div className="pm-streak-avatar-placeholder">
              <i className="fas fa-fire" aria-hidden="true" />
            </div>
          )}
        </div>

        <div
          ref={numberRef}
          id="streak-milestone-title"
          className="pm-streak-milestone-number"
          style={{ opacity: prefersReducedMotion() ? 1 : 0 }}
        >
          {milestone}
        </div>
        <div ref={subRef} className="pm-streak-milestone-sub">DAY STREAK!</div>

        <div
          ref={subtitleRef}
          className="pm-streak-milestone-subtitle"
          style={{ opacity: prefersReducedMotion() ? 1 : 0 }}
        >
          Longest streak {longestStreak ?? milestone} · Next milestone in 10 days
        </div>

        {freezeAwarded ? (
          <div ref={rewardRef} className="pm-streak-milestone-reward" style={{ opacity: prefersReducedMotion() ? 1 : 0 }}>
            <i className="fas fa-snowflake" aria-hidden="true" /> +1 Streak Freeze
          </div>
        ) : null}

        <button
          ref={continueRef}
          className="pm-streak-milestone-continue"
          style={{ opacity: prefersReducedMotion() ? 1 : 0 }}
          onClick={handleClose}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
