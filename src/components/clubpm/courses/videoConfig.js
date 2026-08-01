// Shared vocabulary for a VIDEO section's `videoConfig` JSON.
//
// This lives in its own module because both sides of the video feature need it:
// CourseVideoSettings (authoring) and LockedVideoPlayer (playback), and the
// settings panel renders the player as its preview. Keeping the helpers here
// means those two files never have to import each other.

// Offered in the custom control bar built by LockedVideoPlayer. 0.5×/0.75× are
// offered too so a learner can slow a dense demo down.
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
export const DEFAULT_RATES = [1, 1.25, 1.5, 2];

/**
 * Pull the 11-character video id out of any YouTube URL form — watch?v=,
 * youtu.be/, /embed/, /shorts/, /live/ — or accept a bare id. Returns null when
 * nothing id-shaped is present so the caller can show a validation hint rather
 * than storing garbage the IFrame API will reject at play time.
 */
export function parseYouTubeId(input) {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  if (/^[\w-]{11}$/.test(raw)) return raw;
  const patterns = [
    /[?&]v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /\/embed\/([\w-]{11})/,
    /\/shorts\/([\w-]{11})/,
    /\/live\/([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m) return m[1];
  }
  return null;
}

// mm:ss ⇄ seconds. Authors think in timestamps; the row stores seconds.
export function formatTimestamp(sec) {
  const total = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function parseTimestamp(input) {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = raw.match(/^(\d+):([0-5]?\d)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
