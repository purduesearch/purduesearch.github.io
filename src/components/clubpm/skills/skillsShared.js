// Labels and small helpers shared by the member Skills panel, the admin Skills tab
// and the public portfolio. Levels are advisory estimates; confidence is separate.

export const LEVEL_LABELS = ["", "Aware", "Beginner", "Competent", "Advanced", "Expert"];

export const BAND_LABELS = { LOW: "Low confidence", MEDIUM: "Medium confidence", HIGH: "High confidence" };

export const TREND_META = {
  GROWING: { icon: "fas fa-arrow-trend-up", label: "Growing" },
  STABLE: { icon: "fas fa-minus", label: "Stable" },
  FADING: { icon: "fas fa-arrow-trend-down", label: "Fading" },
};

export const PROVENANCE_META = {
  MANAGER_VERIFIED: { label: "Lead-verified", icon: "fas fa-circle-check" },
  PEER_ENDORSED: { label: "Peer-endorsed", icon: "fas fa-handshake" },
  AI_INFERRED: { label: "From work", icon: "fas fa-wand-magic-sparkles" },
  SELF_CLAIMED: { label: "Self-claimed", icon: "fas fa-user" },
};

export const SOURCE_ICON = {
  GITHUB: "fab fa-github",
  CAD: "fas fa-cube",
  TASK: "fas fa-list-check",
  REVIEW: "fas fa-magnifying-glass",
  MANUAL: "fas fa-pen",
};

export const CONTRIBUTIONS = [
  { value: "AUTHORED", label: "I made it" },
  { value: "LED", label: "I led it" },
  { value: "REVIEWED", label: "I reviewed it" },
  { value: "ASSISTED", label: "I helped" },
];

export function sourceIcon(source) {
  return SOURCE_ICON[String(source).toUpperCase()] ?? "fas fa-file";
}

/** "Sep 2026" from an ISO string; empty string when missing. */
export function formatMonth(iso) {
  if (!iso) return "";
  const d = new Date(/^\d{4}-\d{2}$/.test(iso) ? `${iso}-01T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function formatDay(iso) {
  if (!iso) return "";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function errorMessage(err, fallback = "Something went wrong") {
  return err?.message && err.message !== "Unknown error" ? err.message : fallback;
}
