// Pure helpers for the weekly run: windows, watermarks, idempotency keys, pools.

import type { SkillArtifact } from "./skillPrompts.js";

export type CollectorName = "github" | "cad" | "task";
export const COLLECTORS: readonly CollectorName[] = ["github", "cad", "task"] as const;

/** A retryable failure stops holding the watermark back once the artifact is this old. */
export const GIVE_UP_DAYS = 21;
/** Re-read this much before the watermark so late-arriving items are not missed (idempotency absorbs repeats). */
export const DEFAULT_OVERLAP_MS = 24 * 3_600_000;
const DAY = 86_400_000;

/** What is stored in SkillEvidence.contentHash: a new prompt version re-analyses without breaking the unique key. */
export const storedHash = (contentHash: string, promptVersion: string) => `${contentHash}@${promptVersion}`;

export function evidenceKey(a: Pick<SkillArtifact, "memberId" | "source" | "sourceRef" | "contentHash">, promptVersion: string): string {
  return `${a.memberId}|${a.source}|${a.sourceRef}|${storedHash(a.contentHash, promptVersion)}`;
}

export interface Origin { collector: CollectorName; artifact: SkillArtifact }

/** Same member + source + ref can only appear once per run (a repo linked to two projects, a retried page). */
export function dedupeArtifacts<T extends { artifact: SkillArtifact }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = `${it.artifact.memberId}|${it.artifact.source}|${it.artifact.sourceRef}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

export function computeWindow(o: {
  now: Date;
  lastWatermark?: Date | null;
  overlapMs?: number;
  initialLookbackDays?: number;
  sinceOverride?: Date | null;
  untilOverride?: Date | null;
}): { since: Date; until: Date } {
  const until = o.untilOverride ?? o.now;
  if (o.sinceOverride) return { since: o.sinceOverride, until };
  if (o.lastWatermark) return { since: new Date(o.lastWatermark.getTime() - (o.overlapMs ?? DEFAULT_OVERLAP_MS)), until };
  return { since: new Date(o.now.getTime() - (o.initialLookbackDays ?? 90) * DAY), until };
}

export function chunkWindows(since: Date, until: Date, days: number): { since: Date; until: Date }[] {
  const step = Math.max(1, days) * DAY;
  const out: { since: Date; until: Date }[] = [];
  for (let t = since.getTime(); t < until.getTime(); t += step) out.push({ since: new Date(t), until: new Date(Math.min(t + step, until.getTime())) });
  return out;
}

/**
 * New watermark for one collector, or null to keep the previous one.
 * Never moves backwards, never passes a truncation point or a still-retryable failure.
 */
export function nextWatermark(a: {
  now: Date;
  until: Date;
  previous?: Date | null;
  collectorOk: boolean;
  resumeFrom: Date | null;
  /** occurredAt of artifacts that must be retried next run (retryable failures, over-cap leftovers) */
  holdBack: Date[];
}): Date | null {
  if (!a.collectorOk) return null;
  let cand = a.until.getTime();
  if (a.resumeFrom) cand = Math.min(cand, a.resumeFrom.getTime());
  const giveUp = a.now.getTime() - GIVE_UP_DAYS * DAY;
  for (const h of a.holdBack) if (h.getTime() > giveUp) cand = Math.min(cand, h.getTime() - 1);
  if (a.previous && cand <= a.previous.getTime()) return null;
  return new Date(cand);
}

export async function mapPool<T, R>(items: T[], size: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(size, items.length)) }, worker));
  return results;
}

export type RunStatus = "SUCCEEDED" | "PARTIAL" | "FAILED";

export function runStatus(a: { collectorsTotal: number; collectorsFailed: number; analyzed: number; failed: number }): RunStatus {
  if (a.collectorsFailed >= a.collectorsTotal) return "FAILED";
  if (a.failed > 0 && a.analyzed === 0) return "FAILED";
  return a.collectorsFailed > 0 || a.failed > 0 ? "PARTIAL" : "SUCCEEDED";
}
