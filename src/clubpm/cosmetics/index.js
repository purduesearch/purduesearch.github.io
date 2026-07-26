// Central exports for the cosmetic registries + shared constants.

export { default as THEMES   } from "./themeRegistry";
export { default as FRAMES   } from "./frameRegistry";

export const RARITY_COLORS = {
  COMMON:   { fg: "#888780", bg: "#f1efe8" },
  UNCOMMON: { fg: "#3b6d11", bg: "#eaf3de" },
  RARE:     { fg: "#534ab7", bg: "#eeedfe" },
  MYTHIC:   { fg: "#854f0b", bg: "#faeeda", border: "#ef9f27" },
};

export const RANK_THRESHOLDS = [
  { rank: "NESTLING",   minXp: 0 },
  { rank: "FLEDGLING",  minXp: 500 },
  { rank: "CADET",      minXp: 1500 },
  { rank: "SPECIALIST", minXp: 3500 },
  { rank: "PIONEER",    minXp: 7000 },
  { rank: "COSMONAUT",  minXp: 12500 },
  { rank: "CELESTIAL",  minXp: 21000 },
];

export const RANK_META = {
  NESTLING:   { label: "Nestling",   icon: "fas fa-egg" },
  FLEDGLING:  { label: "Fledgling",  icon: "fas fa-feather" },
  CADET:      { label: "Cadet",      icon: "fas fa-user-astronaut" },
  SPECIALIST: { label: "Specialist", icon: "fas fa-medal" },
  PIONEER:    { label: "Pioneer",    icon: "fas fa-rocket" },
  COSMONAUT:  { label: "Cosmonaut",  icon: "fas fa-satellite" },
  CELESTIAL:  { label: "Celestial",  icon: "fas fa-star" },
};

// Rank gates for shop rotation visibility (must mirror backend/src/services/shopService.ts)
export const RARE_RANK_GATE   = ["SPECIALIST", "PIONEER", "COSMONAUT", "CELESTIAL"];
export const MYTHIC_RANK_GATE = ["COSMONAUT", "CELESTIAL"];
