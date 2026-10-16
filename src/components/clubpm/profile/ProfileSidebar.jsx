// Identity column of the profile: avatar inside an XP-progress ring, active
// badge pin, name/handle/title, rank + role chips, XP and doubloon counters
// (counted up on load and whenever they change), streak, local time and the
// inline "Edit profile" form (own profile only).

import { useEffect, useRef, useState } from "react";
import { getStreak } from "../../../api/clubPmClient";
import { tweenNumber } from "../../../clubpm/anim/motion";
import { tzOffset, copyToClipboard } from "../../../clubpm/members/memberShared";
import { MemberName } from "../../../clubpm/cosmetics/CosmeticStylesContext";
import AvatarPortrait from "../avatar/AvatarPortrait";
import RankBadge, { RANK_META } from "../RankBadge";
import { RANK_DEFAULT_SVG } from "../RankIcon";

const RING_R = 82;
const RING_C = 2 * Math.PI * RING_R;

/** Counts up from the previous value to `value` whenever it changes. */
function CountUp({ value, className }) {
  const ref = useRef(null);
  const prev = useRef(0);
  useEffect(() => {
    const to = Number(value) || 0;
    const t = tweenNumber(ref.current, prev.current, to, { duration: 900 });
    prev.current = to;
    return () => t?.pause?.();
  }, [value]);
  return <b ref={ref} className={className}>{(Number(value) || 0).toLocaleString()}</b>;
}

function LocalClock({ timezone }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);
  if (!timezone) return null;
  let text = null;
  try {
    text = now.toLocaleTimeString("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" });
  } catch { return null; }
  const city = timezone.split("/").pop().replace(/_/g, " ");
  return (
    <div className="cpm-pf-clock" title={`${tzOffset(timezone) ?? ""} (${timezone})`}>
      <i className="fas fa-clock" aria-hidden="true" /> {text} in {city}
    </div>
  );
}

