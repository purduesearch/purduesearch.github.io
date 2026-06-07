// Optimistic heart button — clicking sends 1 kudo to the target member.
// Disables on 429 (weekly send cap or recipient receive cap hit).
// Shown only when target !== current user.

import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { post } from "../../api/clubPmClient";
import { useClubPmAuth } from "../../clubpm/ClubPmAuth";
import { animate, spring, prefersReducedMotion } from "../../clubpm/anim/motion";

export default function KudosButton({ memberId, displayName }) {
  const { member: me } = useClubPmAuth();
  const [sent,    setSent]    = useState(false);
  const [pending, setPending] = useState(false);
  const [capped,  setCapped]  = useState(false);
  const [remaining, setRemaining] = useState(null);
  const btnRef = useRef(null);

  if (!me || me.id === memberId) return null;

  const handleClick = async (e) => {
    e.stopPropagation();
    if (pending || sent || capped) return;
    setPending(true);
    setSent(true); // optimistic
    try {
      const result = await post(`/api/members/${memberId}/kudos`, {});
      setRemaining(result.sendCapRemaining);
      toast.success(`Kudos sent${displayName ? ` to ${displayName}` : ""}. ${result.sendCapRemaining} left this week.`, { className: 'pm-toast-celebrate' });

      // Heartbeat pulse + floating heart particles.
      if (btnRef.current && !prefersReducedMotion()) {
        animate(btnRef.current, {
          scale: [1, 1.5, 1.1, 1.2, 1],
          duration: 520,
          ease: spring,
        });

        // Spawn 3 floating hearts.
        const rect = btnRef.current.getBoundingClientRect();
        for (let i = 0; i < 3; i++) {
          const spark = document.createElement('span');
          spark.textContent = '❤';
          spark.style.cssText = `position:fixed;left:${rect.left + rect.width / 2 + (i - 1) * 6}px;top:${rect.top}px;font-size:14px;color:#ff7a8f;pointer-events:none;z-index:9999;will-change:transform,opacity;`;
          document.body.appendChild(spark);
          animate(spark, {
            translateY: [-10 + i * 2, -60 - i * 12],
            opacity:    [1, 0],
            scale:      [0.6, 1.1],
            duration:   700 + i * 80,
            ease:     spring,
            onComplete: () => spark.remove(),
          });
        }
      }
    } catch (err) {
      setSent(false);
      if (err.status === 429) {
        setCapped(true);
        toast.error(err.message ?? "Weekly kudos limit reached.");
      } else {
        toast.error(err.message ?? "Failed to send kudos.");
      }
    } finally {
      setPending(false);
    }
  };

  const title = capped
    ? "Weekly kudos limit reached"
    : (remaining !== null ? `${remaining} kudos left this week` : "Send kudos");

  return (
    <button
      ref={btnRef}
      type="button"
      className="cpm-kudos-btn"
      data-sent={sent ? "true" : "false"}
      onClick={handleClick}
      disabled={pending || sent || capped}
      title={title}
      aria-label={title}
    >
      <i className={sent ? "fas fa-heart" : "far fa-heart"} aria-hidden="true" />
      <span>{sent ? "Kudos sent" : "Kudos"}</span>
    </button>
  );
}
