// Shared vault helpers — the single home for logic previously copy-pasted
// across the vault components. Keep this module dependency-free (no three.js,
// no React) so anything, including the lazy-loaded viewer chunk, can import it.

export const PREVIEWABLE_EXTENSIONS = new Set(["stl", "obj", "gltf", "glb"]);

export function extensionOf(fileName) {
  if (!fileName) return "";
  const idx = fileName.lastIndexOf(".");
  return idx === -1 ? "" : fileName.slice(idx + 1).toLowerCase();
}

export function isPreviewable(fileName) {
  return PREVIEWABLE_EXTENSIONS.has(extensionOf(fileName));
}

export function formatBytes(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx += 1;
  }
  return `${value.toFixed(1)} ${units[unitIdx]}`;
}

export const CR_STATUS_LABEL = {
  OPEN: "Open",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

// Fired whenever the set of OPEN change requests changes (create, approve,
// reject, cancel) so AppShell's admin badge can refetch — mirrors the
// clubpm:pending-rewards-updated idiom used by PendingRewardsPanel.
export const CR_COUNT_EVENT = "clubpm:pending-cr-updated";

export function notifyCrCountChanged() {
  window.dispatchEvent(new CustomEvent(CR_COUNT_EVENT));
}

// Mirrors backend vaultService.ts's nextRevisionLetter (bijective base-26:
// A, B, …, Z, AA, AB, …). Preview only — the server always recomputes the
// final letter inside approveCr's transaction.
export function nextRevisionLetter(current) {
  let num = 0;
  if (current) {
    for (const ch of current) num = num * 26 + (ch.charCodeAt(0) - 64);
  }
  num += 1;
  let result = "";
  while (num > 0) {
    const rem = (num - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    num = Math.floor((num - 1) / 26);
  }
  return result;
}
