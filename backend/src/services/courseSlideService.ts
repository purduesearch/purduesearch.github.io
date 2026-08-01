import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import {
  uploadImageToDrive, uploadStreamToDrive, makeDriveFilePublic,
  deleteDriveFile, ensureClubPmRootFolder,
} from "./driveService.js";

// ── Pure helpers (unit-tested in courseSlideService.test.ts) ──

/**
 * The slide high-water mark. Monotonic and bounded by the deck, and nothing
 * else — deliberately simpler than clampVideoProgress. Video needs a wall-clock
 * budget because watch time can be fabricated; there is no slide analogue, and
 * a time rule here would only punish fast readers.
 */
export function clampSlideIndex(opts: {
  prevMaxIndex: number; index: number; slideCount: number;
}): number {
  const prev = Math.max(0, Math.floor(opts.prevMaxIndex));
  if (opts.slideCount <= 0) return prev;
  const next = Math.floor(opts.index);
  if (!Number.isFinite(next) || next <= prev) return prev;
  return Math.min(next, opts.slideCount - 1);
}

/**
 * Keep a question pointing at a real slide after a re-import shortened the deck.
 * Clamped, never dropped: silently deleting an author's questions is worse than
 * a stale pointer the workbench can flag.
 */
export function clampQuestionSlideIndex(slideIndex: number | null, slideCount: number): number | null {
  if (slideIndex == null) return null;
  if (slideCount <= 0) return 0;
  return Math.max(0, Math.min(slideIndex, slideCount - 1));
}

/** Last slide reached AND every overlay question answered. */
export function isDeckComplete(opts: {
  maxSlideIndex: number;
  slideCount: number;
  questions: { id: string; slideIndex: number | null }[];
  answeredIds: string[];
}): boolean {
  if (opts.slideCount <= 0) return false;
  if (opts.maxSlideIndex < opts.slideCount - 1) return false;
  const answered = new Set(opts.answeredIds);
  return opts.questions
    .filter((q) => q.slideIndex != null)
    .every((q) => answered.has(q.id));
}

// ── Persistence ──────────────────────────────────────────────

const slideSelect = {
  id: true, sectionId: true, index: true, imageUrl: true, imageFileId: true,
  text: true, notes: true, startSec: true, width: true, height: true,
} satisfies Prisma.CourseSlideSelect;

export async function listSlides(sectionId: string) {
  return prisma.courseSlide.findMany({
    where: { sectionId }, orderBy: { index: "asc" }, select: slideSelect,
  });
}

/** One rendered page → Drive → a row. Called once per page by the importer. */
export async function addSlide(input: {
  sectionId: string; index: number; imageBase64: string;
  text?: string | null; width?: number | null; height?: number | null;
}) {
  const uploaded = await uploadImageToDrive(
    input.imageBase64, "image/png", `slide-${input.sectionId}-${input.index}.png`
  );
  if (!uploaded) throw new Error("Could not store that slide image");
  return prisma.courseSlide.create({
    data: {
      sectionId: input.sectionId,
      index: input.index,
      imageUrl: uploaded.url,
      imageFileId: uploaded.fileId,
      text: input.text ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
    },
    select: slideSelect,
  });
}

/** Notes and start times only — a whole-set write that never touches images. */
export async function updateSlideMeta(
  sectionId: string,
  rows: { id: string; notes?: string | null; startSec?: number | null }[]
) {
  const known = new Set((await listSlides(sectionId)).map((s) => s.id));
  const writes = rows
    .filter((r) => known.has(r.id))
    .map((r) => prisma.courseSlide.update({
      where: { id: r.id },
      data: {
        ...(r.notes !== undefined ? { notes: r.notes } : {}),
        ...(r.startSec !== undefined ? { startSec: r.startSec } : {}),
      },
    }));
  if (writes.length) await prisma.$transaction(writes);
  return listSlides(sectionId);
}

/**
 * Drop the deck, or just the listed slides — rows AND their Drive files.
 *
 * The id-list form is what a re-import uses: the new pages are stored first,
 * then the OLD ids are deleted, so a failed import never destroys the deck it
 * was replacing.
 */
export async function clearDeck(sectionId: string, ids?: string[]): Promise<void> {
  const all = await listSlides(sectionId);
  const doomed = ids?.length ? all.filter((s) => ids.includes(s.id)) : all;
  if (!doomed.length) return;
  await prisma.courseSlide.deleteMany({ where: { id: { in: doomed.map((s) => s.id) } } });
  // Drive deletions are best-effort and deliberately not awaited as a batch —
  // a failed cleanup must not fail the import that triggered it.
  for (const s of doomed) void deleteDriveFile(s.imageFileId);
}

/**
 * Merge a patch into slideConfig. Spreading the previous value is mandatory:
 * the audio row and the source row both write this column and neither knows the
 * other's keys.
 */
export async function setSlideConfig(sectionId: string, patch: Record<string, unknown>) {
  const current = await prisma.courseSection.findUnique({
    where: { id: sectionId }, select: { slideConfig: true },
  });
  const merged = { ...((current?.slideConfig as Record<string, unknown>) ?? {}), ...patch };
  return prisma.courseSection.update({
    where: { id: sectionId },
    data: { slideConfig: merged as Prisma.InputJsonValue },
    select: { id: true, slideConfig: true },
  });
}

/** Narration upload. Made public so <audio src> works without a proxy route. */
export async function setAudio(
  sectionId: string, stream: NodeJS.ReadableStream, mimeType: string, filename: string
) {
  const folderId = await ensureClubPmRootFolder();
  if (!folderId) throw new Error("Google Drive is not connected");
  const uploaded = await uploadStreamToDrive(stream, mimeType, filename, folderId);
  if (!uploaded) throw new Error("Could not store that audio file");
  await makeDriveFilePublic(uploaded.fileId);
  return setSlideConfig(sectionId, {
    audioFileId: uploaded.fileId,
    audioUrl: `https://drive.google.com/uc?export=download&id=${uploaded.fileId}`,
  });
}

export async function clearAudio(sectionId: string) {
  const current = await prisma.courseSection.findUnique({
    where: { id: sectionId }, select: { slideConfig: true },
  });
  const cfg = (current?.slideConfig as Record<string, unknown>) ?? {};
  if (typeof cfg.audioFileId === "string") void deleteDriveFile(cfg.audioFileId);
  return setSlideConfig(sectionId, { audioFileId: null, audioUrl: null, audioDurationSec: null });
}
