/**
 * When a CourseSection is worth snapshotting, and what a snapshot has to carry.
 *
 * Split out of courseService so the decision is pure and testable without a DB —
 * courseService.snapshotSection does the Prisma reads and writes around it.
 *
 * Why this exists: revisions used to record only `title` + `contentJson`, and
 * `updateSection` only took one when `contentJson` was part of the write. A
 * section's *settings* — a video's youtubeId, a deck's audioUrl, a walkthrough's
 * tourId — therefore had no history whatsoever. They are written as whole-object
 * overwrites assembled in the browser, so any write built on a stale copy
 * silently dropped whatever another write had just added, and there was nothing
 * to show what was lost, when, or by whom, and nothing to roll back to.
 */
import type { Prisma } from "@prisma/client";

// The editor autosaves 1.5s after typing stops, so one snapshot per write would
// add a row every few seconds of drafting. One per section per five minutes
// keeps the table small while still bounding how much prose a bad write can
// destroy. Settings changes deliberately bypass this — see shouldSnapshotSection.
export const SNAPSHOT_THROTTLE_MS = 5 * 60 * 1000;

/**
 * The section columns a revision preserves besides the document. Everything a
 * kind-specific authoring surface writes, plus the two QUIZ scalars, so a
 * rollback restores a section's behaviour and not just its prose.
 *
 * `contentYjs` is NOT here: it is the live CRDT, and `rollbackSectionRevision`
 * writes `contentJson` only for the same reason the REST autosave does.
 */
export const CONFIG_KEYS = [
  "videoConfig",
  "slideConfig",
  "tourConfig",
  "litConfig",
  "assignmentConfig",
  "trainingId",
  "passThreshold",
  "maxAttempts",
] as const;

export type ConfigKey = (typeof CONFIG_KEYS)[number];
export type SectionConfig = Partial<Record<ConfigKey, unknown>>;

/**
 * A TipTap doc with no text in it — `{}` (never seeded), or the single empty
 * paragraph a freshly-mounted editor reports. Treated as "nothing worth
 * snapshotting", and as the marker of the write this mechanism exists to
 * survive.
 */
export function isEmptyDoc(doc: Prisma.JsonValue | null | undefined): boolean {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return true;
  const content = (doc as { content?: unknown }).content;
  if (!Array.isArray(content) || content.length === 0) return true;
  return !JSON.stringify(content).includes('"text"');
}

/**
 * Reduce a section row to just its settings, dropping keys that hold nothing.
 *
 * Built by construction from CONFIG_KEYS rather than by deleting `contentJson`
 * and `contentYjs` off the row: a future column must not ride into the revision
 * table by default, and `contentYjs` is a Buffer that would not survive JSON.
 */
export function pickSectionConfig(row: Record<string, unknown> | null | undefined): SectionConfig {
  const out: SectionConfig = {};
  if (!row) return out;
  for (const key of CONFIG_KEYS) {
    const value = row[key];
    if (value !== null && value !== undefined) out[key] = value;
  }
  return out;
}

export function isEmptyConfig(config: SectionConfig | null | undefined): boolean {
  return !config || Object.keys(config).length === 0;
}

/**
 * Order-insensitive deep comparison of two settings objects.
 *
 * A revision written before `configJson` existed has `null` here. That reads as
 * "changed" against a section that has settings, so the next write captures them
 * once — the old rows are not retroactively fixable, but nothing has to be lost
 * from this point on. Null against no settings is not a change, so a plain
 * CONTENT section does not get an extra row for nothing.
 */
export function configChanged(
  live: SectionConfig | null | undefined,
  latest: SectionConfig | null | undefined,
): boolean {
  return stableStringify(live ?? {}) !== stableStringify(latest ?? {});
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export interface SnapshotCandidate {
  contentJson: Prisma.JsonValue | null;
  config: SectionConfig | null;
}

export interface SnapshotDecisionInput {
  /** The section as it stands right now, about to be overwritten. */
  live: SnapshotCandidate;
  /** The most recent revision for this section, if any. */
  latest: (SnapshotCandidate & { createdAt: Date }) | null;
  /** Rollback forces a snapshot so the restore is itself reversible. */
  force: boolean;
  now: number;
}

/**
 * Whether to write a revision row before the caller overwrites this section.
 *
 * The throttle is sized for prose autosave, which fires every couple of seconds
 * while someone types. Settings do not behave like that: they change on discrete
 * author actions (a blur, a toggle, an upload) and settle immediately, so a
 * settings change bypasses the window entirely. Throttling them is exactly what
 * made a cleared video link unrecoverable — the wipe landed a minute after the
 * previous snapshot and wrote no history at all.
 */
export function shouldSnapshotSection({ live, latest, force, now }: SnapshotDecisionInput): boolean {
  if (force) return true;

  // Nothing to preserve: a section with no body and no settings would otherwise
  // seed the history with a row that can only ever restore emptiness.
  if (isEmptyDoc(live.contentJson) && isEmptyConfig(live.config)) return false;

  if (!latest) return true;

  // Never throttled — see the note above.
  if (configChanged(live.config, latest.config)) return true;

  if (now - latest.createdAt.getTime() >= SNAPSHOT_THROTTLE_MS) return true;

  // Inside the window, but the last thing on record is blank while the live body
  // is not. Without this escape a burst of empty writes could leave only the
  // blank version behind, which is precisely the state we need to escape.
  if (isEmptyDoc(latest.contentJson) && !isEmptyDoc(live.contentJson)) return true;

  return false;
}
