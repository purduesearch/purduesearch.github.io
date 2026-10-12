import type { SkillArtifact } from "../skillPrompts.js";

export interface CollectWindow {
  /** exclusive */
  since: Date;
  /** inclusive; the run's start time, so items created mid-run wait for next week */
  until: Date;
  /** only artifacts for these members (manual check / single-member backfill) */
  memberIds?: string[];
  maxArtifacts: number;
  maxChars: number;
}

export interface CollectResult {
  artifacts: SkillArtifact[];
  /** artifacts dropped because the source user maps to no member (e.g. unlinked GitHub login) */
  unmapped: number;
  errors: string[];
  /** true when maxArtifacts cut the list short; the pipeline must not advance this source's watermark past it */
  truncated: boolean;
  /** latest occurredAt among returned artifacts when truncated (safe watermark), else null */
  resumeFrom: Date | null;
}

export const emptyResult = (): CollectResult => ({ artifacts: [], unmapped: 0, errors: [], truncated: false, resumeFrom: null });