export default function ProfileSidebar({
  profile, isSelf, rankInfo, edit,
}) {
  const [ringReady, setRingReady] = useState(false);
  const [streak, setStreak] = useState(null);
  const [pinPop, setPinPop] = useState(false);
  const badgeKey = profile.equippedBadge?.id ?? "default";

  // Let the ring paint empty first so the fill actually animates.
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setRingReady(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    let live = true;
    getStreak(profile.id).then(s => { if (live) setStreak(s); }).catch(() => {});
    return () => { live = false; };
  }, [profile.id]);

  const firstBadge = useRef(true);
  useEffect(() => {
    if (firstBadge.current) { firstBadge.current = false; return; }
    setPinPop(true);
    const id = setTimeout(() => setPinPop(false), 280);
    return () => clearTimeout(id);
  }, [badgeKey]);

  const rank = String(profile.rank ?? "NESTLING").toUpperCase();
  const pinSrc = profile.equippedBadge?.svgUrl ?? RANK_DEFAULT_SVG[rank] ?? RANK_DEFAULT_SVG.NESTLING;
  const pct = Math.max(0, Math.min(100, rankInfo.pct));
  const offset = ringReady ? RING_C * (1 - pct / 100) : RING_C;
  const role = profile.isAdmin ? "Admin" : profile.role === "LEAD" ? "Lead" : "Member";

  return (
    <aside className="cpm-pf-side cpm-profile-card">
      <div className="cpm-pf-ringbox" data-tour-id="profile.avatar">
        <svg viewBox="0 0 176 176" aria-hidden="true">
          <circle className="cpm-pf-ring-track" cx="88" cy="88" r={RING_R} fill="none" strokeWidth="6" />
          <circle
            className="cpm-pf-ring-bar" cx="88" cy="88" r={RING_R} fill="none" strokeWidth="6"
            strokeDasharray={RING_C} strokeDashoffset={offset}
          />
        </svg>
        <div className="cpm-pf-avatar"><AvatarPortrait member={profile} size={146} /></div>
        <img
          className={`cpm-pf-pin${pinPop ? " is-pop" : ""}`}
          src={pinSrc} alt={profile.equippedBadge?.name ?? `${RANK_META[rank]?.label ?? "Rank"} badge`}
          width="44" height="44"
        />
      </div>

      <h1 className="cpm-pf-name"><MemberName memberId={profile.id}>{profile.displayName}</MemberName></h1>
      {profile.slackHandle && <div className="cpm-pf-handle">@{profile.slackHandle}</div>}
      {profile.title && <div className="cpm-pf-title">{profile.title}</div>}

      <div className="cpm-pf-chips">
        <span data-tour-id="profile.rank"><RankBadge rank={profile.rank} /></span>
        <span className="cpm-pf-chip">{role}</span>
      </div>

      <div className="cpm-pf-xp">
        <CountUp value={profile.xp} className="cpm-pf-xp-num" /> XP
        <div className="cpm-pf-xp-sub">
          {rankInfo.next
            ? `${rankInfo.xpToNext.toLocaleString()} XP until ${RANK_META[rankInfo.next.rank].label}`
            : "Max rank reached"}
        </div>
      </div>

      <div className="cpm-pf-stats">
        <div className="cpm-pf-stat">
          <CountUp value={profile.doubloons} className="cpm-pf-stat-num cpm-pf-gold" />
          <span><i className="fas fa-coins" aria-hidden="true" /> Doubloons</span>
        </div>
        <div className="cpm-pf-stat">
          <CountUp value={streak?.currentStreak ?? 0} className="cpm-pf-stat-num" />
          <span><i className="fas fa-fire cpm-pf-flame" aria-hidden="true" /> Day streak</span>
        </div>
      </div>

      {isSelf && profile.pendingCount > 0 && (
        <div className="cpm-pf-pending">
          {profile.pendingCount} reward{profile.pendingCount > 1 ? "s" : ""} awaiting admin review
        </div>
      )}

      <LocalClock timezone={profile.timezone} />

      <div className="cpm-profile-contact">
        {profile.email && (
          <button type="button" className="cpm-profile-contact-row" onClick={() => copyToClipboard(profile.email)} title="Copy email">
            <i className="fas fa-envelope" aria-hidden="true" />
            <span>{profile.email}</span>
            <i className="fas fa-copy cpm-profile-copy-icon" aria-hidden="true" />
          </button>
        )}
        {profile.githubLogin && (
          <div className="cpm-profile-contact-row">
            <i className="fab fa-github" aria-hidden="true" />
            <a href={`https://github.com/${profile.githubLogin}`} target="_blank" rel="noreferrer">@{profile.githubLogin}</a>
          </div>
        )}
      </div>

      {profile.bio && !edit.active && <div className="cpm-profile-bio">{profile.bio}</div>}

      {isSelf && !edit.active && (
        <button type="button" className="cpm-pf-btn" onClick={edit.start}>
          <i className="fas fa-pencil-alt" aria-hidden="true" /> Edit profile
        </button>
      )}
      {isSelf && edit.active && (
        <form className="cpm-profile-edit-form" onSubmit={(e) => { e.preventDefault(); edit.save(); }}>
          <label>
            Display name
            <input value={edit.displayName} onChange={e => edit.setDisplayName(e.target.value)} autoFocus />
          </label>
          <label>
            Bio
            <textarea value={edit.bio} onChange={e => edit.setBio(e.target.value)} rows={3} />
          </label>
          <div className="cpm-profile-edit-actions">
            <button type="button" className="cpm-profile-edit-cancel" onClick={edit.cancel} disabled={edit.saving}>Cancel</button>
            <button type="submit" className="cpm-profile-edit-save" disabled={edit.saving}>{edit.saving ? "Saving…" : "Save changes"}</button>
          </div>
        </form>
      )}
    </aside>
  );
}
