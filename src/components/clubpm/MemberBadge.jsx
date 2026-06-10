import React from "react";
import AvatarPortrait from "./avatar/AvatarPortrait";
import RankIcon from "./RankIcon";

const SIZES = {
  xs: { px: 18, text: 7,  ring: 1 },
  sm: { px: 24, text: 8,  ring: 1 },
  md: { px: 32, text: 10, ring: 2 },
  lg: { px: 48, text: 14, ring: 2 },
};

export default function MemberBadge({ member, size = "md", border, nameFrame, showRank = false, rankSize }) {
  const s = SIZES[size] ?? SIZES.md;
  const resolvedRankSize = rankSize ?? Math.max(12, Math.round(s.px * 0.45));

  const avatar = (
    <AvatarPortrait
      member={member}
      size={s.px}
      style={{ boxShadow: `0 0 0 ${s.ring}px var(--clubpm-surface-100)` }}
    />
  );

  return (
    <div className="clubpm-member-badge group relative inline-block">
      {border ? (
        <div className={`member-badge-border border-${border}`}>
          {avatar}
        </div>
      ) : avatar}
      {showRank && member?.rank ? (
        <span className="cpm-member-badge-rank-overlay" aria-hidden="true">
          <RankIcon member={member} size={resolvedRankSize} />
        </span>
      ) : null}
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded-md bg-[var(--clubpm-surface-400)] text-[var(--clubpm-text-primary)] text-[10px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
        {member.displayName}
        {nameFrame && (
          <span style={{ marginLeft: 5, opacity: 0.7, fontSize: '0.65rem' }}>{nameFrame}</span>
        )}
        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[var(--clubpm-surface-400)]" />
      </div>
    </div>
  );
}
