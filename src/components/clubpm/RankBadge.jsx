// Renders a member's rank as a Font Awesome icon + label inside a themed pill.

const RANK_META = {
  NESTLING:   { label: "Nestling",   icon: "fas fa-egg" },
  FLEDGLING:  { label: "Fledgling",  icon: "fas fa-feather" },
  CADET:      { label: "Cadet",      icon: "fas fa-user-astronaut" },
  SPECIALIST: { label: "Specialist", icon: "fas fa-medal" },
  PIONEER:    { label: "Pioneer",    icon: "fas fa-rocket" },
  COSMONAUT:  { label: "Cosmonaut",  icon: "fas fa-satellite" },
  CELESTIAL:  { label: "Celestial",  icon: "fas fa-star" },
};

export default function RankBadge({ rank }) {
  const resolved = (() => {
    if (!rank) return "NESTLING";
    const upper = String(rank).toUpperCase();
    return RANK_META[upper] ? upper : "NESTLING";
  })();
  const meta = RANK_META[resolved];
  return (
    <span className="cpm-rank-badge" data-rank={resolved}>
      <i className={meta.icon} aria-hidden="true" />
      <span>{meta.label}</span>
    </span>
  );
}

export { RANK_META };
