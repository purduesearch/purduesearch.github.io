// Rarity-colored chip used in shop, profile, editor.

const RARITY_LABEL = {
  COMMON:   "Common",
  UNCOMMON: "Uncommon",
  RARE:     "Rare",
  MYTHIC:   "Mythic",
};

export default function CosmeticChip({ cosmetic }) {
  if (!cosmetic) return null;
  const rarityClass = `cpm-rarity-${cosmetic.rarity.toLowerCase()}`;
  return (
    <div className={`cpm-cosmetic-chip ${rarityClass}`}>
      <span className="cpm-cosmetic-name">
        {cosmetic.iconClass && <i className={cosmetic.iconClass} aria-hidden="true" style={{ marginRight: 6 }} />}
        {cosmetic.name}
      </span>
      <span className="cpm-cosmetic-meta">
        {RARITY_LABEL[cosmetic.rarity]} · {cosmetic.category.replace(/_/g, " ").toLowerCase()}
      </span>
    </div>
  );
}
