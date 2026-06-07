// Renders the member's rank-slot badge as an <img> pointing at an SVG.
// Priority: member.equippedBadge.svgUrl > rank-default SVG > null (no render).
// Used in AppShell sidebar and any place the icon-only slot is needed.
// For labeled pill badges (Leaderboard, Profile header), keep using RankBadge.

const RANK_DEFAULT_SVG = {
  NESTLING:   '/clubpm/badges/rank/nestling.webp',
  FLEDGLING:  '/clubpm/badges/rank/fledgling.webp',
  CADET:      '/clubpm/badges/rank/cadet.webp',
  SPECIALIST: '/clubpm/badges/rank/specialist.webp',
  PIONEER:    '/clubpm/badges/rank/pioneer.webp',
  COSMONAUT:  '/clubpm/badges/rank/cosmonaut.webp',
  CELESTIAL:  '/clubpm/badges/rank/celestial.webp',
};

export { RANK_DEFAULT_SVG };

export default function RankIcon({ member, size = 28 }) {
  const rank   = (member?.rank ?? 'NESTLING').toUpperCase();
  const svgUrl = member?.equippedBadge?.svgUrl ?? RANK_DEFAULT_SVG[rank] ?? RANK_DEFAULT_SVG.NESTLING;
  const label  = member?.equippedBadge?.name ?? `${rank.charAt(0) + rank.slice(1).toLowerCase()} badge`;

  return (
    <img
      src={svgUrl}
      width={size}
      height={size}
      alt={label}
      className="cpm-rank-icon"
      loading="lazy"
    />
  );
}
