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

/**
 * Resolve a section's clip window from its `videoConfig`.
 *
 * `clipStartSec` / `clipEndSec` are **absolute seconds into the real video**, as
 * is everything else stored for a video section — `durationSec`, a pop-up's
 * `videoTimestampSec`, and a learner's `maxWatchedSec`. Only the UI rebases to
 * clip-relative time for display; nothing persisted ever does. That is what lets
 * an author move the clip without rewriting a single stored row.
 *
 * `durationSec` keeps meaning the length of the *whole* video: the player reads
 * it from YouTube's `getDuration()`, which is unaffected by our stopping early.
 *
 * A section with neither key resolves to `[0, durationSec]` — exactly the
 * behaviour that existed before clipping, which is why no migration is needed.
 *
 * The backend has a twin of this function in `courseProgressService.ts`
 * (`clipWindow`); keep the two in step.
 *
 * @returns {{ startSec: number, endSec: number|null, lengthSec: number|null, clipped: boolean }}
 *          `endSec`/`lengthSec` are null when the end is unknown — no clip end
 *          set and no duration detected yet.
 */
export function clipWindow(config) {
  const cfg = config ?? {};
  const duration = Number(cfg.durationSec);
  const hasDuration = Number.isFinite(duration) && duration > 0;

  const rawStart = Number(cfg.clipStartSec);
  let startSec = Number.isFinite(rawStart) && rawStart > 0 ? Math.floor(rawStart) : 0;

  const rawEnd = Number(cfg.clipEndSec);
  let endSec = Number.isFinite(rawEnd) && rawEnd > 0 ? Math.floor(rawEnd) : null;

  // Cap against the real length when we know it — a stale clip end left behind
  // by a swapped video must not put the finish line past the last frame, or the
  // section becomes uncompletable.
  if (hasDuration && endSec != null) endSec = Math.min(endSec, Math.floor(duration));
  if (endSec == null && hasDuration) endSec = Math.floor(duration);

  // An end at or before the start is not a window; discard it rather than hand
  // back a negative length.
  if (endSec != null && endSec <= startSec) {
    if (hasDuration && startSec < Math.floor(duration)) endSec = Math.floor(duration);
    else { startSec = 0; endSec = hasDuration ? Math.floor(duration) : null; }
  }

  return {
    startSec,
    endSec,
    lengthSec: endSec == null ? null : endSec - startSec,
    clipped: startSec > 0 || (endSec != null && hasDuration && endSec < Math.floor(duration)),
  };
}

/** True when an absolute timestamp falls inside the clip window. */
export function isWithinClip(sec, window) {
  const t = Number(sec);
  if (!Number.isFinite(t)) return false;
  if (t < window.startSec) return false;
  return window.endSec == null || t <= window.endSec;
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
